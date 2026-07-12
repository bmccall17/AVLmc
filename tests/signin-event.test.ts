import assert from "node:assert/strict";
import test from "node:test";
import { handleSignInEvent, type SignInEventDeps } from "../lib/auth-signin-event";

/**
 * PRD 47 / audit F2: `events.signIn` is awaited inside the @auth/core callback, so a throwing side
 * effect would abort the response after the session row is created but before the cookie is set.
 * These drive `handleSignInEvent` with injected deps (no DB, no request context) to prove the
 * best-effort contract: a throw never rejects the handler, and never skips the later steps.
 */

const SPOTIFY_EVENT = {
  user: { id: "u1", email: "listener@example.com", image: null },
  account: { provider: "spotify", access_token: "tok", scope: "user-top-read" },
  // A usable Spotify avatar so the image-refresh step actually reaches setUserImage.
  profile: { images: [{ url: "https://i.scdn.co/image/abc" }] },
};

function makeDeps(overrides: Partial<SignInEventDeps> = {}): {
  deps: SignInEventDeps;
  calls: Record<string, number>;
  migrateArgs: Array<[string, string]>;
} {
  const calls = {
    recordMusicConnection: 0,
    setUserImage: 0,
    recordProviderEmail: 0,
    migrateSessionSignalsToUser: 0,
  };
  const migrateArgs: Array<[string, string]> = [];
  const deps: SignInEventDeps = {
    recordMusicConnection: async () => {
      calls.recordMusicConnection++;
    },
    setUserImage: async () => {
      calls.setUserImage++;
    },
    recordProviderEmail: async () => {
      calls.recordProviderEmail++;
    },
    migrateSessionSignalsToUser: async (sessionId: string, userId: string) => {
      calls.migrateSessionSignalsToUser++;
      migrateArgs.push([sessionId, userId]);
    },
    readAnonymousSessionId: async () => "sess-1",
    ...overrides,
  };
  return { deps, calls, migrateArgs };
}

test("a throwing recordMusicConnection does not reject the sign-in event handler", async () => {
  const { deps } = makeDeps({
    recordMusicConnection: async () => {
      throw new Error("music_connections table drifted (42P01)");
    },
  });

  // Must resolve, not throw — otherwise @auth/core aborts the callback and drops the cookie.
  await assert.doesNotReject(() => handleSignInEvent(SPOTIFY_EVENT, deps));
});

test("a throw in the first step does not skip the remaining steps", async () => {
  const { deps, calls, migrateArgs } = makeDeps({
    recordMusicConnection: async () => {
      throw new Error("boom");
    },
  });

  await handleSignInEvent(SPOTIFY_EVENT, deps);

  assert.equal(calls.setUserImage, 1, "avatar refresh still ran");
  assert.equal(calls.recordProviderEmail, 1, "provider-email still ran");
  assert.equal(calls.migrateSessionSignalsToUser, 1, "anonymous hand-off still ran");
  assert.deepEqual(migrateArgs[0], ["sess-1", "u1"], "hand-off got the session + user id");
});

test("a failing step is logged with the stable greppable prefix", async () => {
  const { deps } = makeDeps({
    recordMusicConnection: async () => {
      throw new Error("boom");
    },
  });

  const original = console.error;
  const logged: string[] = [];
  console.error = (...args: unknown[]) => {
    logged.push(String(args[0]));
  };
  try {
    await handleSignInEvent(SPOTIFY_EVENT, deps);
  } finally {
    console.error = original;
  }

  assert.ok(
    logged.some((line) => line.startsWith("signIn side-effect failed: record music connection")),
    "the failure was logged with the signIn side-effect failed: prefix"
  );
});

test("the happy path runs every step exactly once", async () => {
  const { deps, calls } = makeDeps();

  await handleSignInEvent(SPOTIFY_EVENT, deps);

  assert.deepEqual(calls, {
    recordMusicConnection: 1,
    setUserImage: 1,
    recordProviderEmail: 1,
    migrateSessionSignalsToUser: 1,
  });
});

test("a non-music provider skips the music-connection step but still runs the rest", async () => {
  const { deps, calls } = makeDeps();

  await handleSignInEvent(
    {
      user: { id: "u2", email: "e@example.com", image: null },
      account: { provider: "google" },
      profile: { picture: "https://lh3.googleusercontent.com/x" },
    },
    deps
  );

  assert.equal(calls.recordMusicConnection, 0, "no music connection for a non-Spotify provider");
  assert.equal(calls.setUserImage, 1);
  assert.equal(calls.recordProviderEmail, 1);
  assert.equal(calls.migrateSessionSignalsToUser, 1);
});

test("no id or no provider is a no-op", async () => {
  const { deps, calls } = makeDeps();

  await handleSignInEvent({ user: { id: null }, account: { provider: "spotify" } }, deps);
  await handleSignInEvent({ user: { id: "u3" }, account: null }, deps);

  assert.deepEqual(calls, {
    recordMusicConnection: 0,
    setUserImage: 0,
    recordProviderEmail: 0,
    migrateSessionSignalsToUser: 0,
  });
});

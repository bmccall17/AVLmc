import assert from "node:assert/strict";
import test from "node:test";
import {
  emailSourceForProvider,
  isProviderEmailVerified,
  normalizeEmail,
  resolveAccountLink,
} from "../lib/account-linking";

test("signed in: an unowned email links onto the current account", () => {
  assert.deepEqual(
    resolveAccountLink({ sessionUserId: "7", emailOwnerUserId: null }),
    { kind: "link", userId: "7" }
  );
});

test("signed in: an email already owned by the current account links (idempotent, no fork)", () => {
  assert.deepEqual(
    resolveAccountLink({ sessionUserId: "7", emailOwnerUserId: "7" }),
    { kind: "link", userId: "7" }
  );
});

test("signed in: an email owned by a DIFFERENT account is a conflict, never a silent merge", () => {
  assert.deepEqual(
    resolveAccountLink({ sessionUserId: "7", emailOwnerUserId: "9" }),
    { kind: "conflict", ownerUserId: "9" }
  );
});

test("not signed in: a recorded email resolves to its owning account (one identity, no duplicate)", () => {
  assert.deepEqual(
    resolveAccountLink({ sessionUserId: null, emailOwnerUserId: "9" }),
    { kind: "link", userId: "9" }
  );
});

test("not signed in: an unknown email creates a new account", () => {
  assert.deepEqual(
    resolveAccountLink({ sessionUserId: null, emailOwnerUserId: null }),
    { kind: "create" }
  );
});

test("normalizeEmail lowercases and trims (matches the lower(email) unique index)", () => {
  assert.equal(normalizeEmail("  Brett@Example.COM "), "brett@example.com");
  assert.equal(normalizeEmail(null), "");
  assert.equal(normalizeEmail(undefined), "");
});

test("emailSourceForProvider maps provider ids to a user_emails source", () => {
  assert.equal(emailSourceForProvider("spotify"), "spotify");
  assert.equal(emailSourceForProvider("resend"), "magic_link");
  assert.equal(emailSourceForProvider("email"), "magic_link");
  assert.equal(emailSourceForProvider("google"), "google_youtube");
  assert.equal(emailSourceForProvider("apple"), "apple_music");
  assert.equal(emailSourceForProvider(undefined), "magic_link");
});

test("isProviderEmailVerified is true for magic link + Spotify, false for not-yet-wired providers", () => {
  assert.equal(isProviderEmailVerified("spotify"), true);
  assert.equal(isProviderEmailVerified("resend"), true);
  assert.equal(isProviderEmailVerified("google"), false);
  assert.equal(isProviderEmailVerified("apple"), false);
});

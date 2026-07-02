import { auth, signOut } from "@/auth";
import { MusicConnectionActions } from "@/components/MusicConnectionActions";
import { SpotifyGateButton } from "@/components/SignInChooser";
import { getAuthFeatureFlags } from "@/lib/auth-flags";
import { listMusicConnections, listMusicProfileItems } from "@/lib/music";
import { SPOTIFY_LIMITED_BETA_MESSAGE } from "@/lib/spotify-limited-access";

type MusicAccountPanelProps = {
  spotifyLimitedBetaNotice?: boolean;
};

export async function MusicAccountPanel({ spotifyLimitedBetaNotice = false }: MusicAccountPanelProps) {
  const features = getAuthFeatureFlags();

  if (!features.auth && !spotifyLimitedBetaNotice) {
    return null;
  }

  const session = await auth();
  const user = session?.user ?? null;

  if (!user?.id) {
    return (
      <section
        className="music-account-panel"
        id="personalized-discovery"
        aria-label="Personalized discovery account"
      >
        <div>
          <p className="eyebrow">Personalized discovery</p>
          <h2>{spotifyLimitedBetaNotice ? "Spotify beta access is limited" : "Connect your music taste"}</h2>
          <p>
            Optional sign-in can shape future recommendations. Browsing and community posts stay open without an
            account.
          </p>
        </div>
        {spotifyLimitedBetaNotice ? (
          <p className="form-message notice">{SPOTIFY_LIMITED_BETA_MESSAGE}</p>
        ) : features.spotify ? (
          <SpotifyGateButton
            callbackUrl="/#personalized-discovery"
            source="music-account-panel"
          >
            Connect Spotify
          </SpotifyGateButton>
        ) : (
          <p className="empty-copy">Spotify sign-in is not configured yet.</p>
        )}
      </section>
    );
  }

  const userId = user.id;
  const [connections, profileItems] = await Promise.all([
    listMusicConnections(userId),
    listMusicProfileItems(userId),
  ]);
  const spotifyConnection = connections.find((connection) => connection.provider === "spotify");
  const spotifyConnected = Boolean(spotifyConnection && !spotifyConnection.disconnectedAt);
  const spotifyTastePaused = Boolean(spotifyConnection?.tasteOptOutAt);
  const previewItems = profileItems.slice(0, 4);

  return (
    <section
      className="music-account-panel"
      id="personalized-discovery"
      aria-label="Personalized discovery account"
    >
      <div>
        <p className="eyebrow">Personalized discovery</p>
        <h2>{user.name ?? "Signed in"}</h2>
        <p>
          {getConnectionSummary({ connected: spotifyConnected, connection: spotifyConnection })}
        </p>
        {previewItems.length > 0 ? (
          <div className="music-profile-preview">
            {previewItems.map((item) => (
              <span key={item.id}>
                {item.itemType === "top_artist" ? "Artist" : "Track"}: {item.name}
              </span>
            ))}
          </div>
        ) : spotifyConnected ? (
          <p className="empty-copy">Spotify is connected. Sync once to unlock Best Match ranking.</p>
        ) : null}
        {spotifyTastePaused ? (
          <p className="empty-copy">Spotify taste is paused for Best Match.</p>
        ) : null}
      </div>
      <div className="music-account-controls">
        {spotifyConnected ? (
          <MusicConnectionActions tasteOptedOut={spotifyTastePaused} />
        ) : features.spotify ? (
          <SpotifyGateButton
            callbackUrl="/#personalized-discovery"
            source="music-account-panel"
          >
            Connect Spotify
          </SpotifyGateButton>
        ) : null}
        <form action={signOutOfApp}>
          <button className="ghost-control" type="submit">
            Sign out
          </button>
        </form>
      </div>
    </section>
  );
}

async function signOutOfApp() {
  "use server";

  await signOut({ redirectTo: "/" });
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
  }).format(new Date(value));
}

function getConnectionSummary({
  connected,
  connection,
}: {
  connected: boolean;
  connection: Awaited<ReturnType<typeof listMusicConnections>>[number] | undefined;
}) {
  if (!connected) {
    return "Signed in. Connect Spotify to sync taste data.";
  }

  if (connection?.tasteOptOutAt) {
    return "Spotify connected, but Best Match is paused.";
  }

  return `Spotify connected${
    connection?.lastSyncedAt ? `, last synced ${formatDate(connection.lastSyncedAt)}` : ""
  }.`;
}

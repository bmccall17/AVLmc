/**
 * Tester-request emails (PRD 42 / Phase 17): the owner notification ("someone wants a Spotify
 * seat") and the applicant invite ("your seat is ready"). Render functions are pure and
 * unit-tested (tests/tester-requests.test.ts); sends reuse the existing Resend integration —
 * `sendAdminNotificationEmail` for the owner (recipient from `ADMIN_NOTIFY_EMAIL`, falling back to
 * the sender), and the same Resend POST for the applicant invite. Both sends are best-effort:
 * callers wrap them so a Resend failure never rolls back the state change that triggered them.
 */

import type { RenderedEmail } from "./auth-email";

const BRAND_NAME = "AVL Music Companion";

// Design-spec tokens (inline, matching lib/auth-email.ts — email clients don't run Tailwind).
const COLOR_BG = "#0A0A0A";
const COLOR_SURFACE = "#18181b";
const COLOR_BORDER = "#27272a";
const COLOR_TEXT = "#ffffff";
const COLOR_TEXT_MUTED = "#a1a1aa";
const COLOR_TEXT_FAINT = "#71717a";
const COLOR_BUTTON_BG = "#fafafa";
const COLOR_BUTTON_TEXT = "#0A0A0A";
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type TesterRequestNotificationParams = {
  /** The applicant's (normalized) email. */
  email: string;
  /** Their optional "what do you listen to?" note. */
  note: string | null;
  /** The surface that spawned the request (e.g. `spotify-access-page`, `auth-error-page`). */
  source: string;
  /** How many requests are pending right now, for at-a-glance triage. */
  pendingCount: number;
  /** Absolute deep link to the admin review panel. */
  adminUrl: string;
};

/** Render the owner notification. Pure: same inputs always yield the same email. */
export function renderTesterRequestNotification(
  params: TesterRequestNotificationParams
): RenderedEmail {
  const safeEmail = escapeHtml(params.email);
  const safeSource = escapeHtml(params.source);
  const safeAdminUrl = escapeHtml(params.adminUrl);
  const noteBlock = params.note
    ? `<p style="margin:0 0 16px 0; font-size:14px; line-height:1.5; color:${COLOR_TEXT_MUTED};">&ldquo;${escapeHtml(params.note)}&rdquo;</p>`
    : "";

  const subject = `Spotify seat request: ${params.email}`;
  const text = `New Spotify tester request — ${BRAND_NAME}

${params.email} asked for a Spotify seat (via ${params.source}).${params.note ? `\n\nTheir note: "${params.note}"` : ""}

${params.pendingCount} request${params.pendingCount === 1 ? "" : "s"} pending.

Allowlist the email in the Spotify Developer Dashboard first, then approve it here:
${params.adminUrl}`;

  const html = `<!doctype html>
<html lang="en">
  <head><meta charset="utf-8" /><title>${escapeHtml(subject)}</title></head>
  <body style="margin:0; padding:24px; background-color:${COLOR_BG}; color:${COLOR_TEXT}; font-family:${FONT_STACK};">
    <p style="margin:0 0 6px 0; font-size:10px; letter-spacing:0.22em; text-transform:uppercase; color:${COLOR_TEXT_FAINT};">${BRAND_NAME} · admin</p>
    <h1 style="margin:0 0 14px 0; font-size:22px; font-weight:900; color:${COLOR_TEXT};">New Spotify tester request</h1>
    <p style="margin:0 0 16px 0; font-size:15px; line-height:1.5; color:${COLOR_TEXT_MUTED};"><strong style="color:${COLOR_TEXT};">${safeEmail}</strong> asked for a Spotify seat (via ${safeSource}).</p>
    ${noteBlock}
    <p style="margin:0 0 20px 0; font-size:13px; color:${COLOR_TEXT_FAINT};">${params.pendingCount} request${params.pendingCount === 1 ? "" : "s"} pending. Allowlist the email in the Spotify Developer Dashboard <em>first</em>, then approve it in the panel.</p>
    <a href="${safeAdminUrl}" style="display:inline-block; padding:12px 24px; font-size:14px; font-weight:800; color:${COLOR_BUTTON_TEXT}; background-color:${COLOR_BUTTON_BG}; text-decoration:none; border-radius:10px;">Open the review panel</a>
  </body>
</html>`;

  return { subject, html, text };
}

export type TesterInviteEmailParams = {
  /** Absolute URL of the sign-in surface the invite should land on. */
  signInUrl: string;
  /** The approved email — the invite states the Spotify account must match it. */
  email: string;
};

/** Render the applicant invite ("your seat is ready"). Pure. */
export function renderTesterInviteEmail(params: TesterInviteEmailParams): RenderedEmail {
  const safeUrl = escapeHtml(params.signInUrl);
  const safeEmail = escapeHtml(params.email);

  const subject = `Your Spotify seat on ${BRAND_NAME} is ready`;
  const text = `You're in — ${BRAND_NAME}

Your Spotify beta seat is ready. Sign in with the Spotify account that uses ${params.email} and your listening taste starts feeding your show discovery right away:
${params.signInUrl}

Heads up: the seat is tied to that exact email — if your Spotify account uses a different one, reply and we'll swap it.

Everything else works without Spotify too — email sign-in is always available.`;

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="color-scheme" content="dark" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${COLOR_BG}; color:${COLOR_TEXT}; font-family:${FONT_STACK};">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR_BG};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:${COLOR_SURFACE}; border:1px solid ${COLOR_BORDER}; border-radius:16px;">
            <tr>
              <td style="padding:36px 36px 32px 36px;">
                <p style="margin:0 0 28px 0; font-size:10px; line-height:1; letter-spacing:0.22em; text-transform:uppercase; color:${COLOR_TEXT_FAINT};">${BRAND_NAME}</p>
                <h1 style="margin:0 0 14px 0; font-size:30px; line-height:1.05; font-weight:900; letter-spacing:-0.02em; color:${COLOR_TEXT};">You&rsquo;re in</h1>
                <p style="margin:0 0 32px 0; font-size:15px; line-height:1.5; color:${COLOR_TEXT_MUTED};">Your Spotify beta seat is ready. Sign in with the Spotify account that uses <strong style="color:${COLOR_TEXT};">${safeEmail}</strong> and your listening taste starts feeding your show discovery right away.</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px; background-color:${COLOR_BUTTON_BG};">
                      <a href="${safeUrl}" target="_blank" style="display:inline-block; padding:14px 32px; font-size:14px; font-weight:800; letter-spacing:0.02em; color:${COLOR_BUTTON_TEXT}; text-decoration:none; border-radius:10px;">Sign in with Spotify</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:32px 0 0 0; font-size:12px; line-height:1.6; color:${COLOR_TEXT_FAINT};">The seat is tied to that exact email &mdash; if your Spotify account uses a different one, reply and we&rsquo;ll swap it. Everything else works without Spotify too.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  return { subject, html, text };
}

/**
 * Send the applicant invite via Resend. Reads the sender + key from env exactly like
 * `sendAdminNotificationEmail`; throws when they're missing or Resend rejects, so the caller can
 * keep the request in `approved` (not `invited`) and the panel offers a retry.
 */
export async function sendTesterInviteEmail(params: {
  to: string;
  signInUrl: string;
}): Promise<void> {
  const apiKey = process.env.AUTH_RESEND_KEY?.trim();
  const from = process.env.AUTH_EMAIL_FROM?.trim().replace(/^["'](.*)["']$/, "$1").trim();
  if (!apiKey || !from) {
    throw new Error("Resend is not configured (AUTH_RESEND_KEY / AUTH_EMAIL_FROM).");
  }

  const { subject, html, text } = renderTesterInviteEmail({
    signInUrl: params.signInUrl,
    email: params.to,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to: params.to, subject, html, text }),
  });

  if (!res.ok) {
    throw new Error("Resend error: " + JSON.stringify(await res.json()));
  }
}

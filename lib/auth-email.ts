/**
 * Branded magic-link sign-in email (PRD 34 / Phase 14, design pass).
 *
 * Auth.js's stock Resend provider sends a generic light-mode email. This renders the
 * sign-in email in the AVLmc "high-contrast journal" aesthetic instead (see
 * `docs/design/AVLmc-Design-Spec.md`): true-black background (`#0A0A0A`), zinc surfaces,
 * a crisp-white `font-black` heading, uppercase-tracked metadata, and a single
 * high-contrast (white-on-black) sign-in button — the same primary-focus convention the
 * board cards use (`bg-zinc-100`).
 *
 * `renderMagicLinkEmail` is pure and unit-testable; `sendMagicLinkEmail` does the Resend
 * POST (mirroring the default provider's call) so `auth.ts` can pass it straight to the
 * provider's `sendVerificationRequest`. No new dependency — the HTML is an inline string.
 */

const BRAND_NAME = "AVL Music Companion";
const BRAND_TAGLINE = "Asheville shows, worth showing up for";

// Design-spec tokens (inline, since email clients don't run Tailwind).
const COLOR_BG = "#0A0A0A"; // deep true black — the core foundation
const COLOR_SURFACE = "#18181b"; // zinc-900 surface
const COLOR_BORDER = "#27272a"; // zinc-800 stroke
const COLOR_TEXT = "#ffffff"; // crisp white primary
const COLOR_TEXT_MUTED = "#a1a1aa"; // zinc-400 secondary
const COLOR_TEXT_FAINT = "#71717a"; // zinc-500 tertiary
const COLOR_BUTTON_BG = "#fafafa"; // zinc-50 — high-contrast primary focus
const COLOR_BUTTON_TEXT = "#0A0A0A"; // black on the white button
const FONT_STACK =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Escape a value for safe interpolation into HTML text / attribute contexts. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export type MagicLinkEmailParams = {
  /** The verification (sign-in) URL the listener must click. */
  url: string;
  /** The host the link points at, used in copy + subject. */
  host: string;
  /**
   * Absolute, publicly-reachable logo URL (e.g. `https://avlmc.vercel.app/icon.png`). Email
   * clients can't load relative/local paths, so this must be a full https URL. Optional — when
   * omitted the header degrades to the text wordmark alone (also the fallback when a client
   * blocks remote images, which many do by default).
   */
  logoUrl?: string;
};

export type RenderedEmail = {
  subject: string;
  html: string;
  text: string;
};

/**
 * Render the branded sign-in email. Pure: given the same url/host/logoUrl it always returns
 * the same `{ subject, html, text }`.
 */
export function renderMagicLinkEmail({ url, host, logoUrl }: MagicLinkEmailParams): RenderedEmail {
  const safeUrl = escapeHtml(url);
  const safeHost = escapeHtml(host);

  const subject = `Your ${BRAND_NAME} sign-in link`;

  // Logo image (absolute https URL only). Kept above the text wordmark, which doubles as the
  // fallback when a client blocks remote images. `alt` carries the brand name in that case.
  const logoBlock = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" width="48" height="48" alt="${BRAND_NAME}" style="display:block; width:48px; height:48px; border:0; border-radius:12px; margin:0 0 20px 0;" />`
    : "";

  const html = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${escapeHtml(subject)}</title>
  </head>
  <body style="margin:0; padding:0; background-color:${COLOR_BG}; color:${COLOR_TEXT}; font-family:${FONT_STACK}; -webkit-font-smoothing:antialiased;">
    <span style="display:none; max-height:0; overflow:hidden; opacity:0;">Your sign-in link is here. No password to forget, no merch table to find. Expires in 24 hours.</span>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:${COLOR_BG};">
      <tr>
        <td align="center" style="padding:40px 16px;">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px; background-color:${COLOR_SURFACE}; border:1px solid ${COLOR_BORDER}; border-radius:16px;">
            <tr>
              <td style="padding:36px 36px 28px 36px;">
                ${logoBlock}
                <p style="margin:0 0 6px 0; font-size:10px; line-height:1; letter-spacing:0.22em; text-transform:uppercase; color:${COLOR_TEXT_FAINT};">${BRAND_NAME}</p>
                <p style="margin:0 0 28px 0; font-size:10px; line-height:1; letter-spacing:0.18em; text-transform:uppercase; color:${COLOR_TEXT_FAINT};">${BRAND_TAGLINE}</p>
                <h1 style="margin:0 0 14px 0; font-size:30px; line-height:1.05; font-weight:900; letter-spacing:-0.02em; color:${COLOR_TEXT};">You&rsquo;re on the list</h1>
                <p style="margin:0 0 32px 0; font-size:15px; line-height:1.5; color:${COLOR_TEXT_MUTED};">Tap the button to sign in &mdash; no password to forget, no will-call line to wait in.</p>
                <table role="presentation" cellpadding="0" cellspacing="0">
                  <tr>
                    <td style="border-radius:10px; background-color:${COLOR_BUTTON_BG};">
                      <a href="${safeUrl}" target="_blank" style="display:inline-block; padding:14px 32px; font-size:14px; font-weight:800; letter-spacing:0.02em; color:${COLOR_BUTTON_TEXT}; text-decoration:none; border-radius:10px;">Sign in to ${BRAND_NAME}</a>
                    </td>
                  </tr>
                </table>
                <p style="margin:32px 0 0 0; font-size:12px; line-height:1.5; color:${COLOR_TEXT_FAINT};">Or paste this link into your browser:</p>
                <p style="margin:6px 0 0 0; font-size:12px; line-height:1.5; word-break:break-all;"><a href="${safeUrl}" target="_blank" style="color:${COLOR_TEXT_MUTED}; text-decoration:underline;">${safeUrl}</a></p>
              </td>
            </tr>
            <tr>
              <td style="padding:0 36px;"><div style="height:1px; background-color:${COLOR_BORDER};"></div></td>
            </tr>
            <tr>
              <td style="padding:20px 36px 32px 36px;">
                <p style="margin:0; font-size:9px; line-height:1.6; letter-spacing:0.18em; text-transform:uppercase; color:${COLOR_TEXT_FAINT};">Link expires in 24 hours &middot; ${safeHost}</p>
                <p style="margin:10px 0 0 0; font-size:12px; line-height:1.5; color:${COLOR_TEXT_FAINT};">If you didn&rsquo;t request this, you can safely ignore it &mdash; we&rsquo;ll keep your seat warm.</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `You're on the list — ${BRAND_NAME}
${BRAND_TAGLINE}

Tap this link to sign in (no password to forget, no will-call line):
${url}

This link expires in 24 hours.
If you didn't request this, you can safely ignore it — we'll keep your seat warm.`;

  return { subject, html, text };
}

/**
 * Send the branded sign-in email via the Resend API. Mirrors the default Resend provider's
 * POST so it can be dropped straight into `sendVerificationRequest`; throws on a non-OK
 * response so Auth.js surfaces the failure (it must not silently no-op).
 */
export async function sendMagicLinkEmail(params: {
  to: string;
  url: string;
  apiKey: string;
  from: string;
}): Promise<void> {
  // Derive the logo from the sign-in link's own origin so it resolves on whatever host sent it
  // (prod, preview, or a custom domain) — `public/icon.png` is served at `<origin>/icon.png`.
  const { host, origin } = new URL(params.url);
  const { subject, html, text } = renderMagicLinkEmail({
    url: params.url,
    host,
    logoUrl: `${origin}/icon.png`,
  });

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: params.from,
      to: params.to,
      subject,
      html,
      text,
    }),
  });

  if (!res.ok) {
    throw new Error("Resend error: " + JSON.stringify(await res.json()));
  }
}

/**
 * Fire a plain admin-notification email via Resend (e.g. a new curator recommendation landed in the
 * queue). Reuses the same Resend POST as sign-in but is self-contained: it reads the sender + key
 * from env and the recipient from `ADMIN_NOTIFY_EMAIL` (falling back to the sender address). When any
 * of those is missing it no-ops — notifications are a nicety, never a blocker, and the caller still
 * wraps this so a Resend failure can't break the underlying write.
 */
export async function sendAdminNotificationEmail(params: {
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const apiKey = process.env.AUTH_RESEND_KEY?.trim();
  // Mirror auth.ts resolveEmailFrom: strip a single wrapping quote pair Resend would otherwise reject.
  const from = process.env.AUTH_EMAIL_FROM?.trim().replace(/^["'](.*)["']$/, "$1").trim();
  const to = (process.env.ADMIN_NOTIFY_EMAIL?.trim() || from)?.replace(/^["'](.*)["']$/, "$1").trim();
  if (!apiKey || !from || !to) {
    return;
  }

  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  });

  if (!res.ok) {
    throw new Error("Resend error: " + JSON.stringify(await res.json()));
  }
}

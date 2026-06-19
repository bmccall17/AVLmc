import assert from "node:assert/strict";
import test from "node:test";
import { renderMagicLinkEmail } from "../lib/auth-email";

const URL_FIXTURE =
  "https://avlmc.vercel.app/api/auth/callback/resend?token=abc123&email=fan%40example.com";

test("renders subject, html, and text for a sign-in link", () => {
  const { subject, html, text } = renderMagicLinkEmail({
    url: URL_FIXTURE,
    host: "avlmc.vercel.app",
  });

  assert.match(subject, /AVL Music Companion/);
  assert.ok(html.length > 0 && text.length > 0, "both bodies are populated");
  // The link must appear in both the button href and the plain-text fallback.
  assert.ok(html.includes(`href="${URL_FIXTURE.replace(/&/g, "&amp;")}"`));
  assert.ok(text.includes(URL_FIXTURE));
});

test("carries the dark-mode design tokens (true black bg, white-on-black button)", () => {
  const { html } = renderMagicLinkEmail({ url: URL_FIXTURE, host: "avlmc.vercel.app" });
  assert.ok(html.includes("#0A0A0A"), "true-black background token present");
  assert.ok(html.includes("#fafafa"), "high-contrast button surface present");
  assert.ok(/font-weight:900/.test(html), "font-black heading present");
  assert.ok(/text-transform:uppercase/.test(html), "uppercase-tracked metadata present");
  assert.ok(html.includes('content="dark"'), "declares a dark color-scheme");
});

test("escapes HTML-significant characters in the url (no attribute breakout)", () => {
  const hostile = 'https://evil.example/"><script>alert(1)</script>';
  const { html } = renderMagicLinkEmail({ url: hostile, host: "evil.example" });
  assert.ok(!html.includes("<script>"), "raw script tag is escaped");
  assert.ok(html.includes("&lt;script&gt;"), "angle brackets are entity-encoded");
});

test("renders the logo img when a logoUrl is provided", () => {
  const { html } = renderMagicLinkEmail({
    url: URL_FIXTURE,
    host: "avlmc.vercel.app",
    logoUrl: "https://avlmc.vercel.app/icon.png",
  });
  assert.ok(
    html.includes('src="https://avlmc.vercel.app/icon.png"'),
    "logo image points at the absolute URL"
  );
  assert.ok(/alt="AVL Music Companion"/.test(html), "logo has brand alt text for blocked-image fallback");
});

test("omits the logo img (wordmark-only) when no logoUrl is given", () => {
  const { html } = renderMagicLinkEmail({ url: URL_FIXTURE, host: "avlmc.vercel.app" });
  assert.ok(!html.includes("<img"), "no broken image element without a URL");
  assert.ok(html.includes("AVL Music Companion"), "text wordmark still present");
});

test("is pure — identical inputs produce identical output", () => {
  const a = renderMagicLinkEmail({ url: URL_FIXTURE, host: "avlmc.vercel.app", logoUrl: "https://x/icon.png" });
  const b = renderMagicLinkEmail({ url: URL_FIXTURE, host: "avlmc.vercel.app", logoUrl: "https://x/icon.png" });
  assert.deepEqual(a, b);
});

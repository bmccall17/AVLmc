import { test, expect, type Page } from "@playwright/test";

/**
 * Readability & integrity smoke test (PRD 41, Phase 16 C3).
 *
 * Guards the C1 (PRD 39) dark route-shell token contract and the C2 (PRD 40) legible failure states
 * against silent regression. For every route in the audit table, at desktop (1440) and mobile (390),
 * it asserts:
 *   1. no horizontal overflow (the audit's overflow blocker),
 *   2. the page rendered its serving content (not the dark error boundary),
 *   3. a dark-shell-aware DOM contrast pass — no light-on-dark / dark-on-dark body text.
 *
 * Runs against the PRD 41 missing-`DATABASE_URL` degrade path (see playwright.smoke.config.ts), so
 * the sweep needs no database: DB-backed routes render their empty/seed state.
 */

const ADMIN_COOKIE = { name: "avl_admin_session", value: "local-admin-session" };

type Route = {
  path: string;
  // A heading/text the serving page must show — proves we did not fall through to the error boundary.
  expectText: RegExp;
  admin?: boolean;
};

const ROUTES: Route[] = [
  { path: "/", expectText: /Asheville|shows|board|upcoming/i },
  { path: "/curators", expectText: /curator/i },
  { path: "/curators/apply", expectText: /curator/i },
  { path: "/curators/recommend", expectText: /curator|recommend/i },
  { path: "/curator/does-not-exist-smoke", expectText: /missed that connection|not found|curator/i },
  { path: "/auth/error?code=unknown", expectText: /sign|try again|something|account|error/i },
  { path: "/this-route-does-not-exist-smoke", expectText: /missed that connection/i },
  { path: "/admin", expectText: /admin|health|overview|architecture/i, admin: true },
  { path: "/admin/curators", expectText: /curator/i, admin: true },
];

const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "mobile", width: 390, height: 844 },
];

// The canonical dark route-shell backdrop (PRD 39). Used as the effective background when an element
// resolves to a transparent stack (the full-bleed `::before` paints this behind everything).
const DARK_BACKDROP = "#0a0a0a";

// Colors the June 25 audit explicitly accepted as operator-only / brand near-AA text and recorded in
// PRD 41 "Remaining (open)": zinc-500 tertiary labels + the footer "Privacy" link, and zinc-600 stat
// captions (~4.1 / ~2.3:1 on dark). They are intentional dim-secondary styling, not the split-token
// light-on-dark regression this guard exists to catch — so they pass. Anything else below AA fails.
const TOLERATED_COLORS = ["rgb(113, 113, 122)", "rgb(82, 82, 91)"];

/** In-page contrast audit. Returns text elements whose contrast against their effective background
 *  fails WCAG AA. Kept as a single stringified function so it runs in the browser context. */
async function findContrastFailures(page: Page, backdrop: string, tolerated: string[]) {
  return page.evaluate(([fallbackBg, toleratedColors]: [string, string[]]) => {
    const toleratedSet = new Set(toleratedColors.map((c) => c.replace(/\s+/g, "")));
    function parseColor(input: string): [number, number, number, number] | null {
      const m = input.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1].split(",").map((p) => parseFloat(p.trim()));
      const [r, g, b] = parts;
      const a = parts.length >= 4 ? parts[3] : 1;
      if ([r, g, b].some((n) => Number.isNaN(n))) return null;
      return [r, g, b, a];
    }

    function relLuminance([r, g, b]: [number, number, number]) {
      const chan = [r, g, b].map((v) => {
        const s = v / 255;
        return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
      });
      return 0.2126 * chan[0] + 0.7152 * chan[1] + 0.0722 * chan[2];
    }

    function contrast(fg: [number, number, number], bg: [number, number, number]) {
      const l1 = relLuminance(fg);
      const l2 = relLuminance(bg);
      const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
      return (hi + 0.05) / (lo + 0.05);
    }

    // Composite a possibly-translucent foreground color over an opaque background.
    function composite(
      fg: [number, number, number, number],
      bg: [number, number, number]
    ): [number, number, number] {
      const a = fg[3];
      return [
        Math.round(fg[0] * a + bg[0] * (1 - a)),
        Math.round(fg[1] * a + bg[1] * (1 - a)),
        Math.round(fg[2] * a + bg[2] * (1 - a)),
      ];
    }

    const fallback = parseColor(fallbackBg) ?? [10, 10, 10, 1];
    const fallbackRgb: [number, number, number] = [fallback[0], fallback[1], fallback[2]];

    // Walk ancestors to find the first opaque background color; composite translucent ones over the
    // dark backdrop so we judge against what actually paints.
    function effectiveBackground(el: Element): [number, number, number] {
      let node: Element | null = el;
      let acc: [number, number, number] = fallbackRgb;
      const stack: [number, number, number, number][] = [];
      while (node) {
        const bg = parseColor(getComputedStyle(node).backgroundColor);
        if (bg && bg[3] > 0) {
          if (bg[3] >= 1) {
            acc = [bg[0], bg[1], bg[2]];
            let out = acc;
            for (let i = stack.length - 1; i >= 0; i--) out = composite(stack[i], out);
            return out;
          }
          stack.push(bg);
        }
        node = node.parentElement;
      }
      let out = fallbackRgb;
      for (let i = stack.length - 1; i >= 0; i--) out = composite(stack[i], out);
      return out;
    }

    function hasDirectText(el: Element) {
      for (const node of Array.from(el.childNodes)) {
        if (node.nodeType === Node.TEXT_NODE && (node.textContent ?? "").trim().length > 0) {
          return true;
        }
      }
      return false;
    }

    const failures: Array<{ tag: string; text: string; ratio: number; color: string; bg: string }> = [];
    const elements = document.querySelectorAll(
      "h1, h2, h3, h4, p, a, button, span, li, label, small, strong, td, th, dt, dd"
    );

    for (const el of Array.from(elements)) {
      if (!hasDirectText(el)) continue;
      const style = getComputedStyle(el);
      if (style.visibility === "hidden" || style.display === "none" || Number(style.opacity) === 0) {
        continue;
      }
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;

      const fg = parseColor(style.color);
      if (!fg || fg[3] === 0) continue;
      if (toleratedSet.has(style.color.replace(/\s+/g, ""))) continue;

      const bg = effectiveBackground(el);
      const fgComposited = composite(fg, bg);
      const ratio = contrast(fgComposited, bg);

      const fontSize = parseFloat(style.fontSize);
      const bold = Number(style.fontWeight) >= 700;
      const isLarge = fontSize >= 24 || (bold && fontSize >= 18.66);
      const threshold = isLarge ? 3 : 4.5;

      if (ratio < threshold) {
        failures.push({
          tag: el.tagName.toLowerCase(),
          text: (el.textContent ?? "").trim().slice(0, 40),
          ratio: Math.round(ratio * 100) / 100,
          color: style.color,
          bg: `rgb(${bg.join(",")})`,
        });
      }
    }
    return failures;
  }, [backdrop, tolerated] as [string, string[]]);
}

for (const viewport of VIEWPORTS) {
  test.describe(`readability @ ${viewport.label} (${viewport.width})`, () => {
    for (const route of ROUTES) {
      test(`${route.path} renders readably with no overflow`, async ({ page, context }) => {
        await page.setViewportSize({ width: viewport.width, height: viewport.height });
        if (route.admin) {
          await context.addCookies([{ ...ADMIN_COOKIE, url: "http://localhost:3101" }]);
        }

        await page.goto(route.path, { waitUntil: "networkidle" });

        // 1. Serving content rendered (not the dark error boundary).
        await expect(page.getByText(route.expectText).first()).toBeVisible();

        // 2. No horizontal overflow at this viewport.
        const overflow = await page.evaluate(
          () => document.documentElement.scrollWidth - window.innerWidth
        );
        expect(overflow, `horizontal overflow of ${overflow}px on ${route.path}`).toBeLessThanOrEqual(1);

        // 3. Dark-shell-aware contrast pass.
        const failures = await findContrastFailures(page, DARK_BACKDROP, TOLERATED_COLORS);
        expect(
          failures,
          `low-contrast text on ${route.path}:\n${JSON.stringify(failures, null, 2)}`
        ).toEqual([]);
      });
    }
  });
}

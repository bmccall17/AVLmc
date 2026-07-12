import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  outputFileTracingRoot: __dirname,
  // The admin design-sandbox route streams this static mock from docs/ at runtime; make sure the
  // file is traced into the serverless bundle.
  outputFileTracingIncludes: {
    "/admin/design/redesign-sandbox": ["./docs/avlmc-redesign-sandbox.html"],
    // The Health tab's schema-drift probe diffs the live DB against the declared schema at runtime.
    "/admin": ["./db/schema.sql"]
  },
  images: {
    // PRD 50 / ADR 003 §2: `/_next/image?url=` optimizes only these hosts — a `**` wildcard makes
    // the optimizer an open proxy anyone can bill us through. Posters currently render via plain
    // <img> (unaffected); every current <Image> src is a local static asset. Verified against live
    // prod `events.image_url` hosts on Jul 12, 2026 before locking. Extend this list deliberately
    // if a component starts rendering a remote host through next/image.
    remotePatterns: [
      { protocol: "https", hostname: "*.blob.vercel-storage.com" },
      { protocol: "https", hostname: "i.scdn.co" },
      { protocol: "https", hostname: "*.fbcdn.net" },
      { protocol: "https", hostname: "www.avlgo.com" }
    ],
    // PRD 51 / ADR 002 §5: each source image is transformed ~once, not per-viewer-per-viewport.
    // Every current <Image> is a small fixed-size local asset (24–42px logos/previews), so the
    // size matrix is pruned to those slots plus a small responsive set for future poster use;
    // 31-day cache TTL keeps re-transforms off the bill (sources change only via re-ingest,
    // which changes the URL).
    minimumCacheTTL: 2678400,
    deviceSizes: [640, 1080, 1920],
    imageSizes: [32, 48, 64, 96]
  }
};

export default nextConfig;

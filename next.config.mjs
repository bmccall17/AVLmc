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
    ]
  }
};

export default nextConfig;

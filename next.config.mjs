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
    remotePatterns: [
      {
        protocol: "https",
        hostname: "**"
      }
    ]
  }
};

export default nextConfig;

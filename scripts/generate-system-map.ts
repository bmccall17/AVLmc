/**
 * Generates the agent-readable Markdown system map (PRD 06 / C1, Outcome 3).
 *
 * Renders the typed System Registry to `docs/product/system-map.generated.md`. Run after editing
 * `lib/system-registry.ts`:  `npm run generate:system-map`. The drift-guard test
 * (`npm run test:registry`) fails if the checked-in file is out of sync with the registry.
 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { getSystemRegistry } from "@/lib/system-registry";
import { renderSystemMapMarkdown } from "@/lib/admin/system-map-markdown";

const outPath = join(process.cwd(), "docs/product/system-map.generated.md");
const markdown = renderSystemMapMarkdown(getSystemRegistry());
writeFileSync(outPath, markdown, "utf8");

// eslint-disable-next-line no-console
console.log(`Wrote ${outPath} (${markdown.length} bytes)`);

// Prepend the "use client" directive to the bundled outputs.
//
// esbuild strips module-level directives when bundling (tsup's `banner` is ignored
// with a warning), so we add it back here. The entire package is client-side, so the
// directive belongs at the very top of each JS entry for Next.js App Router consumers.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const distDir = join(dirname(fileURLToPath(import.meta.url)), "..", "dist");
const directive = '"use client";\n';

for (const file of ["index.mjs", "index.cjs"]) {
  const path = join(distDir, file);
  const src = readFileSync(path, "utf8");
  if (src.startsWith('"use client"') || src.startsWith("'use client'")) {
    continue;
  }
  writeFileSync(path, directive + src);
  console.log(`add-use-client: prepended directive to dist/${file}`);
}

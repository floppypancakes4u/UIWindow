import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm", "cjs"],
  outExtension({ format }) {
    return { js: format === "cjs" ? ".cjs" : ".mjs" };
  },
  dts: true,
  sourcemap: true,
  clean: true,
  treeshake: true,
  // react/react-dom are peer deps — never bundle them.
  external: ["react", "react-dom", "react/jsx-runtime"],
  // Note: esbuild strips a module-level "use client" banner when bundling, so the
  // directive is re-added to the output by scripts/add-use-client.mjs (see build script).
});

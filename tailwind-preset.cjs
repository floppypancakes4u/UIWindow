/**
 * Tailwind preset for @spify/app-window.
 *
 * The window UI is styled with Tailwind utility classes (default `zinc` / `sky` /
 * `yellow` palette — no custom colors). Tailwind's content scanner must see the
 * package's built files or it will purge the window classes. Add this preset to your
 * Tailwind config:
 *
 *   // tailwind.config.{js,ts}
 *   presets: [require("@spify/app-window/tailwind-preset")],
 *
 * If your project resolves the package somewhere other than the local `node_modules`
 * (e.g. a monorepo hoist), add the matching `dist` glob to your own `content` instead.
 */
module.exports = {
  content: ["./node_modules/@spify/app-window/dist/**/*.{js,mjs,cjs}"],
};

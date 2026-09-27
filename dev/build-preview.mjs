// Bundles the UI against the obsidian shim into dev/www. `--serve` starts a local server on :8000.
import esbuild from "esbuild";
import { cpSync, mkdirSync } from "node:fs";

mkdirSync("dev/www", { recursive: true });
cpSync("dev/index.html", "dev/www/index.html");
cpSync("styles.css", "dev/www/styles.css");

const ctx = await esbuild.context({
  entryPoints: ["dev/preview.tsx"],
  bundle: true,
  outfile: "dev/www/preview.js",
  format: "iife",
  jsx: "automatic",
  jsxImportSource: "preact",
  alias: { obsidian: "./dev/obsidian-shim.ts" },
  sourcemap: "inline",
  logLevel: "info",
});
if (process.argv.includes("--serve")) {
  await ctx.watch();
  const { port } = await ctx.serve({ servedir: "dev/www", port: 8000 });
  console.log(`preview on http://localhost:${port}`);
} else {
  await ctx.rebuild();
  await ctx.dispose();
}

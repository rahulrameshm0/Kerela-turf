import { build } from "esbuild";
import { mkdir, copyFile, cp } from "node:fs/promises";
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/app.js"],
  bundle: true,
  format: "esm",
  outfile: "dist/app.js",
  minify: true,
  sourcemap: false,
  target: ["es2022"],
});
await Promise.all(
  ["index.html", "styles.css"].map((file) => copyFile(file, `dist/${file}`)),
);
await cp("public/media", "dist/media", { recursive: true, filter: (src) => !src.endsWith(".md") });
console.log("Built TurfKerala into dist/");

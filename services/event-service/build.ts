import { build } from "esbuild";

const common = {
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  packages: "external",
  tsconfig: "./tsconfig.json",
} as const;

await build({
  ...common,
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
});
await build({
  ...common,
  entryPoints: ["src/db/migrate.ts"],
  outfile: "dist/db/migrate.js",
});
await build({
  ...common,
  entryPoints: ["src/db/cleanup.ts"],
  outfile: "dist/db/cleanup.js",
});

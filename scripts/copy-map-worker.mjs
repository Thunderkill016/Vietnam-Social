import { copyFileSync, mkdirSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
// MapLibre 6 requires adjacent worker/shared modules with Next.js asset handling.
// https://maplibre.org/maplibre-gl-js/docs/#installation
const packageDirectory = dirname(
  createRequire(import.meta.url).resolve("maplibre-gl/package.json"),
);
const output = join(process.cwd(), "public/maplibre");
mkdirSync(output, { recursive: true });
for (const name of ["maplibre-gl-worker.mjs", "maplibre-gl-shared.mjs"]) {
  copyFileSync(join(packageDirectory, "dist", name), join(output, name));
}

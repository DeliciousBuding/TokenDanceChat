/**
 * PWA icon sync.
 * Copies the approved TokenDance rounded app icon into the legacy icon names
 * consumed by the manifest and service worker.
 *
 * Usage: node scripts/generate-icons.mjs
 */

import { copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

for (const size of [192, 512]) {
  const source = join(publicDir, `token-dance-icon-${size}.png`);
  const target = join(publicDir, `icon-${size}.png`);
  if (!existsSync(source)) {
    throw new Error(`Missing TokenDance icon source: ${source}`);
  }
  copyFileSync(source, target);
  console.log(`Synced ${target}`);
}

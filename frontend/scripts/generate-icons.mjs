/**
 * PWA icon sync.
 * Copies the approved TokenDance Org rounded app icon into the legacy icon
 * names kept only for browser/PWA cache compatibility.
 *
 * Usage: node scripts/generate-icons.mjs
 */

import { copyFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const publicDir = join(__dirname, "..", "public");

for (const size of [192, 512]) {
  const source = join(publicDir, `tokendance-icon-rounded-${size}.png`);
  const target = join(publicDir, `icon-${size}.png`);
  if (!existsSync(source)) {
    throw new Error(`Missing TokenDance icon source: ${source}`);
  }
  copyFileSync(source, target);
  console.log(`Synced ${target}`);
}

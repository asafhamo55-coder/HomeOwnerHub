// scripts/build-email-logo.ts
/**
 * Rasterises the email header logo: the marketing site's logo-full.svg,
 * exactly as shipped (no recolouring, so the site stays the one source of
 * truth), at 2x (360px wide, shown at 180) on an OPAQUE white field. Opaque
 * because mail clients invert CSS colours but never image pixels: a
 * transparent PNG of dark ink would vanish on an inverted background.
 *
 * Output: apps/hoa/public/email/v2/ (v2 so caches drop the old violet PNG).
 *
 * Run: pnpm build:email-logo
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { BRAND, LOGO_DIR, LOGO_FILE, LOGO_WIDTH } from '../apps/hoa/src/lib/email/brand'

async function main(): Promise<void> {
  const root = process.cwd()
  const svg = await readFile(path.join(root, 'apps/marketing/public/brand/logo-full.svg'), 'utf8')
  const width = LOGO_WIDTH * 2
  const buf = await sharp(Buffer.from(svg), { density: 600 })
    .resize({ width })
    .flatten({ background: BRAND.card })
    .png({ compressionLevel: 9 })
    .toBuffer()
  await mkdir(path.join(root, 'apps/hoa/public', LOGO_DIR), { recursive: true })
  const out = path.join(root, 'apps/hoa/public', LOGO_DIR, LOGO_FILE)
  await writeFile(out, buf)
  const meta = await sharp(buf).metadata()
  console.log(`  ${LOGO_FILE}  ${meta.width}x${meta.height}  ${(buf.length / 1024).toFixed(1)}kb`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

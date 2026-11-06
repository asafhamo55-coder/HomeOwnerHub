// scripts/build-email-logo.ts
/**
 * Rasterises the email header logo: the full-colour HomeownerHub lockup at
 * 2x (360px wide, shown at 180) on an OPAQUE white field, in the royal
 * purple the marketing site now uses.
 *
 * It recolours the old-violet tile and "Hub" (#4B27C9) from the shipped
 * logo-full.svg rather than waiting for the marketing PNGs, which a
 * separate session owns. Once `pnpm brand:assets` ships royal-purple
 * logos, this script gives identical output. Opaque because mail clients
 * invert CSS colours but never image pixels: a transparent PNG of dark ink
 * would vanish on an inverted background.
 *
 * Run: pnpm build:email-logo
 */
import { readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { BRAND, LOGO_FILE, LOGO_WIDTH } from '../apps/hoa/src/lib/email/brand'

const OLD_VIOLET = '#4B27C9'

async function main(): Promise<void> {
  const root = process.cwd()
  const svg = (await readFile(path.join(root, 'apps/marketing/public/brand/logo-full.svg'), 'utf8')).replaceAll(
    OLD_VIOLET,
    BRAND.primary,
  )
  const width = LOGO_WIDTH * 2
  const buf = await sharp(Buffer.from(svg), { density: 600 })
    .resize({ width })
    .flatten({ background: BRAND.card })
    .png({ compressionLevel: 9 })
    .toBuffer()
  const out = path.join(root, 'apps/hoa/public/email/v1', LOGO_FILE)
  await writeFile(out, buf)
  const meta = await sharp(buf).metadata()
  console.log(`  ${LOGO_FILE}  ${meta.width}x${meta.height}  ${(buf.length / 1024).toFixed(1)}kb`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

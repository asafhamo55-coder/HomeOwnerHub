// scripts/build-email-logo.ts
/**
 * Rasterises the email header logo as a self-contained BADGE: a primary blue
 * (#2563EB) rounded rectangle holding the marketing site's WHITE logo
 * variant (logo-full-dark.svg, exactly as shipped), at 2x (400x96, shown at
 * 200x48), with real alpha outside the rounded corners.
 *
 * Why a badge and not dark ink on white: mail clients in dark mode invert
 * CSS colours but never image pixels, so the old opaque white field showed
 * as a white rectangle. A blue badge with transparent corners looks
 * deliberate on a light band and on a dark one.
 *
 * Output: apps/hoa/public/email/v4/ (v4 so caches drop the purple PNG).
 * v3 stays in place for emails already sent.
 *
 * Run: pnpm build:email-logo
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'
import { BRAND, LOGO_DIR, LOGO_FILE, LOGO_HEIGHT, LOGO_WIDTH } from '../apps/hoa/src/lib/email/brand'

const RADIUS = 12 // px at 2x
const LOGO_PX_HEIGHT = 56 // white logo height inside the badge at 2x

async function main(): Promise<void> {
  const root = process.cwd()
  // The marketing SVG may still carry the old purple tile and door; repaint them to the blue palette in memory.
  const svg = (await readFile(path.join(root, 'apps/marketing/public/brand/logo-full-dark.svg'), 'utf8'))
    .replace(/#6D28D9/gi, BRAND.primary)
    .replace(/#E9D5FF/gi, '#FFFFFF')
  const w = LOGO_WIDTH * 2
  const h = LOGO_HEIGHT * 2
  const logo = await sharp(Buffer.from(svg), { density: 600 }).resize({ height: LOGO_PX_HEIGHT }).png().toBuffer()
  const lm = await sharp(logo).metadata()
  const badge = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="${w}" height="${h}" rx="${RADIUS}" ry="${RADIUS}" fill="${BRAND.primary}"/></svg>`,
  )
  const buf = await sharp(badge, { density: 72 })
    .composite([
      {
        input: logo,
        left: Math.round((w - (lm.width ?? 0)) / 2),
        top: Math.round((h - (lm.height ?? 0)) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toBuffer()
  await mkdir(path.join(root, 'apps/hoa/public', LOGO_DIR), { recursive: true })
  const out = path.join(root, 'apps/hoa/public', LOGO_DIR, LOGO_FILE)
  await writeFile(out, buf)
  const meta = await sharp(buf).metadata()
  console.log(`  ${LOGO_FILE}  ${meta.width}x${meta.height}  alpha=${meta.hasAlpha}  ${(buf.length / 1024).toFixed(1)}kb`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

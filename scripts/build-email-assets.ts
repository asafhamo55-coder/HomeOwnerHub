// scripts/build-email-assets.ts
/**
 * Rasterises every topic pictogram to an opaque 2x PNG.
 *
 * Why Playwright rather than sharp/resvg: playwright is already a root
 * devDependency, so this adds no new dependency, and Chromium's SVG
 * renderer is the same engine the design was authored against.
 *
 * Why opaque: mail clients invert CSS colours but never image pixels. A
 * transparent PNG of a dark glyph becomes invisible in a large share of
 * inboxes and nobody reports it, because it looks like a missing image.
 * `omitBackground` is deliberately NOT set.
 *
 * Run: pnpm build:email-assets
 */

import { mkdir, writeFile, readdir } from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright'
import { renderPictogramSvg } from '../apps/hoa/src/lib/email/pictogram'
import { PICTOGRAMS } from '../apps/hoa/src/lib/email/pictogram-manifest'

const OUT_DIR = path.join(process.cwd(), 'apps/hoa/public/email/v1')
const WIDTH = 1200
const HEIGHT = 400

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true })

  const browser = await chromium.launch()
  const page = await browser.newPage({ viewport: { width: WIDTH, height: HEIGHT } })

  for (const p of PICTOGRAMS) {
    const svg = renderPictogramSvg({ glyph: p.glyph, accentColor: p.accent })
    await page.setContent(
      `<body style="margin:0;padding:0;">${svg}</body>`,
      { waitUntil: 'load' },
    )
    const buf = await page.screenshot({
      type: 'png',
      clip: { x: 0, y: 0, width: WIDTH, height: HEIGHT },
      // omitBackground stays false — the PNG must be fully opaque.
    })
    const file = path.join(OUT_DIR, `${p.slug}.png`)
    await writeFile(file, buf)
    console.log(`  ${p.slug}.png  ${(buf.length / 1024).toFixed(1)}kb`)
  }

  await browser.close()

  const written = (await readdir(OUT_DIR)).filter((f) => f.endsWith('.png'))
  if (written.length !== PICTOGRAMS.length) {
    throw new Error(`expected ${PICTOGRAMS.length} PNGs, wrote ${written.length}`)
  }
  console.log(`\n${written.length} assets → apps/hoa/public/email/v1/`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

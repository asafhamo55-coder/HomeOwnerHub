#!/usr/bin/env node
// Dev helper: freeze a scene at given times and save PNGs, to check layout without recording.
//   node tools/welcome-video/shot.mjs <sceneId> <port|land> <t1,t2,...> [outDir]
import path from 'node:path'
import { mkdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const [scene, layout = 'port', times = '2', outDir = path.join(HERE, 'build', 'shots')] = process.argv.slice(2)
const size = layout === 'land' ? { width: 1920, height: 1080 } : { width: 1080, height: 1920 }
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch()
for (const t of times.split(',')) {
  const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 })
  page.on('pageerror', (e) => console.error('page error', e.message))
  await page.goto(pathToFileURL(path.join(HERE, 'index.html')).href + `?scene=${scene}&layout=${layout}&t=${t}`)
  await page.waitForFunction(() => window.__ready === true)
  await page.waitForTimeout(1400) // let the css transitions settle
  const f = path.join(outDir, `${scene}-${layout}-${t}.png`)
  await page.screenshot({ path: f })
  console.log(f)
  await page.close()
}
await browser.close()

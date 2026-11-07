#!/usr/bin/env node
// Renders the HeyGen background stills (one per scene, per orientation) from the existing welcome-video screen markup.
//   node tools/welcome-video-heygen/render-backgrounds.mjs [--only=<sceneId>]
// Output: tools/welcome-video-heygen/backgrounds/<nn>-<id>-<portrait|landscape>.png
//   portrait 1080x1920 (phone on top, lower third left clear for the presenter)
//   landscape 1920x1080 (phone on the left, right side clear for the presenter)
// Reuses tools/welcome-video/{index.html,scenes.js,icons.js,runtime.js,style.css,brand/}; nothing there is changed.
// Needs Playwright's Chromium (already used by tools/welcome-video/render.mjs). Sample data only (see scenes.js).
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const WV = path.resolve(HERE, '../welcome-video')
const BUILD = path.join(HERE, 'build')
const OUT = path.join(HERE, 'backgrounds')
const only = process.argv.find((a) => a.startsWith('--only='))?.split('=')[1]

const scenes = JSON.parse(readFileSync(path.join(HERE, 'scenes.json'), 'utf8')).scenes
const script = JSON.parse(readFileSync(path.join(WV, 'script.json'), 'utf8')).scenes

// Which spoken line of the original scene the still should show (its cues are visible), plus seconds into that line.
const STILL = { welcome: [1, 0.8], setup: [0, 3.5], install: [1, 3.5], dues: [1, 2.5], requests: [1, 2.5], booking: [2, 2.5], community: [1, 2.5], help: [0, 2.5], closing: [1, 0.8] }

// Rough timeline (the real one comes from `say`); only used to pick when the freeze happens.
const timeline = {}
for (const s of script) {
  let t = 0.5
  const starts = []
  const ends = []
  const holds = []
  const lines = []
  for (const l of s.lines) {
    const text = typeof l === 'string' ? l : l.text
    const d = text.split(/\s+/).length / 2.4
    starts.push(+t.toFixed(2))
    ends.push(+(t + d).toFixed(2))
    holds.push(0)
    lines.push(text)
    t += d + 0.5
  }
  timeline[s.id] = { id: s.id, title: s.title, lines, starts, ends, holds, duration: t + 1 }
}

mkdirSync(BUILD, { recursive: true })
mkdirSync(OUT, { recursive: true })
writeFileSync(path.join(BUILD, 'timeline.js'), `window.TIMELINE = ${JSON.stringify(timeline)}\n`)

// A copy of index.html whose relative assets point at tools/welcome-video, with our timeline.
const base = pathToFileURL(WV + '/').href
const html = readFileSync(path.join(WV, 'index.html'), 'utf8')
  .replace('src="build/timeline.js"', `src="${pathToFileURL(path.join(BUILD, 'timeline.js')).href}"`)
  .replace('<head>', `<head><base href="${base}">`)
writeFileSync(path.join(BUILD, 'index.html'), html)

// Layout overrides: clean branded background, room for the presenter, no burned-in captions (HeyGen adds its own).
const CSS = {
  portrait: `
  body.port { --s: 1.5; }
  body.port #stage { grid-template-rows: 150px 1130px 1fr; background: linear-gradient(180deg,#1E40AF 0%,#1E3A8A 45%,#172554 100%); }
  body.port #top img { height: 60px; }
  body.port #top .tag { font-size: 44px; max-width: 560px; }
  #cap { display: none !important; }
  #stripe { position:absolute; left:0; right:0; bottom:0; height:14px; background:#047857; z-index:5 }
  `,
  landscape: `
  body.land { --s: 1.5; }
  body.land #stage { grid-template-columns: 800px 1fr; background: linear-gradient(135deg,#1E40AF 0%,#1E3A8A 50%,#172554 100%); }
  body.land #side { padding: 70px 70px 70px 20px; }
  body.land #side .tag { display: none; }
  body.land #side-foot { display: none; }
  body.land #side h2 { font-size: 72px; }
  #cap { display: none !important; }
  #stripe { position:absolute; left:0; right:0; bottom:0; height:14px; background:#047857; z-index:5 }
  `,
}

const browser = await chromium.launch({ args: ['--hide-scrollbars', '--force-color-profile=srgb'] })
for (const [i, s] of scenes.entries()) {
  if (only && s.id !== only) continue
  const [line, off] = STILL[s.id]
  const tl = timeline[s.id]
  const t = tl.starts[line] + off
  for (const o of ['portrait', 'landscape']) {
    const layout = o === 'portrait' ? 'port' : 'land'
    const size = o === 'portrait' ? { width: 1080, height: 1920 } : { width: 1920, height: 1080 }
    const page = await browser.newPage({ viewport: size, deviceScaleFactor: 1 })
    page.on('pageerror', (e) => console.error('page error', s.id, e.message))
    await page.goto(pathToFileURL(path.join(BUILD, 'index.html')).href + `?scene=${s.id}&layout=${layout}&t=${t}`)
    await page.waitForFunction(() => window.__ready === true)
    await page.addStyleTag({ content: CSS[o] })
    await page.evaluate(
      ([cap, port]) => {
        const stage = document.getElementById('stage')
        const stripe = document.createElement('div')
        stripe.id = 'stripe'
        stage.appendChild(stripe)
        if (port) {
          document.querySelector('#top .tag').textContent = cap
        } else {
          document.getElementById('side-title').textContent = cap
        }
      },
      [s.caption, o === 'portrait'],
    )
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(1500) // css transitions settle
    const file = path.join(OUT, s.background[o])
    await page.screenshot({ path: file, type: 'png' })
    console.log(path.relative(process.cwd(), file))
    await page.close()
  }
}
await browser.close()

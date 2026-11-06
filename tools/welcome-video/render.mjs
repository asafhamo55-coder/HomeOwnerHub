#!/usr/bin/env node
// Builds the resident welcome video. Run from the repo root:
//   node tools/welcome-video/render.mjs [--audio] [--only=<sceneId>] [--layouts=port,land] [--no-record]
//
// 1. macOS `say` voices every line of script.json (one file per line, so the scene knows exactly when each line is spoken).
// 2. build/timeline.js is written from the real audio lengths; the scene pages (index.html) read it to time every cue.
// 3. Playwright records each scene page with recordVideo (1080x1920 vertical, 1920x1080 landscape).
// 4. ffmpeg trims each recording to the moment the scene started, muxes the narration, and joins the scenes into small H.264 MP4s
//    (720x1280 phone, 1280x720 landscape). Captions are burned in (open captions); there is no separate caption track.
// 5. script.md, poster.jpg, poster-land.jpg and apps/hoa/src/app/welcome/transcript.ts (the page's text transcript) are written.
// Needs: macOS (`say`), ffmpeg/ffprobe on PATH (brew install ffmpeg), Playwright's Chromium.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, statSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { chromium } from 'playwright'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const BUILD = path.join(HERE, 'build')
const OUT = path.resolve(HERE, '../../apps/hoa/public/welcome')
const args = process.argv.slice(2)
const flag = (n) => args.find((a) => a === `--${n}` || a.startsWith(`--${n}=`))
const val = (n) => flag(n)?.split('=')[1]

const LEAD = 0.5 // quiet seconds before the first line
const GAP = 0.5 // pause between lines
const TAIL = 0.8 // quiet seconds after the last line
const FPS = 25
const FPS_OUT = 20
const LAYOUTS = {
  // w/h: what is recorded (and what the poster is); ow/oh: the encoded size.
  port: { w: 1080, h: 1920, ow: 720, oh: 1280, rate: ['-crf', '26', '-maxrate', '700k', '-bufsize', '1.4M'], file: 'welcome.mp4', poster: 'poster.jpg' },
  land: { w: 1920, h: 1080, ow: 1280, oh: 720, rate: ['-crf', '26', '-maxrate', '800k', '-bufsize', '1.6M'], file: 'welcome-landscape.mp4', poster: 'poster-land.jpg' },
}

const sh = (cmd, a, opts = {}) => execFileSync(cmd, a, { stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 1 << 28, ...opts })
const dur = (f) => parseFloat(sh('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString())

const script = JSON.parse(readFileSync(path.join(HERE, 'script.json'), 'utf8'))
const scenes = script.scenes.map((s) => ({
  ...s,
  lines: s.lines.map((l) => (typeof l === 'string' ? { text: l, hold: 0 } : { hold: 0, ...l })),
}))

// ---------- 1 + 2: narration and timeline ----------
function buildAudio() {
  rmSync(path.join(BUILD, 'audio'), { recursive: true, force: true })
  mkdirSync(path.join(BUILD, 'audio'), { recursive: true })
  const timeline = {}
  let total = 0
  for (const s of scenes) {
    const starts = []
    const ends = []
    const holds = []
    const inputs = []
    let t = LEAD
    s.lines.forEach((l, i) => {
      const aiff = path.join(BUILD, 'audio', `${s.id}-${i}.aiff`)
      sh('say', ['-v', script.voice, '-r', String(script.rate), '-o', aiff, l.text])
      const d = dur(aiff)
      starts.push(+t.toFixed(3))
      ends.push(+(t + d).toFixed(3))
      holds.push(l.hold)
      inputs.push({ aiff, at: t })
      t += d + l.hold + GAP
    })
    const duration = +(ends[ends.length - 1] + holds[holds.length - 1] + TAIL).toFixed(3)
    // Mix the lines at their start times into one padded scene track.
    const ff = ['-y']
    inputs.forEach((x) => ff.push('-i', x.aiff))
    const filt = inputs.map((x, i) => `[${i}:a]aresample=44100,aformat=channel_layouts=mono,adelay=${Math.round(x.at * 1000)}:all=1[a${i}]`)
    filt.push(`${inputs.map((_, i) => `[a${i}]`).join('')}amix=inputs=${inputs.length}:normalize=0:duration=longest,apad=whole_dur=${duration}[out]`)
    ff.push('-filter_complex', filt.join(';'), '-map', '[out]', '-t', String(duration), path.join(BUILD, 'audio', `${s.id}.wav`))
    sh('ffmpeg', ff)
    timeline[s.id] = { id: s.id, title: s.title, lines: s.lines.map((l) => l.text), starts, ends, holds, duration }
    total += duration
  }
  writeFileSync(path.join(BUILD, 'timeline.js'), `window.TIMELINE = ${JSON.stringify(timeline, null, 1)}\n`)
  writeFileSync(path.join(BUILD, 'timeline.json'), JSON.stringify(timeline, null, 1))
  console.log('narration done, total length', total.toFixed(1), 's')
  for (const s of scenes) {
    const t = timeline[s.id]
    console.log(s.id.padEnd(10), t.duration.toFixed(1).padStart(5), t.starts.map((x, i) => `${x.toFixed(1)}-${t.ends[i].toFixed(1)}`).join('  '))
  }
  return timeline
}

// ---------- 3: record ----------
function pageUrl(scene, layout, extra = '') {
  return pathToFileURL(path.join(HERE, 'index.html')).href + `?scene=${scene}&layout=${layout}${extra}`
}

// Which frame of the recording is the first one after the scene started? Before that the page is solid magenta.
function startOffset(webm) {
  const w = 16, h = 16
  const raw = sh('ffmpeg', ['-v', 'error', '-t', '8', '-i', webm, '-vf', `fps=${FPS},scale=${w}:${h}`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'])
  const frame = w * h * 3
  for (let i = 0; i * frame < raw.length; i++) {
    const o = i * frame + ((h / 2) * w + w / 2) * 3
    const [r, g, b] = [raw[o], raw[o + 1], raw[o + 2]]
    const magenta = r > 200 && g < 60 && b > 200
    if (!magenta && i > 0) return i / FPS
  }
  throw new Error('start marker not found in ' + webm)
}

async function record(timeline, layoutKey, only) {
  const L = LAYOUTS[layoutKey]
  const browser = await chromium.launch({ args: ['--hide-scrollbars', '--force-color-profile=srgb'] })
  for (const s of scenes) {
    if (only && s.id !== only) continue
    const dir = path.join(BUILD, 'rec', layoutKey, s.id)
    rmSync(dir, { recursive: true, force: true })
    mkdirSync(dir, { recursive: true })
    const ctx = await browser.newContext({
      viewport: { width: L.w, height: L.h },
      deviceScaleFactor: 1,
      recordVideo: { dir, size: { width: L.w, height: L.h } },
    })
    const page = await ctx.newPage()
    page.on('pageerror', (e) => console.error('page error in', s.id, e.message))
    await page.goto(pageUrl(s.id, layoutKey))
    await page.waitForFunction(() => window.__ready === true)
    await page.evaluate(() => document.fonts.ready)
    await page.waitForTimeout(900) // a few solid-magenta frames, so the start marker is easy to find
    await page.evaluate(() => window.startScene())
    await page.waitForTimeout((timeline[s.id].duration + 0.8) * 1000)
    const video = page.video()
    await ctx.close()
    const webm = await video.path()
    console.log('recorded', layoutKey, s.id)
    const off = startOffset(webm)
    const sceneMp4 = path.join(BUILD, 'scenes', layoutKey, `${s.id}.mp4`)
    mkdirSync(path.dirname(sceneMp4), { recursive: true })
    sh('ffmpeg', [
      '-y', '-ss', off.toFixed(3), '-i', webm, '-i', path.join(BUILD, 'audio', `${s.id}.wav`),
      '-t', String(timeline[s.id].duration), '-map', '0:v', '-map', '1:a',
      '-vf', `fps=${FPS_OUT},scale=${L.ow}:${L.oh}:flags=lanczos,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', ...L.rate, '-profile:v', 'main', '-level', '3.1',
      '-c:a', 'aac', '-b:a', '64k', '-ac', '1', '-ar', '44100', '-movflags', '+faststart', sceneMp4,
    ])
  }
  await browser.close()
}

// ---------- 4: join ----------
function join(layoutKey) {
  const L = LAYOUTS[layoutKey]
  const list = path.join(BUILD, `concat-${layoutKey}.txt`)
  writeFileSync(list, scenes.map((s) => `file '${path.join(BUILD, 'scenes', layoutKey, s.id + '.mp4')}'`).join('\n'))
  mkdirSync(OUT, { recursive: true })
  const out = path.join(OUT, L.file)
  sh('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', out])
  console.log(L.file, (statSync(out).size / 1e6).toFixed(2), 'MB', dur(out).toFixed(1), 's')
}

// ---------- 5: script, transcript, posters ----------
function writeText(timeline) {
  const total = scenes.reduce((n, s) => n + timeline[s.id].duration, 0)
  let md = '# Getting started with HomeownerHub: narration script\n\n'
  md += `Voice: macOS \`say\`, ${script.voice}, rate ${script.rate}. Total length ${total.toFixed(0)} seconds.\n\n`
  md += 'The captions are **open captions**: they are burned into the picture, so they show everywhere, including silent autoplay. '
  md += 'There is no separate caption track. The page at `/welcome` shows this same text as a transcript under "Read the video instead".\n\n'
  md += '**Re-rendering adds repo size.** Every re-render of the MP4s adds a new copy of about 10 MB to the repository history. '
  md += 'Only commit a re-render when the script or screens really changed, and commit the final files once. '
  md += 'To re-render: `node tools/welcome-video/render.mjs` from the repo root (macOS with `say`, ffmpeg from `brew install ffmpeg`, and Playwright\'s Chromium). '
  md += 'Edit `tools/welcome-video/script.json` for the words. The render also rewrites `apps/hoa/src/app/welcome/transcript.ts`, which the page and its test read.\n\n'
  let off = 0
  for (const s of scenes) {
    const t = timeline[s.id]
    const mm = String(Math.floor(off / 60)).padStart(2, '0')
    const ss = String(Math.floor(off % 60)).padStart(2, '0')
    md += `## ${s.title} (${mm}:${ss})\n\n`
    t.lines.forEach((text) => (md += `${text}\n\n`))
    off += t.duration
  }
  writeFileSync(path.join(OUT, 'script.md'), md)

  // The page's transcript. Generated, so it cannot drift from the narration.
  const ts =
    '// Generated by tools/welcome-video/render.mjs from tools/welcome-video/script.json. Do not edit.\n' +
    'export const TRANSCRIPT: ReadonlyArray<{ title: string; lines: readonly string[] }> = ' +
    JSON.stringify(scenes.map((s) => ({ title: s.title, lines: s.lines.map((l) => l.text) })), null, 2) +
    '\n'
  writeFileSync(path.resolve(HERE, '../../apps/hoa/src/app/welcome/transcript.ts'), ts)
  console.log('words:', scenes.flatMap((s) => s.lines.map((l) => l.text)).join(' ').split(/\s+/).length)
}

async function posters() {
  const browser = await chromium.launch()
  for (const [k, L] of Object.entries(LAYOUTS)) {
    const page = await browser.newPage({ viewport: { width: L.w, height: L.h }, deviceScaleFactor: 1 })
    await page.goto(pageUrl('welcome', k, '&t=3.2&poster=1'))
    await page.waitForFunction(() => window.__ready === true)
    await page.waitForTimeout(700)
    await page.screenshot({ path: path.join(OUT, L.poster), type: 'jpeg', quality: 86 })
    await page.close()
  }
  await browser.close()
}

// ---------- main ----------
mkdirSync(BUILD, { recursive: true })
mkdirSync(OUT, { recursive: true })
const timeline = buildAudio()
if (!flag('audio') && !flag('no-record')) {
  const layouts = (val('layouts') || 'port,land').split(',')
  const only = val('only')
  for (const l of layouts) {
    await record(timeline, l, only)
    join(l)
  }
}
if (!flag('audio') && !val('only')) {
  writeText(timeline)
  await posters()
  console.log(readdirSync(OUT).map((f) => `${f} ${(statSync(path.join(OUT, f)).size / 1024).toFixed(0)}KB`).join('\n'))
}

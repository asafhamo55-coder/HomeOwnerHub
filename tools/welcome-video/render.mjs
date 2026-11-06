#!/usr/bin/env node
// Builds the resident welcome video. Run from the repo root:
//   node tools/welcome-video/render.mjs [--audio] [--only=<sceneId>] [--layouts=port,land] [--no-record]
//
// 1. macOS `say` voices every line of script.json (one file per line, so the scene knows exactly when each line is spoken).
// 2. build/timeline.js is written from the real audio lengths; the scene pages (index.html) read it to time every cue.
// 3. Playwright records each scene page with recordVideo (1080x1920 vertical, 1920x1080 landscape).
// 4. ffmpeg trims each recording to the moment the scene started, muxes the narration, and joins the scenes into H.264 MP4.
// 5. welcome.vtt, script.md, poster.jpg, poster-land.jpg and preview.gif are written next to the videos.
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
const GAP = 0.4 // pause between lines
const TAIL = 0.8 // quiet seconds after the last line
const FPS = 25
const LAYOUTS = {
  port: { w: 1080, h: 1920, file: 'welcome.mp4', poster: 'poster.jpg' },
  land: { w: 1920, h: 1080, file: 'welcome-landscape.mp4', poster: 'poster-land.jpg' },
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
      '-vf', `fps=${FPS},scale=${L.w}:${L.h}:flags=lanczos,format=yuv420p`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-maxrate', '2.2M', '-bufsize', '4.4M', '-profile:v', 'high', '-level', '4.1',
      '-c:a', 'aac', '-b:a', '128k', '-ar', '44100', '-movflags', '+faststart', sceneMp4,
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

// ---------- 5: captions, script, posters, preview ----------
const vttTime = (x) => {
  const ms = Math.round(x * 1000)
  const p = (n, w = 2) => String(n).padStart(w, '0')
  return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)}.${p(ms % 1000, 3)}`
}
function writeText(timeline) {
  let off = 0
  let vtt = 'WEBVTT\n\n'
  let n = 1
  for (const s of scenes) {
    const t = timeline[s.id]
    t.lines.forEach((text, i) => {
      const start = off + t.starts[i]
      const next = i + 1 < t.lines.length ? off + t.starts[i + 1] - 0.1 : off + t.ends[i] + t.holds[i] + 0.5
      vtt += `${n++}\n${vttTime(start)} --> ${vttTime(next)}\n${text}\n\n`
    })
    off += t.duration
  }
  writeFileSync(path.join(OUT, 'welcome.vtt'), vtt)

  let md = '# Getting started with HomeownerHub: narration script\n\n'
  md += `Voice: macOS \`say\`, ${script.voice}, rate ${script.rate}. Total length ${off.toFixed(0)} seconds. `
  md += 'These are also the on-screen captions and the contents of `welcome.vtt`.\n\n'
  off = 0
  for (const s of scenes) {
    const t = timeline[s.id]
    md += `## ${s.title} (${vttTime(off).slice(3, 8)})\n\n`
    t.lines.forEach((text) => (md += `${text}\n\n`))
    off += t.duration
  }
  writeFileSync(path.join(OUT, 'script.md'), md)
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

function preview(timeline) {
  // Four seconds of the sign-in scene: the email, and the tap on the button.
  let off = 0
  for (const s of scenes) {
    if (s.id === 'setup') break
    off += timeline[s.id].duration
  }
  const start = off + 1.2
  const pal = path.join(BUILD, 'palette.png')
  const src = path.join(OUT, 'welcome.mp4')
  const vf = 'fps=8,scale=300:-1:flags=lanczos'
  sh('ffmpeg', ['-y', '-ss', start.toFixed(2), '-t', '4.5', '-i', src, '-vf', `${vf},palettegen=max_colors=96`, pal])
  sh('ffmpeg', ['-y', '-ss', start.toFixed(2), '-t', '4.5', '-i', src, '-i', pal, '-lavfi', `${vf}[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4`, path.join(OUT, 'preview.gif')])
  console.log('preview.gif', (statSync(path.join(OUT, 'preview.gif')).size / 1024).toFixed(0), 'KB')
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
    if (!only) join(l)
  }
}
if (!flag('audio') && !val('only')) {
  writeText(timeline)
  await posters()
  if (existsSync(path.join(OUT, 'welcome.mp4'))) preview(timeline)
  console.log(readdirSync(OUT).map((f) => `${f} ${(statSync(path.join(OUT, f)).size / 1024).toFixed(0)}KB`).join('\n'))
}

#!/usr/bin/env node
// Builds the HeyGen version of the resident welcome video. Node 20+, no dependencies (built-in fetch, FormData).
//
//   node tools/welcome-video-heygen/generate.mjs --list
//   node tools/welcome-video-heygen/generate.mjs --avatar <id> --voice <id> [--orientation portrait|landscape] [--dry-run]
//
// Uses HeyGen's current v3 API (the v2 endpoints are retired per developers.heygen.com):
//   GET  /v3/avatars/looks            list avatars ("looks"); the look id is the avatar_id
//   GET  /v3/models/audio/voices      list voices
//   POST /v3/assets                   upload a background image (multipart, field "file") -> data.asset_id
//   POST /v3/videos                   one avatar scene: script, voice, voice_settings.speed, background image, captions
//   GET  /v3/videos/{id}              poll until status is completed, then download data.video_url
// A v3 video is a single scene, so each scene in scenes.json is rendered as its own video and the parts are joined with ffmpeg.
// The API key is read from ~/.config/homeownerhub/heygen.env (HEYGEN_API_KEY=...). It is only ever sent in the x-api-key header.
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
export const API = 'https://api.heygen.com'
export const DEFAULT_ENV_FILE = path.join(homedir(), '.config', 'homeownerhub', 'heygen.env')
export const ASPECT = { portrait: '9:16', landscape: '16:9' }
export const DIMENSION = { portrait: { width: 1080, height: 1920 }, landscape: { width: 1920, height: 1080 } }
const REDACTED = '[REDACTED]'

// ---------- pure helpers (unit tested) ----------

// Reads HEYGEN_API_KEY from a KEY=VALUE env file. Never prints it; errors name the file only.
export function readApiKey(file = DEFAULT_ENV_FILE) {
  let text
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    throw new Error(`Cannot read ${file}. Create it with one line: HEYGEN_API_KEY=<your key>`)
  }
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*(?:export\s+)?HEYGEN_API_KEY\s*=\s*(.*?)\s*$/.exec(raw)
    if (!m) continue
    const v = m[1].replace(/^(['"])(.*)\1$/, '$2')
    if (v) return v
  }
  throw new Error(`HEYGEN_API_KEY is not set in ${file}`)
}

// Deep copy of a value with the key (and any header-like fields) replaced. Safe to print.
export function redact(value, key) {
  const sensitive = /^(x-api-key|authorization|api[-_]?key)$/i
  const walk = (v) => {
    if (typeof v === 'string') return key ? v.split(key).join(REDACTED) : v
    if (Array.isArray(v)) return v.map(walk)
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, sensitive.test(k) ? REDACTED : walk(x)]))
    return v
  }
  return walk(value)
}

export function loadScenes(file = path.join(HERE, 'scenes.json')) {
  const j = JSON.parse(readFileSync(file, 'utf8'))
  return { speed: j.speed ?? 0.9, scenes: j.scenes }
}

export function totalSeconds(scenes) {
  return scenes.reduce((n, s) => n + s.seconds, 0)
}

// One POST /v3/videos body per scene, in scenes.json order. assetIds maps background file name -> asset_id.
export function buildPayloads({ scenes, speed = 0.9, avatarId, voiceId, orientation = 'portrait', assetIds = {} }) {
  if (!ASPECT[orientation]) throw new Error(`orientation must be portrait or landscape, got "${orientation}"`)
  return scenes.map((s) => {
    const file = s.background[orientation]
    return {
      type: 'avatar',
      avatar_id: avatarId,
      script: s.line,
      voice_id: voiceId,
      voice_settings: { speed },
      background: { type: 'image', asset_id: assetIds[file] ?? `<asset_id of ${file}>` },
      aspect_ratio: ASPECT[orientation],
      resolution: '1080p',
      title: `HomeownerHub welcome ${String(s.number).padStart(2, '0')} ${s.id} (${orientation})`,
      // style "default" burns the captions into the picture; omitting it would give a separate .srt only.
      caption: { file_format: 'srt', style: 'default' },
      output_format: 'mp4',
    }
  })
}

// ---------- HTTP ----------

async function call(key, method, pathAndQuery, { body, form } = {}) {
  const headers = { 'x-api-key': key, accept: 'application/json' }
  if (body) headers['content-type'] = 'application/json'
  let res
  try {
    res = await fetch(API + pathAndQuery, { method, headers, body: body ? JSON.stringify(body) : form })
  } catch (e) {
    throw new Error(`${method} ${pathAndQuery.split('?')[0]} failed: ${redact(String(e.message), key)}`)
  }
  const text = await res.text()
  let json = null
  try {
    json = JSON.parse(text)
  } catch {}
  if (!res.ok) {
    const detail = json?.error?.message ?? json?.message ?? text.slice(0, 300)
    throw new Error(`${method} ${pathAndQuery.split('?')[0]} returned HTTP ${res.status}: ${redact(String(detail), key)}`)
  }
  if (!json) throw new Error(`${method} ${pathAndQuery.split('?')[0]} returned HTTP ${res.status} with a non-JSON body`)
  return json
}

async function pages(key, base, maxPages) {
  const items = []
  let token = null
  for (let i = 0; i < maxPages; i++) {
    const j = await call(key, 'GET', base + (token ? `&token=${encodeURIComponent(token)}` : ''))
    items.push(...(j.data ?? []))
    if (!j.has_more || !j.next_token) break
    token = j.next_token
  }
  return items
}

const pad = (v, n) => String(v ?? '').slice(0, n).padEnd(n)

export async function list(key, maxPages = 6, out = console.log) {
  const looks = await pages(key, '/v3/avatars/looks?ownership=public&limit=50', maxPages)
  out('AVATARS (use the id as --avatar)')
  out(`${pad('id', 34)} ${pad('name', 28)} ${pad('gender', 8)} ${pad('type', 14)} orientation`)
  for (const a of looks) out(`${pad(a.id, 34)} ${pad(a.name, 28)} ${pad(a.gender, 8)} ${pad(a.avatar_type, 14)} ${a.preferred_orientation ?? ''}`)
  const voices = (await pages(key, '/v3/models/audio/voices?type=public&limit=100', maxPages * 3)).filter((v) => /^en\b|^en[-_]|english/i.test(v.language ?? ''))
  out('')
  out('ENGLISH VOICES (use the voice_id as --voice; the API gives no gender, listen to preview_audio_url)')
  out(`${pad('voice_id', 34)} ${pad('name', 28)} ${pad('language', 10)} preview`)
  for (const v of voices) out(`${pad(v.voice_id, 34)} ${pad(v.name, 28)} ${pad(v.language, 10)} ${v.preview_audio_url ?? ''}`)
  out('')
  out(`${looks.length} avatars, ${voices.length} English voices. A look's default_voice_id is often a good match for that avatar.`)
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function waitFor(key, id, label, { intervalMs = 10000, timeoutMs = 30 * 60 * 1000 } = {}) {
  const t0 = Date.now()
  for (;;) {
    const v = (await call(key, 'GET', `/v3/videos/${encodeURIComponent(id)}`)).data ?? {}
    if (v.status === 'completed') return v
    if (v.status === 'failed') throw new Error(`${label} failed: ${redact(`${v.failure_code ?? ''} ${v.failure_message ?? ''}`.trim(), key)}`)
    if (Date.now() - t0 > timeoutMs) throw new Error(`${label} did not finish within ${Math.round(timeoutMs / 60000)} minutes (video id ${id})`)
    console.log(`  ${label}: ${v.status ?? 'unknown'}`)
    await sleep(intervalMs)
  }
}

async function generate({ key, avatarId, voiceId, orientation }) {
  const { speed, scenes } = loadScenes()
  const outDir = path.join(HERE, 'out')
  const partsDir = path.join(outDir, `parts-${orientation}`)
  mkdirSync(partsDir, { recursive: true })

  const assetIds = {}
  for (const s of scenes) {
    const file = s.background[orientation]
    const p = path.join(HERE, 'backgrounds', file)
    if (!existsSync(p)) throw new Error(`Missing ${p}. Run: node tools/welcome-video-heygen/render-backgrounds.mjs`)
    const form = new FormData()
    form.append('file', new Blob([readFileSync(p)], { type: 'image/png' }), file)
    const r = await call(key, 'POST', '/v3/assets', { form })
    if (!r.data?.asset_id) throw new Error(`Upload of ${file} returned no asset_id`)
    assetIds[file] = r.data.asset_id
    console.log(`uploaded ${file}`)
  }

  const payloads = buildPayloads({ scenes, speed, avatarId, voiceId, orientation, assetIds })
  const ids = []
  for (const [i, body] of payloads.entries()) {
    const r = await call(key, 'POST', '/v3/videos', { body })
    const id = r.data?.video_id
    if (!id) throw new Error(`Scene ${scenes[i].number} returned no video_id`)
    ids.push(id)
    console.log(`submitted scene ${scenes[i].number} (${scenes[i].id}) -> ${id}`)
  }
  writeFileSync(path.join(outDir, `video-ids-${orientation}.json`), JSON.stringify(ids, null, 2))

  const parts = []
  for (const [i, id] of ids.entries()) {
    const label = `scene ${scenes[i].number}`
    const v = await waitFor(key, id, label)
    // The download URL is presigned: fetch it without the API key.
    const res = await fetch(v.video_url)
    if (!res.ok) throw new Error(`Download of ${label} returned HTTP ${res.status}`)
    const file = path.join(partsDir, `${String(scenes[i].number).padStart(2, '0')}-${scenes[i].id}.mp4`)
    writeFileSync(file, Buffer.from(await res.arrayBuffer()))
    parts.push(file)
    console.log(`downloaded ${label} (${Math.round(v.duration ?? 0)}s)`)
  }

  const list = path.join(partsDir, 'concat.txt')
  writeFileSync(list, parts.map((f) => `file '${f}'`).join('\n'))
  const out = path.join(outDir, `welcome-heygen-${orientation}.mp4`)
  try {
    // Re-encode so differing part encodings cannot break the join; the size matches the app's welcome video.
    execFileSync('ffmpeg', ['-y', '-f', 'concat', '-safe', '0', '-i', list, '-c:v', 'libx264', '-crf', '24', '-preset', 'slow', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', out], { stdio: 'ignore' })
  } catch {
    throw new Error(`Could not join the parts with ffmpeg (brew install ffmpeg). The scene files are in ${partsDir}`)
  }
  console.log(`done: ${path.relative(process.cwd(), out)}`)
}

// ---------- main ----------

async function main(argv) {
  const flag = (n) => argv.includes(`--${n}`)
  const val = (n) => {
    const i = argv.indexOf(`--${n}`)
    return i >= 0 ? argv[i + 1] : undefined
  }
  const orientation = val('orientation') ?? 'portrait'
  if (!ASPECT[orientation]) throw new Error('--orientation must be portrait or landscape')

  if (flag('list')) return list(readApiKey())

  const avatarId = val('avatar')
  const voiceId = val('voice')
  if (!avatarId || !voiceId) throw new Error('Usage: generate.mjs --list | --avatar <id> --voice <id> [--orientation portrait|landscape] [--dry-run]')

  if (flag('dry-run')) {
    const { speed, scenes } = loadScenes()
    const payloads = buildPayloads({ scenes, speed, avatarId, voiceId, orientation })
    console.log(JSON.stringify({ requests: [{ method: 'POST', url: `${API}/v3/videos`, headers: { 'x-api-key': REDACTED }, bodies: redact(payloads) }], dimension: DIMENSION[orientation], totalSeconds: totalSeconds(scenes) }, null, 2))
    return
  }
  return generate({ key: readApiKey(), avatarId, voiceId, orientation })
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((e) => {
    console.error(`Error: ${e.message}`)
    process.exit(1)
  })
}

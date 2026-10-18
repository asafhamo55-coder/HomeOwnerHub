/** Fixed locations used by the guide tooling. */
import { resolve } from 'node:path'

export const REPO_ROOT = resolve(__dirname, '..', '..')
export const HOA_DIR = resolve(REPO_ROOT, 'apps', 'hoa')
export const CONTENT_DIR = resolve(HOA_DIR, 'content', 'guide')
export const META_FILE = resolve(CONTENT_DIR, '_meta.yaml')
export const GENERATED_FILE = resolve(HOA_DIR, 'src', 'generated', 'guide.ts')
export const APP_DIR = resolve(HOA_DIR, 'src', 'app')
export const SRC_DIR = resolve(HOA_DIR, 'src')
export const SHOTS_DIR = resolve(HOA_DIR, 'public', 'guide', 'shots')
export const MANIFEST_FILE = resolve(SHOTS_DIR, 'manifest.json')
/** Release notes; their `whats_new:` blocks feed WHATS_NEW (spec §6.5). */
export const RELEASES_DIR = resolve(REPO_ROOT, 'docs', 'releases')

/**
 * Core routes that must have at least one article (spec §5.3). A ratchet:
 * entries are only ever added. /accounting joins when its article lands
 * (phase 2), so CI stays green on what day 1 actually covers.
 */
export const GUIDE_EXPECTED_ROUTES = [
  '/',
  '/properties',
  '/settings/members',
  '/dues',
  '/violations',
  '/violations/approval-queue',
  '/arc',
  '/meetings',
  '/approvals',
  '/communications',
  '/documents/governing',
  '/ai/ask',
  '/resident',
  '/resident/dues',
  '/resident/arc',
]

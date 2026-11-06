/**
 * The last line of defence for "every email carries the logo".
 *
 * Most mail is rendered through the shared shell (shell.ts) or the branded
 * wrapper and already has the HomeownerHub header. Some is a few plain
 * paragraphs from a small notifier (an amenity booking, a reversal notice, a
 * pro invitation) or a free-form announcement a board member typed. Those
 * reach `sendEmail` as a bare HTML fragment. This wraps the fragment in the
 * brand frame so no message leaves the product without it.
 *
 * Idempotent: a document that already has the brand header (the marker is
 * the `eh-logo` cell the header always renders) is returned untouched. A
 * full document without it is also left alone, because wrapping a document
 * inside a document breaks clients; the grep test in brand.test.ts keeps
 * that case from existing.
 */

import { wrapBrandedEmail } from './brand'

const BRAND_MARKER = 'class="eh-logo"'

export function ensureBranded(html: string, logoUrl?: string | null): string {
  if (html.includes(BRAND_MARKER)) return html
  // Look past a BOM and leading comments (conditional comments included).
  const head = html.replace(/^\uFEFF/, '').replace(/^(\s|<!--[\s\S]*?-->)+/, '')
  if (/^<!doctype|^<html/i.test(head)) return html
  return wrapBrandedEmail({ bodyHtml: html, logoUrl })
}

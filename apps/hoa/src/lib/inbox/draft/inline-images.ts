/**
 * Images pasted into the message body. The composer is plain text, so a
 * pasted image becomes an ordinary draft attachment plus an
 * `[image: <fileName>]` marker where the cursor was. At send time
 * buildMimeMessage (packages/mailbox/src/send.ts) turns every marked image
 * into an inline part shown in place in an HTML body. The marker format is
 * matched there by IMAGE_MARKER_RE, so the two must change together.
 *
 * No `'use server'` directive and no `@/` imports: pure, unit-tested.
 */

/** The image types sent inline — the same set send.ts renders in place. */
const EXTENSIONS: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
}

export function isInlineImageType(type: string): boolean {
  return type in EXTENSIONS
}

export function imageMarker(fileName: string): string {
  return `[image: ${fileName}]`
}

/**
 * A clipboard image arrives named "image.png" (or nothing at all), so two
 * pastes would share a name and one marker would point at both. A
 * timestamp plus index keeps every paste distinct.
 */
export function pastedImageName(type: string, now: Date, index: number): string {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\..*$/, '').replace('T', '-')
  return `pasted-image-${stamp}${index > 0 ? `-${index + 1}` : ''}.${EXTENSIONS[type] ?? 'png'}`
}

/**
 * The markers go in at the selection (replacing it), each on its own line,
 * so the image sits as its own block between paragraphs.
 */
export function insertMarkers(
  body: string,
  start: number,
  end: number,
  fileNames: string[],
): { body: string; caret: number } {
  const before = body.slice(0, start)
  const after = body.slice(end)
  const lead = before === '' || before.endsWith('\n') ? '' : '\n'
  const trail = after.startsWith('\n') ? '' : '\n'
  const block = `${lead}${fileNames.map(imageMarker).join('\n')}${trail}`
  return { body: before + block + after, caret: before.length + block.length }
}

/** Removes a marker (and the line break it was given) — used when its upload fails or the file is removed. */
export function removeMarker(body: string, fileName: string): string {
  const marker = imageMarker(fileName)
  return body.replace(`${marker}\n`, '').replace(marker, '')
}

export function hasMarker(body: string, fileName: string): boolean {
  return body.includes(imageMarker(fileName))
}

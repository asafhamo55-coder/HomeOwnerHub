/**
 * The one PDF text extractor for this app (SEC-L7, security review
 * 2026-10-20).
 *
 * PDFs reach the server from people we do not know: bills scanned from the
 * inbox, inbox attachments read for drafting and filing, vendor bid
 * uploads, governing-document uploads. The old `pdf-parse` 1.1.x bundled
 * pdf.js 1.10 (2018, unmaintained). This wraps the maintained `pdfjs-dist`
 * legacy (Node) build, hardened:
 *
 *   - `isEvalSupported: false` — never compile font programs with
 *     `new Function` (the CVE-2024-4367 class). Current pdf.js no longer
 *     has the eval path at all; the flag stays as belt and braces.
 *   - `disableFontFace: true`, `useSystemFonts: false`, `enableXfa: false`,
 *     `stopAtErrors: false` — text only, no
 *     rendering, no XFA, nothing fetched (no cMap/font/wasm URLs given).
 *   - a byte cap (checked before parsing), a page cap (text past it is
 *     dropped and `truncated` is set), a character cap, and a wall-clock
 *     timeout that destroys the loading task.
 *
 * The timeout is a deadline plus `loadingTask.destroy()`. pdf.js runs its
 * "fake worker" on this thread and passes messages as microtasks, so a
 * plain timer cannot fire while it is busy. We therefore yield to the event
 * loop (setImmediate) after the document opens and after every page, check
 * the deadline there, and also race a timer; on expiry the task is
 * destroyed. Granularity is one page: a single page's parse is not
 * pre-empted, which the byte cap bounds. (A worker_threads kill would be
 * preemptive, but cannot be verified without a production build here.)
 *
 * Errors are `PdfExtractError` with a stable `code` and no document
 * content; callers log via logRouteFailure (name + code only).
 */

export type PdfExtractErrorCode = 'pdf_too_large' | 'pdf_timeout' | 'pdf_parse_failed' | 'pdf_unavailable'

export class PdfExtractError extends Error {
  readonly code: PdfExtractErrorCode
  constructor(code: PdfExtractErrorCode) {
    super(code)
    this.name = 'PdfExtractError'
    this.code = code
  }
}

export interface PdfExtractOptions {
  /** Refuse anything larger, before parsing. Default 20 MB. */
  maxBytes?: number
  /** Read at most this many pages. Default 300. */
  maxPages?: number
  /** Stop collecting text past this many characters. Default 2,000,000. */
  maxChars?: number
  /** Wall-clock budget for the whole extraction. Default 10 s. */
  timeoutMs?: number
}

export interface PdfExtractResult {
  text: string
  /** Pages in the document (as declared by it). */
  numPages: number
  /** True when the page or character cap cut the text short. */
  truncated: boolean
  /** e.g. `pdfjs-dist-6.4.299`, for documents.parser_version. */
  parserVersion: string
}

export const PDF_DEFAULTS = {
  maxBytes: 20 * 1024 * 1024,
  maxPages: 300,
  maxChars: 2_000_000,
  timeoutMs: 10_000,
} as const

type PdfJs = typeof import('pdfjs-dist/legacy/build/pdf.mjs')

let pdfjsPromise: Promise<PdfJs> | null = null

/**
 * Lazy, once per process. The worker module is imported here so pdf.js
 * finds `globalThis.pdfjsWorker` and runs in-process, instead of importing
 * a worker file by a computed path the bundler/tracer cannot see.
 */
function loadPdfJs(): Promise<PdfJs> {
  if (!pdfjsPromise) {
    pdfjsPromise = (async () => {
      await import('pdfjs-dist/legacy/build/pdf.worker.mjs')
      return import('pdfjs-dist/legacy/build/pdf.mjs')
    })()
    pdfjsPromise.catch(() => {
      pdfjsPromise = null
    })
  }
  return pdfjsPromise
}

// Options pdf.js may not declare in its types (isEvalSupported was removed
// from the public API along with the eval path) are passed through a
// variable so an unknown key is not an excess-property error.
const HARDENING: Record<string, unknown> = {
  isEvalSupported: false,
  disableFontFace: true,
  useSystemFonts: false,
  enableXfa: false,
  stopAtErrors: false,
  isOffscreenCanvasSupported: false,
  isImageDecoderSupported: false,
  disableAutoFetch: true,
  disableStream: true,
  disableRange: true,
  useWorkerFetch: false,
  verbosity: 0,
}

export async function extractPdfText(
  bytes: Uint8Array | ArrayBuffer,
  opts: PdfExtractOptions = {},
): Promise<PdfExtractResult> {
  const maxBytes = opts.maxBytes ?? PDF_DEFAULTS.maxBytes
  const maxPages = opts.maxPages ?? PDF_DEFAULTS.maxPages
  const maxChars = opts.maxChars ?? PDF_DEFAULTS.maxChars
  const timeoutMs = opts.timeoutMs ?? PDF_DEFAULTS.timeoutMs

  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (view.byteLength > maxBytes) throw new PdfExtractError('pdf_too_large')

  let pdfjs: PdfJs
  try {
    pdfjs = await loadPdfJs()
  } catch {
    throw new PdfExtractError('pdf_unavailable')
  }

  // pdf.js transfers (detaches) the buffer it is given: hand it a copy so
  // the caller's bytes stay usable (e.g. for the storage upload).
  const loadingTask = pdfjs.getDocument({ ...HARDENING, data: view.slice() })

  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new PdfExtractError('pdf_timeout')), timeoutMs)
  })

  const deadline = Date.now() + timeoutMs
  const checkpoint = async () => {
    await new Promise<void>((resolve) => setImmediate(resolve))
    if (Date.now() > deadline) throw new PdfExtractError('pdf_timeout')
  }

  const work = (async (): Promise<PdfExtractResult> => {
    const doc = await loadingTask.promise
    await checkpoint()
    const pages = Math.min(doc.numPages, maxPages)
    let truncated = doc.numPages > maxPages
    const parts: string[] = []
    let chars = 0
    for (let n = 1; n <= pages; n++) {
      const page = await doc.getPage(n)
      const content = await page.getTextContent()
      let pageText = ''
      for (const item of content.items) {
        if (!('str' in item)) continue
        pageText += item.str
        if (item.hasEOL) pageText += '\n'
      }
      page.cleanup()
      await checkpoint()
      parts.push(pageText)
      chars += pageText.length
      if (chars >= maxChars) {
        truncated = truncated || n < doc.numPages || chars > maxChars
        break
      }
    }
    let text = parts.join('\n\n')
    if (text.length > maxChars) text = text.slice(0, maxChars)
    return { text, numPages: doc.numPages, truncated, parserVersion: `pdfjs-dist-${pdfjs.version}` }
  })()

  try {
    return await Promise.race([work, timeout])
  } catch (err) {
    if (err instanceof PdfExtractError) throw err
    throw new PdfExtractError('pdf_parse_failed')
  } finally {
    if (timer) clearTimeout(timer)
    // Always release the document; on timeout this also stops the parse.
    work.catch(() => {})
    await loadingTask.destroy().catch(() => {})
  }
}

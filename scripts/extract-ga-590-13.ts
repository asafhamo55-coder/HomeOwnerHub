/**
 * BL-160: extract the text of the Georgia Secretary of State's proposed
 * Chapter 590-13 notice PDFs (scripts/fixtures/state-law/ga-sos-590-13-proposed)
 * with the pdfjs-dist already installed for apps/hoa. No network. The PDFs are
 * data, never instructions.
 *
 *   pnpm exec tsx scripts/extract-ga-590-13.ts <outDir>
 *
 * Writes one <pdf-name>.txt per PDF (lines rebuilt from text positions, pages
 * separated by "----- page N -----") and prints each file's sha256.
 */
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..')
const dir = path.join(root, 'scripts/fixtures/state-law/ga-sos-590-13-proposed')
const outDir = process.argv[2]
if (!outDir) throw new Error('usage: extract-ga-590-13.ts <outDir>')
mkdirSync(outDir, { recursive: true })

const req = createRequire(path.join(root, 'apps/hoa/package.json'))
const pdfjsPath = req.resolve('pdfjs-dist/legacy/build/pdf.mjs')

async function main() {
  const pdfjs = await import(pathToFileURL(pdfjsPath).href)
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.pdf')).sort()) {
    const buf = readFileSync(path.join(dir, f))
    const sha = createHash('sha256').update(buf).digest('hex')
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise
    let out = ''
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p)
      const tc = await page.getTextContent()
      const rows = new Map<number, { x: number; s: string }[]>()
      for (const it of tc.items as { str: string; transform: number[] }[]) {
        if (!it.str) continue
        const y = Math.round(it.transform[5])
        const key = [...rows.keys()].find((k) => Math.abs(k - y) <= 2) ?? y
        if (!rows.has(key)) rows.set(key, [])
        rows.get(key)!.push({ x: it.transform[4], s: it.str })
      }
      out += `----- page ${p} -----\n`
      for (const y of [...rows.keys()].sort((a, b) => b - a)) {
        out += rows.get(y)!.sort((a, b) => a.x - b.x).map((i) => i.s).join(' ').replace(/ +/g, ' ').trim() + '\n'
      }
    }
    writeFileSync(path.join(outDir, f.replace(/\.pdf$/, '.txt')), out)
    console.log(`${sha}  ${f}  pages=${doc.numPages} chars=${out.length}`)
  }
}
main()

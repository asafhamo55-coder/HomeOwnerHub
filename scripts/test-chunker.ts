/**
 * scripts/test-chunker.ts
 *
 * Characterization tests for the W1 chunkers — pure functions, no DB.
 * Pins down the current behavior of chunkByMarkdownSection and
 * chunkPlainText (paragraph packing at ~TARGET_CHARS=1000, normalization
 * of \r\n and U+2028 to \n, section-label detection, synth-label
 * fallback). Any divergence from these expectations is by definition a
 * behavior change in retrieval — treat a failure here as a signal to
 * re-eval W1, not as a "just bump the test" situation.
 *
 * Pattern matches test-accounting.ts / test-bank-rec.ts (ok/✓/✗ console,
 * exit 0/1). No fixture loader because no DB.
 */

import './_load-env'
import {
  chunkByMarkdownSection,
  chunkPlainText,
} from '../packages/workflows/src/index'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string): void {
  if (ok) {
    passed += 1
    console.log(`  ✓ ${name}`)
  } else {
    failed += 1
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`)
  }
}

function main(): void {
  console.log('chunkByMarkdownSection / chunkPlainText (pure fn):\n')

  // 1. Empty input → []
  console.log('empty input:')
  check('chunkPlainText("") → []', chunkPlainText('').length === 0)
  check('chunkPlainText("   \\n\\n  ") → []', chunkPlainText('   \n\n  ').length === 0)
  check('chunkByMarkdownSection("") → []', chunkByMarkdownSection('').length === 0)

  // 2. Markdown with # / ## / ###
  console.log('\nmarkdown headings:')
  const md = [
    '# Title (ignored)',
    '',
    '## Article I',
    '',
    '### Section 1.1',
    'Setbacks shall be twenty-five feet.',
    '',
    '### Section 1.2',
    'Fences shall not exceed six feet.',
    '',
    '## Article II',
    '',
    '### Section 2.1',
    'Quiet hours are 10pm to 7am.',
  ].join('\n')
  const mdChunks = chunkByMarkdownSection(md)
  check('produces 3 chunks (3 H3 sections)', mdChunks.length === 3, `got ${mdChunks.length}`)
  const sections = mdChunks.map((c) => c.section)
  check(
    'section labels are the H3 headings',
    sections[0] === 'Section 1.1' &&
      sections[1] === 'Section 1.2' &&
      sections[2] === 'Section 2.1',
    JSON.stringify(sections),
  )
  check(
    'parent H2 prepended to first chunk body',
    mdChunks[0]?.text.startsWith('Article I'),
    mdChunks[0]?.text.slice(0, 40),
  )
  check(
    'section 2.1 inherits Article II context',
    mdChunks[2]?.text.startsWith('Article II'),
  )

  // 3. Plain text with roman numeral article label
  console.log('\nplain-text roman numeral detection:')
  const romanText =
    'Article IV — Setbacks\n\nNo structure shall be erected within twenty feet of the front lot line. ' +
    'Side setbacks are seven and a half feet minimum.'
  const romanChunks = chunkPlainText(romanText)
  check('produces ≥1 chunk', romanChunks.length >= 1)
  check(
    'section label = "Article IV"',
    romanChunks[0]?.section === 'Article IV',
    romanChunks[0]?.section,
  )

  // 4. ~1600-char paragraph → chunked around TARGET_CHARS=1000 with overlap
  console.log('\nlarge text packing:')
  // Build via several ~400-char paragraphs so the packer has paragraph
  // boundaries to break on (a single 1600-char paragraph would hit the
  // MAX_CHARS hard-split path, which is a separate code path).
  const para = 'a'.repeat(400)
  const big = [para, para, para, para].join('\n\n') // ~1612 chars
  const bigChunks = chunkPlainText(big)
  check(
    'produces ≥2 chunks (packed at ~1000-char target)',
    bigChunks.length >= 2,
    `got ${bigChunks.length}`,
  )
  // Each chunk should respect the soft target — the packer flushes
  // before adding a paragraph that would overflow.
  const longest = Math.max(...bigChunks.map((c) => c.text.length))
  check(
    'no chunk exceeds MAX_CHARS=1500',
    longest <= 1500,
    `longest=${longest}`,
  )

  // 5. Unicode without section pattern → synth label = first line
  console.log('\nsynth label fallback:')
  const unicode = 'Welcome to the community garden — résumé attached.\n\nMore notes below.'
  const uChunks = chunkPlainText(unicode)
  check('produces 1 chunk', uChunks.length === 1)
  check(
    'synth label = first line',
    uChunks[0]?.section === 'Welcome to the community garden — résumé attached.',
    uChunks[0]?.section,
  )

  // 6. \r\n and U+2028 normalization
  console.log('\nline-separator normalization:')
  // Carriage-return + line-feed pair should be normalized to '\n' so the
  // paragraph splitter (which looks for blank lines) sees two paragraphs.
  const crlf = 'Para one.\r\n\r\nPara two.'
  const crlfChunks = chunkPlainText(crlf)
  check(
    '\\r\\n normalized → paragraph boundary detected',
    crlfChunks.length === 1 && crlfChunks[0].text.includes('Para one.') && crlfChunks[0].text.includes('Para two.'),
    JSON.stringify(crlfChunks),
  )
  // U+2028 (LINE SEPARATOR) should also be normalized.
  const ls = 'Para one.  Para two.'
  const lsChunks = chunkPlainText(ls)
  check(
    'U+2028 normalized → text preserved',
    lsChunks.length === 1 && lsChunks[0].text.includes('Para one.') && lsChunks[0].text.includes('Para two.'),
    JSON.stringify(lsChunks),
  )

  console.log(`\n[test-chunker] ${passed} passed, ${failed} failed`)
  process.exit(failed === 0 ? 0 : 1)
}

main()

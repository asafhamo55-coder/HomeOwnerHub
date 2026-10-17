import { describe, expect, it } from 'vitest'
import { parseReleaseNote, sortReleaseNotes } from './release-notes'

const NOTE = `# Version indicator

Intro paragraph that is not the summary.

## Summary

You can now see which version is running.

- Sidebar footer shows the version
- **Login** page too

## Details

Internal notes that should not render.
`

describe('parseReleaseNote', () => {
  it('takes the title from the first h1 and the date from the filename', () => {
    const n = parseReleaseNote('2026-10-17-version.md', NOTE)
    expect(n).not.toBeNull()
    expect(n!.title).toBe('Version indicator')
    expect(n!.date).toBe('2026-10-17')
    expect(n!.slug).toBe('2026-10-17-version')
  })

  it('renders only the Summary section as paragraphs and bullet lists', () => {
    const n = parseReleaseNote('2026-10-17-version.md', NOTE)!
    expect(n.summary).toEqual([
      { type: 'p', text: 'You can now see which version is running.' },
      { type: 'ul', items: ['Sidebar footer shows the version', 'Login page too'] },
    ])
  })

  it('prefers a frontmatter date and title', () => {
    const n = parseReleaseNote('notes.md', `---\ntitle: Big release\ndate: 2026-09-01\n---\n# Ignored\n\nFirst para.\n`)!
    expect(n.title).toBe('Big release')
    expect(n.date).toBe('2026-09-01')
  })

  it('falls back to the first paragraph when there is no Summary heading', () => {
    const n = parseReleaseNote('2026-10-01-x.md', '# X\n\nJust one line\ncontinued.\n\nSecond para.\n')!
    expect(n.summary).toEqual([{ type: 'p', text: 'Just one line continued.' }])
  })

  it('falls back to the filename for a missing title and null for a missing date', () => {
    const n = parseReleaseNote('readme-notes.md', 'Body only.\n')!
    expect(n.title).toBe('readme-notes')
    expect(n.date).toBeNull()
  })

  it('ignores non-markdown files', () => {
    expect(parseReleaseNote('.DS_Store', 'x')).toBeNull()
  })
})

describe('sortReleaseNotes', () => {
  it('orders newest first, undated last', () => {
    const notes = [
      parseReleaseNote('2026-09-01-a.md', '# A')!,
      parseReleaseNote('undated.md', '# U')!,
      parseReleaseNote('2026-10-17-b.md', '# B')!,
    ]
    expect(sortReleaseNotes(notes).map((n) => n.title)).toEqual(['B', 'A', 'U'])
  })
})

import { describe, expect, it } from 'vitest'
import * as React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

// BL-072: /api/ai/ask-community ALWAYS returns `toolCalls`, so the old
// "is it a community response?" check (`toolCalls !== undefined`) was always
// true and the governing-docs branch, with its "Cited sections", never ran.
// One answer view now shows whatever the response carries.

;(globalThis as { React?: typeof React }).React = React
const h = React.createElement

const { AskDocsAnswer } = await import('./AskDocsAnswer')

const docsCall = { name: 'search_governing_docs', args: { question: 'paint' }, result: {} }
const dataCall = { name: 'count_open_violations', args: {}, result: { count: 3 } }

const render = (response: Parameters<typeof AskDocsAnswer>[0]['response']) =>
  renderToStaticMarkup(h(AskDocsAnswer, { question: 'Can I paint my door red?', response }))

describe('AskDocsAnswer (BL-072)', () => {
  it('a docs answer shows its cited sections, confidence and reference — even though toolCalls is present', () => {
    const html = render({
      answer: 'Front doors must be an approved colour.',
      toolCalls: [docsCall],
      steps: 2,
      citations: [
        { chunkId: 'ch-1', documentId: 'd-1', docType: 'ccrs', section: 'Article 7.2 Exterior colours' },
        { chunkId: 'ch-2', documentId: 'd-1', docType: 'rules', section: null },
      ],
      confidence: 'HIGH',
      runId: 'run-123',
    })
    expect(html).toContain('Cited sections (2)')
    expect(html).toContain('Article 7.2 Exterior colours')
    expect(html).toContain('Section not labelled')
    expect(html).toContain('Reference run-123')
    // No database lookups were made: no data-lookup pill, no records caveat.
    expect(html).not.toContain('data lookup')
    expect(html).not.toContain('Answered from your records')
  })

  it('a data answer shows its lookups and no citations block', () => {
    const html = render({ answer: 'You have 3 open violations.', toolCalls: [dataCall], steps: 2 })
    expect(html).toContain('1 data lookup')
    expect(html).toContain('Data sources (1)')
    expect(html).toContain('Count open violations')
    expect(html).toContain('Answered from your records')
    expect(html).not.toContain('Cited sections')
    expect(html).not.toContain('No source sections were cited')
  })

  it('an answer that used both shows both', () => {
    const html = render({
      answer: '3 open; fines per Article 9.',
      toolCalls: [dataCall, docsCall],
      steps: 3,
      citations: [{ chunkId: 'ch-9', documentId: 'd-2', docType: 'ccrs', section: 'Article 9 Fines' }],
      confidence: 'MEDIUM',
      runId: 'run-9',
    })
    expect(html).toContain('Cited sections (1)')
    expect(html).toContain('1 data lookup')
    expect(html).toContain('Reference run-9')
  })

  it('a docs search that cited nothing says so', () => {
    const html = render({ answer: 'I don’t see that in your governing docs.', toolCalls: [docsCall], steps: 2, citations: [], confidence: 'LOW' })
    expect(html).toContain('No source sections were cited for this answer.')
  })
})

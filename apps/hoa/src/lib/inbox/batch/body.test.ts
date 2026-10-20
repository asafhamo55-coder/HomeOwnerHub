import { describe, expect, it } from 'vitest'
import { batchBodyProblem, batchReplySubject, renderBatchBody } from './body'

const links = { portalLink: 'https://app.example.test/resident', arcLink: 'https://app.example.test/resident/arc/new' }

describe('batchBodyProblem', () => {
  it('accepts a plain body with safe merge fields', () => {
    expect(batchBodyProblem('Hi {{first_name}}, the pool reopens soon. See {{portal_link}}.')).toBeNull()
  })

  it('refuses empty bodies, blanks, balances and unknown fields', () => {
    expect(batchBodyProblem('   ')).toBe('Write the reply first.')
    expect(batchBodyProblem('Hours are [[BLANK: community_fact]].')).toMatch(/BLANK/)
    expect(batchBodyProblem('Your balance is {{balance}}.')).toMatch(/can’t include a balance/)
    expect(batchBodyProblem('Hi {{ address }}')).toMatch(/\{\{address\}\}/)
    expect(batchBodyProblem('x'.repeat(10_001))).toMatch(/10,000/)
  })
})

describe('renderBatchBody', () => {
  it('fills each resident’s own first name and the links', () => {
    expect(renderBatchBody('Hi {{first_name}}, see {{portal_link}}', { fromName: 'pat example', ...links })).toBe(
      'Hi Pat, see https://app.example.test/resident',
    )
    expect(renderBatchBody('Hi {{first_name}}', { fromName: null, ...links })).toBe('Hi there')
  })
})

describe('batchReplySubject', () => {
  it('prefixes Re: once', () => {
    expect(batchReplySubject('Pool hours')).toBe('Re: Pool hours')
    expect(batchReplySubject('RE: Pool hours')).toBe('RE: Pool hours')
    expect(batchReplySubject(null)).toBe('Re: your message')
  })
})

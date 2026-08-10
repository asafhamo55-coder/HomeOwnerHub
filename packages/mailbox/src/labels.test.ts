import { describe, expect, it } from 'vitest'
import {
  messageStateFromLabels,
  threadStateFromMessages,
  type ThreadMessageState,
} from './labels'

describe('messageStateFromLabels', () => {
  it('classifies a message still in the Gmail inbox', () => {
    expect(messageStateFromLabels(['INBOX', 'UNREAD', 'CATEGORY_PERSONAL'])).toBe('inbox')
  })

  it('classifies an archived message', () => {
    expect(messageStateFromLabels(['CATEGORY_PERSONAL'])).toBe('archived')
  })

  it('classifies a message moved into a user folder as archived', () => {
    // "Move to folder" in Gmail is add-label + remove-INBOX. There is no
    // separate folder concept to detect, which is exactly why this reads
    // as archived rather than as its own state.
    expect(messageStateFromLabels(['Label_17'])).toBe('archived')
  })

  it('classifies a trashed message', () => {
    expect(messageStateFromLabels(['TRASH'])).toBe('trashed')
  })

  it('classifies spam as trashed even when INBOX is still present', () => {
    // The ordering guarantee: when SPAM and INBOX conflict, the
    // more-hidden classification has to win, or spam lands in the board's
    // triage queue while Gmail shows it filed away.
    expect(messageStateFromLabels(['INBOX', 'SPAM'])).toBe('trashed')
  })

  it('classifies TRASH as trashed even when INBOX is still present', () => {
    expect(messageStateFromLabels(['INBOX', 'TRASH'])).toBe('trashed')
  })

  it('treats an empty label set as archived, not as in-inbox', () => {
    expect(messageStateFromLabels([])).toBe('archived')
  })
})

describe('threadStateFromMessages', () => {
  const inbound = (gmailState: ThreadMessageState['gmailState']): ThreadMessageState => ({
    direction: 'inbound',
    gmailState,
  })
  const outbound = (gmailState: ThreadMessageState['gmailState']): ThreadMessageState => ({
    direction: 'outbound',
    gmailState,
  })

  it('is unknown when the thread has no messages at all', () => {
    expect(threadStateFromMessages([])).toBe('unknown')
  })

  it('is unknown when no inbound message has been observed yet', () => {
    // Every thread ingested before this feature shipped looks like this.
    // It must stay visible rather than being assumed archived.
    expect(threadStateFromMessages([inbound('unknown'), inbound('unknown')])).toBe('unknown')
  })

  it('is active when any inbound message is still in the Gmail inbox', () => {
    expect(threadStateFromMessages([inbound('archived'), inbound('inbox')])).toBe('active')
  })

  it('is archived when every observed inbound message left the inbox', () => {
    expect(threadStateFromMessages([inbound('archived'), inbound('archived')])).toBe('archived')
  })

  it('ignores unobserved inbound messages when the rest are archived', () => {
    expect(threadStateFromMessages([inbound('unknown'), inbound('archived')])).toBe('archived')
  })

  it('is trashed only when every observed inbound message is trashed or deleted', () => {
    expect(threadStateFromMessages([inbound('trashed'), inbound('deleted')])).toBe('trashed')
  })

  it('downgrades a mixed trashed/archived thread to archived', () => {
    // The weaker claim is the one the evidence supports: one message
    // thrown away and another merely filed is not a thrown-away thread.
    expect(threadStateFromMessages([inbound('trashed'), inbound('archived')])).toBe('archived')
  })

  it('is unknown for an outbound-only thread, never archived', () => {
    // The regression this guards: a sent message never carries INBOX, so
    // counting outbound mail would hide every vendor request and every
    // unanswered reply — i.e. the entire `awaiting_resident` filter — the
    // moment it was sent.
    expect(threadStateFromMessages([outbound('archived'), outbound('archived')])).toBe('unknown')
  })

  it('stays active on an archived outbound reply when inbound mail is still in the inbox', () => {
    expect(threadStateFromMessages([inbound('inbox'), outbound('archived')])).toBe('active')
  })

  it('archives a replied-to thread once the board files the inbound side', () => {
    expect(threadStateFromMessages([inbound('archived'), outbound('archived')])).toBe('archived')
  })
})

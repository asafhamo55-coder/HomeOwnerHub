/**
 * Gmail REST client over plain fetch.
 *
 * No googleapis SDK — it is a very large dependency for the six endpoints
 * we use, and the codebase already set this precedent in
 * apps/hoa/src/lib/community-qa/agent.ts.
 *
 * Error mapping is the important part:
 *   401           → MailboxAuthError            (credentials dead; stop, don't retry)
 *   404 + history → MailboxHistoryExpiredError  (fall back to a dated re-sync)
 *   everything else → Error with Google's message intact
 */

import type { GmailApiMessage } from './parse'
import { MailboxAuthError, MailboxHistoryExpiredError } from './types'

const BASE = 'https://gmail.googleapis.com/gmail/v1/users/me'
const MAX_RETRIES = 3
const BASE_BACKOFF_MS = 500

interface GoogleError {
  error?: { message?: string; status?: string }
}

export class GmailClient {
  constructor(private readonly accessToken: string) {}

  private async request<T>(path: string, isHistory = false): Promise<T> {
    let lastMessage = 'Gmail request failed'

    // Gmail rate-limits per user (429) and occasionally 5xxs. Retry those
    // with exponential backoff + jitter; never retry 401 (credentials are
    // dead) or 404-on-history (the caller has a real fallback path).
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      const response = await fetch(`${BASE}${path}`, {
        headers: {
          Authorization: `Bearer ${this.accessToken}`,
          Accept: 'application/json',
        },
      })

      if (response.ok) return (await response.json()) as T

      const body = (await response.json().catch(() => ({}))) as GoogleError
      lastMessage = body.error?.message ?? `Gmail request failed (${response.status})`

      if (response.status === 401) throw new MailboxAuthError(lastMessage)
      if (response.status === 404 && isHistory) {
        // Gmail drops history after ~7 days. The caller must re-sync by date.
        throw new MailboxHistoryExpiredError(lastMessage)
      }

      const retryable = response.status === 429 || response.status >= 500
      if (!retryable || attempt === MAX_RETRIES) throw new Error(lastMessage)

      // Jitter matters: without it, a batch of parallel calls that all hit
      // the limit retry in lockstep and hit it again together.
      const backoffMs = BASE_BACKOFF_MS * 2 ** attempt
      const jitterMs = Math.floor(Math.random() * BASE_BACKOFF_MS)
      await new Promise((resolve) => setTimeout(resolve, backoffMs + jitterMs))
    }

    throw new Error(lastMessage)
  }

  async getProfile(): Promise<{ emailAddress: string; historyId: string }> {
    return this.request<{ emailAddress: string; historyId: string }>('/profile')
  }

  async listSendAs(): Promise<
    Array<{ sendAsEmail: string; isPrimary: boolean; isDefault: boolean }>
  > {
    const json = await this.request<{
      sendAs?: Array<{ sendAsEmail: string; isPrimary?: boolean; isDefault?: boolean }>
    }>('/settings/sendAs')

    return (json.sendAs ?? []).map((s) => ({
      sendAsEmail: s.sendAsEmail,
      isPrimary: s.isPrimary === true,
      isDefault: s.isDefault === true,
    }))
  }

  async listLabels(): Promise<Array<{ id: string; name: string; type: string }>> {
    const json = await this.request<{
      labels?: Array<{ id: string; name: string; type?: string }>
    }>('/labels')

    return (json.labels ?? []).map((l) => ({
      id: l.id,
      name: l.name,
      type: l.type ?? 'user',
    }))
  }

  async listHistory(
    startHistoryId: string,
    pageToken?: string,
  ): Promise<{ messageIds: string[]; nextPageToken: string | null; historyId: string | null }> {
    const params = new URLSearchParams({
      startHistoryId,
      historyTypes: 'messageAdded',
    })
    if (pageToken) params.set('pageToken', pageToken)

    const json = await this.request<{
      history?: Array<{ messagesAdded?: Array<{ message?: { id?: string } }> }>
      nextPageToken?: string
      historyId?: string
    }>(`/history?${params.toString()}`, true)

    // Only messagesAdded counts. Label changes and deletions also appear in
    // the history stream and must not be treated as new mail.
    const ids = new Set<string>()
    for (const entry of json.history ?? []) {
      for (const added of entry.messagesAdded ?? []) {
        if (added.message?.id) ids.add(added.message.id)
      }
    }

    return {
      messageIds: [...ids],
      nextPageToken: json.nextPageToken ?? null,
      historyId: json.historyId ?? null,
    }
  }

  async listMessages(
    query: string,
    pageToken?: string,
  ): Promise<{ messageIds: string[]; nextPageToken: string | null }> {
    const params = new URLSearchParams({ q: query, maxResults: '100' })
    if (pageToken) params.set('pageToken', pageToken)

    const json = await this.request<{
      messages?: Array<{ id: string }>
      nextPageToken?: string
    }>(`/messages?${params.toString()}`)

    return {
      messageIds: (json.messages ?? []).map((m) => m.id),
      nextPageToken: json.nextPageToken ?? null,
    }
  }

  async getMessage(id: string): Promise<GmailApiMessage> {
    return this.request<GmailApiMessage>(`/messages/${id}?format=full`)
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<Buffer> {
    const json = await this.request<{ data?: string; size?: number }>(
      `/messages/${messageId}/attachments/${attachmentId}`,
    )
    return Buffer.from(json.data ?? '', 'base64url')
  }
}

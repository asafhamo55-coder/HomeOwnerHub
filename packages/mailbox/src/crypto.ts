/**
 * AES-256-GCM envelope encryption for Gmail OAuth tokens.
 *
 * Envelope format:  v<version>:<iv-b64>:<authTag-b64>:<ciphertext-b64>
 *
 * The version prefix is what makes key rotation possible. Rotating means:
 *   1. keep the old key as MAILBOX_TOKEN_KEY_V<n>
 *   2. set MAILBOX_TOKEN_KEY to the new key
 *   3. bump MAILBOX_TOKEN_KEY_VERSION
 * Existing envelopes keep opening under their original version; new ones
 * are sealed under the new key. Nothing needs re-encrypting up front.
 *
 * GCM is authenticated, so tampering throws rather than silently
 * returning garbage — a plain CBC/CTR mode would hand back nonsense that
 * looks like a valid token and fail confusingly at the Gmail API.
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_BYTES = 12 // GCM standard

function readKey(version: number): Buffer {
  const current = currentKeyVersion()
  const raw =
    version === current
      ? process.env.MAILBOX_TOKEN_KEY
      : process.env[`MAILBOX_TOKEN_KEY_V${version}`]

  if (!raw) {
    throw new Error(
      version === current
        ? 'MAILBOX_TOKEN_KEY is not set. Generate one with: openssl rand -base64 32'
        : `MAILBOX_TOKEN_KEY_V${version} is not set — an envelope sealed under key ` +
          `version ${version} cannot be opened. Retain retired keys after rotation.`,
    )
  }

  const key = Buffer.from(raw, 'base64')
  if (key.length !== 32) {
    throw new Error(
      `MAILBOX_TOKEN_KEY must decode to 32 bytes for AES-256 (got ${key.length}).`,
    )
  }
  return key
}

export function currentKeyVersion(): number {
  const raw = process.env.MAILBOX_TOKEN_KEY_VERSION

  // If unset or empty, use default version 1 (the un-rotated state)
  if (!raw || raw === '') {
    return 1
  }

  // Trim whitespace to avoid operator mistakes like " 2 "
  const trimmed = raw.trim()

  // Must be a numeric string (all digits, no prefix like "v2")
  if (!/^\d+$/.test(trimmed)) {
    throw new Error(
      `MAILBOX_TOKEN_KEY_VERSION must be a positive integer; got "${raw}". ` +
      `Versions are numeric like "1" or "2", not "v1" or "v2".`,
    )
  }

  const parsed = Number.parseInt(trimmed, 10)

  // Must be positive (reject "0" or leading zeros that parse to 0)
  if (parsed <= 0) {
    throw new Error(
      `MAILBOX_TOKEN_KEY_VERSION must be a positive integer; got "${raw}".`,
    )
  }

  return parsed
}

export function encryptToken(plain: string): string {
  const version = currentKeyVersion()
  const iv = randomBytes(IV_BYTES)
  const cipher = createCipheriv(ALGORITHM, readKey(version), iv)

  const ciphertext = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()

  return [
    `v${version}`,
    iv.toString('base64'),
    tag.toString('base64'),
    ciphertext.toString('base64'),
  ].join(':')
}

export function decryptToken(encoded: string): string {
  const parts = encoded.split(':')
  if (parts.length !== 4 || !parts[0].startsWith('v')) {
    throw new Error('Malformed token envelope.')
  }

  const version = Number.parseInt(parts[0].slice(1), 10)
  if (!Number.isFinite(version)) throw new Error('Malformed token envelope version.')

  const decipher = createDecipheriv(
    ALGORITHM,
    readKey(version),
    Buffer.from(parts[1], 'base64'),
  )
  decipher.setAuthTag(Buffer.from(parts[2], 'base64'))

  // .final() throws on an auth-tag mismatch — that is the tamper check.
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3], 'base64')),
    decipher.final(),
  ]).toString('utf8')
}

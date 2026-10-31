// Codes /auth/callback puts in ?error=. Anything else is ignored, so the raw
// query value is never rendered.
export const LINK_ERROR_CODES = ['missing_code', 'exchange_failed'] as const
export type LinkErrorCode = (typeof LINK_ERROR_CODES)[number]

export function parseLinkError(raw: string | undefined): LinkErrorCode | undefined {
  return LINK_ERROR_CODES.find((c) => c === raw)
}

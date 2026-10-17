// tel: and mailto: hrefs for contact details typed in by hand. Pure.
//
// Phones on file are free text ("(555) 010-0128", "555.010.0128 x12"), so
// the href is built from the digits; anything that doesn't look dialable
// stays plain text rather than becoming a link that dials nonsense.

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function isPlausibleEmail(raw: string): boolean {
  return EMAIL.test(raw.trim())
}

export function telHref(raw: string | null | undefined): string | null {
  if (!raw) return null
  const m = raw.trim().match(/^(.*?)(?:\s*(?:x|ext\.?|extension)\s*(\d+))?$/i)
  const main = m?.[1] ?? raw
  const ext = m?.[2]
  const plus = main.trim().startsWith('+') ? '+' : ''
  const digits = main.replace(/\D/g, '')
  if (digits.length < 7 || digits.length > 15) return null
  return `tel:${plus}${digits}${ext ? `;ext=${ext}` : ''}`
}

export function mailtoHref(raw: string | null | undefined): string | null {
  if (!raw) return null
  const email = raw.trim()
  return isPlausibleEmail(email) ? `mailto:${email}` : null
}

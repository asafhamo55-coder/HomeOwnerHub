import type { ConsentState } from '@/lib/email-consent'
import type { TextMessagesState } from '@/lib/sms-consent'
import type { LanguageState } from '@/lib/language-preference'

export type ChipTone = 'on' | 'off' | 'unknown'
export interface StatusChip {
  key: 'notices' | 'texts' | 'language'
  label: string
  value: string
  href: string
  tone: ChipTone
}

/**
 * The three status chips at the top of the Account page. Pure: takes the
 * values the page already loaded and changes no consent logic. A card the
 * page does not show (undefined or null input) gets no chip, so no chip
 * links to nothing. A failed read says "Not available", never "Off".
 */
export function statusChips(input: {
  consent: ConsentState | null | 'failed' | undefined
  texts: Pick<TextMessagesState, 'optIn'> | 'failed' | null
  language: LanguageState | null
}): StatusChip[] {
  const out: StatusChip[] = []
  const { consent, texts, language } = input
  if (consent !== undefined) {
    out.push(
      consent === 'failed'
        ? { key: 'notices', label: 'Email notices', value: 'Not available', href: '#e-notices', tone: 'unknown' }
        : consent?.granted === true
          ? { key: 'notices', label: 'Email notices', value: 'On', href: '#e-notices', tone: 'on' }
          : { key: 'notices', label: 'Email notices', value: 'Off', href: '#e-notices', tone: 'off' },
    )
  }
  if (texts !== null) {
    out.push(
      texts === 'failed'
        ? { key: 'texts', label: 'Texts', value: 'Not available', href: '#text-messages', tone: 'unknown' }
        : { key: 'texts', label: 'Texts', value: texts.optIn ? 'On' : 'Off', href: '#text-messages', tone: texts.optIn ? 'on' : 'off' },
    )
  }
  if (language !== null) {
    out.push(
      !language.ok
        ? { key: 'language', label: 'Language', value: 'Not available', href: '#message-language', tone: 'unknown' }
        : {
            key: 'language',
            label: 'Language',
            value: language.language === 'es' ? 'Español' : language.language === 'en' ? 'English' : 'English and Español',
            href: '#message-language',
            tone: 'on',
          },
    )
  }
  return out
}

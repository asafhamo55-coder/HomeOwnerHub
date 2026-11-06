import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { MADISON_PARK_PRESET, renderWelcomeEmail } from '@/lib/communications/welcome-email'
import { renderPollResultsEmail } from '@/lib/polls/email/render'
import { renderPaymentReceiptEmail } from '@/lib/resident-notify/receipt-render'
import { LOGO_FILE } from './brand'

// Opt-in: writes the rebranded sample emails so the owner can look at them.
//   BRAND_SAMPLES_DIR=/some/dir pnpm vitest run apps/hoa/src/lib/email/brand-samples
// The logo URL in each file points at the PNG copied next to it, so the
// samples show the logo when opened from disk, before it is deployed.
const OUT = process.env.BRAND_SAMPLES_DIR

describe.skipIf(!OUT)('brand samples', () => {
  it('writes the welcome, poll results and receipt samples', () => {
    const dir = OUT!
    mkdirSync(dir, { recursive: true })
    process.env.EMAIL_ASSET_BASE_URL = 'https://app.homeownerhub.test'
    const local = (html: string) => html.replace(/src="https:\/\/[^"]*homeownerhub-logo\.png"/g, `src="${LOGO_FILE}"`)

    const welcome = renderWelcomeEmail({
      origin: 'https://app.homeownerhub.test',
      associationName: MADISON_PARK_PRESET.associationName,
      city: MADISON_PARK_PRESET.city,
      boardSignature: 'The Madison Park Board',
    }).html

    const poll = renderPollResultsEmail({
      associationName: 'Madison Park',
      title: 'Repaint the clubhouse trim this spring?',
      homesAnswered: 62,
      allowMultiple: false,
      resultsUrl: 'https://app.homeownerhub.test/polls/example',
      rows: [
        { optionId: 'a', label: 'Yes, repaint in the current colours', votes: 31, percent: 50, leading: true },
        { optionId: 'b', label: 'Yes, but choose new colours', votes: 19, percent: 31, leading: false },
        { optionId: 'c', label: 'No, wait another year', votes: 12, percent: 19, leading: false },
      ],
    }).html

    const receipt = renderPaymentReceiptEmail({
      associationName: 'Madison Park',
      amount: 275,
      paidDay: '2026-11-03',
      method: 'zelle',
      propertyLabel: '12 Oak Lane',
      balance: 0,
      portalUrl: 'https://app.homeownerhub.test/resident/dues',
    }).html

    writeFileSync(path.join(dir, 'welcome-email-madison-park.html'), local(welcome))
    writeFileSync(path.join(dir, 'poll-results-sample.html'), local(poll))
    writeFileSync(path.join(dir, 'receipt-sample.html'), local(receipt))
    copyFileSync(path.resolve(__dirname, '../../../public/email/v2', LOGO_FILE), path.join(dir, LOGO_FILE))
    expect(receipt.length).toBeGreaterThan(1000)
  })
})

// Findings the suite records as facts about the test account and the app
// (e.g. "ACH is not enabled in Checkout"), printed to the log and, in
// GitHub Actions, appended to the job summary. Ids and enum values only:
// never a key, an email, or a provider message.

import { appendFileSync } from 'node:fs'

const findings: string[] = []

export function record(section: string, line: string): void {
  findings.push(`- **${section}:** ${line}`)
  console.info(`[stripe-sandbox] ${section}: ${line}`)
}

export function recorded(): readonly string[] {
  return findings
}

/** Append this file's findings to $GITHUB_STEP_SUMMARY (when set) and clear them. */
export function flushReport(title: string, summaryPath = process.env.GITHUB_STEP_SUMMARY): void {
  if (findings.length && summaryPath) {
    appendFileSync(summaryPath, `\n### Stripe sandbox: ${title}\n\n${findings.join('\n')}\n`)
  }
  findings.length = 0
}

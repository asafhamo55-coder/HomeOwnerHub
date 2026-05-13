// W18 — Bank Reconciliation Agent prompt
// Versioned via PROMPT_VERSION; bump on copy edits.
//
// The LLM is only consulted for Step D ("unmatched — suggest a
// categorization for the human"). Steps A/B/C are deterministic and
// don't need the model — see tools.ts and index.ts.

export const PROMPT_VERSION = '1.0.0'

export const SYSTEM_PROMPT = `You are the Bank Reconciliation Agent for an HOA management platform. A bank transaction has arrived that could not be auto-matched to an open assessment or a recent journal entry. Your job: suggest how a human should categorize it.

Rules you MUST follow:

1. Suggest exactly ONE account from the chart of accounts that the user provided. Use account_number to identify it. Never invent an account number that isn't in the list.

2. Suggest exactly ONE fund from the funds list the user provided. Match it to the bank account's primary fund unless the memo clearly indicates a different fund (e.g. memo contains "reserve").

3. If the transaction is inbound (positive amount) and the memo or merchant hints at a resident name, flag it: set "likely_payment_from_resident": true and add a brief note. The human can then go look for the matching assessment by name even if the memo code was malformed.

4. If the transaction is outbound (negative amount) and the merchant resembles a vendor name in the vendors list, flag it: set "likely_vendor_payment_to": "<vendor_id>" and recommend the AP account from the COA.

5. Confidence: HIGH if the merchant or memo strongly indicates the suggestion; MEDIUM if it's a reasonable guess; LOW if you're really just picking the most common bucket. Be honest — humans will read this label and decide whether to trust the auto-pick.

6. Never auto-post. Your suggestion lands on a manager's queue. The output is advisory, not authoritative.

Output schema (return JSON, no markdown fences):
{
  "suggested_account_number": "<string>",
  "suggested_fund_code": "<string>",
  "suggested_memo": "<short human-readable reason>",
  "likely_payment_from_resident": true | false,
  "likely_vendor_payment_to": "<vendor_id>" | null,
  "confidence": "HIGH" | "MEDIUM" | "LOW",
  "reasoning": "<one sentence>"
}`

export interface AccountSummary {
  accountNumber: string
  accountName: string
  accountType: string
}

export interface FundSummary {
  code: string
  name: string
  fundType: string
}

export interface VendorSummary {
  id: string
  legalName: string
  trades: string[]
}

export function userPromptFor(input: {
  amount: number
  postedDate: string
  memo: string | null
  merchant: string | null
  bankAccountName: string
  primaryFundCode: string
  accounts: AccountSummary[]
  funds: FundSummary[]
  vendors: VendorSummary[]
}): string {
  const accounts = input.accounts
    .map((a) => `  ${a.accountNumber} — ${a.accountName} (${a.accountType})`)
    .join('\n')
  const funds = input.funds
    .map((f) => `  ${f.code} — ${f.name} (${f.fundType})`)
    .join('\n')
  const vendors = input.vendors.length === 0
    ? '  (no vendors on file yet)'
    : input.vendors
        .slice(0, 50) // cap context size
        .map((v) => `  ${v.id} — ${v.legalName} [${v.trades.join(', ')}]`)
        .join('\n')

  return `Bank transaction to categorize:

Amount: ${input.amount.toFixed(2)} ${input.amount > 0 ? '(inbound deposit)' : '(outbound payment)'}
Posted: ${input.postedDate}
Memo: ${input.memo ?? '(none)'}
Merchant: ${input.merchant ?? '(none)'}
Bank account: ${input.bankAccountName} (primary fund: ${input.primaryFundCode})

Chart of accounts (pick one account_number):
${accounts}

Funds (pick one code):
${funds}

Vendors on file (use the id if the merchant matches one):
${vendors}`
}

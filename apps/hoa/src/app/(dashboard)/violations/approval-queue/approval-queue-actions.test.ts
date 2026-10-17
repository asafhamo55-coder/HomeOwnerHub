import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

/**
 * BL-057: /violations/approval-queue had no buttons of its own — a board
 * member had to go to /approvals to decide a draft. The page now renders
 * the same decision control the inbox uses (components/approvals/
 * ApprovalActions → decideApproval → approveViolationDraft /
 * rejectViolationDraft), so there is one copy of the logic. No component
 * test harness exists here (root vitest is node-only), so this pins the
 * wiring by source, like ux-ratchet.test.ts.
 */
const here = path.dirname(fileURLToPath(import.meta.url))
const page = readFileSync(path.join(here, 'page.tsx'), 'utf8')
const actions = readFileSync(path.resolve(here, '../../../../components/approvals/ApprovalActions.tsx'), 'utf8')

describe('violation approval queue decides drafts in place (BL-057)', () => {
  it('renders the shared ApprovalActions control for each draft as a W3 decision', () => {
    expect(page).toMatch(/import \{ ApprovalActions \} from '@\/components\/approvals\/ApprovalActions'/)
    expect(page).toMatch(/<ApprovalActions[\s\S]*?decision=\{\{ kind: 'w3', runId: run\.id \}\}/)
  })

  it('does not call the draft actions itself — the shared control does', () => {
    expect(page).not.toMatch(/approveViolationDraft|rejectViolationDraft|decideApproval/)
  })

  it('the shared control routes through decideApproval, asks a reason to reject and confirms approve', () => {
    expect(actions).toMatch(/import \{ decideApproval \} from '@\/lib\/approvals-inbox\/actions'/)
    expect(actions).toMatch(/ConfirmDialog/)
    expect(actions).toMatch(/Nothing is emailed or texted to the homeowner/)
    expect(actions).toMatch(/label="Reason" required/)
  })
})

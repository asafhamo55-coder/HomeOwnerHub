// Public API for @homeowner-portal/workflows. Each workflow exports
// from its own subfolder per spec §3.

export {
  governingDocsBrain,
  queryGoverningDocs,
} from './W1-governing-docs-brain'
export type {
  GoverningDocsBrainInput,
  GoverningDocsBrainOutput,
  GoverningDocsCitation,
} from './W1-governing-docs-brain'

export {
  chunkByMarkdownSection,
  chunkPlainText,
} from './W1-governing-docs-brain/chunker'
export type { Chunk } from './W1-governing-docs-brain/chunker'

export { violationInspector } from './W3-violation-inspector'
export type {
  ViolationInspectorInput,
  ViolationInspectorOutput,
} from './W3-violation-inspector'

// v1.1 — Accounting + Vendor workflows (spec §5, added in v1.1)

export { bankReconciliationAgent } from './W18-bank-reconciliation'
export type {
  BankReconciliationInput,
  BankReconciliationOutput,
} from './W18-bank-reconciliation'
export {
  parseMemoCode,
  memoCodeFor,
  amountsMatchExact,
  amountsMatchFuzzy,
  MEMO_CODE_REGEX,
  EXACT_MATCH_AMOUNT_TOLERANCE_USD,
  AUTO_POST_CONFIDENCE_FLOOR,
  EXACT_MEMO_MATCH_CONFIDENCE,
  DUPLICATE_JE_WINDOW_DAYS,
} from './W18-bank-reconciliation/tools'
export type { MemoCodeParts } from './W18-bank-reconciliation/tools'

export { vendorOnboarder } from './W21-vendor-onboarder'
export type {
  VendorOnboarderInput,
  VendorOnboarderOutput,
  Deficiency,
} from './W21-vendor-onboarder'

export { rfpComposer } from './W22-rfp-composer'
export type {
  RfpComposerInput,
  RfpComposerOutput,
} from './W22-rfp-composer'

export { bidComparator } from './W23-bid-comparator'
export type {
  BidComparatorInput,
  BidComparatorOutput,
} from './W23-bid-comparator'

// v1.2 — Module 8 State Law & Compliance
export { stateLawBrain, askStateLaw } from './W30-state-law-brain'
export type {
  StateLawBrainInput,
  StateLawBrainOutput,
  StateLawCitation,
} from './W30-state-law-brain'

// v1.2 — Module 9 Communications
export { commComposer } from './W31-comm-composer'
export type {
  CommComposerInput,
  CommComposerOutput,
} from './W31-comm-composer'

// Phase B — Module 9 continued: shared-inbox reply drafting
export { replyDrafter, draftReply, InvalidCitationError } from './W32-reply-drafter'
export type { ReplyDrafterInput, ReplyDrafterOutput } from './W32-reply-drafter'

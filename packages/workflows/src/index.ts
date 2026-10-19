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
// BL-025 — W31's translation step (English → Spanish draft for review).
export {
  translateCommunication,
  parseTranslationReply,
  mergeFieldNames,
  CommTranslateInputSchema,
  TRANSLATE_PROMPT_VERSION,
} from './W31-comm-composer/translate'
export type {
  CommTranslateInput,
  CommTranslateOutput,
  TranslateComplete,
  TranslateMessage,
  TranslateResult,
} from './W31-comm-composer/translate'

// Phase B — Module 9 continued: shared-inbox reply drafting
// Both citation failures are exported: a consumer needs to tell "cited a source
// that was never retrieved" (InvalidCitationError) apart from "cited a real
// source but the quote is not in it" (UnsupportedQuoteError). They call for
// different messages to a reviewer, and collapsing them would hide which one
// the model actually did.
export {
  replyDrafter,
  draftReply,
  InvalidCitationError,
  UnsupportedQuoteError,
} from './W32-reply-drafter'
export type { ReplyDrafterInput, ReplyDrafterOutput } from './W32-reply-drafter'

export { vendorExtractor, extractVendor } from './W33-vendor-extractor'
export type {
  VendorExtractorInput,
  VendorExtractorOutput,
} from './W33-vendor-extractor'

// Phase D — an AI-drafted work order to a vendor, from a resident's thread.
// `processVendorRequestResponse` is exported alongside the workflow for the
// same reason W32 exports its own processor: the root vitest harness is
// pure-modules-only, and `run()` cannot be called in isolation because
// defineWorkflow closes over it.
export {
  vendorRequestComposer,
  composeVendorRequest,
  processVendorRequestResponse,
  VENDOR_REQUEST_INTENTS,
  VENDOR_REQUEST_BLANK_KINDS,
} from './W34-vendor-request-composer'
export type {
  VendorRequestComposerInput,
  VendorRequestComposerOutput,
  VendorRequestIntent,
  VendorRequestBlankKind,
  PhotoFinding,
} from './W34-vendor-request-composer'

// Sub-project D — approval layer (first consumer: W18 cash receipts).
export {
  proposeApproval,
  approveRequest,
  rejectRequest,
  APPROVAL_EXECUTORS,
  W18_CASH_RECEIPT,
} from './approvals'
export type {
  ApprovalExecutor,
  ApprovalRequestRow,
  ApprovalStatus,
  DecisionResult,
  CashReceiptPayload,
} from './approvals'

// BL-021 — AP bill scan. Proposes only: the caller files a `w36.ap_bill`
// approval request, and the bill is entered (apps/hoa enterBill) when a
// board member approves it. The executor lives in apps/hoa because the
// bill path it reuses (lib/invoices.ts) does.
export {
  scanBill,
  runBillScan,
  processBillScanResponse,
  overallConfidence,
  liveBillScanModel,
  W36_AP_BILL,
  MAX_BILL_AMOUNT,
  MAX_BILL_TEXT_CHARS,
} from './W36-bill-scan'
export type {
  BillScanInput,
  BillScanOutput,
  BillScanModel,
  FieldConfidence,
} from './W36-bill-scan'

// BL-024 / BL-027 — ARC Review. Advisory only: the resident pre-check never
// says approved/denied, and the board draft lands as pending_human_approval;
// the board decides with the existing ARC actions.
export {
  reviewArcRequest,
  runArcReview,
  processArcReviewResponse,
  buildArcFacts,
  detectMissingInfo,
  stripVerdicts,
  liveArcReviewModel,
  W37_WORKFLOW_ID,
  ARC_DECISIONS,
  ARC_MISSING_INFO,
  ARC_PRECHECK_DISCLAIMER,
  ARC_REVIEW_DISCLAIMER,
} from './W37-arc-review'
export type {
  ArcReviewInput,
  ArcReviewOutput,
  ArcReviewModel,
  ArcRetrieve,
  ArcFacts,
  ArcRule,
  ArcSuggestion,
  ArcSuggestedDecision,
  ArcMissingInfo,
  ArcRequestFields,
} from './W37-arc-review'

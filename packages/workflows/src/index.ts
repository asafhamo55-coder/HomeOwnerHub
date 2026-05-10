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

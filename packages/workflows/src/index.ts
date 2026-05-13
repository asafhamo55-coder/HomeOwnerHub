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

// Router / agent registry
export { TASK_ROUTING, agentFor } from './router'
export type { TaskType, AgentId } from './router'

// Agents (lower-level — apps usually call tasks instead)
export { runFast, MODEL_FAST } from './agents/fast'
export { runMain, MODEL_MAIN } from './agents/main'
export { runReason } from './agents/reason'
export { analyzeImage } from './agents/vision'
export { runCPU } from './agents/cpu'
export { runCloud } from './agents/cloud'

// Tasks (the public API for apps)
export { analyzeViolationPhoto } from './tasks/photo-analysis'
export type { PhotoAnalysisResult } from './tasks/photo-analysis'

export { covenantBrainAnalyze } from './tasks/covenant-brain'
export type { CovenantMatch } from './tasks/covenant-brain'

export { draftViolationLetter } from './tasks/draft-letter'
export { parseCCRDocument } from './tasks/parse-document'
export type { ParsedCCRDocument } from './tasks/parse-document'

export { summarizeMeeting } from './tasks/meeting-summary'
export { generateDailyDigest } from './tasks/daily-digest'

export { aiComplianceCheck } from './tasks/compliance-check'
export type { AIComplianceFlags } from './tasks/compliance-check'

export { draftEvictionNotice, humanizeNoticeType } from './tasks/draft-notice'
export type { EvictionNoticeType } from './tasks/draft-notice'

export { classifyIntent } from './tasks/classify-intent'
export type { Intent } from './tasks/classify-intent'

export { runViolationWorkflow } from './tasks/violation-workflow'
export type { ViolationWorkflowResult } from './tasks/violation-workflow'

export { suggestFieldValues } from './tasks/suggest-fields'
export type { FieldSuggestion, SuggestFieldsInput } from './tasks/suggest-fields'

// Resilience wrapper
export { withFallback } from './resilience'

// Embeddings (BGE-M3 via HuggingFace bridge per ADR-003)
export { embedTexts, toPgVector, EmbeddingError } from './embeddings'
export type { EmbedOptions } from './embeddings'

// v1 workflow primitive (spec §7) — every Phase 2 workflow goes through this.
export { defineWorkflow } from './workflow'
export type {
  Workflow,
  WorkflowResult,
  WorkflowExecuteApi,
  WorkflowExecutionContext,
  WorkflowExecutionStatus,
  DefineWorkflowOptions,
} from './workflow'

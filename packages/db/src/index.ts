export {
  createBrowserClient,
  createAdminClient,
  SUPABASE_URL,
  SUPABASE_ANON_KEY,
} from './client'

export type { Database, Json } from './database.types'

export {
  postJournalEntry,
  PostJournalEntryInputSchema,
  JournalEntryLineSchema,
} from './accounting/post-journal-entry'
export type {
  PostJournalEntryInput,
  PostJournalEntryResult,
  JournalEntryLine,
} from './accounting/post-journal-entry'

export { loadAccountingRefs } from './accounting/refs'
export type { AccountingRefs } from './accounting/refs'

export { M1_APPLIED } from './m1'
export { M3_APPLIED } from './m3'
export { M4_APPLIED } from './m4'
export { M5_APPLIED } from './m5'

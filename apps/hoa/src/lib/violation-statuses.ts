// Plain (non-"use server") module so the constants + type can be
// imported from client components and server actions alike.
// `lib/violations.ts` is marked "use server" and Next 15 forbids
// exporting anything except async functions from such a file.

export const VIOLATION_STATUSES = [
  'open',
  'notice_sent',
  'fined',
  'resolved',
  'dismissed',
] as const

export type ViolationStatus = (typeof VIOLATION_STATUSES)[number]

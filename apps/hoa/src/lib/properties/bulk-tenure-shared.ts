// Client-safe half of bulk "set tenure": the cap, the confirm wording, the
// toast summary and the selection arithmetic. Kept free of server imports
// (index.ts pulls in next/cache and the Supabase server client) so the
// BulkTenure client component can import it without breaking the browser
// bundle. Same split as approvals-inbox/bulk-shared.ts.

export type BulkTenureTarget = 'owner_occupied' | 'leased'

/** Most homes one call will touch. Matches the schema in bulkSetPropertyTenure. */
export const BULK_TENURE_CAP = 200

const TARGET_PHRASE: Record<BulkTenureTarget, string> = {
  owner_occupied: 'owner-occupied',
  leased: 'leased',
}

export const TARGET_BUTTON_LABEL: Record<BulkTenureTarget, string> = {
  owner_occupied: 'Owner-occupied',
  leased: 'Leased',
}

const homes = (n: number) => `${n} ${n === 1 ? 'home' : 'homes'}`

export function barLabel(n: number): string {
  return `Set tenure for ${homes(n)}`
}

export function capMessage(n: number): string {
  return `You can change up to ${BULK_TENURE_CAP} homes at a time. Deselect ${n - BULK_TENURE_CAP} to continue.`
}

/** The confirm dialog: "Mark 12 homes as leased?" */
export function confirmCopy(n: number, target: BulkTenureTarget): { title: string; description: string; confirmLabel: string } {
  return {
    title: `Mark ${homes(n)} as ${TARGET_PHRASE[target]}?`,
    description:
      target === 'leased'
        ? 'Each home is recorded as leased in its history, and the rental count on Leases goes up. Nothing is sent to owners.'
        : 'Each home is recorded as owner-occupied in its history. Homes that were leased are marked as no longer leased. Nothing is sent to owners.',
    confirmLabel: `Mark ${n} as ${TARGET_PHRASE[target]}`,
  }
}

/** Toast text for a finished run. */
export function summarizeTenure(
  updated: number,
  failed: number,
  target: BulkTenureTarget,
): { tone: 'success' | 'error'; text: string } {
  if (failed === 0) return { tone: 'success', text: `${homes(updated)} marked as ${TARGET_PHRASE[target]}.` }
  const head = updated === 0 ? 'No homes were updated' : `${homes(updated)} updated`
  return { tone: 'error', text: `${head}, ${failed} could not be changed. They stay selected so you can try again.` }
}

/** Add or remove ids, keeping first-seen order and no duplicates. */
export function applySelection(current: string[], ids: string[], on: boolean): string[] {
  if (on) return [...new Set([...current, ...ids])]
  const drop = new Set(ids)
  return current.filter((id) => !drop.has(id))
}

/** After a run: only the ids the server reported as failed stay selected. */
export function keepFailed(current: string[], failedIds: string[]): string[] {
  const failed = new Set(failedIds)
  return current.filter((id) => failed.has(id))
}

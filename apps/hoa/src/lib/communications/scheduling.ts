/**
 * BL-102 A1: whether the composer offers "Send later".
 *
 * Scheduled messages are delivered by the `communications-scheduled-dispatch`
 * Inngest job (packages/jobs/src/communications-scheduled.ts), every five
 * minutes. Before that job existed, a scheduled message sat in
 * status='scheduled' forever. Set this to false to hide scheduling again:
 * the wizard then shows "Scheduling is coming soon" and sendCommunication
 * refuses a future scheduledFor, so nothing can be queued that nobody sends.
 */
export const SCHEDULING_ENABLED: boolean = true

export const SCHEDULING_COMING_SOON = 'Scheduling is coming soon.'

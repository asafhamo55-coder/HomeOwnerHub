/**
 * The automated reminder's email (BL-013). Pure.
 *
 * Built from the same pieces as the manual reminder on /dues (render.ts) so
 * the two can never drift: same shell, same dues table, same subject. The
 * manual path hands placeholders to the communications pipeline's
 * renderTemplate; the job sends directly, so substitution happens here, in
 * ONE pass over `{{word}}` tokens — a value that itself contains `{{…}}`
 * (an owner named "{{dues_table}}") is never re-expanded.
 */

import type { ReminderRenderInput } from '@homeowner-portal/jobs'
import {
  SUBJECT_TEMPLATE,
  amountSummary,
  escapeHtml,
  neutralizeMergeSyntax,
  renderDuesTableHtml,
  renderDuesTableText,
  renderShellHtml,
  renderShellText,
} from './render'
import type { ReminderPacket } from './types'

function substitute(template: string, values: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole,
  )
}

export function packetFor(input: ReminderRenderInput): ReminderPacket {
  const charges = input.charges
  const round = (n: number) => Math.round(n * 100) / 100
  const total = round(charges.reduce((s, c) => s + c.balance, 0))
  const pastDue = round(charges.filter((c) => c.pastDue).reduce((s, c) => s + c.balance, 0))
  return {
    email: '',
    ownerName: input.ownerName,
    userId: null,
    properties: [{ unitId: input.unitId, label: input.unitLabel, charges, subtotal: total }],
    totalDue: total,
    pastDueTotal: pastDue,
    oldestDaysLate: charges.reduce((m, c) => Math.max(m, c.daysLate), 0),
    chargeCount: charges.length,
  }
}

export function renderAutoReminder(input: ReminderRenderInput): { subject: string; html: string; text: string } {
  const packet = packetFor(input)
  const note = input.note?.trim() ? neutralizeMergeSyntax(input.note.trim().slice(0, 500)) : undefined

  const subject = substitute(SUBJECT_TEMPLATE, {
    association_name_text: input.associationName,
    amount_summary: amountSummary(packet),
  })
  const html = substitute(renderShellHtml({ note, portalUrl: input.portalUrl }), {
    association_name: escapeHtml(input.associationName),
    owner_name: escapeHtml(input.ownerName),
    dues_table: renderDuesTableHtml(packet),
  })
  const text = substitute(renderShellText({ note, portalUrl: input.portalUrl }), {
    association_name_text: input.associationName,
    owner_name_text: input.ownerName,
    dues_text: renderDuesTableText(packet),
  })
  return { subject, html, text }
}

/** Invented data for the settings screen's template preview — never a
 *  real owner, address or balance. */
export function sampleReminderInput(opts: {
  associationName: string
  note: string | null
  portalUrl: string
}): ReminderRenderInput {
  return {
    associationName: opts.associationName,
    ownerName: 'Jordan Sample',
    unitId: 'sample',
    unitLabel: '100 Sample Way',
    step: 5,
    dueDate: '2026-10-01',
    note: opts.note,
    portalUrl: opts.portalUrl,
    charges: [
      {
        id: 'sample-1',
        assessmentType: 'regular',
        dueDate: '2026-10-01',
        amount: 325,
        paid: 0,
        balance: 325,
        pastDue: true,
        daysLate: 5,
      },
    ],
  }
}

// BL-117 Board turnover kit — the pure half. Every section of
// /settings/handover is assembled here from rows the loader read, so each
// rule is unit-tested without a database.
//
// What this module may hold, by design (docs/research/2026-10-20-next-wins.md
// #5, and the no-PII rule): board/admin members' own names and emails (the
// board already sees them on /settings/members), user ids, counts, dates and
// statuses. Never a token, secret, Zelle recipient, Stripe customer id, bank
// account number, resident name or thread subject. The printable summary is
// stricter still: board members' names and roles only, no emails.
//
// "Leaving" is a client-side checklist filter only — nothing here writes it.

export type BoardRole = 'admin' | 'board'

export interface MemberRowInput {
  user_id: string
  role: string
  joined_at: string | null
  profile: { email: string | null; full_name: string | null } | null
}

export interface BoardMember {
  userId: string
  name: string | null
  email: string | null
  role: BoardRole
  joinedAt: string | null
  /** null when auth has no record of a sign-in, or it couldn't be read. */
  lastSignInAt: string | null
}

export interface AccessSection {
  board: BoardMember[]
  /** Residents are counted, never listed: their names are not part of a handover. */
  residentCount: number
}

/** Admins first, then board; each by name (unnamed last), then id for stability. */
export function buildAccess(rows: MemberRowInput[], lastSignIns: ReadonlyMap<string, string | null>): AccessSection {
  const board: BoardMember[] = []
  let residentCount = 0
  for (const r of rows) {
    if (r.role === 'admin' || r.role === 'board') {
      board.push({
        userId: r.user_id,
        name: r.profile?.full_name?.trim() || null,
        email: r.profile?.email ?? null,
        role: r.role,
        joinedAt: r.joined_at,
        lastSignInAt: lastSignIns.get(r.user_id) ?? null,
      })
    } else if (r.role === 'resident') {
      residentCount += 1
    }
  }
  board.sort((a, b) => {
    if (a.role !== b.role) return a.role === 'admin' ? -1 : 1
    if (a.name && b.name && a.name !== b.name) return a.name.localeCompare(b.name)
    if (a.name && !b.name) return -1
    if (!a.name && b.name) return 1
    return a.userId.localeCompare(b.userId)
  })
  return { board, residentCount }
}

/** The label a board member goes by everywhere in the kit. */
export function memberLabel(m: Pick<BoardMember, 'name' | 'email' | 'userId'>): string {
  return m.name ?? m.email ?? `Member ${m.userId.slice(0, 8)}`
}

// ─── Connections tied to one person ──────────────────────────────────

export type ConnectionKind = 'mailbox' | 'plaid' | 'zelle' | 'stripe'
export type ConnectionStatus = 'connected' | 'not_connected' | 'needs_attention'

export interface Connection {
  /** Stable key for React and tests: kind, plus the row id for multi-row kinds. */
  key: string
  kind: ConnectionKind
  label: string
  status: ConnectionStatus
  /** The board member it was set up under. null = not recorded, or not a person. */
  ownerUserId: string | null
  /** True when the owner is recorded but is no longer a board member or admin. */
  ownerGone: boolean
  /** One plain sentence. Never a secret or an account identifier. */
  detail: string
  /** ISO timestamp of setup or last change, when known. */
  since: string | null
  href: string
  action: 'Transfer' | 'Reconnect' | 'Review'
  /** The settings screen behind `href` is admin-only. */
  adminOnly: boolean
}

export interface MailboxInput {
  connected_by: string | null
  connected_at: string
  sync_status: string
  provider: string
}

export interface PlaidItemInput {
  id: string
  institution_name: string | null
  created_by: string | null
  created_at: string
  last_synced_at: string | null
}

export type ZelleState = 'configured' | 'not_configured' | 'unverified' | 'no_association'

export interface ConnectionsInput {
  mailbox: MailboxInput | null
  plaidItems: PlaidItemInput[]
  zelle: { state: ZelleState; updatedAt: string | null }
  /** Only whether a Stripe customer exists — never the id itself. */
  hasStripeCustomer: boolean
}

export function buildConnections(input: ConnectionsInput, boardIds: ReadonlySet<string>): Connection[] {
  const owner = (id: string | null) => ({ ownerUserId: id, ownerGone: id !== null && !boardIds.has(id) })
  const out: Connection[] = []

  const mb = input.mailbox
  out.push(
    mb
      ? {
          key: 'mailbox',
          kind: 'mailbox',
          label: 'HOA mailbox (Google sign-in)',
          status: mb.sync_status === 'ok' ? 'connected' : 'needs_attention',
          ...owner(mb.connected_by),
          detail:
            mb.sync_status === 'ok'
              ? 'Connected through the Google account of the person who signed in. If they leave, disconnect it and reconnect from an account the HOA controls.'
              : 'Connected, but syncing has stopped. Reconnect it, ideally from an account the HOA controls.',
          since: mb.connected_at,
          href: '/settings/mailbox',
          action: 'Reconnect',
          adminOnly: true,
        }
      : {
          key: 'mailbox',
          kind: 'mailbox',
          label: 'HOA mailbox (Google sign-in)',
          status: 'not_connected',
          ownerUserId: null,
          ownerGone: false,
          detail: 'No mailbox is connected. Nothing to hand over.',
          since: null,
          href: '/settings/mailbox',
          action: 'Review',
          adminOnly: true,
        },
  )

  if (input.plaidItems.length === 0) {
    out.push({
      key: 'plaid',
      kind: 'plaid',
      label: 'Bank connection (Plaid)',
      status: 'not_connected',
      ownerUserId: null,
      ownerGone: false,
      detail: 'No bank is linked. Nothing to hand over.',
      since: null,
      href: '/accounting/bank',
      action: 'Review',
      adminOnly: false,
    })
  }
  for (const p of [...input.plaidItems].sort((a, b) => a.created_at.localeCompare(b.created_at))) {
    out.push({
      key: `plaid:${p.id}`,
      kind: 'plaid',
      label: `Bank connection (Plaid)${p.institution_name ? ` · ${p.institution_name}` : ''}`,
      status: 'connected',
      ...owner(p.created_by),
      detail:
        'Linked with the online-banking login of the person who connected it. If they leave, link the bank again under the new treasurer’s login.',
      since: p.created_at,
      href: '/accounting/bank',
      action: 'Reconnect',
      adminOnly: false,
    })
  }

  const z = input.zelle
  out.push({
    key: 'zelle',
    kind: 'zelle',
    label: 'Zelle payment details',
    status: z.state === 'configured' ? 'connected' : z.state === 'unverified' ? 'needs_attention' : 'not_connected',
    // The signed Zelle save does not record who saved it.
    ownerUserId: null,
    ownerGone: false,
    detail:
      z.state === 'configured'
        ? 'Residents are told to pay this Zelle recipient. Check it is the HOA’s account, not a departing member’s own phone or email.'
        : z.state === 'unverified'
          ? 'The saved details were changed outside the app and are hidden from residents. Check and save them again.'
          : z.state === 'no_association'
            ? 'Your association isn’t set up yet, so there is nothing to check.'
            : 'Zelle isn’t set up. Nothing to hand over.',
    since: z.state === 'configured' ? z.updatedAt : null,
    href: '/settings/payments',
    action: 'Transfer',
    adminOnly: false,
  })

  out.push({
    key: 'stripe',
    kind: 'stripe',
    label: 'Subscription billing (Stripe)',
    status: input.hasStripeCustomer ? 'connected' : 'not_connected',
    ownerUserId: null,
    ownerGone: false,
    detail: input.hasStripeCustomer
      ? 'Receipts and invoices go to the email the subscription was started with. If that person is leaving, change the billing email and card under Manage subscription.'
      : 'No paid subscription yet. Nothing to hand over.',
    since: null,
    href: '/settings/billing',
    action: 'Transfer',
    adminOnly: false,
  })

  return out
}

// ─── Open work owned by a person ─────────────────────────────────────

export interface OpenWorkCounts {
  /** Inbox threads assigned to them that are not closed. */
  threads: number
  /** Open or in-progress action items assigned to them, not tied to a ticket. */
  actionItems: number
  /** Open or in-progress action items assigned to them on a resident ticket. */
  ticketTasks: number
  /** Open tickets they filed themselves. */
  ticketsFiled: number
  /** Reply drafts they wrote that are still waiting for approval. */
  draftsAwaiting: number
}

export interface OpenWorkInput {
  threads: Array<{ assigned_to: string | null }>
  actionItems: Array<{ assignee_user_id: string | null; ticket_id: string | null }>
  tickets: Array<{ submitted_by: string }>
  drafts: Array<{ created_by: string | null }>
}

export interface OpenWorkSection {
  byMember: Record<string, OpenWorkCounts>
  /** Work still assigned to someone who is no longer on the board. */
  formerMembers: OpenWorkCounts
}

export const ZERO_WORK: OpenWorkCounts = { threads: 0, actionItems: 0, ticketTasks: 0, ticketsFiled: 0, draftsAwaiting: 0 }

export function workTotal(c: OpenWorkCounts): number {
  return c.threads + c.actionItems + c.ticketTasks + c.ticketsFiled + c.draftsAwaiting
}

/**
 * Buckets each open item by its owner. Rows with no owner are skipped
 * (nobody is handing them over). Threads, action items and drafts owned
 * by someone no longer on the board land in `formerMembers`. `tickets` is
 * every open ticket; only the ones a current board member filed count — a
 * resident's own ticket is not board work owned by a person.
 */
export function buildOpenWork(input: OpenWorkInput, boardIds: ReadonlySet<string>): OpenWorkSection {
  const byMember: Record<string, OpenWorkCounts> = {}
  for (const id of boardIds) byMember[id] = { ...ZERO_WORK }
  const formerMembers = { ...ZERO_WORK }
  const bump = (id: string | null, field: keyof OpenWorkCounts, countFormer: boolean) => {
    if (!id) return
    const bucket = byMember[id]
    if (bucket) bucket[field] += 1
    else if (countFormer) formerMembers[field] += 1
  }
  for (const t of input.threads) bump(t.assigned_to, 'threads', true)
  for (const a of input.actionItems) bump(a.assignee_user_id, a.ticket_id ? 'ticketTasks' : 'actionItems', true)
  for (const t of input.tickets) bump(t.submitted_by, 'ticketsFiled', false)
  for (const d of input.drafts) bump(d.created_by, 'draftsAwaiting', true)
  return { byMember, formerMembers }
}

// ─── The whole kit ───────────────────────────────────────────────────

/** A section that could not be read is `null` — the page says so, never "nothing to do". */
export interface HandoverModel {
  generatedAt: string
  orgName: string
  access: AccessSection | null
  connections: Connection[] | null
  openWork: OpenWorkSection | null
  exportTableCount: number
}

export type ChecklistState = 'todo' | 'done' | 'unknown'

export interface ChecklistItem {
  id: string
  text: string
  state: ChecklistState
  href: string
}

/**
 * The handover checklist for the members marked as leaving. With nobody
 * marked, it is the general turnover review. Pure: the client component
 * recomputes it as checkboxes change.
 */
export function buildChecklist(
  model: HandoverModel,
  leaving: ReadonlySet<string>,
  label: (m: BoardMember) => string = memberLabel,
): ChecklistItem[] {
  const items: ChecklistItem[] = []
  const board = model.access?.board ?? []
  const leavingMembers = board.filter((m) => leaving.has(m.userId))
  const staying = board.filter((m) => !leaving.has(m.userId))

  if (!model.access) {
    items.push({ id: 'access', text: 'Review who has access (couldn’t be loaded).', state: 'unknown', href: '/settings/members' })
  } else {
    items.push({
      id: 'admin-stays',
      text: 'At least one admin stays on after the handover.',
      state: staying.some((m) => m.role === 'admin') ? 'done' : 'todo',
      href: '/settings/members',
    })
    for (const m of leavingMembers) {
      items.push({
        id: `remove:${m.userId}`,
        text: `Invite ${label(m)}’s successor, then change ${label(m)}’s role or remove them on Members.`,
        state: 'todo',
        href: '/settings/members',
      })
    }
  }

  if (!model.connections) {
    items.push({ id: 'connections', text: 'Check connections tied to one person (couldn’t be loaded).', state: 'unknown', href: '/settings/handover' })
  } else {
    for (const c of model.connections) {
      if (c.status === 'not_connected') continue
      const ownerLeaving = c.ownerUserId !== null && leaving.has(c.ownerUserId)
      const needsMove = c.ownerGone || ownerLeaving || c.status === 'needs_attention'
      // A connection with no recorded owner can't be cleared automatically:
      // it stays a "check this" item whenever anyone is leaving.
      const unowned = c.ownerUserId === null && leaving.size > 0
      items.push({
        id: `conn:${c.key}`,
        text: `${c.action} ${c.label}${ownerLeaving ? ' — set up by a leaving member' : c.ownerGone ? ' — set up by a former member' : ''}.`,
        state: needsMove || unowned ? 'todo' : 'done',
        href: c.href,
      })
    }
  }

  if (!model.openWork) {
    items.push({ id: 'work', text: 'Reassign open work (couldn’t be loaded).', state: 'unknown', href: '/inbox' })
  } else {
    for (const m of leavingMembers) {
      const c = model.openWork.byMember[m.userId] ?? ZERO_WORK
      items.push({
        id: `work:${m.userId}`,
        text: `Reassign ${label(m)}’s open work (${workTotal(c)} item${workTotal(c) === 1 ? '' : 's'}).`,
        state: workTotal(c) === 0 ? 'done' : 'todo',
        href: '/inbox',
      })
    }
    const former = workTotal(model.openWork.formerMembers)
    if (former > 0) {
      items.push({
        id: 'work:former',
        text: `Reassign ${former} open item${former === 1 ? '' : 's'} still owned by former members.`,
        state: 'todo',
        href: '/inbox',
      })
    }
  }

  // BL-142: the fidelity bond and D&O policy name or cover the people who
  // handle the money and sit on the board; the agent needs the new list.
  items.push({
    id: 'insurance',
    text:
      leaving.size > 0
        ? 'Send the insurance agent the new board and treasurer, so the fidelity bond and D&O policy cover them. Check the policies on Insurance.'
        : 'Review the association’s insurance policies and renewal dates, and keep the agent’s contact with the HOA’s records.',
    state: 'todo',
    href: '/insurance',
  })
  items.push({
    id: 'export',
    text: 'Download a full copy of the association’s data and keep it with the HOA’s records.',
    state: 'todo',
    href: '/settings/data',
  })
  return items
}

const ROLE_LABEL: Record<BoardRole, string> = { admin: 'Admin', board: 'Board member' }

/**
 * The printable one-pager, as plain lines. Names and roles of board
 * members only: no emails, no account names, no ids of anything but the
 * association's own counts. Rendered verbatim by the print view and
 * asserted on by tests.
 */
export function buildPrintableSummary(model: HandoverModel, leaving: ReadonlySet<string>): string[] {
  const lines: string[] = []
  lines.push(`Board handover summary — ${model.orgName}`)
  lines.push(`Prepared ${model.generatedAt.slice(0, 10)}`)
  lines.push('')
  lines.push('Who has access')
  if (!model.access) lines.push('  Could not be loaded.')
  else {
    for (const m of model.access.board) {
      lines.push(`  ${m.name ?? 'Unnamed member'} — ${ROLE_LABEL[m.role]}${leaving.has(m.userId) ? ' (leaving)' : ''}`)
    }
    lines.push(`  Residents with access: ${model.access.residentCount}`)
  }
  lines.push('')
  lines.push('Connections tied to one person')
  if (!model.connections) lines.push('  Could not be loaded.')
  else {
    const names = new Map((model.access?.board ?? []).map((m) => [m.userId, m.name ?? 'Unnamed member']))
    for (const c of model.connections) {
      const who = c.ownerUserId ? (names.get(c.ownerUserId) ?? 'a former member') : null
      const status = c.status === 'connected' ? 'connected' : c.status === 'needs_attention' ? 'needs attention' : 'not set up'
      lines.push(`  ${c.label}: ${status}${who ? `, set up by ${who}` : ''}`)
    }
  }
  lines.push('')
  lines.push('Open work by owner')
  if (!model.openWork || !model.access) lines.push('  Could not be loaded.')
  else {
    for (const m of model.access.board) {
      const c = model.openWork.byMember[m.userId] ?? ZERO_WORK
      lines.push(
        `  ${m.name ?? 'Unnamed member'}: ${c.threads} inbox thread(s), ${c.actionItems} action item(s), ${c.ticketTasks} ticket task(s), ${c.ticketsFiled} ticket(s) filed, ${c.draftsAwaiting} draft(s) awaiting approval`,
      )
    }
    const f = workTotal(model.openWork.formerMembers)
    if (f > 0) lines.push(`  Former members: ${f} open item(s)`)
  }
  lines.push('')
  lines.push('Checklist')
  for (const i of buildChecklist(model, leaving, (m) => m.name ?? 'Unnamed member')) {
    lines.push(`  [${i.state === 'done' ? 'x' : i.state === 'unknown' ? '?' : ' '}] ${i.text}`)
  }
  lines.push('')
  lines.push(`Records: the full data export (${model.exportTableCount} spreadsheets) is under Settings → Your data.`)
  lines.push('Insurance: the policies, the fidelity bond and their renewal dates are under Insurance.')
  return lines
}

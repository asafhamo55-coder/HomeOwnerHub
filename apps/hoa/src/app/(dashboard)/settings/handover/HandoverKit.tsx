'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Printer } from 'lucide-react'
import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  LoadFailed,
  StatusPill,
  type StatusTone,
} from '@homeowner-portal/ui'
import { formatShortDate } from '@/lib/format-datetime'
import {
  ZERO_WORK,
  buildChecklist,
  buildPrintableSummary,
  memberLabel,
  workTotal,
  type Connection,
  type HandoverModel,
} from '@/lib/handover/model'
import type { DirectorCertView } from '@/lib/compliance/director-certs'
import { DirectorCertPill } from '@/components/compliance/director-cert-ui'

const STATUS: Record<Connection['status'], { tone: StatusTone; label: string }> = {
  connected: { tone: 'success', label: 'Connected' },
  needs_attention: { tone: 'warning', label: 'Needs attention' },
  not_connected: { tone: 'neutral', label: 'Not set up' },
}

/**
 * BL-117. The board turnover kit. "Leaving" is a checklist filter that
 * lives in this component's state only: nothing is saved, and reloading
 * clears it. Removing someone for real happens on Members.
 */
export function HandoverKit({
  model,
  viewerRole,
  directorCerts = null,
}: {
  model: HandoverModel
  viewerRole: 'admin' | 'board'
  /** BL-139: Florida associations only; null shows nothing. */
  directorCerts?: DirectorCertView[] | null
}) {
  const certByUser = new Map((directorCerts ?? []).map((c) => [c.userId, c]))
  const [leaving, setLeaving] = useState<ReadonlySet<string>>(() => new Set())
  const checklist = useMemo(() => buildChecklist(model, leaving), [model, leaving])
  const summary = useMemo(() => buildPrintableSummary(model, leaving), [model, leaving])
  const board = model.access?.board ?? []
  const names = new Map(board.map((m) => [m.userId, memberLabel(m)]))

  const toggle = (id: string) =>
    setLeaving((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })

  const workMembers = leaving.size > 0 ? board.filter((m) => leaving.has(m.userId)) : board

  return (
    <>
      <div className="space-y-5 print:hidden">
        <Card>
          <CardHeader
            className="pb-3"
            actions={
              <Button type="button" variant="secondary" icon={<Printer aria-hidden />} onClick={() => window.print()}>
                Print handover summary
              </Button>
            }
          >
            <CardTitle as="h2">Handover checklist</CardTitle>
            <CardDescription>
              Mark who is leaving under Who has access. The list below updates to what their handover needs.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {checklist.map((i) => (
                <li key={i.id} className="flex items-start gap-2">
                  <StatusPill
                    tone={i.state === 'done' ? 'success' : i.state === 'unknown' ? 'neutral' : 'warning'}
                    label={i.state === 'done' ? 'Done' : i.state === 'unknown' ? 'Unknown' : 'To do'}
                    size="sm"
                  />
                  <Link href={i.href} className="text-foreground hover:underline">
                    {i.text}
                  </Link>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle as="h2">Who has access</CardTitle>
            <CardDescription>
              Board members and admins. Ticking “Leaving” only filters this page; it doesn’t remove anyone.{' '}
              <Link href="/settings/members" className="font-medium text-primary hover:underline">
                Invite a successor or remove a member on Members
              </Link>
              .
            </CardDescription>
            {directorCerts ? (
              <CardDescription>
                Florida: a new director must submit the education certificate within 90 days after being elected or
                appointed, or is suspended until they do (Fla. Stat. § 720.3033(1)).{' '}
                <Link href="/settings/members#director-certification" className="font-medium text-primary hover:underline">
                  Record election and certificate dates on Members
                </Link>
                .
              </CardDescription>
            ) : null}
          </CardHeader>
          {model.access ? (
            <>
              <ul className="divide-y divide-border border-t border-border">
                {board.map((m) => (
                  <li key={m.userId} className="flex flex-wrap items-center justify-between gap-3 px-5 py-3 text-sm">
                    <div className="min-w-0">
                      <div className="font-medium text-foreground">{m.name ?? 'Unnamed member'}</div>
                      <div className="truncate text-muted">{m.email ?? 'No email on file'}</div>
                      <div className="text-xs text-muted">
                        Last sign-in: {m.lastSignInAt ? formatShortDate(m.lastSignInAt) : 'Not recorded'}
                      </div>
                      {certByUser.get(m.userId) ? (
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                          <span>FL director certificate:</span>
                          <DirectorCertPill tone={certByUser.get(m.userId)!.tone} label={certByUser.get(m.userId)!.label} />
                        </div>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-3">
                      <Badge variant={m.role === 'admin' ? 'info' : 'neutral'}>{m.role === 'admin' ? 'Admin' : 'Board'}</Badge>
                      <label className="flex items-center gap-1.5 text-sm text-foreground">
                        <input
                          type="checkbox"
                          checked={leaving.has(m.userId)}
                          onChange={() => toggle(m.userId)}
                          aria-label={`${memberLabel(m)} is leaving`}
                        />
                        Leaving
                      </label>
                    </div>
                  </li>
                ))}
              </ul>
              <CardContent className="pt-3 text-sm text-muted">
                Residents with access: <span className="num">{model.access.residentCount}</span>
              </CardContent>
            </>
          ) : (
            <CardContent>
              <LoadFailed what="members" retryHref="/settings/handover" />
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle as="h2">Connections tied to one person</CardTitle>
            <CardDescription>
              These were set up under someone’s own login. Move each one before that person leaves.
            </CardDescription>
          </CardHeader>
          {model.connections ? (
            <ul className="divide-y divide-border border-t border-border">
              {model.connections.map((c) => {
                const owner = c.ownerUserId ? (names.get(c.ownerUserId) ?? 'a former member') : null
                const ownerLeaving = c.ownerUserId !== null && leaving.has(c.ownerUserId)
                const blocked = c.adminOnly && viewerRole !== 'admin'
                return (
                  <li key={c.key} className="space-y-1 px-5 py-3 text-sm">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{c.label}</span>
                      <div className="flex items-center gap-2">
                        {ownerLeaving ? <StatusPill tone="danger" label="Owner leaving" size="sm" /> : null}
                        {c.ownerGone ? <StatusPill tone="warning" label="Owner no longer on the board" size="sm" /> : null}
                        <StatusPill tone={STATUS[c.status].tone} label={STATUS[c.status].label} size="sm" />
                      </div>
                    </div>
                    <p className="text-muted">
                      {owner ? `Set up by ${owner}${c.since ? ` on ${formatShortDate(c.since)}` : ''}. ` : c.since ? `Last changed ${formatShortDate(c.since)}. ` : ''}
                      {c.detail}
                    </p>
                    {blocked ? (
                      <p className="text-xs text-muted">Only an admin can reconnect this.</p>
                    ) : (
                      <Link href={c.href} className="text-sm font-medium text-primary hover:underline">
                        {c.action}
                      </Link>
                    )}
                  </li>
                )
              })}
            </ul>
          ) : (
            <CardContent>
              <LoadFailed what="connections" retryHref="/settings/handover" />
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle as="h2">Open work</CardTitle>
            <CardDescription>
              {leaving.size > 0 ? 'Work owned by the members marked as leaving.' : 'Work each board member owns right now.'} Reassign
              it in the{' '}
              <Link href="/inbox" className="font-medium text-primary hover:underline">
                Inbox
              </Link>
              ,{' '}
              <Link href="/tickets" className="font-medium text-primary hover:underline">
                Tickets
              </Link>{' '}
              and{' '}
              <Link href="/meetings" className="font-medium text-primary hover:underline">
                Meetings
              </Link>
              .
            </CardDescription>
          </CardHeader>
          {model.openWork ? (
            <ul className="divide-y divide-border border-t border-border">
              {workMembers.map((m) => {
                const c = model.openWork!.byMember[m.userId] ?? ZERO_WORK
                return (
                  <li key={m.userId} className="space-y-1 px-5 py-3 text-sm">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-foreground">{memberLabel(m)}</span>
                      <Badge variant={workTotal(c) > 0 ? 'warning' : 'neutral'} className="num">
                        {workTotal(c)}
                      </Badge>
                    </div>
                    <p className="text-muted">
                      {c.threads} assigned inbox thread{c.threads === 1 ? '' : 's'} · {c.actionItems} action item
                      {c.actionItems === 1 ? '' : 's'} · {c.ticketTasks} ticket task{c.ticketTasks === 1 ? '' : 's'} ·{' '}
                      {c.ticketsFiled} open ticket{c.ticketsFiled === 1 ? '' : 's'} they filed · {c.draftsAwaiting} reply draft
                      {c.draftsAwaiting === 1 ? '' : 's'} waiting for approval
                    </p>
                  </li>
                )
              })}
              {workTotal(model.openWork.formerMembers) > 0 ? (
                <li className="px-5 py-3 text-sm text-muted">
                  Still owned by people no longer on the board:{' '}
                  <span className="num font-medium text-foreground">{workTotal(model.openWork.formerMembers)}</span>
                </li>
              ) : null}
            </ul>
          ) : (
            <CardContent>
              <LoadFailed what="open work" retryHref="/settings/handover" />
            </CardContent>
          )}
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle as="h2">Records</CardTitle>
            <CardDescription>The association’s records belong to the HOA, not to any one board member.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>
              <Link href="/settings/data" className="font-medium text-primary hover:underline">
                Download all data
              </Link>{' '}
              <span className="text-muted">— one zip with {model.exportTableCount} spreadsheets.</span>
            </p>
            <p>
              <Link href="/documents/governing" className="font-medium text-primary hover:underline">
                Governing documents
              </Link>{' '}
              <span className="text-muted">— the CC&amp;Rs, bylaws and rules the new board works under.</span>
            </p>
          </CardContent>
        </Card>
      </div>

      {/* The printed page: names and roles of board members, counts and statuses. No emails, nothing secret. */}
      <pre className="hidden whitespace-pre-wrap font-sans text-sm text-foreground print:block">{summary.join('\n')}</pre>
    </>
  )
}

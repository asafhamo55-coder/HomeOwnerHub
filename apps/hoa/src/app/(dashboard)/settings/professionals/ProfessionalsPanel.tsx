'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Send } from 'lucide-react'
import { Alert, Button, Checkbox, Field, Fieldset, Input, Select, useConfirm } from '@homeowner-portal/ui'
import {
  assignMatter,
  cancelProfessionalInvite,
  inviteProfessional,
  renewProfessional,
  revokeProfessional,
  setDualControlAmount,
  setGeneralCounsel,
  setOfficerTitle,
  unassignMatter,
} from '@/lib/professionals/actions'
import {
  DEFAULT_EXPIRY_DAYS,
  MATTER_LABEL,
  OFFICER_TITLES,
  OFFICER_TITLE_LABEL,
  PRO_ROLE_LABEL,
  type MatterRef,
  type OfficerTitle,
  type ProRole,
} from '@/lib/professionals/model'
import type { MatterOption, OfficerRow, PendingInvite, ProfessionalRow } from '@/lib/professionals/load'

type Msg = { ok: boolean; text: string } | null

function useRun() {
  const router = useRouter()
  const [pending, start] = useTransition()
  const [msg, setMsg] = useState<Msg>(null)
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, done: string, after?: () => void) =>
    start(async () => {
      setMsg(null)
      const r = await fn()
      if (!r.ok) return setMsg({ ok: false, text: r.error ?? 'Something went wrong.' })
      setMsg({ ok: true, text: done })
      after?.()
      router.refresh()
    })
  return { pending, msg, run }
}

const addDays = (today: string, days: number) => {
  const d = new Date(`${today}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function InviteProfessionalForm({ today, options }: { today: string; options: MatterOption[] }) {
  const { pending, msg, run } = useRun()
  const [role, setRole] = useState<ProRole>('cpa')
  const [email, setEmail] = useState('')
  const [name, setName] = useState('')
  const [expiresOn, setExpiresOn] = useState(addDays(today, DEFAULT_EXPIRY_DAYS.cpa))
  const [general, setGeneral] = useState(false)
  const [picked, setPicked] = useState<Record<string, MatterRef>>({})

  const changeRole = (r: ProRole) => {
    setRole(r)
    setExpiresOn(addDays(today, DEFAULT_EXPIRY_DAYS[r]))
    if (r === 'cpa') {
      setGeneral(false)
      setPicked({})
    }
  }

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault()
        run(
          () =>
            inviteProfessional({ email, fullName: name || null, role, expiresOn, generalCounsel: general, matters: Object.values(picked) }),
          `If ${email} can receive an invitation, it has been sent. Access ends on ${expiresOn}.`,
          () => {
            setEmail('')
            setName('')
            setPicked({})
          },
        )
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Role" required>
          <Select value={role} onValueChange={(v) => changeRole(v as ProRole)}>
            <option value="cpa">CPA: reads the books and reports</option>
            <option value="attorney">Attorney: sees only the matters you assign</option>
          </Select>
        </Field>
        <Field label="Access ends on" required hint="You can renew it, or remove access at any time.">
          <Input type="date" value={expiresOn} onChange={(e) => setExpiresOn(e.target.value)} required />
        </Field>
        <Field label="Email" required>
          <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="off" />
        </Field>
        <Field label="Name" optional>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
      </div>

      {role === 'attorney' ? (
        <Fieldset legend="What the attorney sees" hint="Collections cases, violations and records requests you pick. They see nothing else about residents." className="rounded-lg border border-border bg-subtle p-4">
          <Checkbox checked={general} onChange={(e) => setGeneral(e.target.checked)} label="General counsel: also the governing documents and the compliance record" />
          <div className="mt-3 max-h-56 space-y-1.5 overflow-y-auto">
            {options.length === 0 ? <p className="text-sm text-foreground-secondary">No matters yet. You can assign them later.</p> : null}
            {options.map((o) => {
              const key = `${o.type}:${o.id}`
              return (
                <Checkbox
                  key={key}
                  checked={key in picked}
                  onChange={(e) =>
                    setPicked((p) => {
                      const next = { ...p }
                      if (e.target.checked) next[key] = { type: o.type, id: o.id }
                      else delete next[key]
                      return next
                    })
                  }
                  label={o.label}
                />
              )
            })}
          </div>
        </Fieldset>
      ) : null}

      {msg ? <Alert variant={msg.ok ? 'success' : 'error'}>{msg.text}</Alert> : null}
      <div className="flex justify-end">
        <Button type="submit" loading={pending} icon={<Send aria-hidden />}>
          Invite a professional
        </Button>
      </div>
    </form>
  )
}

export function ProfessionalRowView({ row, today, options, note }: { row: ProfessionalRow; today: string; options: MatterOption[]; note: string }) {
  const { pending, msg, run } = useRun()
  const confirm = useConfirm()
  const [renewOn, setRenewOn] = useState(addDays(today, DEFAULT_EXPIRY_DAYS[row.role]))
  const [matterKey, setMatterKey] = useState('')
  const label = (type: string, id: string) => options.find((o) => o.type === type && o.id === id)?.label ?? `${type} ${id.slice(0, 8)}`
  return (
    <li className="space-y-3 px-5 py-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium">
            {row.fullName ?? row.email ?? 'Invited professional'} <span className="text-foreground-secondary">· {PRO_ROLE_LABEL[row.role]}</span>
          </p>
          {row.fullName && row.email ? <p className="text-foreground-secondary">{row.email}</p> : null}
          <p className={note === 'Expired' ? 'font-medium text-danger' : 'text-foreground-secondary'}>{note}</p>
        </div>
        <Button
          size="sm"
          variant="secondary"
          loading={pending}
          onClick={async () => {
            const ok = await confirm({
              title: 'Remove access?',
              description: 'They lose access to this HOA right away. Their earlier submissions stay on the record.',
              confirmLabel: 'Remove access',
              destructive: true,
            })
            if (ok) run(() => revokeProfessional(row.userId), 'Access removed.')
          }}
        >
          Remove access
        </Button>
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <Field label="Renew until">
          <Input type="date" value={renewOn} onChange={(e) => setRenewOn(e.target.value)} />
        </Field>
        <Button size="sm" loading={pending} onClick={() => run(() => renewProfessional(row.userId, renewOn), `Access now ends on ${renewOn}.`)}>
          Renew
        </Button>
        {row.role === 'attorney' ? (
          <Checkbox
            checked={row.generalCounsel}
            onChange={(e) => run(() => setGeneralCounsel(row.userId, e.target.checked), 'Saved.')}
            label="General counsel"
          />
        ) : null}
      </div>

      {row.role === 'attorney' ? (
        <div className="space-y-2">
          <p className="font-medium">Assigned matters</p>
          {row.matters.length === 0 ? <p className="text-foreground-secondary">None yet.</p> : null}
          <ul className="space-y-1">
            {row.matters.map((m) => (
              <li key={m.assignmentId} className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate">
                  {MATTER_LABEL[m.type]} · {label(m.type, m.id)}
                </span>
                <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => unassignMatter(m.assignmentId), 'Matter removed.')}>
                  Remove
                </Button>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Assign a matter">
              <Select value={matterKey} onValueChange={setMatterKey}>
                <option value="">Choose…</option>
                {options.map((o) => (
                  <option key={`${o.type}:${o.id}`} value={`${o.type}:${o.id}`}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </Field>
            <Button
              size="sm"
              loading={pending}
              disabled={!matterKey}
              onClick={() => {
                const [type, id] = matterKey.split(':')
                run(() => assignMatter(row.userId, { type: type as MatterRef['type'], id: id! }), 'Matter assigned.', () => setMatterKey(''))
              }}
            >
              Assign
            </Button>
          </div>
        </div>
      ) : null}
      {msg ? <Alert variant={msg.ok ? 'success' : 'error'}>{msg.text}</Alert> : null}
    </li>
  )
}

export function OfficerTitles({ rows, canEdit }: { rows: OfficerRow[]; canEdit: boolean }) {
  const { pending, msg, run } = useRun()
  return (
    <div className="space-y-3">
      <ul className="divide-y divide-border text-sm">
        {rows.map((r) => (
          <li key={r.userId} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <span>{r.fullName ?? r.email ?? 'Board member'}</span>
            {canEdit ? (
              <Select
                aria-label={`Officer title for ${r.fullName ?? r.email ?? 'board member'}`}
                value={r.title ?? ''}
                disabled={pending}
                onValueChange={(v) => run(() => setOfficerTitle(r.userId, (v || null) as OfficerTitle | null), 'Title saved.')}
              >
                <option value="">No title</option>
                {OFFICER_TITLES.map((t) => (
                  <option key={t} value={t}>
                    {OFFICER_TITLE_LABEL[t]}
                  </option>
                ))}
              </Select>
            ) : (
              <span className="text-foreground-secondary">{r.title ? OFFICER_TITLE_LABEL[r.title] : 'No title'}</span>
            )}
          </li>
        ))}
      </ul>
      {!canEdit ? <p className="text-xs text-foreground-secondary">Only an admin can change officer titles.</p> : null}
      {msg ? <Alert variant={msg.ok ? 'success' : 'error'}>{msg.text}</Alert> : null}
    </div>
  )
}

export function PendingInviteRow({ invite }: { invite: PendingInvite }) {
  const { pending, msg, run } = useRun()
  return (
    <li className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
      <span>
        {invite.email} · {PRO_ROLE_LABEL[invite.role]} · access to {invite.accessExpiresOn} · link good until {invite.linkExpiresAt.slice(0, 10)}
      </span>
      <Button size="sm" variant="secondary" loading={pending} onClick={() => run(() => cancelProfessionalInvite(invite.id), 'Invitation cancelled.')}>
        Cancel
      </Button>
      {msg ? <Alert variant={msg.ok ? 'success' : 'error'}>{msg.text}</Alert> : null}
    </li>
  )
}

export function DualControlForm({ cents, canEdit }: { cents: number | null; canEdit: boolean }) {
  const { pending, msg, run } = useRun()
  const [value, setValue] = useState(cents === null ? '' : String(cents / 100))
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault()
        const n = value.trim() === '' ? null : Number(value)
        run(() => setDualControlAmount(n), n === null ? 'Dual control is off.' : 'Saved.')
      }}
    >
      <Field label="Needs two board members above (dollars)" hint="Applies to money approvals: scanned bills and a CPA’s adjusting entries. Leave blank for none.">
        <Input inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="5000" disabled={!canEdit} />
      </Field>
      {msg ? <Alert variant={msg.ok ? 'success' : 'error'}>{msg.text}</Alert> : null}
      {canEdit ? (
        <Button type="submit" size="sm" loading={pending}>
          Save
        </Button>
      ) : (
        <p className="text-xs text-foreground-secondary">Only an admin can change this amount.</p>
      )}
    </form>
  )
}

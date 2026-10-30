'use client'

import { useState, type RefObject } from 'react'
import { ListPlus } from 'lucide-react'
import {
  Alert,
  Button,
  Checkbox,
  Dialog,
  DialogClose,
  DialogContent,
  DialogTrigger,
} from '@homeowner-portal/ui'
import {
  applyAgenda,
  buildStandardAgenda,
  ownersReportApplies,
  type AgendaActionItem,
  type InsertMode,
} from '@/lib/meetings/agenda-template'

const AGENDA_MAX = 4000

interface Props {
  /** The agenda (or notes) textarea this button fills. */
  fieldRef: RefObject<HTMLTextAreaElement | null>
  meetingType: string
  state: string | null
  associationType?: string | null
  openActionItems: readonly AgendaActionItem[]
}

/** "Insert standard agenda": a small dialog that builds the usual agenda into the field. */
export function InsertAgendaButton({ fieldRef, meetingType, state, associationType, openActionItems }: Props) {
  const [open, setOpen] = useState(false)
  const [existing, setExisting] = useState('')
  const [ownerComments, setOwnerComments] = useState(true)
  const [ownersReport, setOwnersReport] = useState(true)
  const [withActions, setWithActions] = useState(true)

  const showOwnersReport = ownersReportApplies({ meetingType, state, associationType })
  const agenda = buildStandardAgenda({
    meetingType,
    state,
    associationType,
    openActionItems: withActions ? openActionItems : [],
    includeOwnersReport: ownersReport,
    includeOwnerComments: ownerComments,
  })
  const hasText = existing.trim().length > 0
  const tooLong = applyAgenda(existing, agenda, 'append').length > AGENDA_MAX

  function onOpenChange(next: boolean) {
    if (next) setExisting(fieldRef.current?.value ?? '')
    setOpen(next)
  }

  function insert(mode: InsertMode) {
    const field = fieldRef.current
    if (!field) return
    const value = applyAgenda(field.value, agenda, mode)
    // Set through the native setter and fire "input" so React and the form see the change.
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
    setter?.call(field, value)
    field.dispatchEvent(new Event('input', { bubbles: true }))
    setOpen(false)
    field.focus()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button type="button" variant="secondary" size="sm" icon={<ListPlus aria-hidden />}>
          Insert standard agenda
        </Button>
      </DialogTrigger>
      <DialogContent
        title="Insert standard agenda"
        description="Call to order, quorum, minutes, reports, old and new business, adjourn. You can edit every line afterward."
        footer={
          <>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            {hasText ? (
              <>
                <Button type="button" variant="secondary" onClick={() => insert('append')} disabled={tooLong}>
                  Add to the end
                </Button>
                <Button type="button" onClick={() => insert('replace')}>
                  Replace what’s there
                </Button>
              </>
            ) : (
              <Button type="button" onClick={() => insert('replace')}>
                Insert
              </Button>
            )}
          </>
        }
      >
        <div className="space-y-3">
          <Checkbox
            label="Owner comments"
            description="Leave this out if owners can’t attend this meeting."
            checked={ownerComments}
            onChange={(e) => setOwnerComments(e.target.checked)}
          />
          {showOwnersReport ? (
            <Checkbox
              label="Report to the owners"
              description="Georgia annual meeting. Cites O.C.G.A. § 44-3-230."
              checked={ownersReport}
              onChange={(e) => setOwnersReport(e.target.checked)}
            />
          ) : null}
          {openActionItems.length > 0 ? (
            <Checkbox
              label={`Include ${openActionItems.length} open action ${openActionItems.length === 1 ? 'item' : 'items'}`}
              description="Listed under Old business."
              checked={withActions}
              onChange={(e) => setWithActions(e.target.checked)}
            />
          ) : null}
        </div>
        {hasText ? (
          <Alert variant="warning" title="The agenda field already has text">
            Replace it, or add the standard agenda after it.
            {tooLong ? ' Adding would pass the 4,000 character limit.' : ''}
          </Alert>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

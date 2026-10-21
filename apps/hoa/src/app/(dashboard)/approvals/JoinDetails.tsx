import { AlertTriangle, CheckCircle2 } from 'lucide-react'
import { JOIN_METHOD_LABEL, OWNER_EMAIL_NOTE, type JoinCard } from '@/lib/owner-join/model'

// BL-143: how the person asked, and whether their sign-in email is the
// owner email on file for the home — the board's main check before
// approving. A mismatch or no owner on file is said plainly.

export function JoinDetails({ join }: { join: JoinCard }) {
  const ok = join.emailCheck === 'match'
  return (
    <div className="space-y-1 text-xs">
      <p className="text-muted">{JOIN_METHOD_LABEL[join.method]}</p>
      <p className={`flex items-start gap-1.5 ${ok ? 'text-success' : 'text-warning'}`}>
        {ok ? <CheckCircle2 className="mt-0.5 size-3.5 shrink-0" aria-hidden /> : <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />}
        <span>{OWNER_EMAIL_NOTE[join.emailCheck]}</span>
      </p>
    </div>
  )
}

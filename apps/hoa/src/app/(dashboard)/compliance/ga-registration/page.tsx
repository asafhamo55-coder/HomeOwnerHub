import type { ReactNode } from 'react'
import Link from 'next/link'
import { ExternalLink, Scale } from 'lucide-react'
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  EmptyState,
  LoadFailed,
  Page,
  StatusPill,
  type StatusTone,
} from '@homeowner-portal/ui'
import { createAdminClient } from '@homeowner-portal/db'
import { requireBoardOrAdmin } from '@/lib/auth'
import { currentTimeZone } from '@/lib/association-time-current'
import { todayIn } from '@/lib/association-time'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { formatDueOn } from '@/lib/compliance/deadlines'
import { NOT_LEGAL_ADVICE, type StatuteQuote } from '@/lib/compliance/law'
import { GA_SOS_URL, type ObligationTone } from '@/lib/compliance/obligations'
import type { LooseDb } from '@/lib/compliance/evidence'
import { KIT_QUOTES, NOT_IN_STATUTE_NOTE } from '@/lib/ga-registration/kit-quotes'
import { GOVERNING_DOC_TYPES, loadRegistrationKit, type KitData } from '@/lib/ga-registration/kit-load'
import {
  GA_AMENDMENT_REASON_LABEL,
  GA_FILING_LABEL,
  GA_REGISTRATION_GATE_FROM,
  GA_REGISTRATION_KIT_HREF,
  amendmentFor,
  gaStandingLabel,
  type GaRegistrationStatus,
} from '@/lib/ga-registration/model'
import {
  AmendmentControls,
  DecisionControls,
  DetailsForm,
  FilingForm,
  OtherAmendmentForm,
  PrintKitButton,
  RemoveFilingButton,
} from './KitControls'

export const metadata = { title: 'Georgia registration kit' }
export const dynamic = 'force-dynamic'

const TITLE = 'Georgia registration kit'
const DESCRIPTION =
  'Everything the Secretary of State registration (SB 406) asks for, from what HomeownerHub already holds, and the board’s record of each filing.'

const CRUMBS = [{ label: 'Compliance', href: '/compliance' }, { label: 'Georgia registration' }]

const STANDING_TONE: Record<GaRegistrationStatus, StatusTone> = {
  registered: 'success',
  lapsed: 'danger',
  not_registered: 'warning',
  opted_out: 'neutral',
  unverified: 'danger',
}

const PILL: Record<ObligationTone, StatusTone> = {
  overdue: 'danger',
  soon: 'warning',
  upcoming: 'info',
  done: 'success',
  standing: 'neutral',
  unknown: 'warning',
  failed: 'danger',
  not_loaded: 'neutral',
}

const DOC_LABEL: Record<(typeof GOVERNING_DOC_TYPES)[number], string> = {
  ccr: 'Declaration / CC&Rs',
  bylaws: 'Bylaws',
  rules: 'Rules and regulations',
}

function Quote({ q }: { q: StatuteQuote }) {
  return (
    <figure className="space-y-1">
      <blockquote className="border-l-2 border-border pl-3 text-sm text-foreground-secondary">“{q.quote}”</blockquote>
      <figcaption className="text-xs text-muted">{q.cite}</figcaption>
    </figure>
  )
}

/** A line on the fill-in sheet: what the app holds, or a blank to fill by hand. */
function SheetLine({ label, value, note }: { label: string; value: ReactNode | null; note?: string }) {
  return (
    <div className="grid gap-1 border-b border-border py-2 sm:grid-cols-[14rem_1fr]">
      <dt className="text-sm font-medium text-foreground">{label}</dt>
      <dd className="text-sm text-foreground-secondary">
        {value ?? <span className="inline-block min-w-[16rem] border-b border-dashed border-border-strong">&nbsp;</span>}
        {note ? <span className="mt-0.5 block text-xs text-muted">{note}</span> : null}
      </dd>
    </div>
  )
}

/**
 * /compliance/ga-registration — BL-149. Board/admin only
 * (requireBoardOrAdmin redirects residents before any read). A printable
 * checklist and fill-in sheet for the Georgia Secretary of State
 * registration (SB 406, O.C.G.A. § 43-17A-2), filled from what the app
 * holds; the board's decision; and its record of each filing, renewal
 * and amended registration (including BL-151's post-election amendment).
 * That record is what the state law check reads: from Jan 1, 2027 fines,
 * letters asking for fines or fees, liens and the nightly late fee are
 * blocked for an association not recorded here as registered. Statute
 * text only from lib/ga-registration/kit-quotes.ts (checked word for
 * word). Nothing on this page sends or files anything.
 */
export default async function GaRegistrationKitPage(props: { searchParams?: Promise<{ association?: string }> }) {
  const { org } = await requireBoardOrAdmin()
  const params = (await props.searchParams) ?? {}
  const [supabase, timeZone] = await Promise.all([getSupabaseServerClient(), currentTimeZone()])
  const today = todayIn(timeZone)
  const loaded = await loadRegistrationKit({
    db: supabase as unknown as LooseDb,
    admin: createAdminClient() as unknown as LooseDb,
    orgId: org.id,
    today,
    associationId: typeof params.association === 'string' ? params.association : null,
  })

  if (loaded.kind === 'failed') {
    return (
      <Page title={TITLE} description={DESCRIPTION} breadcrumbs={CRUMBS} linkAs={Link}>
        <LoadFailed what="your association" retryHref={GA_REGISTRATION_KIT_HREF} />
      </Page>
    )
  }
  if (loaded.kind !== 'ok') {
    return (
      <Page title={TITLE} description={DESCRIPTION} breadcrumbs={CRUMBS} linkAs={Link}>
        <EmptyState
          icon={<Scale aria-hidden />}
          title={loaded.kind === 'no_association' ? 'Set up your association first' : 'This kit is for Georgia associations'}
          description={
            loaded.kind === 'no_association'
              ? 'Add the association and its state in Settings.'
              : 'None of your associations is in Georgia. Compliance lists what your state requires.'
          }
          action={
            <Button asChild variant="secondary">
              <Link href={loaded.kind === 'no_association' ? '/settings' : '/compliance'}>
                {loaded.kind === 'no_association' ? 'Open Settings' : 'Open Compliance'}
              </Link>
            </Button>
          }
        />
      </Page>
    )
  }

  return (
    <Page title={TITLE} description={DESCRIPTION} breadcrumbs={CRUMBS} linkAs={Link} actions={<PrintKitButton />}>
      <Kit data={loaded.data} today={today} />
    </Page>
  )
}

function Kit({ data, today }: { data: KitData; today: string }) {
  const { association, record, standing } = data
  const live = today >= GA_REGISTRATION_GATE_FROM
  const blocked = standing.status !== 'registered'
  const filings = [...record.filings].sort((a, b) => b.filedOn.localeCompare(a.filedOn))
  const unitLine =
    data.unitCount === null
      ? null
      : `${data.unitCount} ${data.unitCount === 1 ? 'unit' : 'units'} on file${association.totalUnits !== null && association.totalUnits !== data.unitCount ? ` (your setup says ${association.totalUnits})` : ''}`

  return (
    <div className="space-y-5">
      {data.others.length > 0 ? (
        <p className="text-sm text-foreground-secondary print:hidden">
          Showing {association.name}. Other Georgia associations:{' '}
          {data.others.map((o, i) => (
            <span key={o.id}>
              {i > 0 ? ', ' : ''}
              <Link href={`${GA_REGISTRATION_KIT_HREF}?association=${o.id}`} className="font-medium text-primary hover:underline">
                {o.name}
              </Link>
            </span>
          ))}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <StatusPill tone={STANDING_TONE[standing.status]} label={gaStandingLabel(standing, formatDueOn)} />
        {record.decision === 'opt_out' ? <span className="text-sm text-foreground-secondary">The board recorded that it opted out.</span> : null}
      </div>

      {blocked ? (
        live ? (
          <Alert variant="error" title="Fines, fees and liens are blocked" className="print:hidden">
            Since {formatDueOn(GA_REGISTRATION_GATE_FROM)}, HomeownerHub’s state law check blocks levying a fine, a collections letter that asks for
            fines or fees, and recording a lien for this association, and the nightly late fee is skipped, until a current registration is recorded
            below. The board can override a block only with the attorney’s advice, and the override is logged.
          </Alert>
        ) : (
          <Alert variant="warning" title={`From ${formatDueOn(GA_REGISTRATION_GATE_FROM)}, fines, fees and liens need this`} className="print:hidden">
            Until a registration is recorded below, HomeownerHub warns on every fine, collections letter with fines or fees, and lien. From{' '}
            {formatDueOn(GA_REGISTRATION_GATE_FROM)} it blocks them and skips the nightly late fee.
          </Alert>
        )
      ) : null}

      {data.recordState === 'unverified' ? (
        <Alert variant="warning" title="The stored record can’t be verified" className="print:hidden">
          Something is stored for this association that HomeownerHub’s board save didn’t write, so it isn’t trusted. Record the filings again
          below; the next save replaces it.
        </Alert>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle as="h2">1. Decide: register, or opt out</CardTitle>
          <CardDescription>A board decision. Most associations that collect dues register.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Quote q={KIT_QUOTES.bar} />
          <Quote q={KIT_QUOTES.optOut} />
          <Quote q={KIT_QUOTES.inForce} />
          <DecisionControls associationId={association.id} decision={record.decision} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">2. What the filing needs</CardTitle>
          <CardDescription>
            Filled in from HomeownerHub where it can be. Blank lines are for you to fill in by hand. Printed {formatDueOn(today)}.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Quote q={KIT_QUOTES.filing} />
          <Quote q={KIT_QUOTES.formMinimum} />

          <dl>
            <SheetLine label="Association legal name" value={association.name} note="Check it matches your articles of incorporation exactly." />
            <SheetLine label="Mailing address" value={record.mailingAddress} />
            <SheetLine
              label="Officers"
              value={
                data.board === null ? (
                  'Couldn’t load the board roster. Fill in by hand.'
                ) : data.board.length === 0 ? null : (
                  <ul className="space-y-1">
                    {data.board.map((m) => (
                      <li key={`${m.name}-${m.role}`}>
                        {m.name} — title: <span className="inline-block min-w-[8rem] border-b border-dashed border-border-strong">&nbsp;</span>
                      </li>
                    ))}
                  </ul>
                )
              }
              note="Board members and admins with a HomeownerHub login. HomeownerHub doesn’t hold officer titles: write in president, secretary and treasurer."
            />
            <SheetLine label="Registered agent" value={record.registeredAgent} note="If known. HomeownerHub doesn’t hold it unless you enter it below." />
            <SheetLine label="Number of units" value={unitLine} />
          </dl>
          <p className="text-xs text-muted">{NOT_IN_STATUTE_NOTE}</p>

          <DetailsForm associationId={association.id} mailingAddress={record.mailingAddress} registeredAgent={record.registeredAgent} />

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Governing documents (a copy goes with the filing)</h3>
            {data.documents === null ? (
              <p className="text-sm text-foreground-secondary">Couldn’t load your documents. Check Documents by hand.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {GOVERNING_DOC_TYPES.map((t) => {
                  const docs = data.documents!.filter((d) => d.type === t)
                  return (
                    <li key={t} className="flex flex-wrap gap-1">
                      <span aria-hidden>{docs.length > 0 ? '☑' : '☐'}</span>
                      <span className="font-medium text-foreground">{DOC_LABEL[t]}:</span>
                      {docs.length > 0 ? (
                        docs.map((d, i) => (
                          <span key={d.id}>
                            {i > 0 ? ', ' : ''}
                            <Link href={`/documents/${d.id}`} className="text-primary hover:underline">
                              {d.name}
                            </Link>
                          </span>
                        ))
                      ) : (
                        <span className="text-foreground-secondary">not in Documents yet</span>
                      )}
                    </li>
                  )
                })}
                <li className="flex flex-wrap gap-1">
                  <span aria-hidden>☐</span>
                  <span className="font-medium text-foreground">Amendments and articles of incorporation:</span>
                  <span className="text-foreground-secondary">check your records; HomeownerHub can’t tell which documents these are.</span>
                </li>
              </ul>
            )}
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Financial statement</h3>
            <Quote q={KIT_QUOTES.financials} />
            <p className="text-sm text-foreground-secondary">
              Run both reports within a year of the day you file, and print them with the date showing.
            </p>
            <div className="flex flex-wrap gap-3 text-sm print:hidden">
              <Link href="/accounting/reports/balance-sheet" className="font-medium text-primary hover:underline">
                Balance sheet
              </Link>
              <Link href="/accounting/reports/income-statement" className="font-medium text-primary hover:underline">
                Income statement
              </Link>
            </div>
          </div>

          <div className="space-y-2">
            <h3 className="text-sm font-semibold text-foreground">Fee</h3>
            <Quote q={KIT_QUOTES.fee} />
          </div>

          <a
            href={GA_SOS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-medium text-primary hover:underline print:hidden"
          >
            Georgia Secretary of State — Property Owners’ Associations Division <ExternalLink className="size-3.5" aria-hidden />
          </a>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">3. Record the filing</CardTitle>
          <CardDescription>After you file with the Secretary of State, record the day and the confirmation number here.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Quote q={KIT_QUOTES.effectiveOnFiling} />
          <Quote q={KIT_QUOTES.renewal} />
          <FilingForm associationId={association.id} today={today} registered={standing.registeredOn !== null} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2" id="amendments">
            4. Amendments
          </CardTitle>
          <CardDescription>File an amended registration within 30 days of a change of officers, name or address.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Quote q={KIT_QUOTES.amendment} />
          {data.amendments === null ? (
            <p className="text-sm text-foreground-secondary">Couldn’t load your elections. Refresh the page.</p>
          ) : data.amendments.length === 0 ? (
            <p className="text-sm text-foreground-secondary">
              No election with recorded results needs one. After an election, record the results in its election planner and it appears here.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {data.amendments.map((o) => {
                const answered = o.meetingId ? amendmentFor(record, o.meetingId) : null
                return (
                  <li key={o.key} className="space-y-2 py-3 first:pt-0">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{o.title}</span>
                      <StatusPill tone={PILL[o.tone]} label={o.label} />
                    </div>
                    {o.meetingId ? (
                      <AmendmentControls associationId={association.id} meetingId={o.meetingId} today={today} answered={answered?.kind ?? null} />
                    ) : null}
                  </li>
                )
              })}
            </ul>
          )}
          <div className="space-y-2 border-t border-border pt-4 print:hidden">
            <h3 className="text-sm font-semibold text-foreground">Another change</h3>
            <OtherAmendmentForm associationId={association.id} today={today} />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle as="h2">Filings on record</CardTitle>
          <CardDescription>What the board recorded. Removing one here doesn’t change anything at the Secretary of State.</CardDescription>
        </CardHeader>
        <CardContent>
          {filings.length === 0 ? (
            <p className="text-sm text-foreground-secondary">Nothing recorded yet.</p>
          ) : (
            <ul className="divide-y divide-border">
              {filings.map((f) => (
                <li key={f.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                  <span>
                    <span className="font-medium text-foreground">{GA_FILING_LABEL[f.kind]}</span> · filed {formatDueOn(f.filedOn)}
                    {f.coversYear !== null ? ` · covers ${f.coversYear}` : ''}
                    {f.reason ? ` · ${GA_AMENDMENT_REASON_LABEL[f.reason]}` : ''}
                    {f.confirmation ? ` · confirmation ${f.confirmation}` : ''}
                  </span>
                  <RemoveFilingButton associationId={association.id} filingId={f.id} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <p className="text-xs text-muted">
        {NOT_LEGAL_ADVICE} Check the Secretary of State’s guidance and ask your association’s attorney.
      </p>
    </div>
  )
}

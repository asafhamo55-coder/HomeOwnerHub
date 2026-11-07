import Link from 'next/link'
import { notFound } from 'next/navigation'
import { Alert, LoadFailed, Page, PageHeader } from '@homeowner-portal/ui'
import { getCurrentUserRole } from '@/lib/auth'
import { todayIn } from '@/lib/association-time'
import { getSupabaseServerClient } from '@/lib/supabase/server'
import { tryLoad } from '@/lib/load-or-fail'
import { readAll } from '@/lib/supabase/read-all'
import { loadPaperRule } from '@/lib/properties/roster/label-consent'
import { loadRosterInput, readRosterAssociations } from '@/lib/properties/statutory-roster/load'
import { buildOwnerRoster } from '@/lib/properties/statutory-roster/model'
import { buildPaperReminders } from '@/lib/dues-reminders/paper'
import { loadOpenChargesByProperty } from '@/lib/dues-reminders/paper-load'
import { paySettingsSecret, readZelleSettings } from '@/lib/pay-by-zelle'
import { readBoardContacts } from '@/lib/association-contacts'
import { MAX_NOTICE_CONTACTS } from '@/lib/join-notice'
import { PaperReminderLetters, payHowFrom } from './PaperReminderLetters'
import { PrintRemindersButton } from './PrintRemindersButton'

export const metadata = { title: 'Paper dues reminders' }
export const dynamic = 'force-dynamic'

const PATH = '/dues/paper-reminders'
const linkClass = 'inline-flex min-h-11 items-center font-medium text-primary underline'
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/** '2026-11-07' as 'November 7, 2026', by hand so the day never shifts with the time zone. */
function longDate(iso: string): string {
  const [y, m, d] = iso.split('-')
  return `${MONTHS[Number(m) - 1]} ${Number(d)}, ${y}`
}

interface AssocRow {
  id: string
  name: string
  compliance_settings: unknown
}

/**
 * /dues/paper-reminders: one letter-size dues reminder per household that
 * cannot be reached by email, with the amount owed, how to pay and the board
 * contact. Board and admins only; anyone else gets a 404 before any database
 * client is made. Who gets paper is the mailing-label rule (isPaperOnly with
 * loadPaperRule: fail-closed, judged per home state). Every list is read to
 * the end (readAll) and scoped to the organization. If any read fails the
 * page says so and prints nothing. Nothing is logged here: names and
 * addresses never leave the page. The header is screen-only.
 */
export default async function PaperRemindersPage() {
  const ctx = await getCurrentUserRole()
  if (!ctx || (ctx.role !== 'admin' && ctx.role !== 'board')) notFound()

  const page = (body: React.ReactNode) => (
    <Page
      width="wide"
      linkAs={Link}
      className="print:m-0 print:max-w-none print:space-y-0 print:p-0"
      header={
        <div className="print:hidden">
          <PageHeader
            title="Paper dues reminders"
            description="One page for each owner who gets notices on paper, with what they owe and how to pay."
            breadcrumbs={[{ label: 'Dues', href: '/dues' }, { label: 'Paper reminders' }]}
            linkAs={Link}
          />
        </div>
      }
    >
      {body}
    </Page>
  )

  const supabase = await getSupabaseServerClient()
  const assoc = await tryLoad('paper reminders associations', () => readRosterAssociations(supabase, ctx.org.id))
  if (!assoc.ok) return page(<LoadFailed what="your association" retryHref={PATH} />)

  const asOf = todayIn(assoc.data.timeZone)
  const loaded = await tryLoad('paper reminders roster', () => loadRosterInput(supabase, ctx.org.id, 'owners', asOf, assoc.data))
  if (!loaded.ok) return page(<LoadFailed what="the owner list" retryHref={PATH} />)

  const consent = await tryLoad('paper reminders consent', async () => {
    const r = await loadPaperRule(supabase, ctx.org.id, loaded.data.states)
    if (!r) throw new Error('consent unavailable')
    return r
  })
  if (!consent.ok) return page(<LoadFailed what="who agreed to electronic notices" retryHref={PATH} />)

  // ONE association is the source for the letters: its name, its payee, its
  // contacts and its charges. Another association's payee is never printed
  // on this association's homes.
  const primaryAssoc = assoc.data.primary
  if (!primaryAssoc) return page(<LoadFailed what="your association" retryHref={PATH} />)
  const charges = await tryLoad('paper reminders charges', () =>
    loadOpenChargesByProperty(supabase, ctx.org.id, primaryAssoc.id, asOf),
  )
  if (!charges.ok) return page(<LoadFailed what="what owners owe" retryHref={PATH} />)

  const settings = await tryLoad('paper reminders settings', () =>
    readAll<AssocRow>(
      (from, to) =>
        supabase
          .from('associations')
          .select('id, name, compliance_settings')
          .eq('organization_id', ctx.org.id)
          .order('name', { ascending: true })
          .order('id', { ascending: true })
          .range(from, to) as unknown as PromiseLike<{ data: AssocRow[] | null; error: { code?: string; message?: string } | null }>,
      (e) => new Error(`paper reminders: associations read failed (${e.code ?? 'no code'})`),
    ),
  )
  if (!settings.ok) return page(<LoadFailed what="your payment details" retryHref={PATH} />)

  const primary = settings.data.find((a) => a.id === primaryAssoc.id)
  if (!primary) return page(<LoadFailed what="your payment details" retryHref={PATH} />)
  const associationName = primary.name
  const read = readZelleSettings(primary.id, primary.compliance_settings, paySettingsSecret())
  const pay = payHowFrom(read)
  const contacts = readBoardContacts(primary.compliance_settings)
    .filter((c) => c.phone !== '' || c.email !== '')
    .slice(0, MAX_NOTICE_CONTACTS)

  const unplaced = noOwner + charges.data.unmappedUnits
  const noPayHow = !pay.checks && !pay.zelle
  const cannotPrint = noPayHow && contacts.length === 0
  const roster = buildOwnerRoster(loaded.data.input, asOf)
  const { letters, noAddress, noOwner } = buildPaperReminders(roster.rows, charges.data.byProperty, consent.data)

  return page(
    <div className="space-y-5 print:space-y-0">
      <div className="space-y-4 print:hidden">
        <ol
          className="list-decimal space-y-1 rounded-lg border-2 border-foreground/30 bg-subtle p-4 pl-9 text-base text-foreground"
          aria-label="How to print"
        >
          <li>Press the Print button. Each owner gets their own page.</li>
          <li>Turn off Headers and footers in the print window.</li>
          <li>Mail each page. Mailing labels for the same owners are on the labels page.</li>
        </ol>
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1">
          <Link href="/properties/roster/labels?paper=1" className={linkClass}>
            Print mailing labels for these owners
          </Link>
          <Link href="/dues" className={linkClass}>
            Back to Dues
          </Link>
        </div>
        <p className="text-sm text-foreground-secondary" role="status">
          {letters.length === 1 ? '1 owner gets a paper reminder.' : `${letters.length} owners get a paper reminder.`} Only homes with a balance where
          every owner has no email on file, or has not agreed to electronic notices, are listed.
        </p>
        {noAddress > 0 ? (
          <Alert variant="warning" title={`${noAddress} ${noAddress === 1 ? 'home has' : 'homes have'} no street address`}>
            {noAddress === 1 ? 'This home owes' : 'These homes owe'} money and gets paper notices, but there is no address to print. Add an address on the
            Properties page.
          </Alert>
        ) : null}
        {settings.data.length > 1 ? (
          <p className="text-sm text-foreground-secondary">
            These letters are for {associationName}. Its payment details and contacts are printed on every letter.
          </p>
        ) : null}
        <p className="text-sm text-foreground-secondary">
          Owners in states that require consent to email notices are included here even if they also received an email reminder.
        </p>
        {unplaced > 0 ? (
          <Alert variant="warning" title={`${unplaced} ${unplaced === 1 ? 'home owes' : 'homes owe'} money but no letter was made`}>
            {unplaced === 1 ? 'This home has' : 'These homes have'} no owner on file or no linked home record, so there is nobody to send a letter to. Fix{' '}
            {unplaced === 1 ? 'it' : 'them'} under Properties.
          </Alert>
        ) : null}
        {letters.length > 0 && read.state === 'unverified' ? (
          <Alert variant="warning" title="Payment details could not be checked">
            Your saved payment details could not be verified. Please save them again under Settings, Payments.
          </Alert>
        ) : letters.length > 0 && noPayHow ? (
          <Alert variant="warning" title="How to pay is not set up yet">
            The letters will tell owners to contact the board. Add check or Zelle details under Settings, then Payments, to print them on every letter.
          </Alert>
        ) : null}
        {letters.length > 0 && contacts.length === 0 ? (
          <Alert variant="warning" title="No board contact is set up">
            The letters will say to ask the board for contact details. Add a phone number or email under Settings, then Contacts.
          </Alert>
        ) : null}
        {letters.length > 0 && cannotPrint ? (
          <p className="text-base font-medium text-foreground" role="status">
            Printing is turned off until you add how to pay or a board contact. A letter with neither would leave owners with no way to respond.
          </p>
        ) : null}
        {letters.length > 0 ? <PrintRemindersButton count={letters.length} disabled={cannotPrint} /> : null}
      </div>
      {letters.length === 0 ? (
        <Alert variant="info" title="Nobody needs a paper reminder">
          Every owner with a balance can be reached by email, or has nothing owing. You can send the reminders from the Dues page.
        </Alert>
      ) : (
        <PaperReminderLetters
          letters={letters}
          associationName={associationName}
          dateLabel={longDate(asOf)}
          pay={pay}
          contacts={contacts}
        />
      )}
    </div>,
  )
}

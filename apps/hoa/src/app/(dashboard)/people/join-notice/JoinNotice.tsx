import { NOTICE_STEPS, displayAddress } from '@/lib/join-notice'
import { Letterhead } from '@/components/print/Letterhead'
import { ManagedByFooter } from '@/components/print/ManagedByFooter'
import { telHref, type BoardContact } from '@/lib/association-contacts'

/**
 * One printed page: black on white, headings 28pt and up, body 16pt and up.
 * Nothing here relies on colour (the letterhead logo prints in colour, but the words never depend on it). Pure presentation so tests can render it.
 */
export function JoinNotice({
  associationName,
  joinUrl,
  welcomeUrl,
  qrSvg,
  contacts,
  managedBy,
}: {
  associationName: string
  joinUrl: string
  welcomeUrl: string
  qrSvg: string
  contacts: BoardContact[]
  /** The board's "Managed by" line, printed at the foot. */
  managedBy?: string | null
}) {
  const address = displayAddress(joinUrl)
  return (
    <article
      aria-label="How to join HomeownerHub notice"
      className="join-notice [print-color-adjust:exact] mx-auto max-w-[8.5in] bg-white p-6 text-[16pt] leading-snug text-black print:max-w-none print:p-0"
    >
      <style>{'@media print { @page { size: letter; margin: 0.5in; } }'}</style>
      <header className="break-inside-avoid border-b-4 border-black pb-1">
        <Letterhead name={associationName} className="[&_span]:text-[16pt] [&_span]:font-bold" />
        <h1 className="text-[30pt] font-bold leading-tight">{associationName} is now on HomeownerHub</h1>
      </header>

      <h2 className="mt-3 text-[28pt] font-bold leading-tight">How to join</h2>
      <ol className="mt-2 space-y-2 break-inside-avoid">
        {NOTICE_STEPS.map((s, i) => (
          <li key={s.title} className="flex gap-3">
            <span aria-hidden className="w-10 shrink-0 text-[28pt] font-bold leading-none">
              {i + 1}.
            </span>
            <p>
              <span className="font-bold">{s.title}</span> {s.body}
            </p>
          </li>
        ))}
      </ol>

      <section aria-label="Web address and code" className="mt-3 flex break-inside-avoid items-center gap-5 border-4 border-black p-3">
        <div
          role="img"
          aria-label={`QR code that opens ${address}`}
          className="h-[1.9in] w-[1.9in] shrink-0 [&_svg]:h-full [&_svg]:w-full"
          dangerouslySetInnerHTML={{ __html: qrSvg }}
        />
        <div>
          <p className="font-bold">Web address:</p>
          <p className="break-all text-[28pt] font-bold leading-tight">{address}</p>
        </div>
      </section>

      <h2 className="mt-3 text-[28pt] font-bold leading-tight">Add it to your phone&apos;s home screen</h2>
      <p>iPhone: tap the Share button, then &quot;Add to Home Screen&quot;.</p>
      <p>Android: tap the menu with three dots, then &quot;Add to Home screen&quot;.</p>

      {contacts.length > 0 ? (
        <section aria-label="Need help" className="mt-3 break-inside-avoid">
          <h2 className="text-[28pt] font-bold leading-tight">Need help? Call or email</h2>
          <ul className="mt-1">
            {contacts.map((c) => (
              <li key={`${c.label}-${c.name}-${c.phone}-${c.email}`}>
                <span className="font-bold">{[c.label, c.name].filter(Boolean).join(', ')}</span>
                {c.phone ? (
                  <>
                    {' '}
                    <a href={telHref(c.phone)} className="text-black no-underline">
                      {c.phone}
                    </a>
                  </>
                ) : null}
                {c.email ? <> {c.email}</> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <p className="mt-3 break-inside-avoid border-t-4 border-black pt-2">
        A 1-minute video shows how it works. Watch it at <span className="break-all font-bold">{displayAddress(welcomeUrl)}</span>
      </p>
      <ManagedByFooter line={managedBy} compact />
    </article>
  )
}

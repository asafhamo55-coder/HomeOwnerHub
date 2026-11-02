import { notFound } from 'next/navigation'
import { loadPublicPage } from '@/lib/public-site/load'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ slug: string }>
}

export async function generateMetadata({ params }: PageProps) {
  const { slug } = await params
  const view = await loadPublicPage(slug)
  return view ? { title: view.title } : { title: 'Page not found', robots: { index: false } }
}

function formatDay(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' })
}

export default async function PublicCommunityPage({ params }: PageProps) {
  const { slug } = await params
  const view = await loadPublicPage(slug)
  if (!view) notFound()

  return (
    <main className="mx-auto max-w-3xl px-4 py-10 space-y-8">
      <header className="space-y-3">
        <h1 className="text-3xl font-bold text-foreground">{view.title}</h1>
        {view.about ? <p className="whitespace-pre-line text-base text-foreground">{view.about}</p> : null}
      </header>

      {view.announcements.length > 0 ? (
        <section aria-labelledby="notices" className="space-y-4">
          <h2 id="notices" className="text-xl font-semibold text-foreground">
            Notices
          </h2>
          <ul className="space-y-4">
            {view.announcements.map((a) => (
              <li key={a.id} className="rounded-lg border border-border p-4">
                <h3 className="text-base font-semibold text-foreground">{a.title}</h3>
                <p className="text-sm text-foreground-secondary">{formatDay(a.postedAt)}</p>
                <p className="mt-2 whitespace-pre-line text-base text-foreground">{a.body}</p>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.documents.length > 0 ? (
        <section aria-labelledby="documents" className="space-y-4">
          <h2 id="documents" className="text-xl font-semibold text-foreground">
            Documents
          </h2>
          <ul className="space-y-2">
            {view.documents.map((d) => (
              <li key={d.id}>
                <a
                  href={d.href}
                  className="flex min-h-11 items-center rounded-lg border border-border px-4 text-base font-medium text-primary hover:bg-subtle focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                >
                  {d.title}
                </a>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {view.contactEmail || view.contactPhone ? (
        <section aria-labelledby="contact" className="space-y-2">
          <h2 id="contact" className="text-xl font-semibold text-foreground">
            Contact
          </h2>
          {view.contactEmail ? (
            <p className="text-base">
              <a className="font-medium text-primary hover:underline" href={`mailto:${view.contactEmail}`}>
                {view.contactEmail}
              </a>
            </p>
          ) : null}
          {view.contactPhone ? <p className="text-base text-foreground">{view.contactPhone}</p> : null}
        </section>
      ) : null}
    </main>
  )
}

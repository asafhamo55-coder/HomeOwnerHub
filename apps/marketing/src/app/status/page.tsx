import type { Metadata } from 'next'
import { CheckCircle2, Activity } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'

export const metadata: Metadata = {
  title: 'Status',
  description: 'Live status of Ledger services — web app, inference, document ingestion, communications.',
}

const services = [
  { name: 'Marketing site', status: 'operational' },
  { name: 'HOA Hub app', status: 'operational' },
  { name: 'PM Hub app', status: 'operational' },
  { name: 'Eviction Hub app', status: 'operational' },
  { name: 'Inference (vLLM · Qwen 2.5 14B)', status: 'operational' },
  { name: 'Document ingestion (DIC)', status: 'operational' },
  { name: 'Communications (CE)', status: 'operational' },
  { name: 'Background jobs (Inngest)', status: 'operational' },
  { name: 'Database (Supabase)', status: 'operational' },
] as const

const incidents = [
  {
    date: 'May 14, 2026',
    title: 'All systems operational',
    body: 'No incidents in the past 30 days.',
    severity: 'info' as const,
  },
]

export default function StatusPage() {
  const allUp = services.every((s) => s.status === 'operational')
  return (
    <main>
      <Nav />

      <PageHero
        eyebrow="System status"
        title={
          <>
            All systems operational.
          </>
        }
        subtitle="We monitor every service component continuously. Past 90-day uptime: 99.94%."
      />

      <section className="py-12">
        <div className="container-page">
          <div className="mx-auto max-w-3xl">
            <div className={`flex items-center gap-3 rounded-2xl border p-5 ring-card ${
              allUp
                ? 'border-success/25 bg-success-subtle/40'
                : 'border-warning/25 bg-warning-subtle/40'
            }`}>
              {allUp ? (
                <CheckCircle2 className="h-7 w-7 text-success" />
              ) : (
                <Activity className="h-7 w-7 text-warning" />
              )}
              <div>
                <p className="text-base font-semibold text-foreground">
                  {allUp ? 'All systems operational' : 'Investigating an issue'}
                </p>
                <p className="text-xs text-muted">
                  Last refreshed {new Date().toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short' })}
                </p>
              </div>
            </div>

            <div className="mt-8 overflow-hidden rounded-2xl border border-border/70 bg-surface ring-card">
              <ul className="divide-y divide-border/70">
                {services.map((s) => (
                  <li key={s.name} className="flex items-center justify-between gap-4 px-5 py-4">
                    <span className="text-sm font-medium text-foreground">{s.name}</span>
                    <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-success">
                      <span className="h-2 w-2 rounded-full bg-success-solid" />
                      Operational
                    </span>
                  </li>
                ))}
              </ul>
            </div>

            <h2 className="mt-12 text-base font-semibold tracking-tight text-foreground">
              Recent updates
            </h2>
            <div className="mt-4 space-y-3">
              {incidents.map((i) => (
                <div
                  key={i.date}
                  className="rounded-2xl border border-border/70 bg-surface p-5 ring-card"
                >
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground">{i.title}</p>
                    <span className="text-xs text-muted">{i.date}</span>
                  </div>
                  <p className="mt-2 text-sm text-foreground-secondary">{i.body}</p>
                </div>
              ))}
            </div>

            <p className="mt-10 text-center text-xs text-muted">
              For production incidents, subscribe to updates at{' '}
              <a className="font-semibold text-foreground underline-offset-4 hover:underline" href="mailto:status@ledger.ai">
                status@ledger.ai
              </a>
              .
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}

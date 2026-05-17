import type { Metadata } from 'next'
import { Lock, ShieldCheck, FileSearch, Database, Eye, Server } from 'lucide-react'
import { Nav } from '@/components/site/nav'
import { Footer } from '@/components/site/footer'
import { PageHero } from '@/components/site/page-hero'
import { AuditLogLive } from '@/components/site/audit-log-live'

export const metadata: Metadata = {
  title: 'Security — How we protect your data',
  description:
    'Encryption at rest and in transit. Postgres row-level security by tenant. Self-hosted LLM. Full audit log on every AI action.',
}

const pillars = [
  {
    Icon: Lock,
    title: 'Encryption everywhere',
    body:
      'TLS 1.3 in transit. AES-256 at rest. Encrypted backups. Customer documents are stored in scoped, signed-URL-only object storage with short-lived access tokens.',
  },
  {
    Icon: Database,
    title: 'Tenant isolation at the DB layer',
    body:
      'Postgres Row-Level Security enforces tenant_id on every read and write. We run an eval suite against RLS policies on the same CI gate as our AI workflows. A bug here is treated as severity-1.',
  },
  {
    Icon: Server,
    title: 'Self-hosted LLM',
    body:
      'We run our own Qwen 2.5 14B inference. Your covenants never leave our infrastructure for inference. No frontier-API provider sees your documents.',
  },
  {
    Icon: FileSearch,
    title: 'Audit log on every AI action',
    body:
      'Every AI output is appended to an immutable AIEventLog: prompt hash, model version, output, citations, human action taken. Searchable by tenant. Exportable on request.',
  },
  {
    Icon: Eye,
    title: 'No training on customer data',
    body:
      'We never train models on documents you upload. Period. We use anonymized synthetic fixtures for eval, never real customer text.',
  },
  {
    Icon: ShieldCheck,
    title: 'Operating + reserve fund separation',
    body:
      'For HOA Hub: operating, reserve, and trust account separation is enforced at the database layer, not the application layer. Required by GA OCGA Title 44; we built it that way on day one.',
  },
]

const policies = [
  { label: 'Encryption at rest', value: 'AES-256' },
  { label: 'Encryption in transit', value: 'TLS 1.3' },
  { label: 'Backups', value: 'Daily · 30-day retention' },
  { label: 'Tenant isolation', value: 'Postgres RLS' },
  { label: 'Auth', value: 'Supabase · magic link + Google' },
  { label: 'Inference', value: 'Self-hosted vLLM (RunPod)' },
  { label: 'Data residency', value: 'US-East' },
  { label: 'Audit log', value: 'Append-only AIEventLog' },
]

export default function SecurityPage() {
  return (
    <main>
      <Nav />

      <PageHero
        eyebrow="Security · Privacy · Audit"
        title="Built like the legal record it has to be."
        subtitle="HOAs and landlords hold sensitive data on hundreds of households. We built Ledger so the security posture is the product, not a checkbox."
      />

      <AuditLogLive />

      <section className="py-12">
        <div className="container-page">
          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {pillars.map((p) => (
              <div
                key={p.title}
                className="rounded-2xl border border-ink-200/70 bg-white p-7 ring-card"
              >
                <div className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-brand-50 text-brand-700">
                  <p.Icon className="h-5 w-5" />
                </div>
                <h3 className="mt-5 text-lg font-semibold tracking-tight text-ink-900">
                  {p.title}
                </h3>
                <p className="mt-2 text-sm leading-relaxed text-ink-600">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <div className="container-page">
          <div className="mx-auto max-w-3xl rounded-2xl border border-ink-200/70 bg-white p-8 ring-card md:p-10">
            <h2 className="text-xl font-semibold tracking-tight text-ink-900">
              Security posture at a glance
            </h2>
            <p className="mt-2 text-sm text-ink-600">
              For your security team, your insurance carrier, or your own peace of mind.
            </p>
            <dl className="mt-8 grid gap-x-8 gap-y-5 sm:grid-cols-2">
              {policies.map((p) => (
                <div key={p.label} className="flex items-baseline justify-between gap-4 border-b border-ink-200/70 pb-3">
                  <dt className="text-sm text-ink-500">{p.label}</dt>
                  <dd className="text-sm font-semibold text-ink-900">{p.value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-8 text-xs text-ink-500">
              Have a security question, vendor risk assessment form, or DPA
              request? Email{' '}
              <a className="font-semibold text-ink-800 underline-offset-4 hover:underline" href="mailto:security@ledger.ai">
                security@ledger.ai
              </a>
              . We reply within one business day.
            </p>
          </div>
        </div>
      </section>

      <Footer />
    </main>
  )
}

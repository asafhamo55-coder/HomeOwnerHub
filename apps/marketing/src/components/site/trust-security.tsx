import Link from 'next/link'
import { ArrowRight, Database, Eye, FileSearch, ShieldCheck } from 'lucide-react'

// Home trust block. Each line restates something /security already says
// (and that section is the proof); no certifications are claimed.

const POINTS = [
  {
    Icon: ShieldCheck,
    title: 'The board approves every draft',
    body: 'Letters, notices, announcements and bills wait for a person. Nothing is sent, filed or entered until the board says so.',
  },
  {
    Icon: Database,
    title: 'Your association’s data stays yours',
    body: 'Row-level security in Postgres scopes every read and write to your association, and a failing test blocks the merge.',
  },
  {
    Icon: FileSearch,
    title: 'Every AI run is logged',
    body: 'Workflow, model, citations and status are recorded, and only your own board and admins can read them.',
  },
  {
    Icon: Eye,
    title: 'No training on your documents',
    body: 'We never train models on what you upload. Owner contact details are kept out of AI prompts.',
  },
]

export function TrustSecurity() {
  return (
    <section className="section section-ink ink-glow" aria-labelledby="trust-heading">
      <div className="container-page">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.4fr] lg:gap-20">
          <div>
            <p className="eyebrow !text-[#8fb4ff]">Trust and security</p>
            <h2 id="trust-heading" className="t-h2 mt-4 text-[#fff]">
              Built to be{' '}
              <span className="t-serif text-[#8fb4ff]">checked,</span> not just trusted.
            </h2>
            <p className="mt-5 text-[17px] leading-relaxed text-[#c3d0ea]">
              A volunteer board is answerable to its neighbors. So every answer cites its source and every AI action
              leaves a record.
            </p>
            <Link
              href="/security"
              className="mt-8 inline-flex items-center gap-1.5 text-[15px] font-semibold text-[#fff] underline-offset-4 hover:underline"
            >
              How we protect your data
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          </div>

          <ul className="grid gap-4 sm:grid-cols-2">
            {POINTS.map(({ Icon, title, body }) => (
              <li key={title} className="rounded-2xl border border-[#ffffff1a] bg-[#ffffff0d] p-6">
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#ffffff1a] text-[#8fb4ff]">
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <h3 className="mt-5 text-[17px] font-semibold text-[#fff]">{title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-[#c3d0ea]">{body}</p>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

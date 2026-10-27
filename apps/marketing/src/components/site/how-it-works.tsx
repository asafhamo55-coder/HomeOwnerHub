import { Upload, ScanSearch, MessageCircleQuestion, Users } from 'lucide-react'

const steps = [
  {
    Icon: Upload,
    title: 'Drop your documents',
    body:
      'Upload your CC&R, bylaws and rules as PDF, text or Markdown. A scanned PDF needs a text layer (OCR) first.',
  },
  {
    Icon: ScanSearch,
    title: 'AI reads everything',
    body:
      'Each document is split into its sections and indexed, so every answer can point to the exact section it came from.',
  },
  {
    Icon: MessageCircleQuestion,
    title: 'Ask your first question',
    body:
      'Covenant Brain answers in plain English, citing the exact section — and says so when your documents don’t cover it.',
  },
  {
    Icon: Users,
    title: 'Bring in the board and the roster',
    body:
      'Invite the board, import your roster from a spreadsheet (CINC exports are recognised) and open the books in Accounting. The built-in guide walks each step.',
  },
]

export function HowItWorks() {
  return (
    <section className="section scroll-mt-16" id="how-it-works">
      <div className="container-page">
        <div className="mx-auto max-w-3xl text-center">
          <p className="eyebrow">How it works</p>
          <h2 className="t-h2 mt-4 text-foreground">
            From a pile of PDFs to a working workspace,{' '}
            <span className="t-serif text-primary">no implementation team.</span>
          </h2>
          <p className="t-lead mt-5">Four steps, designed for a volunteer board on a Tuesday night.</p>
        </div>

        <ol className="relative mt-16 grid gap-5 md:grid-cols-2 lg:grid-cols-4">
          {steps.map((s, i) => (
            <li key={s.title} className="card relative p-6">
              <div className="flex items-center justify-between">
                <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-subtle text-primary">
                  <s.Icon className="h-5 w-5" aria-hidden />
                </span>
                <span className="text-sm font-semibold tabular-nums text-muted" aria-hidden>
                  Step {i + 1}
                </span>
              </div>
              <h3 className="t-h3 mt-6 text-foreground">{s.title}</h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-foreground-secondary">{s.body}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

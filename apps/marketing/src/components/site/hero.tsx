import { HeroCtas } from './hero-ctas'
import { AskAnswerCard, WorkspaceApprovalsPanel } from './mockups'

// Home hero: an evergreen slab with the headline, two CTAs, a 2x2 checklist and
// a cropped app window. Server component, so the copy paints with the HTML.
//

export function Hero() {
  return (
    <section className="hero-wash relative overflow-hidden">
      <div className="container-page">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6">
          <div className="pt-12 lg:py-16">
            <h1 className="t-display text-foreground">
              Run your HOA board <span className="t-serif text-primary">with less paperwork.</span>
            </h1>
            <p className="t-lead mt-6 max-w-xl">
              An AI workspace that drafts letters, notices and answers from your own documents. Your board reads each
              one and approves it before anything goes out.
            </p>

            <HeroCtas position="hero" secondaryHref="/features" secondaryLabel="See it work" />
          </div>

          {/* STOPGAP: HTML mockup of the app, cropped by the slab. Replace
              with real screenshots (see the decision doc's TODO). */}
          <div
            className="relative lg:self-end"
            role="img"
            aria-label="Sample screens from HomeownerHub: the Approvals queue with AI drafts waiting for the board, and a cited answer from a CC&R. Sample data."
          >
            <div className="h-[300px] overflow-hidden sm:h-[380px] lg:-mr-28 lg:mt-14 lg:h-[460px]" aria-hidden>
              <div className="w-[560px] max-w-none sm:w-[640px] lg:w-[720px]">
                <WorkspaceApprovalsPanel className="!rounded-b-none" />
                <div className="mt-3 px-6">
                  <AskAnswerCard />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}

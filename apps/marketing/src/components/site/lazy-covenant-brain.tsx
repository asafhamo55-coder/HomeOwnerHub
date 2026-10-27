'use client'

import dynamic from 'next/dynamic'

// The Covenant Brain sample animates with framer-motion. It sits far below
// the fold, so it loads after the page is interactive and stays out of the
// home page's first-load JS. The placeholder holds the space (no layout
// shift) and reads fine without JavaScript.
const CovenantBrainDemo = dynamic(() => import('./covenant-brain-demo').then((m) => m.CovenantBrainDemo), {
  ssr: false,
  loading: () => (
    <div className="min-h-[420px] p-8 text-sm text-muted md:min-h-[460px]" aria-busy="true">
      Loading the sample…
    </div>
  ),
})

export function LazyCovenantBrain() {
  return <CovenantBrainDemo />
}

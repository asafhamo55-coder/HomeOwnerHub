// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react'

const captured: Array<Record<string, any>> = []
vi.mock('@/components/charts/LazyECharts', () => ({
  LazyECharts: ({ option }: { option: Record<string, any> }) => {
    captured.push(option)
    return null
  },
}))

import {
  computeChartFontScale,
  scaleChartFont,
  scaleChartSpace,
  useChartFontScale,
} from './useChartFontScale'
import { ActivityBar } from '@/components/dashboard/ActivityBar'
import { StatusDonut } from '@/components/dashboard/StatusDonut'
import { FeatureAdoptionChart, GrowthChart, WorkflowUsageChart } from '@/components/admin/AnalyticsCharts'
import { applyTextSize } from '@/lib/larger-text'

;(globalThis as { React?: typeof React }).React = React
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

describe('scale computation', () => {
  it('divides the root size by 16', () => {
    expect(computeChartFontScale(16)).toBe(1)
    expect(computeChartFontScale(18.4)).toBeCloseTo(1.15)
    expect(computeChartFontScale(20.8)).toBeCloseTo(1.3)
  })
  it('falls back to 1 for junk', () => {
    expect(computeChartFontScale(NaN)).toBe(1)
    expect(computeChartFontScale(0)).toBe(1)
  })
  it('never goes under the 12px floor', () => {
    expect(scaleChartFont(11, 1)).toBe(12)
    expect(scaleChartFont(11, 1.3)).toBe(14)
    expect(scaleChartFont(12, 1.3)).toBe(16)
  })
  it('scales spacing without a floor', () => {
    expect(scaleChartSpace(28, 1.3)).toBe(36)
  })
})

if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({
    matches: false, media: q, onchange: null,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
}

// MutationObserver callbacks run as microtasks, so flush them inside act.
async function setRootSize(v: string) {
  await act(async () => {
    document.documentElement.style.fontSize = v
    await Promise.resolve()
  })
}

let host: HTMLElement
let root: Root

beforeEach(() => {
  captured.length = 0
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
  document.documentElement.style.fontSize = ''
})
afterEach(() => {
  act(() => root.unmount())
  host.remove()
  document.documentElement.style.fontSize = ''
})

function render(el: React.ReactElement) {
  act(() => root.render(el))
}
const last = () => captured[captured.length - 1]!

describe('useChartFontScale', () => {
  it('starts at 1 and follows the Text size setting live', async () => {
    const seen: number[] = []
    function Probe() {
      const s = useChartFontScale()
      seen.push(s)
      return null
    }
    render(<Probe />)
    expect(seen[0]).toBe(1)
    // jsdom does not resolve % against 16px, so use an absolute size.
    await setRootSize('20.8px')
    expect(seen[seen.length - 1]).toBeCloseTo(1.3)
    await act(async () => { applyTextSize('normal'); await Promise.resolve() })
    expect(seen[seen.length - 1]).toBeCloseTo(1)
  })
})

describe('chart option builders use the scale', () => {
  const buckets = [
    { date: '2026-11-01', violations: 1, arc: 0, invitations: 0 },
    { date: '2026-11-02', violations: 0, arc: 2, invitations: 1 },
  ]

  it('ActivityBar: fonts and grid grow, 12px floor holds at normal', async () => {
    render(<ActivityBar buckets={buckets} />)
    let o = last()
    expect(o.xAxis.axisLabel.fontSize).toBe(12)
    expect(o.grid.left).toBe(28)
    await setRootSize('20.8px')
    o = last()
    expect(o.xAxis.axisLabel.fontSize).toBe(14)
    expect(o.yAxis.axisLabel.fontSize).toBe(14)
    expect(o.tooltip.textStyle.fontSize).toBe(16)
    expect(o.grid.left).toBe(36)
    expect(o.grid.bottom).toBe(26)
  })

  it('StatusDonut: tooltip text scales', async () => {
    render(<StatusDonut title="Status" total={3} segments={[{ label: 'Open', value: 3, tone: 'primary' }]} />)
    expect(last().tooltip.textStyle.fontSize).toBe(12)
    await setRootSize('20.8px')
    expect(last().tooltip.textStyle.fontSize).toBe(16)
  })

  it('GrowthChart: axis text and padding scale', async () => {
    render(<GrowthChart tenants={[{ month: '2026-10', count: 1 }]} members={[{ month: '2026-10', count: 2 }]} />)
    expect(last().xAxis.axisLabel.fontSize).toBe(12)
    await setRootSize('20.8px')
    const o = last()
    expect(o.xAxis.axisLabel.fontSize).toBe(14)
    expect(o.yAxis[0].nameTextStyle.fontSize).toBe(14)
    expect(o.legend.textStyle.fontSize).toBe(16)
    expect(o.grid.left).toBe(52)
    expect(o.grid.bottom).toBe(52)
  })

  it('FeatureAdoptionChart: labels scale and leave room on the right', async () => {
    render(<FeatureAdoptionChart features={[{ feature: 'Violations', tenants_using: 1, total_tenants: 2 }]} />)
    await setRootSize('20.8px')
    const o = last()
    expect(o.yAxis.axisLabel.fontSize).toBe(16)
    expect(o.series[0].label.fontSize).toBe(14)
    expect(o.grid.right).toBe(52)
  })

  it('WorkflowUsageChart: labels truncate to a scaled width and height scales', async () => {
    const wf = Array.from({ length: 4 }, (_, i) => ({ workflow_id: `workflow-with-a-long-name-${i}`, runs: i + 1 }))
    render(<WorkflowUsageChart workflows={wf} />)
    let o = last()
    expect(o.yAxis.axisLabel.width).toBe(110)
    expect(o.yAxis.axisLabel.overflow).toBe('truncate')
    expect(host.querySelector('div[style*="height"]')?.getAttribute('style')).toContain('128px')
    await setRootSize('20.8px')
    o = last()
    expect(o.yAxis.axisLabel.width).toBe(143)
    expect(o.yAxis.axisLabel.overflow).toBe('truncate')
    expect(host.querySelector('div[style*="height"]')?.getAttribute('style')).toContain('166px')
  })

  it('FeatureAdoptionChart: y labels truncate to a scaled width', async () => {
    render(<FeatureAdoptionChart features={[{ feature: 'Violations', tenants_using: 1, total_tenants: 2 }]} />)
    await setRootSize('20.8px')
    expect(last().yAxis.axisLabel.width).toBe(143)
    expect(last().yAxis.axisLabel.overflow).toBe('truncate')
  })

  it('no chart font is under 12px at 130% on a real component', async () => {
    render(<GrowthChart tenants={[{ month: '2026-10', count: 1 }]} members={[{ month: '2026-10', count: 2 }]} />)
    await setRootSize('20.8px')
    const sizes: number[] = []
    const walk = (v: unknown) => {
      if (!v || typeof v !== 'object') return
      for (const [k, x] of Object.entries(v)) {
        if (k === 'fontSize' && typeof x === 'number') sizes.push(x)
        else walk(x)
      }
    }
    walk(last())
    expect(sizes.length).toBeGreaterThan(4)
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(12)
  })
})

describe('observer cleanup', () => {
  it('disconnects the MutationObserver on unmount', () => {
    const spy = vi.spyOn(MutationObserver.prototype, 'disconnect')
    function Probe() {
      useChartFontScale()
      return null
    }
    render(<Probe />)
    act(() => root.render(<div />))
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })
})

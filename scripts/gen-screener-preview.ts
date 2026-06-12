/**
 * scripts/gen-screener-preview.ts
 *
 * Generates a self-contained HTML preview of the Equity Screener using the
 * REAL signals engine + the deterministic mock provider. Not part of the app —
 * a static artifact so the screens can be reviewed without a Supabase backend
 * or a browser in the build sandbox. Charts load ECharts from a CDN.
 *
 *   pnpm exec tsx scripts/gen-screener-preview.ts > /tmp/screener-preview.html
 */

import { MockProvider } from '../packages/market-data/src/index'
import { buildScorecard, type Scorecard } from '../apps/screener/src/lib/signals'
import { bigUsd, marginPct, num, pct, ratio, usd } from '../apps/screener/src/lib/format'

const SYMBOLS = ['NVDA', 'AAPL', 'MSFT', 'TSLA', 'AMD']
const provider = new MockProvider()

function strictlyIncreasing(values: Array<number | null>): boolean | null {
  const clean = values.filter((v): v is number => v != null)
  if (clean.length < 2) return null
  for (let i = 1; i < clean.length; i++) if (clean[i] <= clean[i - 1]) return false
  return true
}

interface Row {
  symbol: string
  name: string | null
  sc: Scorecard
  eps: Awaited<ReturnType<MockProvider['getQuarterlyEps']>>
  val: Awaited<ReturnType<MockProvider['getValuation']>>
  annual: Awaited<ReturnType<MockProvider['getAnnualFinancials']>>
}

async function load(symbol: string): Promise<Row> {
  const [profile, eps, val, annual] = await Promise.all([
    provider.getProfile(symbol),
    provider.getQuarterlyEps(symbol, 12),
    provider.getValuation(symbol),
    provider.getAnnualFinancials(symbol, 5),
  ])
  const actuals = eps.filter((e) => !e.isForecast).map((e) => e.epsActual)
  const sc = buildScorecard({
    trailingPe: val.trailingPe,
    forwardPe: val.forwardPe,
    price: val.price,
    netMarginTtm: val.netMarginTtm,
    revenueGrowing: strictlyIncreasing(annual.map((a) => a.revenue)),
    netIncomeGrowing: strictlyIncreasing(annual.map((a) => a.netIncome)),
    yearsOnFile: annual.length,
    epsSeries: actuals,
  })
  return { symbol, name: profile.name, sc, eps, val, annual }
}

const CHIP: Record<string, string> = {
  pass: 'background:#d1fae5;color:#065f46',
  turnaround: 'background:#e0f2fe;color:#075985',
  flag: 'background:#fef3c7;color:#92400e',
  fail: 'background:#fee2e2;color:#991b1b',
  na: 'background:#f1f5f9;color:#475569',
}
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
function chip(state: string, label?: string): string {
  const text = label ?? cap(state)
  return `<span style="display:inline-flex;align-items:center;border-radius:9999px;padding:2px 8px;font-size:12px;font-weight:500;${CHIP[state] ?? CHIP.na}">${text}</span>`
}
function yoyLabel(sc: Scorecard) {
  return sc.yoy.state === 'turnaround' ? 'Turnaround' : sc.yoy.state === 'na' ? 'N/A' : pct(sc.yoy.pct)
}
function qoqLabel(sc: Scorecard) {
  return sc.qoq.label === 'na' ? 'N/A' : cap(sc.qoq.label)
}
function fwdLabel(sc: Scorecard) {
  return sc.fwd.state === 'na' ? 'N/A' : pct(sc.fwd.pct)
}

async function main() {
  const rows = await Promise.all(SYMBOLS.map(load))
  const total = rows.length
  const cleanSweep = rows.filter((r) => r.sc.scored > 0 && r.sc.passing === r.sc.scored).length
  const premium = rows.filter((r) => r.sc.pe.premiumFlag).length
  const decel = rows.filter((r) => r.sc.qoq.state === 'fail').length

  const detail = rows[0] // NVDA
  const epsLabels = detail.eps.map((e) => e.fiscalPeriod)
  const epsActual = detail.eps.map((e) => (e.isForecast ? null : e.epsActual))
  const lastActualIdx = detail.eps.reduce((acc, e, i) => (e.isForecast ? acc : i), -1)
  const epsForecast = detail.eps.map((e, i) =>
    i === lastActualIdx ? e.epsActual : e.isForecast ? e.epsEstimate : null,
  )
  const actualsOnly = detail.eps.filter((e) => !e.isForecast)
  const qoqLabels = actualsOnly.slice(1).map((e) => e.fiscalPeriod)
  const qoqVals = actualsOnly
    .slice(1)
    .map((e, i) => Number(((e.epsActual ?? 0) - (actualsOnly[i].epsActual ?? 0)).toFixed(2)))

  const statCard = (label: string, value: number | string, meta: string) => `
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:20px">
      <div style="font-size:13px;color:#6B7280;font-weight:500">${label}</div>
      <div style="font-size:30px;font-weight:700;color:#111827;margin-top:8px">${value}</div>
      <div style="font-size:13px;color:#6B7280;margin-top:2px">${meta}</div>
    </div>`

  const tableRows = rows
    .map(
      (r) => `
      <tr style="border-bottom:1px solid #E5E7EB">
        <td style="padding:12px 16px"><div style="font-weight:600;color:#111827">${r.symbol}</div><div style="font-size:12px;color:#6B7280">${r.name ?? ''}</div></td>
        <td style="padding:12px 16px">${chip(r.sc.pe.state, r.sc.pe.trailingPe != null ? r.sc.pe.trailingPe.toFixed(1) + '×' : 'N/A')}</td>
        <td style="padding:12px 16px">${chip(r.sc.fundamentals.state)}</td>
        <td style="padding:12px 16px">${chip(r.sc.yoy.state, yoyLabel(r.sc))}</td>
        <td style="padding:12px 16px">${chip(r.sc.qoq.state, qoqLabel(r.sc))}</td>
        <td style="padding:12px 16px">${chip(r.sc.fwd.state, fwdLabel(r.sc))}</td>
        <td style="padding:12px 16px;font-weight:600;color:#111827">${r.sc.passing}/${r.sc.scored}</td>
      </tr>`,
    )
    .join('')

  const stepCard = (step: number, title: string, chipHtml: string, kv: [string, string][]) => `
    <div style="background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:20px">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px">
        <div><div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280">Step ${step}</div><div style="font-size:16px;font-weight:600;color:#111827">${title}</div></div>
        ${chipHtml}
      </div>
      <dl style="display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;margin:0">
        ${kv.map(([k, v]) => `<div><dt style="font-size:11px;text-transform:uppercase;letter-spacing:.04em;color:#6B7280">${k}</dt><dd style="margin:2px 0 0;font-size:14px;color:#111827">${v}</dd></div>`).join('')}
      </dl>
    </div>`

  const sc = detail.sc
  const yoyText = sc.yoy.state === 'turnaround' ? 'Loss → profit' : sc.yoy.ratio != null ? `${ratio(sc.yoy.ratio)} (${pct(sc.yoy.pct)})` : '—'

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Equity Screener — preview</title>
<script src="https://cdn.jsdelivr.net/npm/echarts@5/dist/echarts.min.js"></script>
<style>
  *{box-sizing:border-box}
  body{margin:0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#FAFBFD;color:#111827}
  .shell{display:flex;min-height:100vh}
  .sidebar{width:240px;background:#fff;border-right:1px solid #E5E7EB;flex-shrink:0}
  .brand{height:56px;display:flex;align-items:center;gap:8px;padding:0 16px;border-bottom:1px solid #E5E7EB;font-weight:600}
  .dot{width:18px;height:18px;border-radius:5px;background:#4F46E5}
  .nav{padding:16px 8px}
  .navitem{display:flex;align-items:center;gap:12px;padding:8px 12px;border-radius:8px;background:rgba(79,70,229,.1);color:#4F46E5;font-size:14px;font-weight:500}
  .main{flex:1;min-width:0}
  .header{height:56px;border-bottom:1px solid #E5E7EB;background:rgba(255,255,255,.8);position:sticky;top:0;display:flex;align-items:center;justify-content:flex-end;padding:0 24px;font-size:13px;color:#6B7280}
  .content{padding:32px 24px;max-width:1100px}
  h1{font-size:24px;margin:0}
  .sub{color:#6B7280;font-size:14px;margin-top:4px}
  .addbox{display:flex;gap:8px;align-items:center}
  .input{height:40px;border:1px solid #E5E7EB;border-radius:8px;padding:0 12px;font-size:14px;width:180px;background:#fff}
  .btn{height:40px;padding:0 16px;border-radius:8px;border:none;background:#4F46E5;color:#fff;font-weight:500;font-size:14px;display:inline-flex;align-items:center;gap:6px}
  .btn.outline{background:#fff;color:#111827;border:1px solid #E5E7EB}
  .grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:16px;margin:24px 0}
  table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #E5E7EB;border-radius:12px;overflow:hidden;font-size:14px}
  thead th{text-align:left;padding:12px 16px;color:#6B7280;font-weight:500;border-bottom:1px solid #E5E7EB;font-size:13px}
  .section-divider{margin:48px 0 0;border-top:2px dashed #E5E7EB;padding-top:32px}
  .crumb{font-size:13px;color:#6B7280;margin-bottom:12px}
  .tabs{display:flex;gap:4px;border-bottom:1px solid #E5E7EB;margin:16px 0 24px}
  .tab{padding:8px 12px;font-size:14px;font-weight:500;color:#6B7280;border-bottom:2px solid transparent}
  .tab.active{color:#111827;border-bottom-color:#4F46E5}
  .grid3{display:grid;grid-template-columns:repeat(3,1fr);gap:16px}
  .card{background:#fff;border:1px solid #E5E7EB;border-radius:12px;padding:20px}
  .note{font-size:12px;color:#6B7280;margin-top:8px}
  @media(max-width:820px){.sidebar{display:none}.grid4{grid-template-columns:repeat(2,1fr)}.grid3{grid-template-columns:1fr}.input{width:130px} table{display:block;overflow-x:auto}}
</style></head>
<body>
<div class="shell">
  <aside class="sidebar">
    <div class="brand"><span class="dot"></span> Equity Screener</div>
    <div class="nav"><div class="navitem">▦ Dashboard</div></div>
  </aside>
  <div class="main">
    <div class="header">◐ &nbsp; demo preview · mock data</div>
    <div class="content">
      <!-- DASHBOARD -->
      <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
        <div><h1>Watchlist</h1><div class="sub">Per-ticker fundamental scorecard — the 5-step EPS methodology, recomputed each refresh.</div></div>
        <div class="addbox"><input class="input" placeholder="Add ticker (e.g. AAPL)"><button class="btn">+ Add</button><button class="btn outline">⟳ Refresh now</button></div>
      </div>
      <div class="grid4">
        ${statCard('Tickers tracked', total, 'on your watchlist')}
        ${statCard('Passing all signals', cleanSweep, `of ${total} clear every scored step`)}
        ${statCard('P/E premium', premium, 'trading above 30× trailing')}
        ${statCard('Decelerating', decel, 'QoQ EPS deltas trending down')}
      </div>
      <table>
        <thead><tr><th>Ticker</th><th>P/E (1)</th><th>Fundamentals (2)</th><th>YoY EPS (3) ↓</th><th>QoQ trend (4)</th><th>Forward (5)</th><th>Score</th></tr></thead>
        <tbody>${tableRows}</tbody>
      </table>

      <!-- TICKER DETAIL (NVDA) -->
      <div class="section-divider">
        <div class="crumb">← Watchlist</div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap">
          <div><h1>${detail.symbol} <span style="font-size:16px;font-weight:400;color:#6B7280">${detail.name ?? ''}</span></h1>
          <div class="sub">${usd(detail.val.price)} · ${bigUsd(detail.val.marketCap)} market cap</div></div>
          <div class="addbox"><button class="btn outline">⟳ Refresh now</button><button class="btn outline">🗑</button></div>
        </div>
        <div class="tabs"><div class="tab active">Overview</div><div class="tab">EPS Trend</div><div class="tab">Financials</div></div>
        <div class="grid3">
          ${stepCard(1, 'P/E reasonableness', chip(sc.pe.state), [['Trailing P/E', sc.pe.trailingPe != null ? num(sc.pe.trailingPe) + '×' : '—'], ['In 20–30 band', sc.pe.inBand ? 'Yes' : 'No'], ['Premium (>30×)', sc.pe.premiumFlag ? 'Yes' : 'No']])}
          ${stepCard(2, 'Fundamentals trend (5 yr)', chip(sc.fundamentals.state), [['Revenue rising', sc.fundamentals.revenueGrowing ? 'Yes' : 'No'], ['Net income rising', sc.fundamentals.netIncomeGrowing ? 'Yes' : 'No'], ['Net margin (TTM)', marginPct(sc.fundamentals.netMarginTtm)]])}
          ${stepCard(3, 'YoY EPS growth', chip(sc.yoy.state, yoyLabel(sc)), [['EPS (latest Q)', num(sc.yoy.epsQ)], ['EPS (year ago)', num(sc.yoy.epsQ4)], ['Growth', yoyText]])}
          ${stepCard(4, 'QoQ EPS delta trend', chip(sc.qoq.state, qoqLabel(sc)), [['Trend', qoqLabel(sc)], ['Slope', sc.qoq.slope != null ? num(sc.qoq.slope, 3) : '—'], ['Recent deltas', sc.qoq.deltas.map((d) => (d > 0 ? '+' : '') + d.toFixed(2)).join('  ')]])}
          ${stepCard(5, 'Forward growth (P/E)', chip(sc.fwd.state, fwdLabel(sc)), [['Trailing ÷ Forward', sc.fwd.ratio != null ? ratio(sc.fwd.ratio) : '—'], ['Implied growth', sc.fwd.state === 'na' ? '—' : pct(sc.fwd.pct)], ['Forward annual EPS', num(sc.fwd.fwdAnnualEps)]])}
          <div class="card" style="background:rgba(248,250,253,.6)">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.05em;color:#6B7280">Composite</div>
            <div style="font-size:16px;font-weight:600">Signals passing</div>
            <div style="font-size:30px;font-weight:700;margin-top:8px">${sc.passing}<span style="font-size:18px;font-weight:500;color:#6B7280">/${sc.scored}</span></div>
            <div class="note">Signals shown for your own judgment — not a buy/avoid verdict.</div>
          </div>
        </div>

        <div class="grid3" style="grid-template-columns:1fr 1fr;margin-top:24px">
          <div class="card"><div style="font-weight:600;margin-bottom:8px">Quarterly EPS</div><div id="trend" style="height:280px"></div></div>
          <div class="card"><div style="font-weight:600;margin-bottom:8px">QoQ EPS deltas</div><div id="qoq" style="height:240px"></div></div>
        </div>
      </div>
    </div>
  </div>
</div>
<script>
  var t = echarts.init(document.getElementById('trend'));
  t.setOption({grid:{top:16,right:16,bottom:28,left:40},tooltip:{trigger:'axis'},
    xAxis:{type:'category',data:${JSON.stringify(epsLabels)},axisLine:{show:false},axisTick:{show:false},axisLabel:{color:'#6B7280',fontSize:11}},
    yAxis:{type:'value',scale:true,splitLine:{lineStyle:{color:'#E5E7EB'}},axisLabel:{color:'#6B7280',fontSize:11}},
    series:[{name:'EPS (actual)',type:'line',smooth:true,symbolSize:6,data:${JSON.stringify(epsActual)},lineStyle:{width:2.5,color:'#4F46E5'},itemStyle:{color:'#4F46E5'}},
            {name:'EPS (estimate)',type:'line',smooth:true,symbolSize:6,connectNulls:true,data:${JSON.stringify(epsForecast)},lineStyle:{width:2,type:'dashed',color:'#F59E0B'},itemStyle:{color:'#F59E0B'}}]});
  var q = echarts.init(document.getElementById('qoq'));
  q.setOption({grid:{top:16,right:16,bottom:28,left:40},tooltip:{trigger:'axis'},
    xAxis:{type:'category',data:${JSON.stringify(qoqLabels)},axisLine:{show:false},axisTick:{show:false},axisLabel:{color:'#6B7280',fontSize:11}},
    yAxis:{type:'value',splitLine:{lineStyle:{color:'#E5E7EB'}},axisLabel:{color:'#6B7280',fontSize:11}},
    series:[{type:'bar',barMaxWidth:28,data:${JSON.stringify(qoqVals)}.map(function(v){return {value:v,itemStyle:{color:v>=0?'#059669':'#E11D48'}}})}]});
  window.addEventListener('resize',function(){t.resize();q.resize()});
</script>
</body></html>`

  process.stdout.write(html)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

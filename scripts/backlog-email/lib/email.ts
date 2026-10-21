// Open backlog items -> branded, email-safe HTML. Same shell, palette and
// helpers as the release-note and owner-actions emails
// (scripts/release-notes/lib), so the three read as one product.

import { BRAND } from '../../release-notes/lib/brand'
import { emailHead, wordmarkHeader } from '../../release-notes/lib/email'
import { escapeHtml } from '../../release-notes/lib/markdown'
import { countPartly, type Backlog, type BacklogItem } from './parse'

export const DOC_PATH = 'docs/backlog.md'
/** The production branch: the copy of the backlog the email links to. */
export const DOC_BRANCH = 'claude/phase1-homeownerhub-setup-MILNu'

export interface BacklogEmail {
  subject: string
  html: string
  text: string
}

type Tone = 'warn' | 'block' | 'info' | 'ga'
const PILL: Record<Tone, { bg: string; fg: string; cls: string }> = {
  block: { bg: '#FEE4E2', fg: '#B42318', cls: 'bl-block' },
  warn: { bg: BRAND.accentSubtle, fg: BRAND.accentFg, cls: 'bl-warn' },
  info: { bg: BRAND.subtle, fg: BRAND.muted, cls: 'bl-info' },
  ga: { bg: BRAND.primarySubtle, fg: BRAND.primary, cls: 'bl-ga' },
}

const EXTRA_CSS = `  @media (prefers-color-scheme: dark) {
    .bl-block { background-color:#3D1512 !important; color:#FDA29B !important; }
    .bl-warn { background-color:#2B2110 !important; color:#FEC84B !important; }
    .bl-info { background-color:#1E293B !important; color:#94A3B8 !important; }
    .bl-ga { background-color:#172554 !important; color:#93C5FD !important; }
    .bl-item { border-color:#1E293B !important; }
  }
`

function tone(label: string): Tone {
  if (/^(blocked|deadline)/i.test(label)) return 'block'
  if (/^partly/i.test(label)) return 'warn'
  return 'info'
}

export function docUrl(branch = DOC_BRANCH): string {
  return `${BRAND.repoUrl}/blob/${branch}/${DOC_PATH}`
}

function itemsLeft(n: number): string {
  return n === 1 ? '1 backlog item left' : `${n} backlog items left`
}

export function subjectFor(b: Backlog): string {
  const ga = b.groups.find((g) => g.name === 'Georgia')?.items.length ?? 0
  return `${BRAND.productName}: ${itemsLeft(b.open.length)}${ga ? ` (${ga} Georgia)` : ''}`
}

function breakdown(b: Backlog): string {
  const partly = countPartly(b.open)
  return `${b.open.length - partly} not started, ${partly} partly done`
}

function pill(text: string, t: Tone): string {
  const p = PILL[t]
  return `<span class="${p.cls}" style="display:inline-block;background-color:${p.bg};color:${p.fg};border-radius:999px;padding:1px 8px;margin:0 4px 4px 0;font-size:11px;line-height:17px;font-weight:700;letter-spacing:0.03em;">${escapeHtml(text)}</span>`
}

function itemRow(i: BacklogItem, inGeorgia: boolean): string {
  const pills = [...(inGeorgia ? [] : i.georgia ? [pill('Georgia', 'ga')] : []), ...i.labels.map((l) => pill(l, tone(l)))]
  if (inGeorgia) pills.push(pill(i.group, 'info'))
  return `
    <tr><td class="bl-item" style="padding:12px 0 10px 0;border-top:1px solid ${BRAND.border};">
      <p class="rn-fg" style="margin:0 0 4px 0;font-size:15px;line-height:22px;color:${BRAND.foreground};"><span class="rn-muted" style="font-family:${BRAND.mono};font-size:13px;color:${BRAND.muted};">${escapeHtml(i.id)}</span>&nbsp; <strong>${escapeHtml(i.title)}</strong></p>
      ${pills.length ? `<div style="margin:0 0 2px 0;">${pills.join('')}</div>` : ''}
      ${i.summary ? `<p style="margin:0;font-size:14px;line-height:21px;color:${BRAND.foregroundSecondary};">${escapeHtml(i.summary)}</p>` : ''}
    </td></tr>`
}

function groupCard(name: string, items: readonly BacklogItem[]): string {
  const ga = name === 'Georgia'
  return `
<tr><td class="rn-card" bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};padding:8px 32px 8px 32px;">
  <h2 class="rn-fg" style="margin:16px 0 6px 0;font-size:17px;line-height:24px;font-weight:600;color:${BRAND.foreground};">${escapeHtml(name)} <span class="rn-muted" style="font-weight:400;color:${BRAND.muted};">&middot; ${items.length}</span></h2>
  ${ga ? `<p style="margin:0 0 6px 0;font-size:13px;line-height:19px;color:${BRAND.muted};">Georgia is the launch state, so these come first. The pill shows the round each one is ranked in.</p>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${items.map((i) => itemRow(i, ga)).join('')}
  </table>
</td></tr>`
}

export function renderHtml(b: Backlog, opts: { branch?: string } = {}): string {
  const subject = subjectFor(b)
  const url = docUrl(opts.branch)
  const counts = b.groups.map((g) => `${g.name}: ${g.items.length}`).join(' · ')
  const preheader = `${breakdown(b)}. ${counts}`
  return `${emailHead(subject, EXTRA_CSS)}<body class="rn-bg" style="margin:0;padding:0;background-color:${BRAND.background};font-family:${BRAND.font};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader.slice(0, 140))}</div>
<table role="presentation" class="rn-bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.background}" style="background-color:${BRAND.background};">
<tr><td align="center" style="padding:28px 12px 36px 12px;">
<table role="presentation" class="rn-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;font-family:${BRAND.font};">

${wordmarkHeader('Backlog')}

<!-- Title card -->
<tr><td class="rn-card" bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};border-top:4px solid ${BRAND.primary};border-radius:12px 12px 0 0;padding:28px 32px 12px 32px;">
  <p class="rn-link" style="margin:0 0 8px 0;font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.primary};">${BRAND.appName} &middot; Backlog digest</p>
  <h1 class="rn-fg" style="margin:0 0 10px 0;font-size:24px;line-height:31px;font-weight:700;letter-spacing:-0.015em;color:${BRAND.foreground};">${escapeHtml(itemsLeft(b.open.length))}</h1>
  <p style="margin:0 0 8px 0;font-size:15px;line-height:24px;color:${BRAND.foregroundSecondary};">${escapeHtml(breakdown(b))}; ${b.closed.length} done or retired. Georgia first, then the newest ranked round first. Each item says what it is, or what is left of it.</p>
  <p class="rn-muted" style="margin:0 0 12px 0;font-size:13px;line-height:20px;color:${BRAND.muted};">${escapeHtml(counts)}</p>
  <p style="margin:0;font-size:14px;line-height:20px;"><a href="${url}" class="rn-link" style="color:${BRAND.primary};text-decoration:underline;">Open the full backlog</a></p>
</td></tr>
${b.groups.map((g) => groupCard(g.name, g.items)).join('')}
<tr><td class="rn-card" bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};border-radius:0 0 12px 12px;padding:8px 32px 24px 32px;">&nbsp;</td></tr>

<!-- Footer -->
<tr><td align="center" style="padding:22px 16px 0 16px;">
  <p class="rn-muted" style="margin:0 0 6px 0;font-size:13px;line-height:19px;color:${BRAND.muted};">From <a href="${url}" class="rn-link" style="color:${BRAND.primary};text-decoration:none;font-family:${BRAND.mono};">${DOC_PATH}</a>. Status is as the file states it.</p>
  <p class="rn-muted" style="margin:0;font-size:12px;line-height:17px;color:${BRAND.muted};">An internal digest for the ${BRAND.productName} account owner. Sent every Monday while anything is open, and on request.</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
`
}

export function renderText(b: Backlog, opts: { branch?: string } = {}): string {
  const lines: string[] = [`${BRAND.productName} backlog digest`, itemsLeft(b.open.length), `${breakdown(b)}; ${b.closed.length} done or retired.`, '']
  for (const g of b.groups) {
    lines.push(`${g.name.toUpperCase()} (${g.items.length})`)
    for (const i of g.items) {
      const tags = [...i.labels, ...(g.name === 'Georgia' ? [i.group] : [])]
      lines.push(`  ${i.id} · ${i.title}${tags.length ? ` [${tags.join('; ')}]` : ''}`)
      if (i.summary) lines.push(`      ${i.summary}`)
    }
    lines.push('')
  }
  lines.push(`Full backlog: ${docUrl(opts.branch)}`)
  return lines.join('\n')
}

export function renderBacklogEmail(b: Backlog, opts: { branch?: string } = {}): BacklogEmail {
  return { subject: subjectFor(b), html: renderHtml(b, opts), text: renderText(b, opts) }
}

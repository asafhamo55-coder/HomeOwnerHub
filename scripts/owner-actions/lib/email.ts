// Owner action items -> branded, email-safe HTML. Same shell, palette and
// markdown subset as the release-note email (scripts/release-notes/lib),
// so the two read as one product.

import { BRAND } from '../../release-notes/lib/brand'
import { emailHead, wordmarkHeader } from '../../release-notes/lib/email'
import { blocksToHtml, blocksToText, escapeHtml, inlineText } from '../../release-notes/lib/markdown'
import { countUrgent, type ActionItem, type OwnerActions, type Urgency } from './parse'

export const DOC_PATH = 'docs/owner-actions.md'
/** The production branch: the copy of the checklist the email links to. */
export const DOC_BRANCH = 'claude/phase1-homeownerhub-setup-MILNu'

export interface OwnerActionsEmail {
  subject: string
  html: string
  text: string
}

const PILL: Record<Urgency, { bg: string; fg: string; cls: string }> = {
  Urgent: { bg: '#FEE4E2', fg: '#B42318', cls: 'oa-urgent' },
  Soon: { bg: BRAND.accentSubtle, fg: BRAND.accentFg, cls: 'oa-soon' },
  Whenever: { bg: BRAND.subtle, fg: BRAND.muted, cls: 'oa-whenever' },
}

const EXTRA_CSS = `  @media (prefers-color-scheme: dark) {
    .oa-urgent { background-color:#3D1512 !important; color:#FDA29B !important; }
    .oa-soon { background-color:#2B2110 !important; color:#FEC84B !important; }
    .oa-whenever { background-color:#1E293B !important; color:#94A3B8 !important; }
    .oa-item { border-color:#1E293B !important; }
  }
`

export function docUrl(branch = DOC_BRANCH): string {
  return `${BRAND.repoUrl}/blob/${branch}/${DOC_PATH}`
}

function things(n: number): string {
  return n === 1 ? '1 thing needs you' : `${n} things need you`
}

export function subjectFor(actions: OwnerActions): string {
  return `${BRAND.productName}: ${things(actions.open.length)} (${countUrgent(actions.open)} urgent)`
}

function card(inner: string, extra = ''): string {
  return `
<tr><td class="rn-card" bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};${extra}">${inner}
</td></tr>`
}

function itemBlock(item: ActionItem): string {
  const u = item.urgency ?? 'Whenever'
  const p = PILL[u]
  return card(
    `
  <table role="presentation" class="oa-item" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-top:1px solid ${BRAND.border};">
    <tr><td style="padding:20px 0 4px 0;">
      <span class="${p.cls}" style="display:inline-block;background-color:${p.bg};color:${p.fg};border-radius:999px;padding:2px 10px;font-size:12px;line-height:18px;font-weight:700;letter-spacing:0.04em;text-transform:uppercase;">${u}</span>
      <span class="rn-muted" style="margin-left:8px;font-size:13px;line-height:18px;font-family:${BRAND.mono};color:${BRAND.muted};">${escapeHtml(item.id)}</span>
      <h2 class="rn-fg" style="margin:8px 0 10px 0;font-size:17px;line-height:24px;font-weight:600;color:${BRAND.foreground};">${escapeHtml(item.title)}</h2>
      ${blocksToHtml(item.body)}
    </td></tr>
  </table>`,
    'padding:0 32px 4px 32px;',
  )
}

function doneBlock(done: readonly ActionItem[]): string {
  if (!done.length) return ''
  const items = done
    .map(
      (i) =>
        `<li style="margin:0 0 4px 0;font-size:14px;line-height:21px;color:${BRAND.muted};"><span style="font-family:${BRAND.mono};">${escapeHtml(i.id)}</span> &middot; ${escapeHtml(i.title)}${i.doneOn ? ` (${escapeHtml(i.doneOn)})` : ''}</li>`,
    )
    .join('')
  return card(
    `
  <h2 class="rn-fg" style="margin:20px 0 10px 0;font-size:15px;line-height:22px;font-weight:600;color:${BRAND.foreground};">Done (${done.length})</h2>
  <ul style="margin:0 0 12px 0;padding:0 0 0 20px;">${items}</ul>`,
    `padding:4px 32px 4px 32px;border-top:1px solid ${BRAND.border};`,
  )
}

export function renderHtml(actions: OwnerActions, opts: { branch?: string } = {}): string {
  const subject = subjectFor(actions)
  const urgent = countUrgent(actions.open)
  const first = actions.open[0]
  const preheader = first ? `${first.urgency === 'Urgent' ? 'Urgent: ' : 'First: '}${first.title}` : ''
  const url = docUrl(opts.branch)
  const intro =
    urgent > 0
      ? `${urgent === 1 ? 'One is' : `${urgent} are`} urgent and listed first. Each step says why it matters and exactly what to do.`
      : 'Nothing is urgent. Each step says why it matters and exactly what to do.'
  const why = actions.why
    ? card(
        `
  <h2 class="rn-fg" style="margin:20px 0 10px 0;font-size:15px;line-height:22px;font-weight:600;color:${BRAND.foreground};">Why Claude can't do these</h2>
  ${blocksToHtml(actions.why)}`,
        `padding:4px 32px 4px 32px;border-top:1px solid ${BRAND.border};`,
      )
    : ''

  return `${emailHead(subject, EXTRA_CSS)}<body class="rn-bg" style="margin:0;padding:0;background-color:${BRAND.background};font-family:${BRAND.font};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preheader.slice(0, 140))}</div>
<table role="presentation" class="rn-bg" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${BRAND.background}" style="background-color:${BRAND.background};">
<tr><td align="center" style="padding:28px 12px 36px 12px;">
<table role="presentation" class="rn-container" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;font-family:${BRAND.font};">

${wordmarkHeader('Owner actions')}

<!-- Title card -->
<tr><td class="rn-card" bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};border-top:4px solid ${BRAND.primary};border-radius:12px 12px 0 0;padding:28px 32px 16px 32px;">
  <p class="rn-link" style="margin:0 0 8px 0;font-size:12px;line-height:16px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:${BRAND.primary};">${BRAND.appName} &middot; Your checklist</p>
  <h1 class="rn-fg" style="margin:0 0 10px 0;font-size:24px;line-height:31px;font-weight:700;letter-spacing:-0.015em;color:${BRAND.foreground};">${escapeHtml(things(actions.open.length))}</h1>
  <p style="margin:0 0 12px 0;font-size:15px;line-height:24px;color:${BRAND.foregroundSecondary};">${escapeHtml(intro)} When you finish one, tell Claude and it moves to Done.</p>
  <p style="margin:0;font-size:14px;line-height:20px;"><a href="${url}" class="rn-link" style="color:${BRAND.primary};text-decoration:underline;">Open the full checklist</a></p>
</td></tr>
${actions.open.map(itemBlock).join('')}${why}${doneBlock(actions.done)}
<tr><td class="rn-card" bgcolor="${BRAND.surface}" style="background-color:${BRAND.surface};border-radius:0 0 12px 12px;padding:8px 32px 24px 32px;">&nbsp;</td></tr>

<!-- Footer -->
<tr><td align="center" style="padding:22px 16px 0 16px;">
  <p class="rn-muted" style="margin:0 0 6px 0;font-size:13px;line-height:19px;color:${BRAND.muted};">From <a href="${url}" class="rn-link" style="color:${BRAND.primary};text-decoration:none;font-family:${BRAND.mono};">${DOC_PATH}</a></p>
  <p class="rn-muted" style="margin:0;font-size:12px;line-height:17px;color:${BRAND.muted};">An internal reminder for the ${BRAND.productName} account owner. Sent when the checklist changes and every Monday while anything is open.</p>
</td></tr>

</table>
</td></tr>
</table>
</body>
</html>
`
}

export function renderText(actions: OwnerActions, opts: { branch?: string } = {}): string {
  const lines: string[] = [`${BRAND.productName} owner actions`, things(actions.open.length), '']
  for (const i of actions.open) {
    lines.push(`[${(i.urgency ?? 'Whenever').toUpperCase()}] ${i.id} · ${inlineText(i.title)}`, blocksToText(i.body), '')
  }
  if (actions.why) lines.push("WHY CLAUDE CAN'T DO THESE", blocksToText(actions.why), '')
  if (actions.done.length) {
    lines.push(`DONE (${actions.done.length})`, ...actions.done.map((i) => `  - ${i.id} · ${inlineText(i.title)}`), '')
  }
  lines.push(`Full checklist: ${docUrl(opts.branch)}`)
  return lines.join('\n')
}

export function renderOwnerActionsEmail(actions: OwnerActions, opts: { branch?: string } = {}): OwnerActionsEmail {
  return { subject: subjectFor(actions), html: renderHtml(actions, opts), text: renderText(actions, opts) }
}

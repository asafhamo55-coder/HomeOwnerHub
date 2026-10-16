/**
 * Grouping and search for /resident/documents (BL-049). Pure; relative
 * imports only.
 */
import { isResidentVisible, type DocSource } from './visibility'

export interface ResidentDocument {
  source: DocSource
  id: string
  title: string
  type: string
  /** governing_documents.effective_date (YYYY-MM-DD). */
  effectiveDate: string | null
  /** When the document was first added. */
  addedAt: string | null
  /** When its file was last replaced (newest hoa_document_versions row), or the governing row's updated_at. */
  updatedAt: string | null
  hasFile: boolean
  aiGenerated?: boolean | null
}

export type ResidentDocGroupId = 'declaration' | 'articles' | 'bylaws' | 'rules' | 'amendments' | 'policies'

export interface ResidentDocGroupDef {
  id: ResidentDocGroupId
  label: string
}

/** Display order. */
export const RESIDENT_DOC_GROUPS: readonly ResidentDocGroupDef[] = [
  { id: 'declaration', label: 'Declaration & CC&Rs' },
  { id: 'articles', label: 'Articles of incorporation' },
  { id: 'bylaws', label: 'Bylaws' },
  { id: 'rules', label: 'Rules & regulations' },
  { id: 'amendments', label: 'Amendments' },
  { id: 'policies', label: 'Policies' },
]

const BY_TYPE: Readonly<Record<DocSource, Readonly<Record<string, ResidentDocGroupId>>>> = {
  hoa: { ccr: 'declaration', bylaws: 'bylaws', rules: 'rules' },
  governing: {
    declaration: 'declaration',
    bylaws: 'bylaws',
    rules: 'rules',
    amendment: 'amendments',
    policy: 'policies',
  },
}

/** Same pattern the § 720.303 check uses for (4)(b)1.a. */
const ARTICLES = /\barticles\s+of\s+(?:incorporation|organization)\b/i

/** The resident group a document belongs in, or null when residents may not see it. */
export function groupFor(doc: ResidentDocument): ResidentDocGroupId | null {
  if (!isResidentVisible(doc)) return null
  const byType = BY_TYPE[doc.source]?.[doc.type]
  if (!byType) return null
  return ARTICLES.test(doc.title) ? 'articles' : byType
}

/** The date a resident sorts and reads by. */
export function docDate(doc: ResidentDocument): string | null {
  return doc.effectiveDate ?? doc.updatedAt ?? doc.addedAt ?? null
}

function time(d: string | null): number {
  if (!d) return Number.NEGATIVE_INFINITY
  const t = Date.parse(d)
  return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t
}

export interface ResidentDocGroup extends ResidentDocGroupDef {
  docs: ResidentDocument[]
}

/** Non-empty groups in display order, newest document first in each. */
export function groupResidentDocuments(docs: readonly ResidentDocument[]): ResidentDocGroup[] {
  const buckets = new Map<ResidentDocGroupId, ResidentDocument[]>()
  for (const d of docs) {
    const g = groupFor(d)
    if (!g) continue
    const list = buckets.get(g) ?? []
    list.push(d)
    buckets.set(g, list)
  }
  const out: ResidentDocGroup[] = []
  for (const def of RESIDENT_DOC_GROUPS) {
    const list = buckets.get(def.id)
    if (!list?.length) continue
    list.sort((a, b) => time(docDate(b)) - time(docDate(a)) || a.title.localeCompare(b.title))
    out.push({ ...def, docs: list })
  }
  return out
}

const LABEL: Record<ResidentDocGroupId, string> = Object.fromEntries(
  RESIDENT_DOC_GROUPS.map((g) => [g.id, g.label]),
) as Record<ResidentDocGroupId, string>

/** Every whitespace-separated term must appear in the title or the group label. */
export function searchResidentDocuments(
  docs: readonly ResidentDocument[],
  query: string | null | undefined,
): ResidentDocument[] {
  const terms = (query ?? '').toLowerCase().split(/\s+/).filter(Boolean)
  if (terms.length === 0) return [...docs]
  return docs.filter((d) => {
    const g = groupFor(d)
    const hay = `${d.title} ${g ? LABEL[g] : ''}`.toLowerCase()
    return terms.every((t) => hay.includes(t))
  })
}

import { tryLoad, type LoadResult } from '@/lib/load-or-fail'

/** A section loader, or null for a section that does not apply (it is not run). */
type Loader = (() => Promise<unknown>) | null
type Loaders = Record<string, Loader>

export type SectionResult<T> = LoadResult<T> | { ok: false; skipped: true }

export type PacketSections<L extends Loaders> = {
  [K in keyof L]: SectionResult<Awaited<ReturnType<NonNullable<L[K]>>>>
}

/**
 * Load every packet section in parallel, each on its own.
 *
 * The packet is several independent reports. One failing read (an RLS
 * denial on budgets, a timeout on the ledger) must cost only that
 * section: it renders `LoadFailed`, never zeros, and the others still
 * print. So each loader is wrapped in `tryLoad` separately — a thrown
 * loader becomes `{ ok: false }` for its key (reported once, PII-redacted
 * by tryLoad), and nothing here can reject.
 *
 * A null loader (e.g. the money sections when the association has no
 * accounting set up) is not run and not reported: `{ ok: false, skipped }`.
 */
export async function loadPacketSections<L extends Loaders>(loaders: L): Promise<PacketSections<L>> {
  const keys = Object.keys(loaders) as (keyof L & string)[]
  const results = await Promise.all(
    keys.map((k) => {
      const load = loaders[k]
      return load ? tryLoad(`board packet: ${k}`, load) : Promise.resolve({ ok: false as const, skipped: true as const })
    }),
  )
  const out = {} as PacketSections<L>
  keys.forEach((k, i) => {
    out[k] = results[i] as PacketSections<L>[typeof k]
  })
  return out
}

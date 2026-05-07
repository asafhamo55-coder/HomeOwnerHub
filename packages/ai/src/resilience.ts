import { runCPU } from './agents/cpu'

const DEFAULT_TIMEOUT_MS = 15_000

// Wrap a primary AI call so a slow/failing GPU pod falls back to the CPU
// always-warm worker. Apps should always render an "AI unavailable" UI
// state if this still throws — never let the user see a raw rejection.
export async function withFallback(
  primary: () => Promise<string>,
  fallbackPrompt: string,
  opts: { timeoutMs?: number } = {},
): Promise<{ result: string; usedFallback: boolean }> {
  const timeout = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  try {
    const result = await Promise.race([
      primary(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('ai_primary_timeout')), timeout),
      ),
    ])
    return { result, usedFallback: false }
  } catch (err) {
    console.error('[ai] primary failed, attempting CPU fallback:', err)
    try {
      const result = await runCPU([{ role: 'user', content: fallbackPrompt }])
      return { result, usedFallback: true }
    } catch (fallbackErr) {
      console.error('[ai] CPU fallback also failed:', fallbackErr)
      throw new Error('ai_unavailable')
    }
  }
}

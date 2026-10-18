/**
 * Help analytics buckets (spec §8). Pure and dependency-free, so client
 * components can bucket a number without pulling in the compiled guide.
 * The values here are the only ones /api/help/event accepts.
 */
export const LENGTH_BUCKETS = ['1-10', '11-30', '31-80', '81+'] as const
export const SCORE_BUCKETS = ['0', '0-0.25', '0.25-0.5', '0.5-0.75', '0.75-1'] as const
export const LATENCY_BUCKETS = ['<1s', '1-3s', '3-8s', '8s+'] as const

export function lengthBucket(n: number): (typeof LENGTH_BUCKETS)[number] {
  return n <= 10 ? '1-10' : n <= 30 ? '11-30' : n <= 80 ? '31-80' : '81+'
}

export function scoreBucket(score: number): (typeof SCORE_BUCKETS)[number] {
  return score <= 0 ? '0' : score < 0.25 ? '0-0.25' : score < 0.5 ? '0.25-0.5' : score < 0.75 ? '0.5-0.75' : '0.75-1'
}

export function latencyBucket(ms: number): (typeof LATENCY_BUCKETS)[number] {
  return ms < 1000 ? '<1s' : ms < 3000 ? '1-3s' : ms < 8000 ? '3-8s' : '8s+'
}

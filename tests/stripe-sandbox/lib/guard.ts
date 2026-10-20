// BL-103 Stripe sandbox suite: the one place that decides whether the
// suite may talk to Stripe at all.
//
//   run    STRIPE_TEST_SECRET_KEY starts with sk_test_
//   skip   the key is absent or is anything else (a clear message, exit 0)
//   refuse a LIVE key is anywhere in the environment (hard failure)
//
// Never returns, logs or embeds any part of a key value in a message.

export type SandboxDecision =
  | { mode: 'run'; secretKey: string; webhookSecret: string | null; webhookSkipReason: string | null }
  | { mode: 'skip'; reason: string }
  | { mode: 'refuse'; reason: string }

const LIVE_RE = /^(sk|rk)_live_/

/** Env vars that must never hold a live key while the suite runs. */
const GUARDED_VARS = ['STRIPE_TEST_SECRET_KEY', 'STRIPE_SECRET_KEY'] as const

export function decideSandbox(env: Record<string, string | undefined>): SandboxDecision {
  for (const name of GUARDED_VARS) {
    const v = env[name]?.trim()
    if (v && LIVE_RE.test(v)) {
      return {
        mode: 'refuse',
        reason:
          `${name} holds a LIVE Stripe key. The sandbox suite only ever runs against test mode ` +
          `and refuses to start. Use a test-mode secret key (sk_test_...) and never the production secret.`,
      }
    }
  }

  const key = env.STRIPE_TEST_SECRET_KEY?.trim()
  if (!key) {
    return {
      mode: 'skip',
      reason:
        'STRIPE_TEST_SECRET_KEY is not set: skipping the Stripe sandbox suite. ' +
        'See docs/specs/2026-10-19-stripe-sandbox.md to create a test-mode key.',
    }
  }
  if (!key.startsWith('sk_test_')) {
    return {
      mode: 'skip',
      reason: 'STRIPE_TEST_SECRET_KEY does not start with sk_test_: skipping the Stripe sandbox suite.',
    }
  }

  const whsec = env.STRIPE_TEST_WEBHOOK_SECRET?.trim() || null
  let webhookSkipReason: string | null = null
  if (!whsec) webhookSkipReason = 'STRIPE_TEST_WEBHOOK_SECRET is not set: skipping the webhook cases.'
  else if (!whsec.startsWith('whsec_')) webhookSkipReason = 'STRIPE_TEST_WEBHOOK_SECRET does not start with whsec_: skipping the webhook cases.'

  return {
    mode: 'run',
    secretKey: key,
    webhookSecret: webhookSkipReason ? null : whsec,
    webhookSkipReason,
  }
}

/** One banner line for the run, safe to print. */
export function describeDecision(d: SandboxDecision): string {
  if (d.mode === 'run') {
    return d.webhookSkipReason
      ? `[stripe-sandbox] running against Stripe TEST mode. ${d.webhookSkipReason}`
      : '[stripe-sandbox] running against Stripe TEST mode (webhook cases enabled).'
  }
  return `[stripe-sandbox] ${d.mode === 'skip' ? 'SKIPPED' : 'REFUSED'}: ${d.reason}`
}

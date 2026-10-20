// Runs once before any sandbox test file. Throwing here fails the run.
import Stripe from 'stripe'
import { STRIPE_API_VERSION } from '../../packages/billing/src/client'
import { decideSandbox, describeDecision } from './lib/guard'
import { sweepStale } from './lib/cleanup'

export default async function globalSetup() {
  const d = decideSandbox(process.env)
  console.info(describeDecision(d))
  if (d.mode === 'refuse') throw new Error(d.reason)
  if (d.mode !== 'run') return

  const stripe = new Stripe(d.secretKey, { apiVersion: STRIPE_API_VERSION as Stripe.LatestApiVersion })
  // Belt and braces on top of the prefix check: ask Stripe.
  const balance = await stripe.balance.retrieve()
  if (balance.livemode !== false) throw new Error('Stripe reports LIVE mode for the sandbox key. Refusing to run.')
  // A run that crashed before its afterAll left tagged objects behind.
  const swept = await sweepStale(stripe)
  console.info(`[stripe-sandbox] swept stale objects from earlier runs: ${JSON.stringify(swept)}`)
}

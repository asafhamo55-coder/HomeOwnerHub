// Per worker, before any test file (and so before any app module) loads.
//
// The app's billing code reads STRIPE_SECRET_KEY and the webhook route
// reads STRIPE_WEBHOOK_SECRET. Point both at the TEST values in run mode
// and remove them otherwise, so nothing in this process can reach Stripe
// with any other key.
import { decideSandbox } from './lib/guard'

const d = decideSandbox(process.env)
if (d.mode === 'refuse') throw new Error(d.reason)

if (d.mode === 'run') process.env.STRIPE_SECRET_KEY = d.secretKey
else delete process.env.STRIPE_SECRET_KEY

if (d.mode === 'run' && d.webhookSecret) process.env.STRIPE_WEBHOOK_SECRET = d.webhookSecret
else delete process.env.STRIPE_WEBHOOK_SECRET

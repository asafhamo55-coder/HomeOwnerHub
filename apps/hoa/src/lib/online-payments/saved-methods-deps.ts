// Test seam for app/resident/dues/methods/actions.ts. A 'use server' file may
// export only async functions, so the swappable port and database live here.

import { createAdminClient } from '@homeowner-portal/db'
import { getSavedMethodsPort } from './saved-methods-stripe'
import type { SavedMethodsStripePort } from './saved-methods'
import type { HandlerDb } from './saved-method-webhooks'

export const deps: { port: () => SavedMethodsStripePort | null; db: () => HandlerDb } = {
  port: getSavedMethodsPort,
  db: () => createAdminClient() as unknown as HandlerDb,
}

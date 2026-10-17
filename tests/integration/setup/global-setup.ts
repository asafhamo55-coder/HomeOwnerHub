// vitest globalSetup: runs once in the main process, around the whole run.
// See suite-lock.ts for why both guards exist.
import { LOCAL_DB_URL, assertLoopbackOrDie } from './env'
import { acquireSuiteLock, preventIdleSleep } from './suite-lock'

export default async function setup(): Promise<() => Promise<void>> {
  assertLoopbackOrDie(LOCAL_DB_URL.replace(/^postgresql/, 'http'))
  const allowSleep = preventIdleSleep()
  let release: () => Promise<void>
  try {
    release = await acquireSuiteLock(LOCAL_DB_URL, 'integration')
  } catch (e) {
    allowSleep()
    throw e
  }
  return async () => {
    await release()
    allowSleep()
  }
}

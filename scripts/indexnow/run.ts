// CLI entry for IndexNow submission. Always runs main (no "am I the entry
// file" check) and always exits 0: a failed submission must never fail a deploy.
import { main } from './submit'

main(process.argv.slice(2))
  .catch((err: unknown) => {
    console.warn(`indexnow: warning: ${err instanceof Error ? err.name : 'error'} (deploy unaffected)`)
  })
  .finally(() => {
    process.exitCode = 0
  })

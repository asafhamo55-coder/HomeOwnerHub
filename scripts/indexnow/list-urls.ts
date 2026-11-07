// Prints the real sitemap URLs as JSON. Used by submit.test.ts, which cannot
// import the sitemap itself under the root vitest config (its "@" alias
// points at apps/hoa).
import { loadSitemap } from './submit'

loadSitemap().then(({ urls }) => {
  process.stdout.write(JSON.stringify(urls))
})

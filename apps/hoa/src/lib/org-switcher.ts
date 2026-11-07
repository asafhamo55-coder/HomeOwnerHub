// Numbers shared by the org switcher (a client component) and the server
// code behind it. Kept apart from lib/orgs.ts, which imports next/headers
// and so cannot be bundled into the browser.

/** More communities than this and the switcher shows a search box. */
export const SWITCHER_SEARCH_THRESHOLD = 8

/** Most results one search page returns. */
export const SWITCHER_SEARCH_PAGE_SIZE = 20

/** Pages the search will serve (50 x 20); past it, type more of the name. */
export const SWITCHER_SEARCH_MAX_PAGES = 50

/** Longest search text sent to the server. */
export const SWITCHER_SEARCH_MAX_CHARS = 80

/** Escape `%`, `_` and `\` so search text is matched literally by ILIKE. */
export function escapeLike(text: string): string {
  return text.replace(/[\\%_]/g, (c) => `\\${c}`)
}

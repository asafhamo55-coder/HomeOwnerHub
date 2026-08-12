/**
 * Test-only helper for enforcing the "background-color implies color" email
 * safety constraint.
 *
 * WHY THIS EXISTS: the obvious way to check this is
 *
 *   expect(styleValue).toContain('color:')
 *
 * and it is wrong. The string `"background-color:#F1F3F5;padding:18px;"`
 * — a style with NO foreground colour at all — contains the substring
 * `"color:"` as part of `"background-color:"` itself. That assertion can
 * never fail on the one input it exists to catch, and it shipped in two
 * test files (meter.test.ts, community-templates/render.test.ts) for the
 * lifetime of this project without anyone noticing, because a vacuous
 * assertion looks exactly like a passing one.
 *
 * The same trap generalizes: `border-color:`, `outline-color:`, and any
 * future `*-color` property all contain the substring `"color:"` without
 * being a real foreground colour declaration. A correct check has to
 * require that `color` appear as an actual CSS *property name* — i.e. right
 * at the start of a declaration or immediately after a `;` (with optional
 * whitespace) — never merely as a trailing substring of some other
 * property's name.
 */

/** True if `style` contains a declaration for CSS property `prop`, matched
 *  only at a genuine declaration boundary (start of string, or right after
 *  a `;`, with optional whitespace) — never as a substring of some other
 *  property name (so `background-color:` does not count as `color:`, and
 *  `border-color:` / `outline-color:` do not either). */
function hasDeclaration(style: string, prop: string): boolean {
  const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:`, 'i')
  return re.test(style)
}

/**
 * Scans an HTML string for every inline `style="..."` attribute that sets
 * `background-color` but does not also set a genuine `color` in the same
 * attribute. Returns the raw offending style-attribute values, in
 * document order, one per violating element.
 *
 * An empty array means the constraint holds everywhere in the input.
 */
export function findBackgroundWithoutColor(html: string): string[] {
  const violations: string[] = []
  for (const m of html.matchAll(/style="([^"]*)"/g)) {
    const style = m[1]
    if (hasDeclaration(style, 'background-color') && !hasDeclaration(style, 'color')) {
      violations.push(style)
    }
  }
  return violations
}

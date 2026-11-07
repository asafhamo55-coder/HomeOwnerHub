import { cleanManagedBy, MAX_MANAGED_BY_LENGTH } from '@/lib/managed-by'

/**
 * The "Managed by" line at the foot of a printed letter (Settings, Association,
 * "Managed by"). One shared component so no letter formats it on its own.
 * React escapes the text; it is also cleaned and capped here so a value that
 * did not come through the settings form is still plain text. Renders nothing
 * when the line is empty.
 */
export function ManagedByFooter({ line, className = '' }: { line?: string | null; className?: string }) {
  const text = cleanManagedBy(line).slice(0, MAX_MANAGED_BY_LENGTH).trim()
  if (!text) return null
  return (
    <p data-managed-by className={`mt-6 border-t border-black pt-2 text-[10pt] text-black ${className}`}>
      {text}
    </p>
  )
}

import { cleanManagedBy, MAX_MANAGED_BY_LENGTH } from '@/lib/managed-by'

/**
 * The "Managed by" line at the foot of a printed letter (Settings, Association,
 * "Managed by"). One shared component so no letter formats it on its own.
 * React escapes the text; it is also cleaned and capped here so a value that
 * did not come through the settings form is still plain text. Renders nothing
 * when the line is empty.
 */
export function ManagedByFooter({ line, compact = false }: { line?: string | null; compact?: boolean }) {
  const text = cleanManagedBy(line).slice(0, MAX_MANAGED_BY_LENGTH).trim()
  if (!text) return null
  return (
    <p
      data-managed-by
      className={`break-inside-avoid break-before-avoid border-t border-black text-[10pt] text-black ${compact ? 'mt-2 pt-1' : 'mt-6 pt-2'}`}
    >
      {text}
    </p>
  )
}

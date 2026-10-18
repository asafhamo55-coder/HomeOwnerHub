// "Log note" on the property page: a dated, append-only note in the
// home's history (property_events kind 'note'). Pure validation, shared by
// the dialog and the server action so both say the same thing.

export const NOTE_MAX = 2000

export type NoteCheck = { ok: true; note: string } | { ok: false; error: string }

export function checkNote(raw: unknown): NoteCheck {
  const note = typeof raw === 'string' ? raw.trim() : ''
  if (!note) return { ok: false, error: 'Write the note first.' }
  if (note.length > NOTE_MAX) return { ok: false, error: `Keep the note under ${NOTE_MAX.toLocaleString('en-US')} characters.` }
  return { ok: true, note }
}

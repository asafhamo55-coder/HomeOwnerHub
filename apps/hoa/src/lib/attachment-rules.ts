// Plain module — deliberately NOT 'use server'. `submission-attachments.ts`
// carries 'use server', and Next only permits async function exports from
// such a module, so its limits cannot be imported by a client component
// from there. These constants live here and are imported by both sides,
// keeping one source of truth for what the server will actually accept.

export const ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024 // 10 MB

/** Everything the submission-attachment server action accepts. */
export const ATTACHMENT_ALLOWED_TYPES: ReadonlySet<string> = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/gif',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
])

/**
 * The image-only subset, for the report-time photo picker. A resident
 * reporting what they are standing in front of is attaching a photo, not
 * a spreadsheet — offering the full set here would invite confusion.
 * `image/heic` matters: it is what an iPhone produces by default.
 */
export const PHOTO_ALLOWED_TYPES: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/gif',
])

/** `accept` attribute value for the photo file inputs. */
export const PHOTO_ACCEPT = Array.from(PHOTO_ALLOWED_TYPES).join(',')

/** Structural stand-in for the DOM `File`, so this module stays node-testable. */
export interface PickedFile {
  name: string
  size: number
  type: string
}

export interface PhotoValidation<T> {
  accepted: T[]
  rejected: Array<{ name: string; reason: string }>
}

/**
 * Client-side courtesy check, not a control. The server re-validates in
 * `uploadSubmissionAttachment`; this exists so an oversized photo fails
 * instantly instead of after a slow upload over mobile data.
 */
export function validatePhotoFiles<T extends PickedFile>(
  files: readonly T[],
): PhotoValidation<T> {
  const accepted: T[] = []
  const rejected: Array<{ name: string; reason: string }> = []

  for (const file of files) {
    if (file.size === 0) {
      rejected.push({ name: file.name, reason: 'File is empty' })
    } else if (file.size > ATTACHMENT_MAX_BYTES) {
      rejected.push({ name: file.name, reason: 'Over the 10 MB limit' })
    } else if (!PHOTO_ALLOWED_TYPES.has(file.type)) {
      rejected.push({ name: file.name, reason: 'Not a supported image' })
    } else {
      accepted.push(file)
    }
  }

  return { accepted, rejected }
}

export interface PhotoUploadOutcome {
  name: string
  ok: boolean
}

export interface PhotoUploadSummary {
  allSucceeded: boolean
  failedNames: string[]
  /** Null when there is nothing worth telling the resident. */
  message: string | null
}

/**
 * The report is created before its photos upload, so a photo failure never
 * means the report was lost. The message leads with that fact — a resident
 * who reads "did not upload" first will assume they have to start over,
 * and will either refile a duplicate or give up.
 */
export function summarizePhotoUploads(
  outcomes: readonly PhotoUploadOutcome[],
): PhotoUploadSummary {
  const failedNames = outcomes.filter((o) => !o.ok).map((o) => o.name)
  if (failedNames.length === 0) {
    return { allSucceeded: true, failedNames: [], message: null }
  }

  const count = failedNames.length
  const noun = count === 1 ? 'photo' : 'photos'
  const object = count === 1 ? 'it' : 'them'
  return {
    allSucceeded: false,
    failedNames,
    message:
      `Your report was submitted. ${count} ${noun} did not upload ` +
      `(${failedNames.join(', ')}) — you can add ${object} from the report page.`,
  }
}

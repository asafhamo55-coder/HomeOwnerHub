/** Shown when the signed URL could not be made or the request threw. */
export const OPEN_DOCUMENT_ERROR = "Couldn't open that file. Try again."

interface OpenDocumentDeps {
  /** The `getVendorDocumentSignedUrl` server action. */
  getUrl: (storagePath: string) => Promise<string | null>
  open: (url: string) => void
  onError: (message: string) => void
}

/**
 * Fetch a short-lived signed URL for an uploaded vendor document and open it
 * in a new tab. Pure on purpose, so the client component can pass in the
 * server action and the behaviour stays testable.
 */
export async function openVendorDocument(
  storagePath: string,
  { getUrl, open, onError }: OpenDocumentDeps,
): Promise<boolean> {
  try {
    const url = await getUrl(storagePath)
    if (url) {
      open(url)
      return true
    }
  } catch {
    // fall through to the error message
  }
  onError(OPEN_DOCUMENT_ERROR)
  return false
}

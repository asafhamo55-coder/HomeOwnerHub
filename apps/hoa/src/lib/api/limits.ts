// Shared request-size limits (RC-8). One number per kind of input, so two
// upload routes cannot drift to 25 MB vs 50 MB again (C-07).

/** Every file upload, every route. Matches the 25 MB the upload routes already used. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024

/** Default cap on a JSON request body (parseJson). Raise per route only with a reason. */
export const MAX_JSON_BYTES = 1024 * 1024

/** Multipart bodies carry one upload plus a few small fields. */
export const MAX_FORM_BYTES = MAX_UPLOAD_BYTES + 1024 * 1024

/** Names, titles, subjects, single-line fields. */
export const MAX_SHORT_TEXT = 500

/** Free text a person typed: descriptions, notes, a letter body. */
export const MAX_LONG_TEXT = 20_000

/** Pasted / extracted documents and transcripts fed to the AI. */
export const MAX_DOCUMENT_TEXT = 500_000

/** Any client-supplied array (line items, tags, field lists). */
export const MAX_ARRAY_ITEMS = 100

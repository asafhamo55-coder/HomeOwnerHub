// Bounds for the "Request updated certificate" email (BL-083). Its own
// module so the client dialog can import them without pulling in the
// server-only settings code (node:crypto).
export const COI_REQUEST_SUBJECT_MAX = 200
export const COI_REQUEST_BODY_MAX = 5000

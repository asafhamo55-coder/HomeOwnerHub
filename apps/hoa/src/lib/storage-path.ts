// Storage-path ownership checks (BL-175a). A client-supplied storage path is
// attacker-controlled: before the server signs it or records it, it must
// provably sit inside the caller's org prefix. Not a 'use server' file so
// the pure helpers can be exported and unit-tested.

/** No traversal segments, no empty segments, no backslashes or control characters. */
function isCleanPath(path: string): boolean {
  if (!path || path.includes('\\') || /[\u0000-\u001f]/.test(path)) return false
  return !path.split('/').some((seg) => seg === '..' || seg === '.' || seg === '')
}

/** True when `path` is a file inside `${orgId}/` (the org's storage prefix). */
export function isOrgStoragePath(path: unknown, orgId: string): boolean {
  if (typeof path !== 'string' || !orgId || !isCleanPath(path)) return false
  return path.startsWith(`${orgId}/`) && path.length > orgId.length + 1
}

/** True when `path` is `${orgId}/submissions/<type>/<parentId>/<file>`. */
export function isSubmissionAttachmentPath(
  path: unknown,
  orgId: string,
  threadType: string,
  parentId: string,
): boolean {
  if (typeof path !== 'string') return false
  const prefix = `${orgId}/submissions/${threadType}/${parentId}/`
  return path.startsWith(prefix) && path.length > prefix.length && isCleanPath(path)
}

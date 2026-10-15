// Storage deletes that report when they did nothing.
//
// storage.remove() returns the objects it actually deleted. When RLS
// filters every row out it returns an empty list and NO error, so a
// caller that only checks `error` reports success while the file stays
// on disk. Before 0059 that was every user-scoped remove() in this app.
// Treat "fewer deleted than requested" as a failure.
//
// Logs bucket, counts and a caller-supplied context only — never the
// paths, which embed user-supplied file names.

export interface StorageRemover {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): PromiseLike<{
        data: unknown[] | null
        error: { message: string } | null
      }>
    }
  }
}

/** Returns null on success, or an error message. */
export async function removeStorageObjects(
  client: StorageRemover,
  bucket: string,
  paths: string[],
  context: string,
): Promise<string | null> {
  if (paths.length === 0) return null
  const { data, error } = await client.storage.from(bucket).remove(paths)
  if (error) {
    console.error(`[storage] remove failed (${context}) bucket=${bucket} requested=${paths.length}: ${error.message}`)
    return error.message
  }
  const deleted = data?.length ?? 0
  if (deleted < paths.length) {
    console.error(`[storage] remove incomplete (${context}) bucket=${bucket} requested=${paths.length} deleted=${deleted}`)
    return 'The file was not removed from storage.'
  }
  return null
}

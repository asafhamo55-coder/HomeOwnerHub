import { describe, expect, it, vi } from 'vitest'
import { OPEN_DOCUMENT_ERROR, openVendorDocument } from './open-document'

const PATH = 'org-1/vendors/v-1/coi/a.pdf'

describe('openVendorDocument', () => {
  it('asks the action for the document and opens the signed url', async () => {
    const getUrl = vi.fn().mockResolvedValue('https://signed.example/a.pdf')
    const open = vi.fn()
    const onError = vi.fn()
    expect(await openVendorDocument(PATH, { getUrl, open, onError })).toBe(true)
    expect(getUrl).toHaveBeenCalledWith(PATH)
    expect(open).toHaveBeenCalledWith('https://signed.example/a.pdf')
    expect(onError).not.toHaveBeenCalled()
  })

  it('shows the error when the action returns nothing', async () => {
    const open = vi.fn()
    const onError = vi.fn()
    expect(await openVendorDocument(PATH, { getUrl: async () => null, open, onError })).toBe(false)
    expect(open).not.toHaveBeenCalled()
    expect(onError).toHaveBeenCalledWith(OPEN_DOCUMENT_ERROR)
  })

  it('shows the error when the action throws', async () => {
    const onError = vi.fn()
    await openVendorDocument(PATH, {
      getUrl: async () => {
        throw new Error('network')
      },
      open: vi.fn(),
      onError,
    })
    expect(onError).toHaveBeenCalledWith("Couldn't open that file. Try again.")
  })
})

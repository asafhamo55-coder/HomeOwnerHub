import { beforeEach, describe, expect, it, vi } from 'vitest'

const toString = vi.hoisted(() => vi.fn(async () => '<svg></svg>'))
vi.mock('qrcode', () => ({ default: { toString } }))
vi.mock('@/lib/app-origin', () => ({ appUrl: (p: string) => `https://app.example.org${p}` }))

import { appUrl } from '@/lib/app-origin'
import { JOIN_PATH, NOTICE_STEPS, joinQrSvg } from './join-notice'

beforeEach(() => vi.clearAllMocks())

describe('joinQrSvg', () => {
  it('encodes exactly appUrl("/join"), as black on white svg', async () => {
    const svg = await joinQrSvg(appUrl(JOIN_PATH))
    expect(svg).toBe('<svg></svg>')
    expect(toString).toHaveBeenCalledTimes(1)
    const [text, opts] = toString.mock.calls[0] as unknown as [string, Record<string, unknown>]
    expect(text).toBe('https://app.example.org/join')
    expect(opts).toMatchObject({ type: 'svg', color: { dark: '#000000', light: '#ffffff' } })
  })
})

describe('notice steps', () => {
  it('tells owners to use an email only they can open and to confirm on the same device', () => {
    const body = NOTICE_STEPS[1].body
    expect(body).toContain('Use an email address only you can open.')
    expect(body).toContain('same phone or computer you used to sign up')
    expect(body).not.toContain('family member\'s email works')
  })
})

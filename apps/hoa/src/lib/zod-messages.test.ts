import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'
import './zod-messages'

const here = path.dirname(fileURLToPath(import.meta.url))

const msg = (schema: z.ZodType, value: unknown): string | undefined => {
  const r = schema.safeParse(value)
  return r.success ? undefined : r.error.issues[0]?.message
}

describe('plain zod messages', () => {
  it('missing values read "Required"', () => {
    expect(msg(z.string(), undefined)).toBe('Required')
    expect(msg(z.string(), null)).toBe('Required')
    expect(msg(z.object({ a: z.string() }), {})).toBe('Required')
  })

  it('number expected', () => {
    expect(msg(z.number(), 'x')).toBe('Enter a number.')
  })

  it('too_big', () => {
    expect(msg(z.string().max(5), 'abcdefg')).toBe('Must be at most 5 characters.')
    expect(msg(z.array(z.string()).max(2), ['a', 'b', 'c'])).toBe('Choose at most 2 items.')
    expect(msg(z.array(z.string()).max(1), ['a', 'b'])).toBe('Choose at most 1 item.')
    expect(msg(z.set(z.string()).max(1), new Set(['a', 'b']))).toBe('Choose at most 1 item.')
    expect(msg(z.number().max(10), 11)).toBe('Must be at most 10.')
  })

  it('too_small', () => {
    expect(msg(z.string().min(1), '')).toBe('Required')
    expect(msg(z.string().min(3), 'ab')).toBe('Must be at least 3 characters.')
    expect(msg(z.array(z.string()).min(2), ['a'])).toBe('Choose at least 2 items.')
    expect(msg(z.array(z.string()).min(1), [])).toBe('Choose at least 1 item.')
    expect(msg(z.number().min(5), 4)).toBe('Must be at least 5.')
  })

  it('invalid_format', () => {
    expect(msg(z.string().email(), 'nope')).toBe('Enter a valid email address.')
    expect(msg(z.string().url(), 'nope')).toBe('Enter a valid web address.')
    expect(msg(z.string().datetime(), 'nope')).toBe('Enter a valid date.')
    expect(msg(z.string().regex(/^a$/), 'b')).toBe('That doesn’t look right.')
    expect(msg(z.string().uuid(), 'b')).toBe('That doesn’t look right.')
  })

  it('invalid_value, union, multiple, unrecognized keys', () => {
    expect(msg(z.enum(['a', 'b']), 'c')).toBe('Pick one of the options.')
    expect(msg(z.union([z.string(), z.number()]), true)).toBe('That value isn’t valid.')
    expect(msg(z.number().multipleOf(5), 3)).toBe('That value isn’t valid.')
    expect(msg(z.object({ a: z.string() }).strict(), { a: 'x', b: 1 })).toBe('Unexpected field.')
  })

  it('schema-level messages and error functions still win', () => {
    expect(msg(z.string().min(2, 'Enter at least 2 characters.'), 'a')).toBe('Enter at least 2 characters.')
    expect(msg(z.enum(['a'], { message: 'Pick a plan.' }), 'z')).toBe('Pick a plan.')
    expect(msg(z.string().email('Email looks invalid.'), 'x')).toBe('Email looks invalid.')
    const fn = z.number({ error: (iss) => (iss.input === undefined ? 'Required' : 'Enter a whole number.') })
    expect(msg(fn, 'x')).toBe('Enter a whole number.')
    expect(msg(z.string({ error: () => 'custom' }), 1)).toBe('custom')
  })

  it('every other type mismatch is plain too', () => {
    expect(msg(z.string(), 5)).toBe('That doesn’t look right.')
    expect(msg(z.boolean(), 'x')).toBe('That doesn’t look right.')
  })

  it('codes without a mapping fall through to zod defaults', () => {
    expect(msg(z.string().refine(() => false), 'x')).toBe('Invalid input')
  })

  it('the four app copies are byte-identical', () => {
    const read = (app: string) =>
      readFileSync(path.resolve(here, '../../..', app, 'src/lib/zod-messages.ts'), 'utf8')
    const hoa = read('hoa')
    for (const app of ['pm', 'eviction', 'marketing']) expect(read(app), app).toBe(hoa)
  })
})

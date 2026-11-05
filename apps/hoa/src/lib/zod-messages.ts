// Plain-language fallbacks for zod 4's default messages.
//
// zod 4 words its defaults for developers ("Invalid input: expected string,
// received undefined"). Those strings reach older, non-technical users
// through API `issues` and through server actions that show
// `issues[0].message`. This restores short, plain wording.
//
// Priority in zod 4: a message on the schema, or an `error:` function on it,
// always wins over this global map. This only fills in where nothing more
// specific was written. Import it for side effects, before any parse.

import { z } from 'zod'

type Issue = {
  code: string
  input?: unknown
  origin?: string
  expected?: string
  maximum?: number | bigint
  minimum?: number | bigint
  format?: string
}

export function plainMessage(iss: Issue): string | undefined {
  switch (iss.code) {
    case 'invalid_type':
      if (iss.input === undefined || iss.input === null) return 'Required'
      if (iss.expected === 'number') return 'Enter a number.'
      return 'That doesn’t look right.'
    case 'too_big': {
      const n = String(iss.maximum)
      if (iss.origin === 'string') return `Must be at most ${n} characters.`
      if (iss.origin === 'array' || iss.origin === 'set') {
        return `Choose at most ${n} ${Number(iss.maximum) === 1 ? 'item' : 'items'}.`
      }
      if (iss.origin === 'number') return `Must be at most ${n}.`
      return undefined
    }
    case 'too_small': {
      const n = String(iss.minimum)
      if (iss.origin === 'string') {
        return Number(iss.minimum) === 1 ? 'Required' : `Must be at least ${n} characters.`
      }
      if (iss.origin === 'array' || iss.origin === 'set') {
        return `Choose at least ${n} ${Number(iss.minimum) === 1 ? 'item' : 'items'}.`
      }
      if (iss.origin === 'number') return `Must be at least ${n}.`
      return undefined
    }
    case 'invalid_format':
      if (iss.format === 'email') return 'Enter a valid email address.'
      if (iss.format === 'url') return 'Enter a valid web address.'
      if (iss.format === 'date' || iss.format === 'datetime') return 'Enter a valid date.'
      return 'That doesn’t look right.'
    case 'invalid_value':
      return 'Pick one of the options.'
    case 'invalid_union':
    case 'not_multiple_of':
      return 'That value isn’t valid.'
    case 'unrecognized_keys':
      return 'Unexpected field.'
    default:
      return undefined
  }
}

z.config({ customError: (iss) => plainMessage(iss as Issue) })

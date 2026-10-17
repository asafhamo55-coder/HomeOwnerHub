import { describe, expect, it } from 'vitest'
import { splitFormErrors } from './field-errors'

describe('splitFormErrors', () => {
  it('field problems go under their fields, with no duplicate alert', () => {
    expect(splitFormErrors({ error: 'Address is required', fieldErrors: { address: 'Address is required' } })).toEqual({
      fields: { address: 'Address is required' },
      form: null,
    })
  })

  it('keeps a form-level problem alongside the field ones (it used to be dropped)', () => {
    expect(
      splitFormErrors({ error: 'x', fieldErrors: { ownerEmail: 'Enter a valid email', _: 'Add an owner or a unit' } }),
    ).toEqual({ fields: { ownerEmail: 'Enter a valid email' }, form: 'Add an owner or a unit' })
  })

  it('no field errors: the message is form-level', () => {
    expect(splitFormErrors({ error: 'No HOA selected.' })).toEqual({ fields: {}, form: 'No HOA selected.' })
    expect(splitFormErrors({ error: 'x', fieldErrors: { _: 'Only form' } })).toEqual({ fields: {}, form: 'Only form' })
  })
})

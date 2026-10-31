/**
 * Thrown by getResidentUnits when a database read behind the resident's
 * home list fails. It is deliberately not an empty list: "No home linked
 * yet" tells a resident their account is wrong when the lookup is. The
 * resident error boundary (app/resident/error.tsx) catches it. The failure
 * itself is reported where it happens (loadOrFail); the message carries no
 * row values.
 */
export class ResidentUnitsLoadError extends Error {
  constructor(what: string) {
    super(`Could not load the resident's homes (${what})`)
    this.name = 'ResidentUnitsLoadError'
  }
}

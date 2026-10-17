/**
 * The association's day (BL-043) — see packages/jobs/src/association-time.ts
 * for the rules. Re-exported so apps/hoa and the jobs share one copy (the
 * jobs cannot import apps/hoa). Pure and browser-safe; the server-side
 * loaders that read an association's state live in association-time-server.ts.
 */
export {
  ASSOCIATION_ZONE_COLUMNS,
  DEFAULT_ASSOCIATION_TIME_ZONE,
  addCalendarDays,
  associationTimeZone,
  calendarDaysBetween,
  dateOnlyCompare,
  dayOf,
  hourIn,
  instantAtLocalTime,
  isValidTimeZone,
  todayIn,
  type AssociationZoneSource,
} from '@homeowner-portal/jobs/association-time'

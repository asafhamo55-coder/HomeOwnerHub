// The pure, client-safe surface of the month-end board report (BL-073) for
// apps/hoa: period math, the opt-out preference and the idempotency key.
// The job factory itself is exported from the package root.
export { MONTHLY_REPORT_CRON, isCompleteMonth, previousMonthIn, reportMonthOf, type ReportMonth } from './period'
export {
  MONTHLY_BOARD_REPORT_PREF,
  NOTIFICATION_PREFS_KEY,
  wantsMonthlyBoardReport,
  withMonthlyBoardReportPref,
} from './prefs'
export {
  MONTHLY_REPORT_EVENT,
  MONTHLY_REPORT_RESOURCE_TYPE,
  monthlyReportCommunicationId,
  runMonthlyReportForOrg,
  type MonthlyReportStore,
  type BuildMonthlyReportInput,
  type MonthlyReportContent,
  type MonthlyReportDeps,
} from './run'

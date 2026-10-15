import { Inngest } from 'inngest'

import { createFailureReportingMiddleware } from './failure-reporting'

// One Inngest app for the whole HomeownerHub workspace. The id needs to
// stay stable across deploys; Inngest dedupes function executions by id.
export const inngest = new Inngest({
  id: 'homeownerhub',
  middleware: [createFailureReportingMiddleware()],
})

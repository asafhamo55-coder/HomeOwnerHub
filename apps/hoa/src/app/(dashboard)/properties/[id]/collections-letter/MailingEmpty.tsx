/**
 * BL-166: a printed Georgia notice with no mailing record yet. Says why to
 * record it; the "Record how and when it was mailed" action follows directly.
 */
export function MailingNotRecorded() {
  return (
    <div data-testid="mailing-not-recorded" className="text-foreground-secondary">
      <p>
        Not recorded yet. The fee and foreclosure clocks count from the day the owner received this notice, so note how and when you mailed it.
      </p>
      <p>Only certified mail or statutory overnight delivery starts a clock.</p>
    </div>
  )
}

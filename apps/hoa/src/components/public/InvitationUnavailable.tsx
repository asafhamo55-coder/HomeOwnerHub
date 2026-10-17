import { Alert, Button, Card, CardContent, CardHeader, CardTitle } from '@homeowner-portal/ui'

/**
 * What a public invitation page (/rfp-bid/[token], /vendor-onboard/[token])
 * shows when its lookup failed on OUR side (BL-056). Distinct from the
 * "this invitation can't be used" state on purpose: the link may be fine,
 * so it must not tell a vendor their link is invalid, expired or used.
 *
 * Takes no error: raw database text never reaches a page (RC-2). The
 * failure was logged by code where it happened.
 *
 * The retry is a plain link to the same page, so it works without JS.
 */
export function InvitationUnavailable({ retryHref }: { retryHref: string }) {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <Card>
        <CardHeader>
          <CardTitle>We couldn’t load this invitation right now</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="warning" title="This is a problem on our side">
            Your link may be fine — nothing about your invitation has changed.
            Please try again in a minute. If it keeps happening, contact the HOA
            that invited you.
          </Alert>
          <Button asChild>
            <a href={retryHref}>Try again</a>
          </Button>
        </CardContent>
      </Card>
    </main>
  )
}

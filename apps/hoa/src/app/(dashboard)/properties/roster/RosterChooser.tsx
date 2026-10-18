import { Button, Card, CardContent, Field, Fieldset, ChoiceGroup, Input, Radio } from '@homeowner-portal/ui'
import { formatDay } from '@/lib/money/format'
import type { RosterKind } from '@/lib/properties/statutory-roster/model'

/**
 * The choice: which document, as of which day. A plain GET form, so the
 * URL (?kind=&asOf=) is the state and a printed page can be re-made.
 * Never printed.
 */
export function RosterChooser({ kind, asOf, today, dateError }: { kind: RosterKind | null; asOf: string; today: string; dateError: string | null }) {
  return (
    <Card className="print:hidden">
      <CardContent className="pt-5">
        <form method="get" action="/properties/roster" className="space-y-5">
          <Fieldset legend="What to produce">
            <ChoiceGroup>
              <Radio
                name="kind"
                value="owners"
                defaultChecked={kind !== 'voters'}
                label="Owner roster"
                description="One row per home: owners and their shares, mailing address, email and phone."
              />
              <Radio
                name="kind"
                value="voters"
                defaultChecked={kind === 'voters'}
                label="Voter list"
                description="One vote per home, the owners eligible on the date, and homes far behind on dues."
              />
            </ChoiceGroup>
          </Fieldset>
          <Field
            label="As of"
            hint={`Your association’s calendar day. Today is ${formatDay(today)}.`}
            error={dateError ?? undefined}
          >
            <Input type="date" name="asOf" defaultValue={asOf} required className="max-w-[12rem]" />
          </Field>
          <Button type="submit">Show roster</Button>
        </form>
      </CardContent>
    </Card>
  )
}

'use client'

import { Checkbox, Field, Fieldset, Input, Select, Textarea } from '@homeowner-portal/ui'
import type { TemplateQuestion } from '@/lib/community-templates/types'
import type { AnswerMap } from '@/lib/community-templates/merge-bag'

interface Props {
  questions: readonly TemplateQuestion[]
  answers: AnswerMap
  onChange: (id: string, value: string | string[]) => void
  /** Per-question errors, keyed by question id. */
  errors?: Record<string, string>
}

/**
 * The declared-questions step. Each question maps 1:1 to a merge field, and
 * the answers become the merge bag — so an unanswered required question here
 * is what stops an email going out with a hole in it.
 */
export function QuestionStep({ questions, answers, onChange, errors = {} }: Props) {
  if (questions.length === 0) return null

  return (
    <div className="space-y-4">
      {questions.map((q) => {
        const value = answers[q.id]
        const error = errors[q.id]

        if (q.type === 'multiselect' && q.options) {
          return (
            <Fieldset
              key={q.id}
              legend={
                <>
                  {q.label}
                  {q.required ? (
                    <span className="ml-1 text-danger" aria-hidden>
                      *
                    </span>
                  ) : null}
                </>
              }
              hint={q.help}
              error={error}
            >
              {q.options.map((opt) => {
                const selected = Array.isArray(value) && value.includes(opt)
                return (
                  <Checkbox
                    key={opt}
                    label={opt}
                    checked={selected}
                    onChange={(e) => {
                      const current = Array.isArray(value) ? value : []
                      onChange(q.id, e.target.checked ? [...current, opt] : current.filter((v) => v !== opt))
                    }}
                  />
                )
              })}
            </Fieldset>
          )
        }

        return (
          <Field key={q.id} label={q.label} required={q.required} hint={q.help} error={error}>
            {q.type === 'select' && q.options ? (
              <Select
                value={typeof value === 'string' ? value : ''}
                onValueChange={(v) => onChange(q.id, v)}
                placeholder="Choose…"
                required={q.required}
              >
                {q.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </Select>
            ) : q.type === 'textarea' ? (
              <Textarea
                rows={3}
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => onChange(q.id, e.target.value)}
              />
            ) : (
              <Input
                type={
                  q.type === 'date'
                    ? 'date'
                    : q.type === 'time'
                      ? 'time'
                      : q.type === 'number'
                        ? 'number'
                        : 'text'
                }
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => onChange(q.id, e.target.value)}
              />
            )}
          </Field>
        )
      })}
    </div>
  )
}

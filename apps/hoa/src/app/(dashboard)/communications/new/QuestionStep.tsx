'use client'

import type { TemplateQuestion } from '@/lib/community-templates/types'
import type { AnswerMap } from '@/lib/community-templates/merge-bag'

interface Props {
  questions: readonly TemplateQuestion[]
  answers: AnswerMap
  onChange: (id: string, value: string | string[]) => void
}

/**
 * The declared-questions step. Each question maps 1:1 to a merge field, and
 * the answers become the merge bag — so an unanswered required question here
 * is what stops an email going out with a hole in it.
 */
export function QuestionStep({ questions, answers, onChange }: Props) {
  if (questions.length === 0) return null

  return (
    <div className="space-y-4">
      {questions.map((q) => {
        const value = answers[q.id]
        const id = `q-${q.id}`

        return (
          <div key={q.id} className="space-y-1">
            <label htmlFor={id} className="block text-sm font-medium text-gray-900">
              {q.label}
              {q.required && (
                <span className="ml-1 text-red-600" aria-hidden="true">
                  *
                </span>
              )}
            </label>

            {q.type === 'multiselect' && q.options ? (
              <fieldset
                className="space-y-1"
                aria-required={q.required}
                aria-describedby={q.help ? `${id}-help` : undefined}
              >
                <legend className="sr-only">{q.label}</legend>
                {q.options.map((opt) => {
                  const selected = Array.isArray(value) && value.includes(opt)
                  return (
                    <label key={opt} className="flex items-center gap-2 text-sm text-gray-700">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          const current = Array.isArray(value) ? value : []
                          onChange(
                            q.id,
                            e.target.checked
                              ? [...current, opt]
                              : current.filter((v) => v !== opt),
                          )
                        }}
                      />
                      {opt}
                    </label>
                  )
                })}
              </fieldset>
            ) : q.type === 'select' && q.options ? (
              <select
                id={id}
                aria-required={q.required}
                className="w-full rounded border-gray-300 text-sm"
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => onChange(q.id, e.target.value)}
                aria-describedby={q.help ? `${id}-help` : undefined}
              >
                <option value="">— choose —</option>
                {q.options.map((opt) => (
                  <option key={opt} value={opt}>
                    {opt}
                  </option>
                ))}
              </select>
            ) : q.type === 'textarea' ? (
              <textarea
                id={id}
                rows={3}
                aria-required={q.required}
                className="w-full rounded border-gray-300 text-sm"
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => onChange(q.id, e.target.value)}
                aria-describedby={q.help ? `${id}-help` : undefined}
              />
            ) : (
              <input
                id={id}
                type={
                  q.type === 'date'
                    ? 'date'
                    : q.type === 'time'
                      ? 'time'
                      : q.type === 'number'
                        ? 'number'
                        : 'text'
                }
                aria-required={q.required}
                className="w-full rounded border-gray-300 text-sm"
                value={typeof value === 'string' ? value : ''}
                onChange={(e) => onChange(q.id, e.target.value)}
                aria-describedby={q.help ? `${id}-help` : undefined}
              />
            )}

            {q.help && (
              <p id={`${id}-help`} className="text-xs text-gray-500">
                {q.help}
              </p>
            )}
          </div>
        )
      })}
    </div>
  )
}

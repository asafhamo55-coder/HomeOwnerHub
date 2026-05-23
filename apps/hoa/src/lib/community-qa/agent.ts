// Community Q&A agent — tool-using LLM loop.
//
// Talks to the Groq OpenAI-compatible /chat/completions endpoint via
// plain fetch (no SDK dep). The LLM is given the tool definitions from
// tools.ts and decides which to call. Each tool result is fed back as
// a `tool` role message until the LLM returns a final assistant
// message with no further tool_calls.
//
// Why no openai SDK: it lives in packages/workflows but not apps/hoa.
// Adding it would be one more dep on an already-large package. The
// REST surface we use is ~50 lines of straightforward JSON.
//
// Loop bound: MAX_STEPS prevents an infinite tool-call cycle when the
// model gets stuck. 8 is plenty for the realistic question depth.

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@homeowner-portal/db/types'
import { TOOLS, TOOL_BY_NAME } from './tools'

type Db = SupabaseClient<Database>

const MAX_STEPS = 8

const SYSTEM_PROMPT = `You are a community-data assistant for an HOA management platform.

Answer questions about the community by calling the provided tools. Each tool returns structured JSON — read it carefully and summarize the result in plain English. Cite specific numbers and names from the tool output.

Style:
- Be concise — 1–3 sentences for simple questions, a short bulleted list when listing rows.
- Show $ amounts as "$1,234" (no decimals unless smaller than $10).
- Show dates as "Jan 15, 2026".
- If a tool returns 0 results, say so directly — don't make up data.
- If you can't answer with the available tools, say "I don't have a tool for that yet — try asking about dues, properties, violations, or meetings."

Never:
- Invent data not present in tool results.
- Reference data from other organizations or communities.
- Speculate about reasons for trends — stick to the facts.`

interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content?: string | null
  tool_call_id?: string
  tool_calls?: ToolCall[]
  name?: string
}

interface ToolCall {
  id: string
  type: 'function'
  function: { name: string; arguments: string }
}

export interface AgentResult {
  answer: string
  toolCalls: Array<{ name: string; args: Record<string, unknown>; result: unknown }>
  steps: number
}

export async function askCommunity(
  question: string,
  ctx: { db: Db; orgId: string },
): Promise<AgentResult> {
  const apiKey = process.env.AI_API_KEY
  const baseUrl = process.env.AI_BASE_URL ?? 'https://api.groq.com/openai/v1'
  const model = process.env.AI_MODEL ?? 'llama-3.3-70b-versatile'
  if (!apiKey) {
    throw new Error('AI_API_KEY not set on the server.')
  }

  const tools = TOOLS.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.def.name,
      description: t.def.description,
      parameters: t.def.parameters,
    },
  }))

  const messages: ChatMessage[] = [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: question },
  ]

  const toolCallLog: AgentResult['toolCalls'] = []

  for (let step = 1; step <= MAX_STEPS; step++) {
    const res = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        temperature: 0.1,
      }),
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`LLM call failed: HTTP ${res.status} — ${errText.slice(0, 200)}`)
    }

    const body = (await res.json()) as {
      choices: Array<{
        message: {
          role: 'assistant'
          content: string | null
          tool_calls?: ToolCall[]
        }
        finish_reason: string
      }>
    }

    const choice = body.choices?.[0]
    if (!choice) {
      throw new Error('LLM returned no choices.')
    }

    const msg = choice.message
    messages.push({
      role: 'assistant',
      content: msg.content,
      tool_calls: msg.tool_calls,
    })

    // No tool calls → final answer.
    if (!msg.tool_calls || msg.tool_calls.length === 0) {
      return {
        answer: msg.content?.trim() ?? '(no answer)',
        toolCalls: toolCallLog,
        steps: step,
      }
    }

    // Execute each requested tool, append a `tool` message per call.
    for (const tc of msg.tool_calls) {
      const tool = TOOL_BY_NAME[tc.function.name]
      let parsedArgs: Record<string, unknown> = {}
      try {
        parsedArgs = tc.function.arguments
          ? (JSON.parse(tc.function.arguments) as Record<string, unknown>)
          : {}
      } catch {
        /* fall through with empty args; tool will surface the issue */
      }

      let result: unknown
      if (!tool) {
        result = { error: `unknown tool: ${tc.function.name}` }
      } else {
        try {
          result = await tool.execute(parsedArgs, ctx)
        } catch (err) {
          result = {
            error: err instanceof Error ? err.message : 'tool execution failed',
          }
        }
      }

      toolCallLog.push({ name: tc.function.name, args: parsedArgs, result })

      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.function.name,
        content: JSON.stringify(result),
      })
    }
  }

  // Loop bound exhausted — model couldn't resolve. Return what we have.
  return {
    answer:
      "I couldn't finish answering that within the step budget. Try a more specific question, or break it into smaller pieces.",
    toolCalls: toolCallLog,
    steps: MAX_STEPS,
  }
}

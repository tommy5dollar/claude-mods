/**
 * The pure half of effort-router: the levels, the classifier prompt, the
 * transcript trimming, parsing the classifier's reply, the /er grammar and
 * the text the mod shows. No `$`, no engine: `bun test` runs it directly.
 *
 * Policy source: Anthropic, "Using Claude Code: Spending your effort",
 * Thariq Shihipar, 2026-09-25 (https://claude.dev/blog/spending-your-effort/).
 */

export type Level = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

export const LEVELS: readonly Level[] = ['low', 'medium', 'high', 'xhigh', 'max']

export const isLevel = (value: unknown): value is Level =>
  typeof value === 'string' && (LEVELS as readonly string[]).includes(value)

export const rank = (level: Level): number => LEVELS.indexOf(level)

// --- the classifier prompt -----------------------------------------------------

/** The highest level the router picks unless the `highestLevel` option says otherwise. Max rarely beats xhigh. */
export const DEFAULT_HIGHEST: Level = 'xhigh'

/** The levels a check may pick: low up to `highest`. */
export const levelsUpTo = (highest: Level = DEFAULT_HIGHEST): readonly Level[] => LEVELS.slice(0, LEVELS.indexOf(highest) + 1)

/** A level held inside `levels` (a run of adjacent levels): the nearest end when it falls outside. */
export function clampLevel(level: Level, levels: readonly Level[]): Level {
  const lowest = levels[0]
  const highest = levels[levels.length - 1]
  if (lowest === undefined || highest === undefined) return level
  return rank(level) < rank(lowest) ? lowest : rank(level) > rank(highest) ? highest : level
}

/**
 * The fixed frame around the routing rules. It describes the job and how to
 * read a transcript, but never ties a kind of task to a level: what a level
 * can do differs by model, and the model notes say it. (An eval on 2026-10-04
 * showed a frame whose examples named levels overrode the notes.) The rules
 * (`rules/default.md` and the user's files) hold the principles for choosing.
 */
export const classifierFrame = (levels: readonly Level[] = levelsUpTo()): string => `You pick the reasoning-effort level for a whole Claude Code session from its transcript. Levels you may pick, lowest to highest: ${levels.join(', ')}.

Level names don't mean the same thing on every model: each level buys a different amount of thinking, and different behaviour, on each. Judge what this session needs on the model it runs on, using what the notes below say each level can do there.

When to answer undecided, and when to suggest:
- Answer undecided ONLY when no actionable task has been stated yet: greetings, setup or housekeeping ("pull the latest code", "install the deps", "what's in this repo?"), or pure questions asked before any work. That opening filler is not the task.
- Once the user has stated a real task, suggest the best level for it NOW, even if the details are still unclear. Do not wait for a full spec: you are asked again after each of the user's first few messages and the level is refined as clarification arrives. Unclear details are a reason to pick the level the task most likely needs, never a reason to answer undecided.

Judge the task as it stands now:
- Weigh the latest exchange most. A later clarification of scope overrides an earlier ask: "fix the whole auth system" followed by "actually just the typo in the login message" is a small change.
- Read short replies against the question they answer. If the assistant asked "1. full rewrite or 2. minimal patch?" and the user replied "2", the task is the minimal patch. Answers to the assistant's multiple-choice questions are the user's words about the task.
- If a user hint is given, the user asked for this routing explicitly: weigh the hint strongly.

How sure you are:
- Give each level you may pick a probability that it is the right level for the work from here. They sum to 1.
- Spread the probability where you are torn. If the task clearly needs more than the level the session is on but you can't tell high from xhigh, say so (for example medium 0.1, high 0.5, xhigh 0.4) rather than naming one level and sounding unsure of it.
- The router moves the session only when you are sure its current level is wrong in one direction, and then to the middle of your spread, so be honest rather than decisive.
- Put most of the probability on one level only when the task, and what makes it easy or hard, is clear and more conversation is unlikely to move it.

Worked examples of reading a transcript (what level each needs depends on the model, so none is shown):
1. USER: hi → {"decision":"undecided"}
2. USER: pull the latest code → {"decision":"undecided"}
3. USER: what's in this repo? / ASSISTANT: A Next.js storefront with a Postgres backend. → {"decision":"undecided"}
4. USER: pull latest code / ASSISTANT: Pulled, 3 new commits. / USER: implement for me a new finance solution pulling from multiple accountancy platforms → a level for the finance build. The filler before it doesn't matter, and the details not being settled is no reason to wait.
5. USER: fix the whole auth system / ASSISTANT: Where should I start? / USER: actually just the typo in the login message → a level for a one-word typo fix.
6. USER: refactor the payment retry logic / ASSISTANT: 1. a full rewrite with a state machine or 2. just extract the backoff constant? / USER: 2, keep it simple → a level for extracting one constant.
7. USER: build a sync job for our invoices / ASSISTANT asked: Which platforms? [options: Xero | QuickBooks | Sage] / USER answered: Xero and QuickBooks, nightly, EU data residency → a level for a nightly two-platform invoice sync.

Principles for choosing. Later rules override earlier ones where they conflict:`

/** The frame at the default highest level. */
export const CLASSIFIER_FRAME = classifierFrame()

export const classifierContract = (levels: readonly Level[] = levelsUpTo()): string => `Reply with exactly one JSON object and nothing else:
{"decision":"undecided"}
or
{"decision":"level","levels":{${levels.map(level => `"${level}":<0 to 1>`).join(',')}},"reason":"<what the task is, 3-8 words, e.g. bug fix in existing code>","why":"<one or two sentences: why the work needs about this much effort on this model, and what would tip it a level either way>"}
"levels" gives the probability that each level is the right one for the work from here, summing to 1.`

export const CLASSIFIER_CONTRACT = classifierContract()

/** What effort means on a model: its name and the notes in `rules/models/`. */
export type ModelNotes = { name: string; notes: string }

const modelBlock = (model: ModelNotes | undefined, who: string): string =>
  model && model.notes.trim() !== ''
    ? `\n\n${who} ${model.name}. What each level can do on this model (the main guide to the level):\n<model_notes>\n${model.notes.trim()}\n</model_notes>`
    : ''

/** The classifier's whole system prompt around the composed rules, with the session model's notes when there are any. */
export const classifierSystem = (rules: string, model?: ModelNotes, levels: readonly Level[] = levelsUpTo()): string =>
  `${classifierFrame(levels)}\n\n<rules>\n${rules.trim()}\n</rules>${modelBlock(model, 'The session runs on')}\n\n${classifierContract(levels)}`

/**
 * The one message a check sends into a fork of the session (`$.model.fork`):
 * the whole conversation as the session's model last saw it, its own system
 * prompt, CLAUDE.md and memory included, then this. A fork replays the last
 * request, which does not hold the reply it produced, so that reply comes
 * along here, as do the prompt being submitted and, mid-turn, the answers the
 * user just gave to the model's questions.
 */
export function forkPrompt(input: { rules: string; model?: ModelNotes; current?: string; lastReply?: string; hint?: string; answered?: string; levels?: readonly Level[]; inForce?: Level }): string {
  const parts = [
    'Pause the task for a moment. Do not use any tools and do not carry on with the work: answer only the question below.',
    classifierSystem(input.rules, input.model, input.levels),
  ]
  const lastReply = input.lastReply?.trim()
  if (lastReply) parts.push(`Your last reply in this conversation, which is not shown above:\n<last_reply>\n${lastReply}\n</last_reply>`)
  const answered = input.answered?.trim()
  if (answered) parts.push(`You asked the user questions, and they have just answered:\n<answers>\n${answered}\n</answers>`)
  const current = input.current?.trim()
  if (current) parts.push(`The user has just sent this new message, and the work goes on from it:\n<new_message>\n${current}\n</new_message>`)
  const hint = input.hint?.trim()
  if (hint) parts.push(`<user_hint>\n${hint}\n</user_hint>\nThe user asked for this routing explicitly and gave this hint; weigh it strongly.`)
  if (input.inForce) parts.push(`The session is at ${input.inForce} effort now.`)
  parts.push("The transcript is this conversation: everything above, with your instructions, CLAUDE.md and memory. Suggest the session's effort level now; answer undecided only if no actionable task has been stated yet. JSON only.")
  return parts.join('\n\n')
}

// --- rule files and their composition ---------------------------------------------

/** The line that splices in the layer beneath (shipped defaults, then the user's). */
export const DEFAULTS_MARKER = '$defaults'

export type RuleLayer = {
  /** Where it came from, for `/er rules` (a path or `defaults`). */
  source: string
  /** The file's text; undefined when the file is absent or unreadable. */
  text: string | undefined
}

export type ComposedRules = {
  text: string
  /** Each layer that contributed, bottom first, and how. */
  contributors: { source: string; how: 'base' | 'spliced' | 'replaced' }[]
}

const stripComments = (text: string): string => text.replace(/<!--[\s\S]*?-->/g, '')

/**
 * Composes rule layers bottom-up. The first layer is the base (the shipped
 * defaults). Each later layer that exists and has content either splices the
 * result so far wherever it has a line that is exactly `$defaults`, or, with
 * no such line, replaces it. An absent, unreadable or empty layer changes
 * nothing. HTML comments are dropped (the starter file's example lives in one).
 */
export function composeRules(layers: readonly RuleLayer[]): ComposedRules {
  let text = ''
  const contributors: ComposedRules['contributors'] = []

  layers.forEach((layer, index) => {
    if (layer.text === undefined) return
    const body = stripComments(layer.text)
    if (index === 0) {
      text = body.trim()
      contributors.push({ source: layer.source, how: 'base' })
      return
    }
    const lines = body.split(/\r?\n/)
    const hasMarker = lines.some(line => line.trim() === DEFAULTS_MARKER)
    const meaningful = lines.some(line => line.trim() !== '' && line.trim() !== DEFAULTS_MARKER)
    if (!meaningful && !hasMarker) return // empty file: nothing to say
    if (!meaningful && hasMarker) return // only `$defaults`: identity
    text = hasMarker
      ? lines.map(line => (line.trim() === DEFAULTS_MARKER ? text : line)).join('\n').trim()
      : body.trim()
    contributors.push({ source: layer.source, how: hasMarker ? 'spliced' : 'replaced' })
  })

  return { text, contributors }
}

// --- transcript trimming ---------------------------------------------------------

/** The shape `$.session.messages()` returns, as far as trimming needs it. */
export type TranscriptToolUse = {
  tool: string
  tool_use_id?: string
  input?: unknown
  /** The result as the model read it; absent while the call is in flight. */
  text?: string
}

export type TranscriptMessage = {
  role: 'user' | 'assistant'
  text: string
  toolUses?: readonly TranscriptToolUse[]
  toolResults?: readonly unknown[]
}

/** The tool the model asks the user multiple-choice questions with; its answers are kept. */
export const QUESTION_TOOL = 'AskUserQuestion'

/** `Which platforms? [options: Xero | QuickBooks]; Where? [options: UK | EU]` from AskUserQuestion's input. */
export function questionText(input: unknown): string {
  const questions = (input as { questions?: unknown } | null | undefined)?.questions
  if (!Array.isArray(questions)) return ''
  return questions
    .map(q => {
      const record = (q ?? {}) as { question?: unknown; options?: unknown }
      const question = typeof record.question === 'string' ? record.question.trim() : ''
      const labels = Array.isArray(record.options)
        ? record.options.map(o => (typeof o === 'string' ? o : (o as { label?: unknown } | null)?.label)).filter((l): l is string => typeof l === 'string')
        : []
      return `${question}${labels.length ? ` [options: ${labels.join(' | ')}]` : ''}`
    })
    .filter(Boolean)
    .join('; ')
}

/**
 * The transcript with an AskUserQuestion call's answer filled in: at
 * `tool.call` the answer is known before the transcript holds it. Patches the
 * matching tool use, or appends one when the transcript has not got it yet.
 */
export function withQuestionAnswer(
  messages: readonly TranscriptMessage[],
  answer: { toolUseId?: string; input: unknown; text: string },
): TranscriptMessage[] {
  const out = messages.map(m => ({ ...m }))
  for (const message of out) {
    const uses = message.toolUses ?? []
    const at = uses.findIndex(u => u.tool === QUESTION_TOOL && answer.toolUseId !== undefined && u.tool_use_id === answer.toolUseId)
    if (at >= 0) {
      if (uses[at]?.text) return out
      message.toolUses = uses.map((u, i) => (i === at ? { ...u, text: answer.text } : u))
      return out
    }
  }
  out.push({ role: 'assistant', text: '', toolUses: [{ tool: QUESTION_TOOL, tool_use_id: answer.toolUseId, input: answer.input, text: answer.text }] })
  return out
}

export type TrimLimits = {
  /** Cap per human prompt; human prompts are kept whole up to this. */
  userChars: number
  /** Cap per assistant message's text. */
  assistantChars: number
  /** Cap for the last assistant message, often the question a short reply answers. */
  lastAssistantChars: number
  /** Cap on the rendered conversation before the prompt being assessed: the first prompt and the newest lines are kept, human lines before assistant text. */
  totalChars: number
}

export const DEFAULT_TRIM: TrimLimits = { userChars: 4000, assistantChars: 300, lastAssistantChars: 2000, totalChars: 24000 }

const COMMAND_MESSAGE = /^\s*<(command-name|command-message|local-command-stdout|local-command-stderr)>/

const cut = (text: string, max: number): string =>
  text.length <= max ? text : `${text.slice(0, max)}… [${text.length - max} more chars]`

/** Tool names with repeat counts, in first-use order: `Read×3, Edit, Bash`. AskUserQuestion is left out: it is rendered in full. */
export function toolNames(uses: readonly { tool: string }[] | undefined): string {
  uses = uses?.filter(use => use.tool !== QUESTION_TOOL)
  if (!uses || uses.length === 0) return ''
  const counts = new Map<string, number>()
  for (const use of uses) counts.set(use.tool, (counts.get(use.tool) ?? 0) + 1)
  return [...counts].map(([tool, n]) => (n > 1 ? `${tool}×${n}` : tool)).join(', ')
}

/**
 * Renders the transcript for the classifier: human prompts in full (capped),
 * assistant text truncated, tool uses as names only, tool results and slash
 * command echoes dropped. AskUserQuestion is the exception: its questions
 * (`ASSISTANT asked:`) and the user's answers (`USER answered:`) are kept,
 * because they are the user's words about the task. The last assistant message keeps more of its text
 * (`lastAssistantChars`): it is often the question that a short reply such as
 * "2" answers. `current` is the prompt being submitted, which
 * `$.session.messages()` does not hold yet at `prompt.submit`.
 *
 * When over `totalChars`, the first human prompt and the most recent lines
 * are kept and the middle is replaced by a marker.
 */
export function trimTranscript(
  messages: readonly TranscriptMessage[],
  current?: string,
  limits: TrimLimits = DEFAULT_TRIM,
): string {
  return renderTranscript(messages, current, limits).text
}

/** The conversation's lines as the classifier reads them, without the prompt being submitted. */
function transcriptLines(messages: readonly TranscriptMessage[], limits: TrimLimits): string[] {
  const lines: string[] = []
  let lastAssistant = -1
  messages.forEach((message, index) => {
    if (message.role === 'assistant' && (message.text ?? '').trim() !== '') lastAssistant = index
  })
  for (const [index, message] of messages.entries()) {
    const text = (message.text ?? '').trim()
    if (message.role === 'user') {
      if (text === '' || COMMAND_MESSAGE.test(text)) continue // tool results, /commands
      lines.push(`USER: ${cut(text, limits.userChars)}`)
    } else {
      const tools = toolNames(message.toolUses)
      const cap = index === lastAssistant ? limits.lastAssistantChars : limits.assistantChars
      const said = text === '' ? '' : cut(text.replace(/\s+/g, ' '), cap)
      if (said !== '' || tools !== '') lines.push(`ASSISTANT: ${said}${said && tools ? ' ' : ''}${tools ? `[tools: ${tools}]` : ''}`)
      for (const use of message.toolUses ?? []) {
        if (use.tool !== QUESTION_TOOL) continue
        const asked = questionText(use.input)
        if (asked) lines.push(`ASSISTANT asked: ${cut(asked, limits.lastAssistantChars)}`)
        const answered = typeof use.text === 'string' ? use.text.replace(/\s+/g, ' ').trim() : ''
        if (answered) lines.push(`USER answered: ${cut(answered, limits.userChars)}`)
      }
    }
  }
  return lines
}

/** What a capped transcript kept, for `/er status`. */
export type CapStats = { text: string; fullChars: number; sentChars: number; omitted: number }

/** The transcript as `trimTranscript` renders it, with what the cap dropped. */
export function renderTranscript(messages: readonly TranscriptMessage[], current?: string, limits: TrimLimits = DEFAULT_TRIM): CapStats {
  const lines = transcriptLines(messages, limits)
  const now = (current ?? '').trim()
  // The prompt being assessed goes in whole, outside the cap: a long dictated brief is the prompt that matters most.
  const currentLine = now !== '' && !COMMAND_MESSAGE.test(now) ? `USER: ${now}` : undefined
  const capped = capLines(lines, limits.totalChars)
  const text = [capped.text, currentLine].filter(part => part !== undefined && part !== '').join('\n')
  const fullChars = [...lines, ...(currentLine ? [currentLine] : [])].join('\n').length
  return { text, sentChars: text.length, omitted: capped.omitted, fullChars }
}

const isHumanLine = (line: string): boolean => line.startsWith('USER') || line.startsWith('ASSISTANT asked:')

/**
 * Fits rendered lines into `max` characters. Always keeps the first human
 * prompt (the original task). Then, newest first, the human side (prompts,
 * AskUserQuestion questions and answers) and the last assistant line (often
 * the question a short reply answers); then, newest first, other assistant
 * text with what is left. Order is kept; each gap becomes one marker line.
 */
export function capLines(lines: readonly string[], max: number): { text: string; sentChars: number; omitted: number } {
  const size = (line: string) => line.length + 1
  const whole = lines.reduce((n, line) => n + size(line), 0)
  if (whole <= max) {
    const text = lines.join('\n')
    return { text, sentChars: text.length, omitted: 0 }
  }
  // Budget the output as it will be rendered: kept lines, plus one marker per
  // run of dropped lines (adding a line can split a run, shrink it or close it).
  const n = lines.length
  const keep = new Set<number>()
  const MARKER = 30 // `[… 123 messages omitted …]` and its newline
  let used = n > 0 ? MARKER : 0
  const dropped = (i: number) => i >= 0 && i < n && !keep.has(i)
  const add = (i: number): boolean => {
    const left = dropped(i - 1)
    const right = dropped(i + 1)
    const markers = left && right ? 1 : !left && !right ? -1 : 0
    const cost = size(lines[i] as string) + markers * MARKER
    if (used + cost > max) return false
    keep.add(i)
    used += cost
    return true
  }
  const firstUser = lines.findIndex(line => line.startsWith('USER: '))
  if (firstUser >= 0) add(firstUser)
  let lastAssistant = -1
  lines.forEach((line, i) => {
    if (line.startsWith('ASSISTANT: ')) lastAssistant = i
  })
  for (let i = lines.length - 1; i >= 0; i--) {
    if (keep.has(i)) continue
    if (isHumanLine(lines[i] as string) || i === lastAssistant) {
      if (!add(i)) break
    }
  }
  for (let i = lines.length - 1; i >= 0; i--) {
    if (keep.has(i)) continue
    if (!add(i)) break
  }
  const out: string[] = []
  let gap = 0
  lines.forEach((line, i) => {
    if (keep.has(i)) {
      if (gap > 0) out.push(`[… ${gap} messages omitted …]`)
      gap = 0
      out.push(line)
    } else gap++
  })
  if (gap > 0) out.push(`[… ${gap} messages omitted …]`)
  const text = out.join('\n')
  return { text, sentChars: text.length, omitted: lines.length - keep.size }
}

/** Human prompts in a stored transcript: the ones a person typed, not tool results, /commands or interruptions. */
export function humanPromptCount(messages: readonly TranscriptMessage[]): number {
  return messages.filter(message => {
    if (message.role !== 'user') return false
    const text = (message.text ?? '').trim()
    return text !== '' && !COMMAND_MESSAGE.test(text) && !text.startsWith('[Request interrupted')
  }).length
}

/**
 * The user message sent to the classifier. The session's instructions
 * (CLAUDE.md files, rules, memory) come first when known; a manual
 * `/er assess <hint>` adds the hint after the transcript.
 */
/** The line that tells a check which level the session is on now, which its spread is judged against. */
const inForceLine = (inForce: Level | undefined): string => (inForce ? `\n\nThe session is at ${inForce} effort now.` : '')

export const classifierPrompt = (transcript: string, hint?: string, instructions?: string, inForce?: Level): string => {
  const said = hint?.trim()
  const hintBlock = said ? `\n\n<user_hint>\n${said}\n</user_hint>\nThe user asked for this routing explicitly and gave this hint; weigh it strongly.` : ''
  const given = instructions?.trim()
  const instructionsBlock = given ? `The session's instructions (CLAUDE.md files, rules and memory), as its model sees them:\n<instructions>\n${given}\n</instructions>\n\n` : ''
  return `${instructionsBlock}Transcript so far (oldest first):\n<transcript>\n${transcript}\n</transcript>${hintBlock}${inForceLine(inForce)}\n\nSuggest the session's effort level now; answer undecided only if no actionable task has been stated yet. JSON only.`
}

// --- parsing the classifier's reply ---------------------------------------------

export type Decision =
  | { decision: 'undecided' }
  | { decision: 'lock'; level: Level; reason: string; why?: string; confidence?: number; spread?: Spread; against?: Level }

/**
 * Reads the classifier's reply: the first `{...}` in it, so a reply fenced
 * in a json code block or wrapped in prose still parses. Anything
 * unparseable or an unknown level is `undecided`: the router never locks on a reply it cannot
 * read (fail open).
 */
export function parseDecision(reply: string | undefined | null): Decision {
  const record = levelInDecision(jsonObjectOf(reply))
  if (!record || (record.decision !== 'level' && record.decision !== 'lock' && record.decision !== 'suggest')) return { decision: 'undecided' }
  const proposal = proposalOf(record)
  return proposal ? { decision: 'lock', ...proposal } : { decision: 'undecided' }
}

/**
 * A reply that names its level as the decision (`{"decision":"medium"}`, seen
 * from Sonnet 5.5 on a subagent check) is read as that level.
 */
function levelInDecision(record: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  const named = typeof record?.decision === 'string' ? record.decision.trim().toLowerCase() : undefined
  return record && isLevel(named) && record.level === undefined ? { ...record, decision: 'level', level: named } : record
}

/**
 * The first JSON object in a reply, parsed; undefined when there is none.
 * Reads from the first `{` to the brace that closes it, so text after the
 * object is ignored, and closes braces left open at the end of the reply
 * (Fable 5.1 sometimes stops before its last `}`).
 */
function jsonObjectOf(reply: string | undefined | null): Record<string, unknown> | undefined {
  if (typeof reply !== 'string') return undefined
  const start = reply.indexOf('{')
  if (start < 0) return undefined
  let depth = 0
  let inString = false
  let end = reply.length
  for (let i = start; i < reply.length; i++) {
    const c = reply[i]
    if (inString) {
      if (c === '\\') i++
      else if (c === '"') inString = false
    } else if (c === '"') inString = true
    else if (c === '{') depth++
    else if (c === '}' && --depth === 0) {
      end = i + 1
      break
    }
  }
  const text = reply.slice(start, end).trimEnd() + (end === reply.length && depth > 0 && !inString ? '}'.repeat(depth) : '')
  try {
    const data: unknown = JSON.parse(text)
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

/**
 * A reply's level (case-insensitive), reason (capped) and confidence;
 * undefined for an unknown level. A reply with a spread (`levels`) takes the
 * spread's median as its level, and its confidence is judged later against
 * the level in force (judgeSpread).
 */
function proposalOf(record: Record<string, unknown>): Proposal | undefined {
  const spread = spreadOf(record.levels)
  const named = typeof record.level === 'string' ? record.level.trim().toLowerCase() : undefined
  const level = spread ? judgeSpread(spread, undefined, LEVELS).level : named
  if (!isLevel(level)) return undefined
  const reason = typeof record.reason === 'string' ? record.reason.replace(/\s+/g, ' ').trim() : ''
  const why = typeof record.why === 'string' ? record.why.replace(/\s+/g, ' ').trim().slice(0, 400) : ''
  const proposal: Proposal = { level, reason: reason === '' ? 'classifier' : cut(reason, 60).replace(/… \[\d+ more chars\]$/, '…'), ...(why ? { why } : {}) }
  if (spread) return { ...proposal, spread }
  const confidence = confidenceOf(record.confidence)
  return confidence === undefined ? proposal : { ...proposal, confidence }
}

/** A reply's `levels` object as a spread: known levels with a probability (0-1 or a percentage), normalised. */
export function spreadOf(value: unknown): Spread | undefined {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return undefined
  const spread: Spread = {}
  let total = 0
  for (const [key, raw] of Object.entries(value as Record<string, unknown>)) {
    const level = key.trim().toLowerCase()
    const p = confidenceOf(raw)
    if (!isLevel(level) || p === undefined) continue
    spread[level] = (spread[level] ?? 0) + p
    total += p
  }
  if (total <= 0) return undefined
  for (const level of LEVELS) if (spread[level] !== undefined) spread[level] = (spread[level] as number) / total
  return spread
}

/**
 * Turns a spread into a level and a confidence, against the level in force.
 * The level is the spread's median within the offered levels (the lowest
 * level at least as likely as not to be enough), so a check torn between high
 * and xhigh lands on high. The confidence is how sure the check is that the
 * level in force is wrong in that direction: the probability above it for a
 * move up, below it for a move down, and for staying, one minus the larger of
 * the two. Tommy, 2026-10-05: a check "certain that it has to go up, just not
 * [sure] to what" should still move; one confidence in one exact level kept it
 * on the level it was sure was wrong. With no level in force known, the
 * confidence is the median level's own probability.
 */
export function judgeSpread(spread: Spread, inForce: Level | undefined, offered: readonly Level[] = levelsUpTo()): { level: Level; confidence: number; against?: Level } {
  const mass = offered.map(() => 0)
  for (const level of LEVELS) {
    const p = spread[level]
    if (p !== undefined) {
      const at = offered.indexOf(clampLevel(level, offered))
      mass[at] = (mass[at] ?? 0) + p
    }
  }
  let cumulative = 0
  let at = offered.length - 1
  for (let i = 0; i < offered.length; i++) {
    cumulative += mass[i] as number
    if (cumulative >= 0.5 - 1e-9) {
      at = i
      break
    }
  }
  const level = offered[at] as Level
  if (inForce === undefined) return { level, confidence: mass[at] as number }
  const ref = offered.indexOf(clampLevel(inForce, offered))
  const up = mass.slice(ref + 1).reduce((a, b) => a + b, 0)
  const down = mass.slice(0, ref).reduce((a, b) => a + b, 0)
  const confidence = at > ref ? up : at < ref ? down : 1 - Math.max(up, down)
  return { level, confidence: Math.round(confidence * 1000) / 1000, against: offered[ref] as Level }
}

/** A confidence from 0 to 1. A percentage (1 to 100) is read as one; anything else is undefined. */
export function confidenceOf(value: unknown): number | undefined {
  const n = typeof value === 'number' ? value : typeof value === 'string' ? Number(value.replace(/%$/, '')) : NaN
  if (!Number.isFinite(n) || n < 0) return undefined
  if (n <= 1) return n
  return n <= 100 ? n / 100 : undefined
}

/** Whether a check is sure enough to act on. A reply with no confidence is not. A threshold of 0 acts on any level. */
export const isConfident = (proposal: Proposal, threshold: number): boolean => threshold <= 0 || (proposal.confidence ?? 0) >= threshold

/** `72%`. */
export const percent = (confidence: number): string => `${Math.round(confidence * 100)}%`

// --- supported models ---------------------------------------------------------------

/**
 * The models the router supports: the current generation, each with a notes
 * file in `rules/models/` on what effort means there. On any other model the
 * router stands aside, because its rules and notes were written for these
 * levels. A new model needs a new version of the plugin.
 */
export type SupportedModel = { id: string; alias: string; name: string; notesFile: string }

export const SUPPORTED_MODELS: readonly SupportedModel[] = [
  { id: 'claude-fable-5-1', alias: 'fable', name: 'Fable 5.1', notesFile: 'fable-5-1.md' },
  { id: 'claude-opus-5-5', alias: 'opus', name: 'Opus 5.5', notesFile: 'opus-5-5.md' },
  { id: 'claude-sonnet-5-5', alias: 'sonnet', name: 'Sonnet 5.5', notesFile: 'sonnet-5-5.md' },
]

/** `Fable 5.1, Opus 5.5 and Sonnet 5.5`. */
export const SUPPORTED_NAMES = SUPPORTED_MODELS.map(m => m.name).join(', ').replace(/, ([^,]*)$/, ' and $1')

/** The supported model a model id or alias names (`claude-opus-5-5`, `claude-opus-5-5[1m]`, `opus`, a cloud provider's id), or undefined. */
export function supportedModel(model: string | undefined): SupportedModel | undefined {
  if (!model) return undefined
  const id = model.toLowerCase().replace(/\[[^\]]*\]$/, '').trim()
  return SUPPORTED_MODELS.find(m => id === m.alias || id.includes(m.id))
}

/** A model's name as people say it: `Opus 5.5`, `Haiku 4.5`; the id itself when it is not a Claude id. */
export function modelName(model: string | undefined): string {
  if (!model) return 'this model'
  const known = supportedModel(model)
  if (known) return known.name
  const match = model.toLowerCase().match(/claude-([a-z]+)-(\d+)(?:-(\d{1,2})(?!\d))?/)
  if (!match?.[1] || !match[2]) return model
  return `${match[1].charAt(0).toUpperCase()}${match[1].slice(1)} ${match[2]}${match[3] ? `.${match[3]}` : ''}`
}

// --- subagents --------------------------------------------------------------------

/**
 * The frame for a subagent's read. A subagent is routed once, at spawn. Like
 * the session frame it ties no kind of task to a level: the notes on the
 * model the subagent runs on say what each level can do. The same rules sit
 * inside it, so a user's or organisation's rules ("payments code is never
 * below high") still apply to subagents.
 */
export const subagentFrame = (levels: readonly Level[] = levelsUpTo()): string => `You pick the reasoning-effort level for one Claude Code subagent. Levels you may pick, lowest to highest: ${levels.join(', ')}.

Level names don't mean the same thing on every model. Judge what this subagent needs on the model it runs on, using what the notes below say each level can do there.

How a subagent differs from a session with a user:
- No user is in the loop. The subagent works alone from its brief until it reports back; nobody answers its questions or checks its steps.
- There is no undecided. If the brief is short or vague, pick the level the work it describes most likely needs.

Principles for choosing. They were written for whole sessions; read them for a subagent, which has no user in the loop. Later rules override earlier ones where they conflict:`

export const SUBAGENT_FRAME = subagentFrame()

export const subagentContract = (levels: readonly Level[] = levelsUpTo()): string => `Reply with exactly one JSON object and nothing else:
{"level":"<${levels.join('|')}>","reason":"<what the subagent's task is, 3-8 words, e.g. codebase search>"}`

export const SUBAGENT_CONTRACT = subagentContract()

/** The subagent read's whole system prompt around the composed rules, with the notes on the model it runs on. */
export const subagentSystem = (rules: string, model?: ModelNotes, levels: readonly Level[] = levelsUpTo()): string =>
  `${subagentFrame(levels)}\n\n<rules>\n${rules.trim()}\n</rules>${modelBlock(model, 'The subagent runs on')}\n\n${subagentContract(levels)}`

/** What `agent.spawn` says about the subagent, as far as its read needs it. */
export type SubagentBrief = { subagentType: string; description: string; prompt: string }

/**
 * Fits a brief into `max` characters: the head (the task is usually stated
 * first) and the tail (often what to report back), with a marker between.
 */
export function capBrief(text: string, max: number): string {
  if (text.length <= max) return text
  const marker = (n: number) => `\n[… ${n} chars omitted …]\n`
  const room = Math.max(0, max - marker(text.length).length)
  const head = Math.ceil(room * 0.75)
  const tail = room - head
  return `${text.slice(0, head)}${marker(text.length - head - tail)}${tail > 0 ? text.slice(-tail) : ''}`
}

/** The user message for a subagent's read on another model: its type, description and brief (capped at `maxChars`). */
export const subagentPrompt = (brief: SubagentBrief, maxChars: number = DEFAULT_TRIM.totalChars): string =>
  `Agent type: ${brief.subagentType || 'unknown'}\nDescription: ${brief.description.trim() || '(none)'}\n<brief>\n${capBrief(brief.prompt.trim(), maxChars)}\n</brief>\n\nPick the effort level this subagent should run at, from its brief alone: decide from it and do not assume context it does not state. JSON only.`

/**
 * The message a subagent's read sends into a fork of its parent at spawn:
 * the parent knows the task and why it is delegating this part, which the
 * brief alone often doesn't say.
 */
export function subagentForkPrompt(input: { rules: string; brief: SubagentBrief; runsOn: string; model?: ModelNotes; maxChars?: number; levels?: readonly Level[] }): string {
  const { brief } = input
  return [
    `Pause the task for a moment. Do not use any tools and do not start the subagent yourself: answer only the question below. You are about to start a ${brief.subagentType || 'general-purpose'} subagent on ${input.runsOn}${brief.description.trim() ? ` ("${brief.description.trim()}")` : ''} with the brief below. You know the task and why you are delegating this part of it: use that.`,
    subagentSystem(input.rules, input.model, input.levels),
    `<brief>\n${capBrief(brief.prompt.trim(), input.maxChars ?? DEFAULT_TRIM.totalChars)}\n</brief>`,
    'Pick the effort level this subagent should run at. JSON only.',
  ].join('\n\n')
}

/**
 * Reads a subagent read's reply: a level and reason, from the first `{...}`.
 * The `decision` field may be left out; an explicit undecided, an unknown
 * level or anything unparseable is undefined, and the caller falls back.
 */
export function parseSubagentReply(reply: string | undefined | null): Proposal | undefined {
  const record = levelInDecision(jsonObjectOf(reply))
  if (!record) return undefined
  if (record.decision !== undefined && record.decision !== 'level' && record.decision !== 'lock' && record.decision !== 'suggest') return undefined
  return proposalOf(record)
}

/**
 * A subagent the router routed: the level its requests carry, and why. With
 * `byDefinition`, its agent definition sets the level (the engine applies it;
 * the router leaves its requests alone and only records it), which may be a
 * number.
 */
export type RoutedAgent = { level: Level | number; reason: string; subagentType: string; description: string; byDefinition?: boolean }

// --- agent definitions that set their own effort ------------------------------------

/** One agent definition, as far as the router needs it: its name, and its effort when it sets one. */
export type AgentDefinition = { name: string; effort?: Level | number; model?: string; source: string }

/** A definition's model, unless it inherits the parent's. */
const definitionModel = (value: unknown): string | undefined => {
  const text = typeof value === 'string' ? value.trim().replace(/^(['"])(.*)\1$/, '$2').trim() : ''
  return text === '' || text.toLowerCase() === 'inherit' ? undefined : text
}

/** A definition's effort when it is one the engine takes: a level, or a positive number. */
export function definitionEffort(value: unknown): Level | number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) && value > 0 ? value : undefined
  if (typeof value !== 'string') return undefined
  const text = value.trim().replace(/^(['"])(.*)\1$/, '$2').trim().toLowerCase()
  if (isLevel(text)) return text
  return /^\d+(\.\d+)?$/.test(text) && Number(text) > 0 ? Number(text) : undefined
}

/**
 * The top-level `key: value` pairs of a markdown file's YAML frontmatter
 * (between `---` lines at the very start); undefined without one. Values are
 * unquoted; nested and list values are left out (the router reads only
 * `name` and `effort`).
 */
export function frontmatterOf(text: string): Record<string, string> | undefined {
  const match = text.replace(/^﻿/, '').match(/^---\r?\n([\s\S]*?)\r?\n---[ \t]*(\r?\n|$)/)
  if (!match) return undefined
  const fields: Record<string, string> = {}
  for (const line of (match[1] as string).split(/\r?\n/)) {
    const field = line.match(/^([A-Za-z_][\w-]*)[ \t]*:[ \t]*(.*?)[ \t]*$/)
    if (!field) continue
    const value = (field[2] as string).replace(/[ \t]+#.*$/, '').replace(/^(['"])(.*)\1$/, '$2')
    if (value !== '' && !(field[1] as string in fields)) fields[field[1] as string] = value
  }
  return fields
}

/**
 * An agent definition file (`.claude/agents/*.md`): named by its frontmatter
 * `name:`, else by its file name. Undefined for a file with no frontmatter,
 * which is not an agent definition.
 */
export function agentFileDefinition(text: string, fileName: string, source: string): AgentDefinition | undefined {
  const fields = frontmatterOf(text)
  if (!fields) return undefined
  const name = fields.name?.trim() || fileName.replace(/\.md$/i, '')
  const effort = definitionEffort(fields.effort)
  const model = definitionModel(fields.model)
  return { name, ...(effort === undefined ? {} : { effort }), ...(model === undefined ? {} : { model }), source }
}

/**
 * The agent definitions in a settings source's `agents` key: an object keyed
 * by agent name (as `--agents` takes them), or a list of `{ name, ... }`.
 * Anything malformed is skipped.
 */
export function settingsAgentDefinitions(settings: unknown, source: string): AgentDefinition[] {
  const agents = (settings as { agents?: unknown } | null | undefined)?.agents
  if (typeof agents !== 'object' || agents === null) return []
  const entries: [unknown, unknown][] = Array.isArray(agents)
    ? agents.map(agent => [(agent as { name?: unknown } | null)?.name, agent])
    : Object.entries(agents)
  const out: AgentDefinition[] = []
  for (const [name, spec] of entries) {
    if (typeof name !== 'string' || name.trim() === '' || typeof spec !== 'object' || spec === null) continue
    const effort = definitionEffort((spec as { effort?: unknown }).effort)
    const model = definitionModel((spec as { model?: unknown }).model)
    out.push({ name: name.trim(), ...(effort === undefined ? {} : { effort }), ...(model === undefined ? {} : { model }), source })
  }
  return out
}

/**
 * The definition a spawn of `subagentType` runs under: the first one with that
 * name, highest precedence first, whether or not it sets an effort (a project
 * definition without one still overrides a user definition with one). A
 * plugin's agent (`<plugin>:<name>`) is never looked up here.
 */
export function definitionFor(subagentType: string, definitions: readonly AgentDefinition[]): AgentDefinition | undefined {
  if (subagentType.includes(':')) return undefined
  return definitions.find(definition => definition.name === subagentType)
}

/**
 * Whether subagents are routed in this state. They are unless you turned the
 * router off (Turn off, `/er off`, or changing the effort picker). A session
 * that started before the router still routes them: each brief is a new,
 * whole task.
 */
export const routesSubagents = (state: RouterState): boolean => state.status !== 'off' || state.offReason === 'mid-flow'

/**
 * The level a spawn inherits, for a fork or when its read fails: the parent
 * subagent's level for a nested spawn (routed, or a level its definition
 * set), else the main thread's level in use; undefined when neither has one
 * (the request is left alone).
 */
export function parentLevel(state: RouterState, agents: ReadonlyMap<string, RoutedAgent>, parentAgentId?: string): Level | undefined {
  const parent = parentAgentId !== undefined ? agents.get(parentAgentId)?.level : undefined
  return isLevel(parent) ? parent : appliedLevel(state)
}

/** Why subagents are or are not routed, for `/er status`. */
export type SubagentStatus = { routing: 'on' | 'setting' | 'user-off'; agents: readonly RoutedAgent[] }

/** `/er status`'s subagent lines: whether they are routed, then the newest `shown`, newest first. */
export function subagentReport(status: SubagentStatus, shown = 10): string[] {
  const why = {
    on: 'each gets its own level from its task',
    setting: 'not routed (routeSubagents is off), so they use the session level',
    'user-off': 'not routed while the router is off, so they use your effort setting',
  }[status.routing]
  const lines = [`Subagents: ${why}.`]
  if (status.agents.length === 0) return lines
  const recent = status.agents.slice(-shown).reverse()
  lines.push(`Recent subagents (${status.agents.length}${status.agents.length > recent.length ? `, newest ${recent.length} shown` : ''}):`)
  for (const agent of recent) {
    const description = cut(agent.description.replace(/\s+/g, ' ').trim() || agent.subagentType || 'a subagent', 60).replace(/… \[\d+ more chars\]$/, '…')
    lines.push(`  ${agent.level}: ${description} (${agent.byDefinition ? 'set by its agent definition' : agent.reason})`)
  }
  return lines
}

// --- the spend ledger -------------------------------------------------------------

/**
 * What the router records about each model request, so `/er report` can
 * say where the effort went: the level the request arrived at (the picker's,
 * or the level a subagent would have inherited), the level it went out at,
 * and what it cost as the API reported it. Requests are summed into rows per
 * UTC day and pair of levels. One file per session, written by that session.
 */
export type SpendRow = {
  /** UTC day, YYYY-MM-DD. */
  day: string
  caller: 'main' | 'subagent'
  /** The level the request arrived at: what it would have run at without the router. `none` for a model without effort. */
  from: string
  /** The level it went out at. */
  to: string
  /** A subagent whose own definition set its level (the router left it alone). */
  byDefinition?: true
  requests: number
  /** Output tokens: thinking and the answer, the part effort changes most. */
  output: number
  /** Input tokens, cached and uncached. */
  input: number
}

/**
 * How a check was made: `first`, a separate call on the session's model
 * before the conversation has a request to fork; `fork`, a fork of the
 * conversation; `separate`, a call on the check model setting's model;
 * `subagent`, a subagent's brief.
 */
export type CheckKind = 'first' | 'fork' | 'separate' | 'subagent'

export const isCheckKind = (value: unknown): value is CheckKind =>
  value === 'first' || value === 'fork' || value === 'separate' || value === 'subagent'

/** The router's own reads, per UTC day and kind (no kind: recorded before 0.10). */
export type ReadRow = { day: string; kind?: CheckKind; calls: number; output: number; input: number }

/**
 * One assessment and what came of it, kept to calibrate confidence later: the
 * spread, the level it was judged against, and `outcome` (`stayed`, `moved to
 * high`, `no clear task`, `judged at the first request`; older ledgers hold
 * the ask-era outcomes too).
 */
export type VerdictRow = {
  at: number
  kind: CheckKind
  model: string
  prompt: number
  level?: Level
  confidence?: number
  /** The check's short task summary and its why, for calibration. */
  reason?: string
  why?: string
  /** The check's probability for each level, when it gave one. */
  spread?: Spread
  /** The level in force the spread was judged against. */
  against?: Level
  outcome: string
  /** A first check that carried the session's instructions (CLAUDE.md, rules, memory), to learn whether they help. */
  withInstructions?: boolean
  /** Asked for by you (the band's Assess, `/er assess`), not counted toward the window. */
  manual?: true
}

/** Verdicts kept per session. */
export const MAX_VERDICTS = 200

/** One session's ledger: its requests, the router's reads, its assessments and, since 0.17, its state. */
export type SpendLedger = { version: 1; session: string; repo: string; rows: SpendRow[]; reads: ReadRow[]; verdicts?: VerdictRow[]; state?: SavedState }

/** A request's usage, in the API's spelling. */
export type SpendUsage = { input_tokens: number; output_tokens: number; cache_read_input_tokens: number; cache_creation_input_tokens: number }

export type SpendPeriod = 'session' | 'week' | 'month' | 'all'

export const isSpendPeriod = (value: unknown): value is SpendPeriod =>
  value === 'session' || value === 'week' || value === 'month' || value === 'all'

export const emptyLedger = (session: string, repo: string): SpendLedger => ({ version: 1, session, repo, rows: [], reads: [] })

/** The UTC day of a time in epoch ms, YYYY-MM-DD. */
export const dayOf = (ms: number): string => new Date(ms).toISOString().slice(0, 10)

const inputOf = (usage: SpendUsage): number =>
  usage.input_tokens + usage.cache_read_input_tokens + usage.cache_creation_input_tokens

const levelName = (value: unknown): string => (value === undefined || value === null ? 'none' : String(value))

export type SpendEntry = { day: string; caller: 'main' | 'subagent'; from: unknown; to: unknown; byDefinition?: boolean; usage: SpendUsage }

/** Adds one request to its row. */
export function withSpend(ledger: SpendLedger, entry: SpendEntry): SpendLedger {
  const from = levelName(entry.from)
  const to = levelName(entry.to)
  const byDefinition = entry.byDefinition ? (true as const) : undefined
  const at = ledger.rows.findIndex(
    r => r.day === entry.day && r.caller === entry.caller && r.from === from && r.to === to && r.byDefinition === byDefinition,
  )
  const old: SpendRow = ledger.rows[at] ?? { day: entry.day, caller: entry.caller, from, to, ...(byDefinition ? { byDefinition } : {}), requests: 0, output: 0, input: 0 }
  const row = { ...old, requests: old.requests + 1, output: old.output + entry.usage.output_tokens, input: old.input + inputOf(entry.usage) }
  return { ...ledger, rows: at >= 0 ? ledger.rows.map((r, i) => (i === at ? row : r)) : [...ledger.rows, row] }
}

/** Adds one of the router's own reads. */
export function withRead(ledger: SpendLedger, day: string, usage: SpendUsage, kind?: CheckKind): SpendLedger {
  const at = ledger.reads.findIndex(r => r.day === day && r.kind === kind)
  const old: ReadRow = ledger.reads[at] ?? { day, ...(kind ? { kind } : {}), calls: 0, output: 0, input: 0 }
  const row = { ...old, calls: old.calls + 1, output: old.output + usage.output_tokens, input: old.input + inputOf(usage) }
  return { ...ledger, reads: at >= 0 ? ledger.reads.map((r, i) => (i === at ? row : r)) : [...ledger.reads, row] }
}

/** Adds one check's verdict, keeping the newest `MAX_VERDICTS`. */
export function withVerdictRow(ledger: SpendLedger, row: VerdictRow): SpendLedger {
  return { ...ledger, verdicts: [...(ledger.verdicts ?? []), row].slice(-MAX_VERDICTS) }
}

/**
 * Sets what came of a verdict (the answer to its question): the one checked at `at`, else the newest. A spread
 * judged later (at the first request) also sets the level and confidence it was judged to.
 */
export function withVerdictOutcome(ledger: SpendLedger, outcome: string, at?: number, judged?: { level: Level; confidence?: number; against?: Level }): SpendLedger {
  const verdicts = ledger.verdicts ?? []
  let index = at === undefined ? -1 : verdicts.findLastIndex(v => v.at === at)
  if (index < 0) index = verdicts.length - 1
  const row = verdicts[index]
  const update = {
    outcome,
    ...(judged ? { level: judged.level } : {}),
    ...(judged?.confidence !== undefined ? { confidence: judged.confidence } : {}),
    ...(judged?.against ? { against: judged.against } : {}),
  }
  return row ? { ...ledger, verdicts: verdicts.map((v, i) => (i === index ? { ...row, ...update } : v)) } : ledger
}

const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0

/** A ledger file's text, checked; rows that do not fit the shape are dropped. Undefined when it is not a ledger. */
export function parseLedger(text: string): SpendLedger | undefined {
  let raw: unknown
  try {
    raw = JSON.parse(text)
  } catch {
    return undefined
  }
  if (typeof raw !== 'object' || raw === null) return undefined
  const value = raw as Record<string, unknown>
  if (value.version !== 1 || typeof value.session !== 'string') return undefined
  const rows = (Array.isArray(value.rows) ? value.rows : []).filter(
    (r): r is SpendRow =>
      typeof r === 'object' && r !== null &&
      typeof r.day === 'string' && (r.caller === 'main' || r.caller === 'subagent') &&
      typeof r.from === 'string' && typeof r.to === 'string' &&
      (r.byDefinition === undefined || r.byDefinition === true) &&
      isCount(r.requests) && isCount(r.output) && isCount(r.input),
  )
  const reads = (Array.isArray(value.reads) ? value.reads : []).filter(
    (r): r is ReadRow =>
      typeof r === 'object' && r !== null && typeof r.day === 'string' && (r.kind === undefined || isCheckKind(r.kind)) &&
      isCount(r.calls) && isCount(r.output) && isCount(r.input),
  )
  const verdicts = (Array.isArray(value.verdicts) ? value.verdicts : []).filter(
    (r): r is VerdictRow =>
      typeof r === 'object' && r !== null && isCount(r.at) && isCheckKind(r.kind) && typeof r.model === 'string' && isCount(r.prompt) &&
      (r.level === undefined || isLevel(r.level)) && (r.confidence === undefined || isCount(r.confidence)) && typeof r.outcome === 'string' &&
      (r.withInstructions === undefined || typeof r.withInstructions === 'boolean'),
  )
  const state = restored(value.state)
  return {
    version: 1, session: value.session, repo: typeof value.repo === 'string' ? value.repo : 'unknown', rows, reads,
    ...(verdicts.length > 0 ? { verdicts } : {}),
    ...(state ? { state: savedOf(state) } : {}),
  }
}

/** A token count in a few characters: 950, 12.3k, 450k, 1.23M. */
export function tokens(n: number): string {
  if (n < 1000) return String(Math.round(n))
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(2)}M`
}

const PERIOD_DAYS: Record<Exclude<SpendPeriod, 'session' | 'all'>, number> = { week: 7, month: 30 }

const periodLabel = (period: SpendPeriod, since?: string): string =>
  period === 'session' ? 'this session'
  : period === 'all' ? 'all recorded sessions'
  : `the last ${PERIOD_DAYS[period]} days (since ${since})`

/** Levels first in their order, then anything else (numbers, none). */
const byLevelOrder = (a: string, b: string): number => {
  const rankOf = (s: string) => (isLevel(s) ? rank(s) : LEVELS.length)
  return rankOf(a) - rankOf(b) || a.localeCompare(b)
}

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * `/er report`: where the effort went over a period, measured. Requests and
 * output tokens per level; the requests the router moved off the level they
 * arrived at, with the average size of requests left at that level beside
 * them; agent definitions' own levels; the router's own reads; and, beyond
 * one session, the split by repo. No "saved" figure (see the last line).
 */
export function spendReport(ledgers: readonly SpendLedger[], period: SpendPeriod, at: { today: string; session: string }): string {
  const since = period === 'week' || period === 'month'
    ? dayOf(Date.parse(`${at.today}T00:00:00Z`) - (PERIOD_DAYS[period] - 1) * 86_400_000)
    : undefined
  const inPeriod = (day: string) => since === undefined || day >= since
  const chosen = (period === 'session' ? ledgers.filter(l => l.session === at.session) : ledgers).map(l => ({
    ...l,
    rows: l.rows.filter(r => inPeriod(r.day)),
    reads: l.reads.filter(r => inPeriod(r.day)),
  }))
  const rows = chosen.flatMap(l => l.rows)
  const label = periodLabel(period, since)
  if (rows.length === 0) {
    return `Nothing recorded for ${label}. Recording started with version 0.9.0.`
  }
  const sum = (list: readonly SpendRow[]) => list.reduce((t, r) => ({ requests: t.requests + r.requests, output: t.output + r.output }), { requests: 0, output: 0 })
  const avg = (t: { requests: number; output: number }) => tokens(t.output / Math.max(1, t.requests))
  const group = <K extends string>(list: readonly SpendRow[], key: (r: SpendRow) => K): Map<K, SpendRow[]> => {
    const out = new Map<K, SpendRow[]>()
    for (const r of list) out.set(key(r), [...(out.get(key(r)) ?? []), r])
    return out
  }
  const all = sum(rows)
  const sessions = chosen.filter(l => l.rows.length > 0).length
  const lines = [`Effort for ${label}: ${plural(all.requests, 'request')}${period === 'session' ? '' : ` in ${plural(sessions, 'session')}`}, ${tokens(all.output)} output tokens.`]

  lines.push('By level:')
  for (const [level, list] of [...group(rows, r => r.to)].sort(([a], [b]) => byLevelOrder(a, b))) {
    const t = sum(list)
    lines.push(`  ${level}: ${plural(t.requests, 'request')}, ${tokens(t.output)} output tokens (avg ${avg(t)})`)
  }

  const unmoved = group(rows.filter(r => !r.byDefinition && r.from === r.to), r => r.to)
  const moved = rows.filter(r => !r.byDefinition && r.from !== r.to)
  if (moved.length === 0) {
    lines.push('Changed by the router: none.')
  } else {
    lines.push(`Changed by the router: ${plural(sum(moved).requests, 'request')}`)
    const groups = [...group(moved, r => `${r.caller}|${r.from}|${r.to}`)].map(([key, list]) => {
      const [caller, from, to] = key.split('|') as [string, string, string]
      return { caller, from, to, t: sum(list) }
    })
    for (const { caller, from, to, t } of groups.sort((a, b) => b.t.requests - a.t.requests)) {
      const left = unmoved.get(from)
      const beside = left ? `, vs ${avg(sum(left))} for those left at ${from}` : ''
      lines.push(`  ${caller === 'main' ? 'main conversation' : 'subagents'}, ${from} → ${to}: ${plural(t.requests, 'request')}, ${tokens(t.output)} output tokens (avg ${avg(t)}${beside})`)
    }
  }

  const defined = rows.filter(r => r.byDefinition)
  if (defined.length > 0) {
    const levels = [...group(defined, r => r.to)].sort(([a], [b]) => byLevelOrder(a, b)).map(([level, list]) => `${level} ${sum(list).requests}`)
    lines.push(`Set by agent definitions: ${plural(sum(defined).requests, 'request')} (${levels.join(', ')}).`)
  }

  const reads = chosen.flatMap(l => l.reads)
  if (reads.length > 0) {
    const r = reads.reduce((t, x) => ({ calls: t.calls + x.calls, output: t.output + x.output, input: t.input + x.input }), { calls: 0, output: 0, input: 0 })
    const count = (kinds: readonly (CheckKind | undefined)[]) => reads.filter(x => kinds.includes(x.kind)).reduce((n, x) => n + x.calls, 0)
    const split = [
      [count(['first']), 'of a first prompt'],
      [count(['fork', 'separate', undefined]), 'of a conversation'],
      [count(['subagent']), 'for subagents'],
    ].filter(([n]) => (n as number) > 0).map(([n, what]) => `${n} ${what}`)
    const by = split.length > 1 ? ` (${split.join(', ')})` : ''
    lines.push(`The router's own assessments: ${r.calls}${by}, using ${tokens(r.output)} output and ${tokens(r.input)} input tokens.`)
  }

  if (period !== 'session') {
    const byRepo = new Map<string, number>()
    for (const l of chosen) if (l.rows.length > 0) byRepo.set(l.repo, (byRepo.get(l.repo) ?? 0) + sum(l.rows).output)
    const repos = [...byRepo].sort(([, a], [, b]) => b - a)
    if (repos.length > 1) {
      const shown = repos.slice(0, 6).map(([repo, output]) => `${repo} ${tokens(output)}`)
      lines.push(`By repo (output tokens): ${shown.join(', ')}${repos.length > 6 ? `, ${repos.length - 6} more` : ''}.`)
    }
  }

  lines.push(
    'No "saved" figure: the router lowers easy tasks and raises hard ones, so these averages can\'t show what a changed request would have cost.',
  )
  return lines.join('\n')
}

// --- state and what the mod shows -------------------------------------------------

/** A check's probability for each level, normalised to sum to 1. */
export type Spread = Partial<Record<Level, number>>

/**
 * An assessment's level. `against`: the level in force the spread was judged
 * against, which `confidence` is relative to. `checkedAt` (when it ran, never
 * saved) ties a later judgement back to its ledger row.
 */
export type Proposal = { level: Level; reason: string; why?: string; confidence?: number; spread?: Spread; against?: Level; checkedAt?: number }

/**
 * The router's three statuses, as the footer's glyph shows them: `unlocked`
 * (it may still move the level, assessing each of the first prompts),
 * `locked` (the level holds), `off` (your effort setting applies).
 */
export type Status = 'unlocked' | 'locked' | 'off'

/** Why the router is off: you turned it off, you changed the effort picker, or the session started before the router. */
export type OffReason = 'you' | 'picker' | 'mid-flow'

/**
 * Everything the router remembers about one session.
 *
 * `level` is the router's own level: after a move while unlocked, or the
 * locked level. Undefined while unlocked means your effort setting runs.
 * Only an assessment moves it, or a button whose label names a level.
 */
export type RouterState = {
  status: Status
  level?: Level
  /** Prompts assessed in this window (an earlier session's prompts count on a first sighting). */
  assessed: number
  /** Who locked it: the router after the last prompt of the window, or you. */
  lockedBy?: 'router' | 'you'
  /** Prompts assessed when it locked, for the band. */
  lockedAfter?: number
  offReason?: OffReason
  /** The router's last level of its own, for `Turn on, locked at <level>`. */
  lastLevel?: Level
  /** A hint from `/er assess <hint>` while unlocked, used by the next prompt's assessment. */
  hint?: string
  /**
   * A first assessment made before any request showed the level in force: its
   * spread is judged at the next main-thread request. Never saved.
   */
  pending?: Proposal
  /** Shown only, never saved: the session's model, which the router does not support, so it stands aside. */
  unsupported?: string
}

export const freshState = (): RouterState => ({ status: 'unlocked', assessed: 0 })

/** The state as it applies on a model: on one the router does not support, it stands aside without forgetting its state. */
export function onModel(state: RouterState, model: string | undefined): RouterState {
  return model === undefined || supportedModel(model) ? state : { ...state, unsupported: modelName(model) }
}

/** The level `turn.step` applies to the main thread, or undefined to leave the request at your effort setting. */
export function appliedLevel(state: RouterState): Level | undefined {
  return state.status !== 'off' && !state.unsupported ? state.level : undefined
}

/** Whether a human prompt should be assessed now. */
export function wantsAssessment(state: RouterState, limit: number): boolean {
  return state.status === 'unlocked' && !state.unsupported && state.assessed < limit
}

/**
 * The state for a session the router first sees with prompts already in it.
 * Those prompts count toward the window; with the window already used up, the
 * session started before the router and it is left off.
 */
export function firstSighting(prior: number, limit: number): RouterState {
  if (prior < limit) return { ...freshState(), assessed: prior }
  return { status: 'off', assessed: 0, offReason: 'mid-flow' }
}

/**
 * The levels an assessment is offered: low up to `highestLevel`, or up to your
 * own setting when that is higher (a session at max would otherwise always
 * read max as too high, since the assessment could never vote for it).
 */
export function offeredLevels(highest: Level, setting?: Level): readonly Level[] {
  return levelsUpTo(setting && rank(setting) > rank(highest) ? setting : highest)
}

/**
 * How sure the last assessment was that `level` is right: one minus the
 * larger share of the spread on either side of it. The footer's word strength
 * and the band's confidence.
 */
export function certaintyOf(spread: Spread, level: Level, offered: readonly Level[] = levelsUpTo()): number {
  const mass = offered.map(() => 0)
  for (const l of LEVELS) {
    const p = spread[l]
    if (p !== undefined) {
      const at = offered.indexOf(clampLevel(l, offered))
      mass[at] = (mass[at] ?? 0) + p
    }
  }
  const ref = offered.indexOf(clampLevel(level, offered))
  const up = mass.slice(ref + 1).reduce((a, b) => a + b, 0)
  const down = mass.slice(0, ref).reduce((a, b) => a + b, 0)
  return Math.round((1 - Math.max(up, down)) * 1000) / 1000
}

/** What one assessment did, for the messages and the ledger. */
export type Settled = { state: RouterState; moved?: { from?: Level; to: Level }; locked?: Level; outcome: string }

/**
 * Applies a judged assessment. It moves to the spread's median when it is at
 * least `threshold` sure the level running is wrong in that direction;
 * otherwise it stays. Counted assessments use up the window, and the last one
 * locks whatever is running. A manual assessment while locked moves the locked
 * level and stays locked. `running` is the level in force (the router's own,
 * else your setting); undefined when no request has shown it yet.
 */
export function settle(
  state: RouterState,
  judged: Proposal | undefined,
  options: { threshold: number; limit: number; running?: Level; counted: boolean },
): Settled {
  let next: RouterState = { ...state, pending: undefined, hint: undefined }
  if (options.counted) next.assessed = Math.min(options.limit, state.assessed + 1)
  let moved: Settled['moved']
  let outcome = judged ? 'stayed' : 'no clear task'
  if (judged && options.running !== undefined && judged.level !== options.running && isConfident(judged, options.threshold)) {
    moved = { from: options.running, to: judged.level }
    next = { ...next, level: judged.level, lastLevel: judged.level }
    outcome = `moved to ${judged.level}`
  }
  let locked: Level | undefined
  const running = next.level ?? options.running
  if (next.status === 'unlocked' && next.assessed >= options.limit && running !== undefined) {
    next = { ...next, status: 'locked', level: running, lockedBy: 'router', lockedAfter: next.assessed }
    locked = running
  }
  return { state: next, ...(moved ? { moved } : {}), ...(locked ? { locked } : {}), outcome }
}

/** Locks the level running now, by you. */
export const lockedByYou = (state: RouterState, level: Level): RouterState => ({
  ...state, status: 'locked', level, lockedBy: 'you', lockedAfter: state.assessed, offReason: undefined, pending: undefined, hint: undefined,
})

/** Unlocks: a fresh window from the level running now (the locked level keeps running until an assessment moves it). */
export const unlocked = (state: RouterState): RouterState => ({
  ...state, status: 'unlocked', assessed: 0, lockedBy: undefined, lockedAfter: undefined, offReason: undefined, pending: undefined,
})

/** Off: your effort setting applies. The router's own level is remembered for `Turn on, locked`. */
export const turnedOff = (state: RouterState, why: OffReason): RouterState => ({
  status: 'off', assessed: state.assessed, offReason: why, lastLevel: state.level ?? state.lastLevel,
})

/** On and unlocked: a fresh window from your effort setting. */
export const turnedOnUnlocked = (state: RouterState): RouterState => ({ status: 'unlocked', assessed: 0, ...(state.lastLevel ? { lastLevel: state.lastLevel } : {}) })

/** On and locked at the router's last level. Unchanged when it never had one. */
export const turnedOnLocked = (state: RouterState): RouterState =>
  state.lastLevel ? { status: 'locked', level: state.lastLevel, lastLevel: state.lastLevel, assessed: 0, lockedBy: 'you' } : state

// --- what the router knows about its own assessments ---------------------------------

/** The last assessment, as the band and `/er status` show it (from the ledger, so it survives a resume). */
export type LastAssessment = {
  at: number
  spread?: Spread
  level?: Level
  against?: Level
  reason?: string
  why?: string
  outcome: string
}

/** What the router knows about its own reads, for `/er status`. */
export type ReadDiagnostics = {
  /** Now, in ms since the epoch. */
  now: number
  /** Assessments this session, automatic and manual. */
  calls: number
  /** The last assessment's raw reply, how it was made and what prompted it. */
  verdict?: { at: number; trigger: string; raw: string; kind?: CheckKind }
  error?: { at: number; text: string }
  /** How long the last read took, in ms. */
  lastReadMs?: number
  /** The last separate call's transcript: characters sent, characters before the cap, the cap, lines dropped. */
  sent?: { sentChars: number; fullChars: number; maxChars: number; omitted: number }
  /** Whether subagents are routed, and the ones that were. */
  subagents?: SubagentStatus
}

/** `12s ago`, `4m ago`, `2h ago`. */
export function ago(now: number, at: number): string {
  const seconds = Math.max(0, Math.round((now - at) / 1000))
  if (seconds < 60) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

/** `Medium`. */
const capital = (text: string): string => text.charAt(0).toUpperCase() + text.slice(1)

/** What the band and status need beyond the state. */
export type View = {
  /** Your effort setting, once a request has shown it. */
  setting?: Level
  last?: LastAssessment
  /** The window: prompts to assess before locking. */
  limit: number
  /** The move bar, 0 to 1. */
  threshold: number
  offered: readonly Level[]
  /** An assessment is running now. */
  assessing?: boolean
  /** Subagents routed this session (memory only). */
  subagents?: number
}

/** The level running now: the router's own, else your setting (undefined until a request shows it). */
export const runningLevel = (state: RouterState, setting?: Level): Level | undefined =>
  state.status === 'off' || state.unsupported ? setting : state.level ?? setting

/** How sure the last assessment is that the level running now is right; undefined without a spread. */
export function confidenceNow(state: RouterState, view: View): number | undefined {
  const running = runningLevel(state, view.setting)
  if (!view.last?.spread || !running) return undefined
  return certaintyOf(view.last.spread, running, view.offered)
}

/** `○ ◔ ◑ ◕`: the share of the window assessed. It never fills: at the end the padlock closes instead. */
export function progressGlyph(assessed: number, limit: number): string {
  const share = limit <= 0 ? 0 : assessed / limit
  if (share <= 0) return '○'
  if (share < 0.35) return '◔'
  if (share < 0.7) return '◑'
  return '◕'
}

export const GLYPH: Record<Status, string> = { unlocked: '🔓', locked: '🔒', off: '⏸️' }

/**
 * The footer, beside the native effort picker: the status glyph, the level
 * running, and while unlocked how much of the window is used. The word is dim
 * while the last assessment is less than 50% sure of the level running.
 */
export function footerLabel(state: RouterState, view: View): { text: string; dim: boolean } {
  const setting = view.setting
  if (state.unsupported || state.status === 'off') return { text: `${GLYPH.off} ${setting ?? 'off'}`, dim: true }
  const glyph = GLYPH[state.status]
  if (view.assessing) return { text: `${glyph} assessing…`, dim: false }
  const running = runningLevel(state, setting)
  const sure = confidenceNow(state, view)
  const dim = state.status === 'unlocked' && sure !== undefined && sure < 0.5
  if (state.status === 'locked') return { text: `${glyph} ${running ?? ''}`.trim(), dim: false }
  return { text: `${glyph}${running ? ` ${running}` : ''} ${progressGlyph(state.assessed, view.limit)}`, dim }
}

const morePrompts = (n: number): string => `${n} more prompt${n === 1 ? '' : 's'}`

/**
 * The band's first line: the footer in words, in the same order. Status,
 * the level running and where it came from, confidence, what changes next.
 */
export function bandHeadline(state: RouterState, view: View): string {
  if (state.unsupported) return `Effort router: off on ${state.unsupported}. It works with ${SUPPORTED_NAMES}.`
  const setting = view.setting
  if (state.status === 'off') {
    const level = setting ? `${capital(setting)} (your effort setting)` : 'Your effort setting applies'
    const why = state.offReason === 'picker' ? ' You changed the effort picker.' : state.offReason === 'mid-flow' ? ' This session started before the router.' : ''
    return `Effort router: off. ${level}.${why}`
  }
  const running = runningLevel(state, setting)
  const sure = confidenceNow(state, view)
  const confidence = sure === undefined ? '' : `, ${percent(sure)} confidence`
  if (state.status === 'locked') {
    const after = state.lockedAfter ? ` after ${state.lockedAfter} prompt${state.lockedAfter === 1 ? '' : 's'}` : ''
    const who = state.lockedBy === 'you' ? `locked by you${after}` : `chosen by the router${after}`
    return `Effort router: locked. ${capital(running ?? 'your level')} (${who})${confidence}.`
  }
  const source = state.level ? 'chosen by the router' : 'your effort setting'
  const level = running ? `${capital(running)} (${source})${confidence}.` : 'Your effort setting applies.'
  const left = Math.max(0, view.limit - state.assessed)
  return `Effort router: unlocked. ${level} Locks after ${morePrompts(left)}.`
}

/** `low 5%, medium 55%, high 35%, xhigh 5%`: levels with 1% or more. */
export const spreadText = (spread: Spread): string =>
  LEVELS.filter(level => (spread[level] ?? 0) >= 0.005)
    .map(level => `${level} ${Math.round((spread[level] as number) * 100)}%`)
    .join(', ')

/**
 * The band's second line: the last assessment's spread, its larger side
 * against the level it was judged against, and what it did. `60% sure medium
 * is too low, so it stayed. It moves at 70%.`
 */
export function lastAssessmentLine(last: LastAssessment | undefined, threshold: number, offered: readonly Level[], locked: boolean): string | undefined {
  if (!last) return undefined
  if (!last.spread || !last.level) return `Last assessment: no clear task yet, so it stayed.`
  const reason = last.reason ? ` (${last.reason})` : ''
  const parts = [`Last assessment: ${spreadText(last.spread)}${reason}.`]
  if (last.against) {
    const mass = (above: boolean) =>
      offered.filter(l => (above ? rank(l) > rank(last.against as Level) : rank(l) < rank(last.against as Level)))
        .reduce((n, l) => n + (last.spread?.[l] ?? 0), 0)
    const up = mass(true)
    const down = mass(false)
    const side = up >= down ? { share: up, way: 'low' } : { share: down, way: 'high' }
    const moved = last.outcome.startsWith('moved')
    const did = moved ? `so it moved to ${last.level}` : 'so it stayed'
    parts.push(`${percent(side.share)} sure ${last.against} ${moved ? 'was' : 'is'} too ${side.way}, ${did}.${moved ? '' : ` It moves at ${percent(threshold)}.`}`)
  }
  if (locked && last.why) parts.push(last.why)
  return parts.join(' ')
}

/** The band's third line, when subagents were routed. */
export const subagentLine = (count: number | undefined): string | undefined =>
  count ? `Subagents get their own level: ${count} routed this session.` : undefined

/**
 * One slot of the band. `disabled` slots are drawn dim and say why when
 * pressed, so no slot moves between statuses.
 */
export type BandAction = {
  value: 'hide' | 'lock' | 'unlock' | 'off' | 'on-locked' | 'on-unlocked' | 'assess' | 'on-assess'
  label: string
  disabled?: string
}

/**
 * The band's four slots, a gradient from doing nothing to taking action: 1
 * Hide, 2 the lock, 3 on and off, 4 assess. Tommy, 2026-10-05.
 */
export function bandActions(state: RouterState, view: View): BandAction[] {
  const hide: BandAction = { value: 'hide', label: 'Hide' }
  if (state.unsupported) return [hide]
  const running = runningLevel(state, view.setting)
  if (state.status === 'off') {
    return [
      hide,
      state.lastLevel
        ? { value: 'on-locked', label: `Turn on, locked at ${state.lastLevel}` }
        : { value: 'on-locked', label: 'Turn on, locked', disabled: 'The router has no level of its own to lock at yet.' },
      { value: 'on-unlocked', label: 'Turn on, unlocked' },
      { value: 'on-assess', label: 'Turn on and assess' },
    ]
  }
  const lock: BandAction =
    state.status === 'locked'
      ? { value: 'unlock', label: 'Unlock' }
      : running
        ? { value: 'lock', label: `Lock at ${running}` }
        : { value: 'lock', label: 'Lock', disabled: 'Nothing to lock yet: the level shows with the first request.' }
  const assess: BandAction =
    state.status === 'locked'
      ? { value: 'assess', label: 'Assess' }
      : { value: 'assess', label: 'Assess', disabled: 'It assesses before your next prompt anyway.' }
  return [hide, lock, { value: 'off', label: 'Turn off' }, assess]
}

// --- messages in the conversation (dim, never sent to the model) ----------------------

export const message = {
  moved: (from: Level | undefined, to: Level, reason: string): string =>
    `Effort router: assessed, ${from ? `${from} to ${to}` : to} (${reason}).`,
  locked: (level: Level): string => `Effort router: locked at ${level}.`,
  lockedByYou: (level: Level): string => `Effort router: you locked it at ${level}.`,
  unlocked: (): string => 'Effort router: unlocked. Assessing again from your next prompt.',
  picker: (level: string): string => `Effort router: you changed the effort to ${level}, so routing is off.`,
  off: (setting?: Level): string => `Effort router: off.${setting ? ` Your effort (${setting}) applies.` : ' Your effort setting applies.'}`,
  onLocked: (level: Level): string => `Effort router: on, locked at ${level}.`,
  onUnlocked: (): string => 'Effort router: on, unlocked.',
}

// --- /er ----------------------------------------------------------------------------

export type RouteCommand =
  | { kind: 'band' }
  | { kind: 'lock' }
  | { kind: 'unlock' }
  | { kind: 'on' }
  | { kind: 'off' }
  | { kind: 'assess'; hint?: string }
  | { kind: 'report'; period: SpendPeriod }
  | { kind: 'status' }
  | { kind: 'rules' }
  | { kind: 'unknown'; text: string }

export const ROUTE_USAGE =
  '/er opens the band. Also: /er lock, unlock, on, off, assess [hint], report [session|week|month|all], status, rules. /er is short for /effort-router.'

/**
 * `/er` arguments. Bare `/er` opens the band. Explicit verbs, not toggles, so
 * a repeat is harmless. Anything else is refused rather than run as a hint.
 */
export function parseRoute(args: string): RouteCommand {
  const text = args.trim()
  const words = text.split(/\s+/).filter(Boolean)
  const verb = words[0]?.toLowerCase()
  const rest = text.slice(words[0]?.length ?? 0).trim()
  if (!verb) return { kind: 'band' }
  if (verb === 'assess') return rest ? { kind: 'assess', hint: rest } : { kind: 'assess' }
  if (words.length === 1 && (verb === 'lock' || verb === 'unlock' || verb === 'on' || verb === 'off' || verb === 'status' || verb === 'rules')) return { kind: verb }
  if (verb === 'report' && words.length <= 2) {
    const period = words[1]?.toLowerCase()
    if (period === undefined) return { kind: 'report', period: 'week' }
    if (isSpendPeriod(period)) return { kind: 'report', period }
  }
  return { kind: 'unknown', text }
}

/**
 * What `/er status` prints: the band's lines, then the troubleshooting
 * details: the last assessment's full reply and how it was made, the last
 * error, how much a separate call read, and the routed subagents.
 */
export function routeReport(state: RouterState, view: View, diagnostics?: ReadDiagnostics): string {
  const lines = [bandHeadline(state, view)]
  const last = lastAssessmentLine(view.last, view.threshold, view.offered, state.status === 'locked')
  if (last) lines.push(last)
  if (state.status === 'unlocked') lines.push(`Assessed ${Math.min(state.assessed, view.limit)} of ${view.limit} prompts.`)
  if (state.hint) lines.push(`Your hint for the next assessment: ${state.hint}`)
  if (diagnostics) {
    lines.push(`Assessments this session: ${diagnostics.calls}. It moves at ${percent(view.threshold)}.`)
    const verdict = diagnostics.verdict
    if (verdict) {
      const took = diagnostics.lastReadMs === undefined ? '' : `, took ${(diagnostics.lastReadMs / 1000).toFixed(1)}s`
      const how = verdict.kind === 'fork' ? 'a fork of the conversation' : verdict.kind === 'first' ? 'a separate call' : verdict.kind ?? 'an assessment'
      lines.push(`Last reply (${verdict.trigger}, ${how}, ${ago(diagnostics.now, verdict.at)}${took}${view.last?.against ? `, judged against ${view.last.against}` : ''}): ${cut(verdict.raw.replace(/\s+/g, ' ').trim(), 600)}`)
    }
    const sent = diagnostics.sent
    if (sent && sent.omitted > 0) lines.push(`The separate call read ${sent.sentChars} of the conversation's ${sent.fullChars} characters (limit ${sent.maxChars}).`)
    if (diagnostics.error) lines.push(`Last error (${ago(diagnostics.now, diagnostics.error.at)}): ${cut(diagnostics.error.text, 200)}`)
    if (diagnostics.subagents) lines.push(...subagentReport(diagnostics.subagents))
  }
  lines.push(ROUTE_USAGE)
  return lines.join('\n')
}

// --- saved state (in the session's ledger) ---------------------------------------------

/** What a session's ledger keeps of its state, so a resume finds it. */
export type SavedState = Pick<RouterState, 'status' | 'level' | 'assessed' | 'lockedBy' | 'lockedAfter' | 'offReason' | 'lastLevel' | 'hint'>

export function savedOf(state: RouterState): SavedState {
  const { status, level, assessed, lockedBy, lockedAfter, offReason, lastLevel, hint } = state
  return {
    status, assessed,
    ...(level ? { level } : {}), ...(lockedBy ? { lockedBy } : {}), ...(lockedAfter ? { lockedAfter } : {}),
    ...(offReason ? { offReason } : {}), ...(lastLevel ? { lastLevel } : {}), ...(hint ? { hint } : {}),
  }
}

/** Rebuilds state from a ledger's saved state; undefined when there is none, or it is malformed. */
export function restored(saved: unknown): RouterState | undefined {
  if (typeof saved !== 'object' || saved === null) return undefined
  const r = saved as Record<string, unknown>
  if (r.status !== 'unlocked' && r.status !== 'locked' && r.status !== 'off') return undefined
  const state: RouterState = { status: r.status, assessed: isCount(r.assessed) ? r.assessed : 0 }
  if (isLevel(r.level)) state.level = r.level
  if (r.lockedBy === 'router' || r.lockedBy === 'you') state.lockedBy = r.lockedBy
  if (isCount(r.lockedAfter)) state.lockedAfter = r.lockedAfter
  if (r.offReason === 'you' || r.offReason === 'picker' || r.offReason === 'mid-flow') state.offReason = r.offReason
  if (isLevel(r.lastLevel)) state.lastLevel = r.lastLevel
  if (typeof r.hint === 'string' && r.hint.trim() !== '') state.hint = r.hint
  if (state.status === 'locked' && !state.level) return { ...state, status: 'unlocked' }
  return state
}

// --- rules from settings (organisation, user, project) ----------------------------------

/**
 * Reads effort-router's `rules` out of one settings source (a parsed
 * settings.json): `pluginConfigs[<name> | <name>@<marketplace>].options.rules`,
 * then a top-level `effortRouter.rules`. Managed (policy) settings are how an
 * organisation pushes its preferences; they layer under everyone else's.
 */
export function settingsRulesOf(source: unknown, pluginName = 'effort-router'): string | undefined {
  if (typeof source !== 'object' || source === null) return undefined
  const record = source as Record<string, unknown>
  const candidates: unknown[] = []
  const configs = record.pluginConfigs
  if (typeof configs === 'object' && configs !== null) {
    for (const [key, value] of Object.entries(configs as Record<string, unknown>)) {
      if (key === pluginName || key.startsWith(`${pluginName}@`)) candidates.push((value as Record<string, unknown> | null)?.options)
    }
  }
  candidates.push(record.effortRouter)
  for (const candidate of candidates) {
    const rules = (candidate as Record<string, unknown> | null | undefined)?.rules
    if (typeof rules === 'string' && rules.trim() !== '') return rules
  }
  return undefined
}

export type RuleSources = {
  defaults: string
  org?: string
  /** The org layer's label, e.g. `managed settings`. */
  orgSource?: string
  userFile?: { path: string; text: string | undefined }
  userSettings?: string
  projectFile?: { path: string; text: string | undefined }
  projectSettings?: string
}

/** The layer stack: shipped defaults, organisation, user (file, else setting), project (file, else setting). */
export function ruleLayers(sources: RuleSources): RuleLayer[] {
  const layers: RuleLayer[] = [{ source: 'built-in defaults', text: sources.defaults }]
  if (sources.org !== undefined) layers.push({ source: sources.orgSource ?? 'managed settings', text: sources.org })
  const pick = (file: RuleSources['userFile'], setting: string | undefined, settingLabel: string): RuleLayer | undefined => {
    if (file?.text !== undefined) return { source: file.path, text: file.text }
    if (setting !== undefined) return { source: settingLabel, text: setting }
    return undefined
  }
  const user = pick(sources.userFile, sources.userSettings, 'user settings (rules option)')
  const project = pick(sources.projectFile, sources.projectSettings, 'project settings (rules option)')
  if (user) layers.push(user)
  if (project) layers.push(project)
  return layers
}

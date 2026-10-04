/**
 * The pure half of effort-router: the levels, the classifier prompt, the
 * transcript trimming, parsing the classifier's reply, the /route grammar and
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

/**
 * The fixed frame around the routing rules. The rules themselves (the
 * article's policy) live in `rules/default.md` and the user's markdown files;
 * this frame holds what no rules file should be able to break: the job, when
 * to answer undecided (only before any task is stated), the worked examples
 * and the JSON contract.
 */
export const CLASSIFIER_FRAME = `You pick the reasoning-effort level for a whole Claude Code session from its transcript. Levels, lowest to highest: low, medium, high, xhigh, max.

When to answer undecided, and when to suggest:
- Answer undecided ONLY when no actionable task has been stated yet: greetings, setup or housekeeping ("pull the latest code", "install the deps", "what's in this repo?"), or pure questions asked before any work. That opening filler is not the task.
- Once the user has stated a real task, suggest the best level for it NOW, even if the details are still unclear. Do not wait for a full spec: you are asked again after every user message and the level is refined as clarification arrives. Unclear details are a reason to pick the level the task most likely needs, never a reason to answer undecided.

Judge the task as it stands now:
- Weigh the latest exchange most. A later clarification of scope overrides an earlier ask: "fix the whole auth system" followed by "actually just the typo in the login message" is a small change.
- Read short replies against the question they answer. If the assistant asked "1. full rewrite or 2. minimal patch?" and the user replied "2", the task is the minimal patch. Answers to the assistant's multiple-choice questions appear as "ASSISTANT asked:" then "USER answered:"; they are the user's words about the task.
- If a user hint is given, the user asked for this routing explicitly: weigh the hint strongly.

Worked examples (transcript, then the reply):
1. USER: hi → {"decision":"undecided"}
2. USER: pull the latest code → {"decision":"undecided"}
3. USER: what's in this repo? / ASSISTANT: A Next.js storefront with a Postgres backend. → {"decision":"undecided"}
4. USER: pull latest code / ASSISTANT: Pulled, 3 new commits. / USER: implement for me a new finance solution pulling from multiple accountancy platforms → {"decision":"lock","level":"high","reason":"new multi-platform finance integration build"} (money, reconciliation and several external APIs: edge cases, even though the details are not settled yet)
5. USER: add a dark mode toggle to the settings page → {"decision":"lock","level":"medium","reason":"regular feature work"}
6. USER: the checkout total is wrong when a coupon expires mid-session, fix it → {"decision":"lock","level":"high","reason":"bug fix in existing code"}
7. USER: refactor the payment retry logic / ASSISTANT: 1. a full rewrite with a state machine or 2. just extract the backoff constant? / USER: 2, keep it simple → {"decision":"lock","level":"low","reason":"small constant extraction"}
8. USER: build a sync job for our invoices / ASSISTANT asked: Which platforms? [options: Xero | QuickBooks | Sage] / USER answered: Xero and QuickBooks, nightly, EU data residency → {"decision":"lock","level":"high","reason":"multi-platform invoice sync"}
9. USER: rename getUser to fetchUser across the repo → {"decision":"lock","level":"low","reason":"mechanical rename"}
10. USER: find security vulnerabilities in our auth service and fix them, work through it on your own, I'm away all day → {"decision":"lock","level":"max","reason":"autonomous security vulnerability hunt"}

Apply these routing rules. Later rules override earlier ones where they conflict:`

export const CLASSIFIER_CONTRACT = `Reply with exactly one JSON object and nothing else:
{"decision":"undecided"}
or
{"decision":"lock","level":"<low|medium|high|xhigh|max>","reason":"<what the task is, 3-8 words, e.g. bug fix in existing code>"}`

/** The classifier's whole system prompt around the composed rules. */
export const classifierSystem = (rules: string): string =>
  `${CLASSIFIER_FRAME}\n\n<rules>\n${rules.trim()}\n</rules>\n\n${CLASSIFIER_CONTRACT}`

// --- rule files and their composition ---------------------------------------------

/** The line that splices in the layer beneath (shipped defaults, then the user's). */
export const DEFAULTS_MARKER = '$defaults'

export type RuleLayer = {
  /** Where it came from, for `/route rules` (a path or `defaults`). */
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

/** What `/route rules init` writes: the defaults kept, an example commented out. */
export const STARTER_RULES = (scope: 'user' | 'project'): string => `${DEFAULTS_MARKER}

<!--
effort-router rules (${scope}). The line "${DEFAULTS_MARKER}" above pulls in the rules beneath this
file (the shipped defaults${scope === 'project' ? ', then your personal file' : ''}). Text after it is added on top;
later rules win. Delete the "${DEFAULTS_MARKER}" line to replace the rules beneath entirely.
Edits apply at the next classification, no reload needed. Run /route rules to see the result.

Example (move it out of this comment to use it):

${scope === 'project'
  ? '- This is a payments codebase. Never pick below high: money movement needs verification.'
  : '- I usually give a detailed spec up front, so ordinary feature work is low, not medium.'}
-->
`

/** The prompt for `/route rules critique`. */
export const critiquePrompt = (defaults: string, composed: ComposedRules): string =>
  `Below are the shipped default rules for a classifier that picks a Claude Code session's reasoning effort (low, medium, high, xhigh, max), and the effective rules after the user's customisation (${composed.contributors.map(c => `${c.source}: ${c.how}`).join('; ')}).

Critique the user's customisation in at most 8 short bullet points: rules that are ambiguous, contradict each other or the defaults, would push most sessions to one level, or that a small classifier model would likely misapply. Suggest concrete rewordings. If nothing was customised, say so in one line.

<defaults>
${defaults.trim()}
</defaults>

<effective>
${composed.text}
</effective>`

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
  /** Cap on the whole rendered transcript (`classifierMaxChars`): the first prompt and the newest lines are kept, human lines before assistant text. */
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

  const now = (current ?? '').trim()
  if (now !== '' && !COMMAND_MESSAGE.test(now)) lines.push(`USER: ${cut(now, limits.userChars)}`)

  return capLines(lines, limits.totalChars).text
}

/** What a capped transcript kept, for `/route status`. */
export type CapStats = { text: string; fullChars: number; sentChars: number; omitted: number }

/** The transcript as `trimTranscript` renders it, with what the cap dropped. */
export function renderTranscript(messages: readonly TranscriptMessage[], current?: string, limits: TrimLimits = DEFAULT_TRIM): CapStats {
  const uncapped = trimTranscript(messages, current, { ...limits, totalChars: Number.MAX_SAFE_INTEGER })
  const capped = capLines(uncapped === '' ? [] : uncapped.split('\n'), limits.totalChars)
  return { ...capped, fullChars: uncapped.length }
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
 * The state for a session the router first sees with prompts already in it:
 * those prompts count toward the budget. A session already past the budget is
 * left alone (off; idle deciding when the organisation keeps the router on).
 */
export function firstSighting(prior: number, decideWithin: number, allowOff: boolean): RouterState {
  const state = { ...freshState(), prompts: prior }
  if (prior < decideWithin) return state
  const offReason = 'existing session — /route to ask'
  return allowOff ? { ...state, mode: 'picker', gaveUp: true, offReason } : { ...state, gaveUp: true, offReason }
}

/**
 * The user message sent to the classifier. A manual `/route <hint>` adds the
 * hint after the transcript.
 */
export const classifierPrompt = (transcript: string, hint?: string): string => {
  const said = hint?.trim()
  const hintBlock = said ? `\n\n<user_hint>\n${said}\n</user_hint>\nThe user asked for this routing explicitly and gave this hint; weigh it strongly.` : ''
  return `Transcript so far (oldest first):\n<transcript>\n${transcript}\n</transcript>${hintBlock}\n\nSuggest the session's effort level now; answer undecided only if no actionable task has been stated yet. JSON only.`
}

// --- parsing the classifier's reply ---------------------------------------------

export type Decision =
  | { decision: 'undecided' }
  | { decision: 'lock'; level: Level; reason: string }

/**
 * Reads the classifier's reply: the first `{...}` in it, so a reply fenced
 * in a json code block or wrapped in prose still parses. Anything
 * unparseable or an unknown level is `undecided`: the router never locks on a reply it cannot
 * read (fail open).
 */
export function parseDecision(reply: string | undefined | null): Decision {
  const record = jsonObjectOf(reply)
  if (!record || (record.decision !== 'lock' && record.decision !== 'suggest')) return { decision: 'undecided' }
  const proposal = proposalOf(record)
  return proposal ? { decision: 'lock', ...proposal } : { decision: 'undecided' }
}

/** The first `{...}` in a reply, parsed; undefined when there is none or it is not a JSON object. */
function jsonObjectOf(reply: string | undefined | null): Record<string, unknown> | undefined {
  const match = typeof reply === 'string' ? reply.match(/\{[\s\S]*\}/) : null
  if (!match) return undefined
  try {
    const data: unknown = JSON.parse(match[0])
    return typeof data === 'object' && data !== null ? (data as Record<string, unknown>) : undefined
  } catch {
    return undefined
  }
}

/** A reply's level (case-insensitive) and reason (capped); undefined for an unknown level. */
function proposalOf(record: Record<string, unknown>): Proposal | undefined {
  const level = typeof record.level === 'string' ? record.level.trim().toLowerCase() : undefined
  if (!isLevel(level)) return undefined
  const reason = typeof record.reason === 'string' ? record.reason.replace(/\s+/g, ' ').trim() : ''
  return { level, reason: reason === '' ? 'classifier' : cut(reason, 60).replace(/… \[\d+ more chars\]$/, '…') }
}

// --- subagents --------------------------------------------------------------------

/**
 * The frame for a subagent's read. A subagent is routed once, at spawn, from
 * the brief its parent wrote: unlike the session read it has no transcript,
 * no user in the loop and no "undecided". The same rules sit inside it, so a
 * user's or organisation's rules ("payments code is never below high") still
 * apply to subagents.
 */
export const SUBAGENT_FRAME = `You pick the reasoning-effort level for one Claude Code subagent from the brief its parent agent wrote for it. Levels, lowest to highest: low, medium, high, xhigh, max.

How a subagent differs from a session with a user:
- No user is in the loop. The subagent works alone from its brief until it reports back; nobody answers its questions or checks its steps. Without a user in the loop, higher effort does better on open-ended work that needs judgement: implementing or changing code, debugging, code review, security work, design and planning. Pick high for these; xhigh when the work is edge-case heavy in security, concurrency, performance, ML/data or hardware; max only for a long, fully autonomous hunt or build on a hard problem.
- Mechanical work and tight specs gain little from effort, with or without a user: searching a codebase or the web, looking something up, listing or reading files, collecting or tabulating facts, running a given command and reporting its output, summarising or extracting from text it is given. Pick low for these.
- medium is for small, well-specified code changes that follow an existing pattern.
- The brief is the whole task: decide from it alone and do not assume context it does not state. The agent type is a hint (a search or explore agent is usually mechanical), but the brief decides.
- There is no undecided. If the brief is short or vague, pick the level the work it describes most likely needs.

Worked examples (agent type: brief, then the reply):
1. Explore: list every call site of chargeCard() with file and line → {"decision":"lock","level":"low","reason":"codebase search"}
2. general-purpose: look up the current Node.js LTS version and its end-of-life date, cite the page → {"decision":"lock","level":"low","reason":"web lookup"}
3. general-purpose: run the lint script and paste back any errors verbatim → {"decision":"lock","level":"low","reason":"run a command and report"}
4. general-purpose: in the orders table component, add a "Region" column the same way "Country" is shown → {"decision":"lock","level":"medium","reason":"small change following a pattern"}
5. general-purpose: the nightly export job sometimes writes duplicate rows; find out why and fix it → {"decision":"lock","level":"high","reason":"debugging an intermittent bug"}
6. general-purpose: implement the webhook retry queue described below, with tests (spec follows) → {"decision":"lock","level":"high","reason":"feature implementation, no user in loop"}
7. general-purpose: audit the file upload handler for path traversal and unsafe deserialisation → {"decision":"lock","level":"xhigh","reason":"security audit"}

Apply these routing rules too. They were written for whole sessions; read them for a subagent, which has no user in the loop. Later rules override earlier ones where they conflict:`

export const SUBAGENT_CONTRACT = `Reply with exactly one JSON object and nothing else:
{"decision":"lock","level":"<low|medium|high|xhigh|max>","reason":"<what the subagent's task is, 3-8 words, e.g. codebase search>"}`

/** The subagent read's whole system prompt around the composed rules. */
export const subagentSystem = (rules: string): string =>
  `${SUBAGENT_FRAME}\n\n<rules>\n${rules.trim()}\n</rules>\n\n${SUBAGENT_CONTRACT}`

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

/** The user message for a subagent's read: its type, description and brief (capped at `maxChars`). */
export const subagentPrompt = (brief: SubagentBrief, maxChars: number = DEFAULT_TRIM.totalChars): string =>
  `Agent type: ${brief.subagentType || 'unknown'}\nDescription: ${brief.description.trim() || '(none)'}\n<brief>\n${capBrief(brief.prompt.trim(), maxChars)}\n</brief>\n\nPick the effort level this subagent should run at, from its brief alone. JSON only.`

/**
 * Reads a subagent read's reply: a level and reason, from the first `{...}`.
 * The `decision` field may be left out; an explicit undecided, an unknown
 * level or anything unparseable is undefined, and the caller falls back.
 */
export function parseSubagentReply(reply: string | undefined | null): Proposal | undefined {
  const record = jsonObjectOf(reply)
  if (!record) return undefined
  if (record.decision !== undefined && record.decision !== 'lock' && record.decision !== 'suggest') return undefined
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
export type AgentDefinition = { name: string; effort?: Level | number; source: string }

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
  return effort === undefined ? { name, source } : { name, effort, source }
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
    out.push(effort === undefined ? { name: name.trim(), source } : { name: name.trim(), effort, source })
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
 * Whether subagents are routed in this state. They are unless the person
 * turned the router off themselves (`/route off`, Revert, Turn off), which
 * clears `offReason`. When the router turned itself off (an existing session,
 * a spent budget) `offReason` says so, and subagents are still routed: each
 * brief is a new, whole task.
 */
export const routesSubagents = (state: RouterState): boolean => state.mode === 'auto' || state.offReason !== undefined

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

/** Why subagents are or are not routed, for `/route status`. */
export type SubagentStatus = { routing: 'on' | 'setting' | 'org' | 'user-off'; agents: readonly RoutedAgent[] }

/** `/route status`'s subagent lines: whether they are routed, then the newest `shown`, newest first. */
export function subagentReport(status: SubagentStatus, shown = 10): string[] {
  const why = {
    on: 'routed from their own briefs at spawn',
    setting: 'not routed (routeSubagents is off); they run at the main level',
    org: "not routed (your organisation's settings turn it off); they run at the main level",
    'user-off': "not routed while the router is off; they run at the picker's level",
  }[status.routing]
  const lines = [`Subagents: ${why}.`]
  if (status.agents.length === 0) return lines
  const recent = status.agents.slice(-shown).reverse()
  lines.push(`Routed subagents this session: ${status.agents.length}${status.agents.length > recent.length ? ` (newest ${recent.length} shown)` : ''}.`)
  for (const agent of recent) {
    const description = cut(agent.description.replace(/\s+/g, ' ').trim() || '(no description)', 60).replace(/… \[\d+ more chars\]$/, '…')
    lines.push(`  ${agent.level}${agent.byDefinition ? ' (set by its definition)' : ''}: ${description} (${agent.subagentType || 'agent'}) — ${agent.reason}`)
  }
  return lines
}

// --- /route grammar -------------------------------------------------------------

export type RouteCommand =
  | { kind: 'suggest'; hint?: string }
  | { kind: 'status' }
  | { kind: 'off' }
  | { kind: 'on' }
  | { kind: 'rules' }
  | { kind: 'rules-init'; scope: 'user' | 'project' }
  | { kind: 'rules-critique' }

export const ROUTE_USAGE =
  'usage: /route [hint] | /route status | /route off | /route on | /route rules [init [user|project] | critique]'

/**
 * `/route` arguments. Bare `/route` runs the router now; any other text that
 * is not a subcommand is a hint for that run. `decide` is a hidden alias of
 * bare `/route`. Setting a level by hand is the effort picker's job.
 */
export function parseRoute(args: string): RouteCommand {
  const text = args.trim()
  const words = text.toLowerCase().split(/\s+/).filter(Boolean)
  const [verb, arg, extra, more] = words
  if (words.length === 0) return { kind: 'suggest' }
  if (words.length === 1) {
    if (verb === 'status') return { kind: 'status' }
    if (verb === 'off') return { kind: 'off' }
    if (verb === 'on') return { kind: 'on' }
    if (verb === 'decide') return { kind: 'suggest' }
    if (verb === 'rules') return { kind: 'rules' }
  }
  if (verb === 'rules') {
    if (arg === 'critique' && extra === undefined) return { kind: 'rules-critique' }
    if (arg === 'init' && more === undefined && (extra === undefined || extra === 'user' || extra === 'project')) {
      return { kind: 'rules-init', scope: extra ?? 'user' }
    }
  }
  return { kind: 'suggest', hint: text }
}

// --- state and what the mod shows -------------------------------------------------

export type Mode = 'auto' | 'picker'

export type Phase = 'undecided' | 'locked'

export type Proposal = { level: Level; reason: string }

/** A question open about a verdict: use the router's level, or keep the picker's (unknown when no request has gone out yet). */
export type Asking = Proposal & { picker?: Level }

const insteadOf = (asking: Asking): string => (asking.picker ? ` instead of ${asking.picker}` : '')

/**
 * Everything the router remembers about one session.
 *
 * `auto` + `undecided` is deciding: requests go out at the picker's level.
 * `auto` + `locked` is decided: every main-thread request runs at `level` and
 * no more reads happen. `picker` is off.
 *
 * With consent `ask` a read's level is not applied: it waits in `pending` for
 * the next main-thread request, which is the only place the picker's level can
 * be seen. There it is compared: the same level locks, a different one asks
 * (`asking` while the question is open).
 */
export type RouterState = {
  mode: Mode
  phase: Phase
  /** The locked level. */
  level?: Level
  /** Why it is locked, in words for status (`router: bug fix in existing code`). */
  reason?: string
  /** A read's verdict waiting for the next main-thread request (consent `ask`). Not persisted. */
  pending?: Proposal
  /** The question open about a verdict. Not persisted. */
  asking?: Asking
  /** A manual run's hint, kept for later automatic reads until a level is locked. */
  hint?: string
  /** Human prompts counted against the decision budget since the router was (re)started. */
  prompts: number
  /** The budget ran out with nothing locked: no automatic reads. */
  gaveUp?: boolean
  /** Why the router is off, when it turned itself off (cleared when the person turns it off). */
  offReason?: string
}

export const freshState = (): RouterState => ({ mode: 'auto', phase: 'undecided', prompts: 0 })

/** `ask`: a level that differs from the picker's is asked about. `auto`: the router's level is locked without a question. */
export type Consent = 'ask' | 'auto'

/**
 * A consent value. 0.8 has two: `ask` and `auto`. The older names map onto
 * them: `apply` and `none` (applied without a question) → `auto`; `confirm`
 * and `band` (waited for the person) → `ask`. Anything else is undefined.
 */
export function consentOf(value: unknown): Consent | undefined {
  if (value === 'ask' || value === 'confirm' || value === 'band') return 'ask'
  if (value === 'auto' || value === 'apply' || value === 'none') return 'auto'
  return undefined
}

/** The level `turn.step` applies to the main thread, or undefined to leave the request alone. */
export function appliedLevel(state: RouterState): Level | undefined {
  return state.mode === 'auto' && state.phase === 'locked' ? state.level : undefined
}

/** Whether an automatic read should follow this human prompt. */
export function wantsRead(state: RouterState, decideWithin: number): boolean {
  return state.mode === 'auto' && state.phase !== 'locked' && !state.gaveUp && state.prompts <= decideWithin
}

/**
 * After an automatic read (and after a question is settled): once the budget
 * is spent with nothing locked, stop reading. A verdict still waiting for its
 * question keeps the router on until it is settled; otherwise the router turns
 * off (or, when the organisation keeps it on, idles as deciding).
 */
export function afterBudget(state: RouterState, decideWithin: number, allowOff: boolean): RouterState {
  if (state.mode !== 'auto' || state.phase === 'locked' || state.prompts < decideWithin) return state
  if (state.pending || state.asking) return state.gaveUp ? state : { ...state, gaveUp: true }
  const offReason = `no clear task after ${decideWithin} prompts — /route to ask again`
  if (state.gaveUp && state.offReason === offReason) return state
  return allowOff
    ? { ...state, mode: 'picker', gaveUp: true, offReason, hint: undefined }
    : { ...state, gaveUp: true, offReason, hint: undefined }
}

/** A read's verdict while deciding (consent `ask`): kept for the next request to compare, or cleared when undecided. Locked or off: unchanged. */
export function withVerdict(state: RouterState, proposal: Proposal | undefined): RouterState {
  if (state.mode !== 'auto' || state.phase === 'locked') return state
  return proposal ? { ...state, pending: proposal } : state.pending ? { ...state, pending: undefined } : state
}

/**
 * What a main-thread request does with a waiting verdict, given the picker's
 * level (`e.effort` as the request came in): nothing to do; the same level
 * (lock it, no question); or a different level (ask). A picker level that is
 * not a named level (a number, or a model without effort) leaves the verdict
 * waiting.
 */
export type StepDecision = { kind: 'none' } | { kind: 'agree'; proposal: Proposal } | { kind: 'ask'; asking: Asking & { picker: Level } }

export function stepDecision(state: RouterState, picker: unknown): StepDecision {
  const pending = state.pending
  if (state.mode !== 'auto' || state.phase === 'locked' || !pending || !isLevel(picker)) return { kind: 'none' }
  return pending.level === picker ? { kind: 'agree', proposal: pending } : { kind: 'ask', asking: { ...pending, picker } }
}

/** Locks a level, for the stated reason: decided, so reading stops. */
export const lockedAt = (state: RouterState, level: Level, reason: string): RouterState => ({
  ...state,
  mode: 'auto',
  phase: 'locked',
  level,
  reason,
  pending: undefined,
  asking: undefined,
  hint: undefined,
  offReason: undefined,
})

/** The reasons a lock is shown with. */
export const lockReason = {
  /** The router's level, chosen (Use) or applied (consent auto). */
  router: (proposal: Proposal): string => `router: ${proposal.reason}`,
  /** The router agreed with the picker. */
  agreed: (proposal: Proposal): string => `router: ${proposal.reason}, same as the picker`,
  /** The person kept the picker's level over the router's. */
  kept: (asking: Asking & { picker: Level }): string => `you kept ${asking.picker} over the router's ${asking.level} (${asking.reason})`,
}

/**
 * The question asked when the router's level differs from the current one:
 * one line with the reason, `Use <level>` and `Keep <current>` (or `Not now`
 * when the current level is unknown).
 */
export function effortQuestion(proposal: Proposal, current: Level | undefined): { text: string; options: [string, string]; header: string } {
  const reason = proposal.reason.charAt(0).toUpperCase() + proposal.reason.slice(1)
  return current
    ? { text: `Effort router: ${reason}. Use ${proposal.level} instead of ${current}?`, options: [`Use ${proposal.level}`, `Keep ${current}`], header: 'Effort' }
    : { text: `Effort router: ${reason}. Use ${proposal.level}?`, options: [`Use ${proposal.level}`, 'Not now'], header: 'Effort' }
}

/** Off: the picker is in charge. */
export const turnedOff = (state: RouterState): RouterState => ({
  ...state, mode: 'picker', phase: 'undecided', level: undefined, reason: undefined, pending: undefined, asking: undefined, hint: undefined, offReason: undefined,
})

/** On: deciding again over the whole conversation, with a fresh prompt budget. */
export const turnedOn = (state: RouterState): RouterState => ({
  ...state, mode: 'auto', phase: 'undecided', level: undefined, reason: undefined, pending: undefined, asking: undefined, hint: undefined, prompts: 0, gaveUp: false, offReason: undefined,
})

/** What the router knows about its own reads, for `/route status`. */
export type ReadDiagnostics = {
  /** Now, in ms since the epoch. */
  now: number
  /** Classifier calls this session, automatic and manual. */
  calls: number
  verdict?: { at: number; trigger: string; raw: string; decision: Decision }
  error?: { at: number; text: string }
  /** The consent mode in force. */
  consent?: string
  /** How long the last read took, in ms. */
  lastReadMs?: number
  /** The last read's transcript: characters sent, characters before the cap, the cap, lines dropped. */
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

/** What `/route status` prints. `inForce` is the level the last main-thread request went out with. */
export function routeReport(state: RouterState, decideWithin: number, inForce?: string | number, diagnostics?: ReadDiagnostics): string {
  const now = inForce === undefined ? "the picker's level" : String(inForce)
  const lines: string[] = []
  const subagents = diagnostics?.subagents?.routing === 'on' ? '; subagents get their own level from their briefs' : ''
  if (state.asking) {
    lines.push(`${state.asking.level}? Asking whether to use ${state.asking.level}${insteadOf(state.asking)} (${state.asking.reason}); the request waits for the answer.`)
  } else if (state.mode === 'picker') {
    lines.push(`off${state.offReason ? ` (${state.offReason})` : ''}. Effort is the picker's (now ${now}). /route on turns it back on; /route asks now.`)
  } else if (state.phase === 'locked') {
    lines.push(`${state.level} 🔒 (${state.reason ?? 'router'}). Every request${subagents ? '' : ' and subagent'} runs at ${state.level}${subagents}.`)
  } else if (state.pending) {
    lines.push(`deciding. The last read suggests ${state.pending.level} (${state.pending.reason}); the next request compares it with the picker's level and asks if they differ. Until then ${now} applies.`)
  } else {
    lines.push(`deciding. The router reads each prompt until the task is clear; until then ${now} (the picker's level) applies.`)
  }
  if (state.mode === 'auto' && state.phase !== 'locked') {
    lines.push(state.gaveUp
      ? `Automatic reads stopped (${state.offReason ?? `budget of ${decideWithin} prompts spent`}). /route asks now.`
      : `Automatic reads: ${Math.min(state.prompts, decideWithin)} of ${decideWithin} used.`)
  }
  if (state.hint) lines.push(`Hint: ${state.hint}`)
  if (diagnostics) {
    if (diagnostics.consent) lines.push(`Consent: ${diagnostics.consent}.`)
    lines.push(`Classifier calls this session: ${diagnostics.calls}.${diagnostics.lastReadMs !== undefined ? ` Last read took ${diagnostics.lastReadMs} ms.` : ''}`)
    const verdict = diagnostics.verdict
    if (verdict) {
      const said = verdict.decision.decision === 'lock' ? `${verdict.decision.level} (${verdict.decision.reason})` : 'undecided'
      lines.push(`Last verdict (${verdict.trigger}, ${ago(diagnostics.now, verdict.at)}): ${said}. Raw: ${cut(verdict.raw.replace(/\s+/g, ' ').trim(), 200)}`)
    }
    if (diagnostics.sent) {
      const sent = diagnostics.sent
      lines.push(
        sent.omitted > 0
          ? `Last read sent ${sent.sentChars} of ${sent.fullChars} transcript chars (cap ${sent.maxChars}; ${sent.omitted} messages left out).`
          : `Last read sent the whole transcript: ${sent.sentChars} chars (cap ${sent.maxChars}).`,
      )
    }
    if (diagnostics.error) lines.push(`Last error (${ago(diagnostics.now, diagnostics.error.at)}): ${cut(diagnostics.error.text, 200)}`)
    if (diagnostics.subagents) lines.push(...subagentReport(diagnostics.subagents))
  }
  lines.push(ROUTE_USAGE)
  return lines.join('\n')
}

/** A colour per level for the band (Ink theme keys / named colours). */
export const LEVEL_COLOR: Record<Level, string> = {
  low: 'green',
  medium: 'cyan',
  high: 'yellow',
  xhigh: 'magenta',
  max: 'red',
}

// --- persistence ------------------------------------------------------------------

/** What `$.store` keeps per session id so a resume finds its lock. */
export type SavedState = Pick<RouterState, 'mode' | 'phase' | 'level' | 'reason' | 'offReason'> & { savedAt: number }

export const MAX_SAVED_SESSIONS = 100

/** Adds/replaces one session's saved state, keeping the newest `MAX_SAVED_SESSIONS`. A waiting verdict or open question is not kept. */
export function withSaved(
  all: Record<string, SavedState> | undefined,
  sessionId: string,
  state: RouterState,
  now: number,
): Record<string, SavedState> {
  const next: Record<string, SavedState> = { ...(all ?? {}) }
  delete next[sessionId]
  const saved: SavedState = { mode: state.mode, phase: state.phase === 'locked' ? 'locked' : 'undecided', savedAt: now }
  if (state.level !== undefined) saved.level = state.level
  if (state.reason !== undefined) saved.reason = state.reason
  if (state.offReason !== undefined) saved.offReason = state.offReason
  next[sessionId] = saved
  const ids = Object.keys(next).sort((a, b) => (next[a]?.savedAt ?? 0) - (next[b]?.savedAt ?? 0))
  while (ids.length > MAX_SAVED_SESSIONS) delete next[ids.shift() as string]
  return next
}

/**
 * Rebuilds state from a saved entry; anything malformed starts fresh. A
 * 0.1–0.3 `pinned` entry comes back locked; a 0.6–0.7 provisional or proposed
 * one comes back deciding.
 */
export function restored(saved: unknown): RouterState {
  const state = freshState()
  if (typeof saved !== 'object' || saved === null) return state
  const record = saved as Record<string, unknown>
  const mode = record.mode
  if (mode === 'picker') return typeof record.offReason === 'string' ? { ...state, mode, offReason: record.offReason } : { ...state, mode }
  const locked = (mode === 'auto' && record.phase === 'locked') || mode === 'pinned'
  if (locked && isLevel(record.level)) {
    return { ...state, phase: 'locked', level: record.level, reason: typeof record.reason === 'string' ? record.reason : 'restored' }
  }
  return state
}

/**
 * The compact state the footer shows beside the native effort picker (which
 * shows the level in use): `deciding`, `high?` while the question is open,
 * `high 🔒` or `off`. `dim` where nothing is locked or asked.
 */
export function footerLabel(state: RouterState): { text: string; color?: string; dim: boolean } {
  if (state.asking) return { text: `${state.asking.level}?`, color: LEVEL_COLOR[state.asking.level], dim: false }
  if (state.mode === 'picker') return { text: 'off', dim: true }
  if (state.phase === 'locked' && state.level) return { text: `${state.level} 🔒`, color: LEVEL_COLOR[state.level], dim: false }
  return { text: 'deciding', dim: true }
}

export type BandAction = {
  /** What the action does: `suggest` (bare `/route`), `off` or `on`; `revert` (off, from the auto notice). */
  value: 'suggest' | 'off' | 'on' | 'revert'
  label: string
}

/** The band consent `auto` opens by itself once, after locking a level other than the picker's. */
export const noticeHeadline = (proposal: Proposal): string => `Using ${proposal.level} — ${proposal.reason}`

/** Its one action, `Revert to picker` (router off), left out when the organisation keeps the router on. */
export const noticeActions = (allowOff = true): BandAction[] => (allowOff ? [{ value: 'revert', label: 'Revert to picker' }] : [])

/**
 * The router's band above the prompt, which the footer button opens. One
 * line: `Effort router: <footer state> — <why>`.
 */
export function bandHeadline(state: RouterState): string {
  const label = footerLabel(state).text
  let why: string
  if (state.asking) why = `asking: use ${state.asking.level}${insteadOf(state.asking)}?`
  else if (state.mode === 'picker') why = state.offReason ?? 'the effort picker decides'
  else if (state.phase === 'locked') why = state.reason ?? 'router'
  else if (state.gaveUp) why = 'stopped reading; Suggest now asks again'
  else why = "the picker's effort applies until the task is clear"
  return `Effort router: ${label} — ${why}`
}

/**
 * The band's buttons for a state (then `Close`, which the caller adds): off →
 * `Turn on`; otherwise `Suggest now`, `Turn off`. `allowOff: false` (an
 * organisation's setting) leaves out Turn off.
 */
export function bandActions(state: RouterState, allowOff = true): BandAction[] {
  if (state.mode === 'picker') return [{ value: 'on', label: 'Turn on' }]
  return allowOff ? [{ value: 'suggest', label: 'Suggest now' }, { value: 'off', label: 'Turn off' }] : [{ value: 'suggest', label: 'Suggest now' }]
}

// --- settings-borne rules (org / user / project) --------------------------------------

export type SettingsRules = {
  /** The layer's rules text, when that settings source sets one. */
  rules?: string
  /** Org only: `enforce` makes the org layer final. */
  rulesMode?: 'extend' | 'enforce'
  /** Org only: false stops users turning the router off, so the org's routing always applies. */
  allowOff?: boolean
  /** Org only: false turns subagent routing off for everyone. */
  routeSubagents?: boolean
}

/**
 * Reads effort-router's settings out of one settings source (a parsed
 * settings.json). Looks in `pluginConfigs[<name> | <name>@<marketplace>].options`
 * first, then a top-level `effortRouter` object. Anything malformed is ignored.
 */
export function settingsRulesOf(source: unknown, pluginName = 'effort-router'): SettingsRules {
  const out: SettingsRules = {}
  if (typeof source !== 'object' || source === null) return out
  const record = source as Record<string, unknown>
  const candidates: unknown[] = []
  const configs = record.pluginConfigs
  if (typeof configs === 'object' && configs !== null) {
    for (const [key, value] of Object.entries(configs as Record<string, unknown>)) {
      if (key === pluginName || key.startsWith(`${pluginName}@`)) {
        candidates.push((value as Record<string, unknown> | null)?.options)
      }
    }
  }
  candidates.push(record.effortRouter)
  for (const candidate of candidates) {
    if (typeof candidate !== 'object' || candidate === null) continue
    const c = candidate as Record<string, unknown>
    if (out.rules === undefined && typeof c.rules === 'string' && c.rules.trim() !== '') out.rules = c.rules
    if (out.rulesMode === undefined && (c.rulesMode === 'extend' || c.rulesMode === 'enforce')) out.rulesMode = c.rulesMode
    if (out.allowOff === undefined && typeof c.allowOff === 'boolean') out.allowOff = c.allowOff
    if (out.routeSubagents === undefined && typeof c.routeSubagents === 'boolean') out.routeSubagents = c.routeSubagents
  }
  return out
}

export type RuleSources = {
  defaults: string
  org?: SettingsRules
  /** The org layer's label, e.g. `policy settings`. */
  orgSource?: string
  userFile?: { path: string; text: string | undefined }
  userSettings?: string
  projectFile?: { path: string; text: string | undefined }
  projectSettings?: string
}

/**
 * Builds the layer stack: shipped defaults → org (policy settings) → user
 * (file, else user settings option) → project (file, else project settings
 * option). Under org `enforce`, the stack stops at the org layer.
 */
export function ruleLayers(sources: RuleSources): { layers: RuleLayer[]; enforced: boolean } {
  const layers: RuleLayer[] = [{ source: 'shipped defaults', text: sources.defaults }]
  if (sources.org?.rules !== undefined) layers.push({ source: sources.orgSource ?? 'policy settings', text: sources.org.rules })
  const enforced = sources.org?.rulesMode === 'enforce'
  if (enforced) return { layers, enforced }
  const pick = (file: RuleSources['userFile'], setting: string | undefined, settingLabel: string): RuleLayer | undefined => {
    if (file?.text !== undefined) return { source: file.path, text: file.text }
    if (setting !== undefined) return { source: settingLabel, text: setting }
    return undefined
  }
  const user = pick(sources.userFile, sources.userSettings, 'user settings (pluginConfigs option)')
  const project = pick(sources.projectFile, sources.projectSettings, 'project settings (pluginConfigs option)')
  if (user) layers.push(user)
  if (project) layers.push(project)
  return { layers, enforced }
}

// Unit tests for the pure policy module. Run with `bun test` from the mod folder.
// Named *.spec.ts so `claude plugin test` (which loads *.test.ts with the
// engine's own kit) leaves it to bun.
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_TRIM,
  SUPPORTED_NAMES,
  confidenceOf,
  conversationTokens,
  forkPrompt,
  clampLevel,
  levelsBetween,
  levelsUpTo,
  subagentForkPrompt,
  isConfident,
  modelName,
  onModel,
  supportedModel,
  withVerdictOutcome,
  withVerdictRow,
  afterBudget,
  appliedLevel,
  classifierPrompt,
  classifierSystem,
  composeRules,
  footerLabel,
  bandActions,
  bandHeadline,
  consentOf,
  effortQuestion,
  freshState,
  lockReason,
  noticeActions,
  noticeHeadline,
  stepDecision,
  lockedAt,
  parseDecision,
  parseRoute,
  restored,
  routeReport,
  ruleLayers,
  settingsRulesOf,
  STARTER_RULES,
  trimTranscript,
  turnedOff,
  turnedOn,
  wantsRead,
  withVerdict,
  withQuestionAnswer,
  capLines,
  renderTranscript,
  firstSighting,
  humanPromptCount,
  withSaved,
  questionText,
  ago,
  SUBAGENT_CONTRACT,
  agentFileDefinition,
  definitionEffort,
  definitionFor,
  frontmatterOf,
  settingsAgentDefinitions,
  SUBAGENT_FRAME,
  capBrief,
  parentLevel,
  parseSubagentReply,
  routesSubagents,
  subagentPrompt,
  subagentReport,
  subagentSystem,
  type TranscriptMessage,
  dayOf,
  emptyLedger,
  parseLedger,
  spendReport,
  tokens,
  withRead,
  withSpend,
  type SpendLedger,
} from '../hooks/policy'

describe('trimTranscript', () => {
  test('keeps human prompts whole, truncates assistant text, names tools only', () => {
    const long = 'x'.repeat(1000)
    const messages: TranscriptMessage[] = [
      { role: 'user', text: 'pull the latest code' },
      { role: 'assistant', text: long, toolUses: [{ tool: 'Bash' }, { tool: 'Bash' }, { tool: 'Read' }] },
      { role: 'user', text: '', toolResults: [{ text: 'huge tool output' }] },
      { role: 'user', text: '<command-name>/effort</command-name>\n<command-args>high</command-args>' },
      { role: 'assistant', text: 'Pulled.' },
    ]
    const out = trimTranscript(messages, 'now fix the flaky checkout test')
    const lines = out.split('\n')
    expect(lines[0]).toBe('USER: pull the latest code')
    expect(lines[1]).toStartWith('ASSISTANT: xxx')
    expect(lines[1]).toContain(`[${1000 - DEFAULT_TRIM.assistantChars} more chars]`)
    expect(lines[1]).toEndWith('[tools: Bash×2, Read]')
    expect(lines[2]).toBe('ASSISTANT: Pulled.')
    expect(lines[3]).toBe('USER: now fix the flaky checkout test')
    expect(out).not.toContain('huge tool output')
    expect(out).not.toContain('command-name')
  })

  test('drops the middle but keeps the first prompt and the latest lines when too long', () => {
    const messages: TranscriptMessage[] = [{ role: 'user', text: 'FIRST' }]
    for (let i = 0; i < 50; i++) messages.push({ role: 'assistant', text: `reply ${i} ${'y'.repeat(200)}` })
    const out = trimTranscript(messages, 'LATEST', { userChars: 100, assistantChars: 300, lastAssistantChars: 300, totalChars: 2000 })
    expect(out.length).toBeLessThanOrEqual(2000)
    expect(out.split('\n')[0]).toBe('USER: FIRST')
    expect(out).toContain('messages omitted …]')
    expect(out).toEndWith('USER: LATEST')
  })

  test('the last assistant message keeps enough text to read a short reply against', () => {
    const question = 'Before I start: ' + 'context '.repeat(60) + 'Which do you want? 1. full rewrite of the auth module 2. minimal patch to the login message'
    const out = trimTranscript([
      { role: 'user', text: 'fix the login bug' },
      { role: 'assistant', text: 'a'.repeat(1000) },
      { role: 'assistant', text: question },
    ], '2')
    const lines = out.split('\n')
    expect(lines[1]).toContain('more chars]') // an earlier assistant message is cut at 300
    expect(lines[2]).toContain('2. minimal patch to the login message') // the question survives
    expect(lines[3]).toBe('USER: 2')
  })

  test('assistant message with only tool uses', () => {
    expect(trimTranscript([{ role: 'assistant', text: '', toolUses: [{ tool: 'Edit' }] }])).toBe('ASSISTANT: [tools: Edit]')
  })
})

describe('the classifier input cap', () => {
  test('keeps the first prompt, then human lines before assistant text, newest first, within the cap', () => {
    const messages: TranscriptMessage[] = [{ role: 'user', text: 'THE ORIGINAL TASK' }]
    for (let i = 0; i < 60; i++) {
      messages.push({ role: 'assistant', text: `reply ${i} ${'y'.repeat(280)}` })
      messages.push({ role: 'user', text: `prompt ${i}` })
    }
    messages.push({ role: 'assistant', text: 'Which one: 1. full rewrite or 2. minimal patch?' })
    const out = renderTranscript(messages, '2', { ...DEFAULT_TRIM, totalChars: 3000 })
    expect(out.sentChars).toBeLessThanOrEqual(3000)
    expect(out.fullChars).toBeGreaterThan(18_000)
    expect(out.omitted).toBeGreaterThan(0)
    const lines = out.text.split('\n')
    expect(lines[0]).toBe('USER: THE ORIGINAL TASK')
    expect(lines.at(-1)).toBe('USER: 2')
    expect(lines.at(-2)).toBe('ASSISTANT: Which one: 1. full rewrite or 2. minimal patch?') // the question a short reply answers
    // every human prompt fits (they are short); assistant replies are what gets dropped
    for (let i = 0; i < 60; i++) expect(out.text).toContain(`USER: prompt ${i}\n`)
    expect(out.text).toContain('[… 1 messages omitted …]')
  })

  test('under the cap nothing is dropped', () => {
    expect(capLines(['USER: a', 'ASSISTANT: b'], 1000)).toEqual({ text: 'USER: a\nASSISTANT: b', sentChars: 20, omitted: 0 })
  })

  test('the default cap is 24k characters', () => {
    expect(DEFAULT_TRIM.totalChars).toBe(24_000)
  })
})

describe('AskUserQuestion in the transcript', () => {
  const QUESTIONS = {
    questions: [
      { question: 'Which platforms?', header: 'Platforms', options: [{ label: 'Xero', description: '' }, { label: 'QuickBooks', description: '' }], multiSelect: true },
      { question: 'Where is the data held?', header: 'Region', options: [{ label: 'UK', description: '' }, { label: 'EU', description: '' }], multiSelect: false },
    ],
  }
  const ANSWER = 'User has answered your questions: "Which platforms?"="Xero, QuickBooks", "Where is the data held?"="EU". You can now continue.'

  test('questions and answers are kept, not reduced to a tool name', () => {
    const out = trimTranscript([
      { role: 'user', text: 'build a finance sync' },
      { role: 'assistant', text: 'A few questions first.', toolUses: [{ tool: 'Read' }, { tool: 'AskUserQuestion', tool_use_id: 'q1', input: QUESTIONS, text: ANSWER }] },
    ])
    expect(out.split('\n')).toEqual([
      'USER: build a finance sync',
      'ASSISTANT: A few questions first. [tools: Read]',
      'ASSISTANT asked: Which platforms? [options: Xero | QuickBooks]; Where is the data held? [options: UK | EU]',
      `USER answered: ${ANSWER}`,
    ])
  })

  test('an unanswered question shows the question only', () => {
    const out = trimTranscript([{ role: 'assistant', text: '', toolUses: [{ tool: 'AskUserQuestion', input: QUESTIONS }] }])
    expect(out).toBe('ASSISTANT asked: Which platforms? [options: Xero | QuickBooks]; Where is the data held? [options: UK | EU]')
    expect(questionText({ nope: 1 })).toBe('')
  })

  test('the answer known at tool.call is patched in, or appended when the transcript lacks the call', () => {
    const stored = [{ role: 'assistant' as const, text: '', toolUses: [{ tool: 'AskUserQuestion', tool_use_id: 'q1', input: QUESTIONS }] }]
    const patched = withQuestionAnswer(stored, { toolUseId: 'q1', input: QUESTIONS, text: ANSWER })
    expect(patched).toHaveLength(1)
    expect(patched[0]?.toolUses?.[0]?.text).toBe(ANSWER)
    expect(stored[0]?.toolUses[0]).not.toHaveProperty('text') // not mutated
    const appended = withQuestionAnswer([{ role: 'user', text: 'build it' }], { toolUseId: 'q9', input: QUESTIONS, text: ANSWER })
    expect(trimTranscript(appended)).toContain(`USER answered: ${ANSWER}`)
  })
})

describe('parseDecision', () => {
  const cases: [string | undefined, ReturnType<typeof parseDecision>][] = [
    ['{"decision":"undecided"}', { decision: 'undecided' }],
    ['{"decision":"lock","level":"high","reason":"bug fix in existing code"}', { decision: 'lock', level: 'high', reason: 'bug fix in existing code' }],
    ['Sure! ```json\n{"decision":"lock","level":"MAX","reason":"autonomous build"}\n```', { decision: 'lock', level: 'max', reason: 'autonomous build' }],
    ['{"decision":"lock","level":"ultra","reason":"x"}', { decision: 'undecided' }],
    ['{"decision":"lock","level":"low"}', { decision: 'lock', level: 'low', reason: 'classifier' }],
    ['not json at all', { decision: 'undecided' }],
    ['{broken', { decision: 'undecided' }],
    ['```json\n{"decision":"undecided"}\n```', { decision: 'undecided' }],
    ['```json\n{"decision":"lock","level":"high","reason":"finance integration build"}\n```', { decision: 'lock', level: 'high', reason: 'finance integration build' }],
    ['{"decision":"suggest","level":"medium","reason":"feature work"}', { decision: 'lock', level: 'medium', reason: 'feature work' }],
    [undefined, { decision: 'undecided' }],
  ]
  for (const [reply, expected] of cases) {
    test(String(reply).slice(0, 50), () => expect(parseDecision(reply)).toEqual(expected))
  }
})

describe('composeRules ($defaults layering)', () => {
  const D = { source: 'defaults', text: 'DEFAULTS' }

  test('no files: defaults', () => {
    expect(composeRules([D, { source: 'user', text: undefined }, { source: 'project', text: undefined }])).toEqual({
      text: 'DEFAULTS',
      contributors: [{ source: 'defaults', how: 'base' }],
    })
  })

  test('append and prepend splice the layer beneath', () => {
    expect(composeRules([D, { source: 'user', text: '$defaults\nUSER AFTER' }]).text).toBe('DEFAULTS\nUSER AFTER')
    expect(composeRules([D, { source: 'user', text: 'USER BEFORE\n$defaults' }]).text).toBe('USER BEFORE\nDEFAULTS')
  })

  test('no marker replaces what is beneath', () => {
    const out = composeRules([D, { source: 'user', text: 'ONLY MINE' }])
    expect(out.text).toBe('ONLY MINE')
    expect(out.contributors[1]).toEqual({ source: 'user', how: 'replaced' })
  })

  test('project splices the user-composed result, not the raw defaults', () => {
    const out = composeRules([
      D,
      { source: 'user', text: '$defaults\nUSER' },
      { source: 'project', text: '$defaults\nPROJECT: never below high' },
    ])
    expect(out.text).toBe('DEFAULTS\nUSER\nPROJECT: never below high')
    expect(out.contributors.map(c => c.how)).toEqual(['base', 'spliced', 'spliced'])
  })

  test('project replace drops user and defaults', () => {
    expect(composeRules([D, { source: 'user', text: '$defaults\nUSER' }, { source: 'project', text: 'P' }]).text).toBe('P')
  })

  test('marker must be the whole line; CRLF ok; empty files and comment-only starter change nothing', () => {
    expect(composeRules([D, { source: 'user', text: 'see $defaults here' }]).text).toBe('see $defaults here')
    expect(composeRules([D, { source: 'user', text: 'A\r\n  $defaults  \r\nB' }]).text).toBe('A\nDEFAULTS\nB')
    expect(composeRules([D, { source: 'user', text: '   \n' }]).contributors).toHaveLength(1)
    const starter = composeRules([D, { source: 'user', text: STARTER_RULES('user') }])
    expect(starter.text).toBe('DEFAULTS')
  })

  test('the system prompt wraps the rules between the fixed frame and contract', () => {
    const system = classifierSystem('MY RULES')
    expect(system).toContain('<rules>\nMY RULES\n</rules>')
    expect(system).toContain('{"decision":"undecided"}')
  })
})

describe('parseRoute', () => {
  const cases: [string, ReturnType<typeof parseRoute>][] = [
    ['', { kind: 'suggest' }],
    ['  ', { kind: 'suggest' }],
    ['decide', { kind: 'suggest' }],
    ['status', { kind: 'status' }],
    ['OFF', { kind: 'off' }],
    ['on', { kind: 'on' }],
    ['this is a security review', { kind: 'suggest', hint: 'this is a security review' }],
    ['keep it quick', { kind: 'suggest', hint: 'keep it quick' }],
    ['off topic: just a quick question', { kind: 'suggest', hint: 'off topic: just a quick question' }],
    ['rules', { kind: 'rules' }],
    ['rules init', { kind: 'rules-init', scope: 'user' }],
    ['rules init project', { kind: 'rules-init', scope: 'project' }],
    ['rules critique', { kind: 'rules-critique' }],
    ['rules are strict here', { kind: 'suggest', hint: 'rules are strict here' }],
    // removed: reset and fix are now plain hints
    ['reset', { kind: 'suggest', hint: 'reset' }],
    ['report', { kind: 'report', period: 'week' }],
    ['report session', { kind: 'report', period: 'session' }],
    ['report MONTH', { kind: 'report', period: 'month' }],
    ['report all', { kind: 'report', period: 'all' }],
    ['report the bug in checkout', { kind: 'suggest', hint: 'report the bug in checkout' }],
  ]
  for (const [args, expected] of cases) {
    test(`/route ${args}`, () => expect(parseRoute(args)).toEqual(expected))
  }
})

describe('the classifier prompt', () => {
  test('recency rules live in the fixed frame', () => {
    const system = classifierSystem('RULES')
    expect(system).toContain('Weigh the latest exchange most')
    expect(system).toContain('A later clarification of scope overrides an earlier ask')
    expect(system).toContain('replied "2"')
  })

  test('undecided only before any task; an underspecified task still gets a level; worked examples', () => {
    const system = classifierSystem('RULES')
    expect(system).toContain('Answer undecided ONLY when no actionable task has been stated yet')
    expect(system).toContain('suggest the best level for it NOW, even if the details are still unclear')
    expect(system).not.toContain('When unsure, answer undecided')
    expect(system).toContain('implement for me a new finance solution pulling from multiple accountancy platforms → a level for the finance build.')
    expect(system).toContain('USER: pull the latest code → {"decision":"undecided"}')
    expect(system).toContain('2, keep it simple → a level for extracting one constant.')
    expect(system).toContain('USER answered:')
    expect((system.match(/^\d+\. USER:/gm) ?? []).length).toBeGreaterThanOrEqual(6)
    // 0.11: no example or rule names the level a kind of task gets; the model notes say what each level can do
    expect(system).not.toMatch(/"level":"(low|medium|high|xhigh|max)"/)
    expect(classifierPrompt('USER: hi')).toContain('answer undecided only if no actionable task has been stated yet')
  })

  test('a manual hint is passed and weighted', () => {
    const prompt = classifierPrompt('USER: hi', 'this is a security review')
    expect(prompt).toContain('<user_hint>\nthis is a security review\n</user_hint>')
    expect(prompt).toContain('weigh it strongly')
    expect(classifierPrompt('USER: hi')).not.toContain('user_hint')
  })
})

describe('state', () => {
  const P_HIGH = { level: 'high' as const, reason: 'bug fix in existing code' }
  const P_LOW = { level: 'low' as const, reason: 'minimal patch' }
  const DECIDING = freshState()
  const PENDING = withVerdict(DECIDING, P_HIGH)
  const LOCKED = lockedAt(DECIDING, 'high', lockReason.router(P_HIGH))
  const OFF = turnedOff(DECIDING)
  const ASKING = { ...DECIDING, asking: { ...P_HIGH, picker: 'medium' as const } }

  test('consent: ask and auto; the old names map onto them', () => {
    expect(consentOf('ask')).toBe('ask')
    expect(consentOf('auto')).toBe('auto')
    expect(consentOf('confirm')).toBe('ask')
    expect(consentOf('band')).toBe('ask')
    expect(consentOf('apply')).toBe('auto')
    expect(consentOf('none')).toBe('auto')
    expect(consentOf('sometimes')).toBeUndefined()
    expect(consentOf(undefined)).toBeUndefined()
  })

  test('a verdict waits for the next request; undecided clears it; locked or off is unchanged', () => {
    expect(PENDING).toMatchObject({ mode: 'auto', phase: 'undecided', pending: P_HIGH })
    expect(appliedLevel(PENDING)).toBeUndefined() // nothing applied until compared with the picker
    expect(withVerdict(PENDING, P_LOW).pending).toEqual(P_LOW)
    expect(withVerdict(PENDING, undefined).pending).toBeUndefined()
    expect(withVerdict(DECIDING, undefined)).toBe(DECIDING)
    expect(withVerdict(LOCKED, P_LOW)).toBe(LOCKED)
    expect(withVerdict(OFF, P_LOW)).toBe(OFF)
  })

  test("the rule at a request: nothing waiting → nothing; the picker's level → agree; another level → ask", () => {
    expect(stepDecision(DECIDING, 'medium')).toEqual({ kind: 'none' })
    expect(stepDecision(PENDING, 'high')).toEqual({ kind: 'agree', proposal: P_HIGH })
    expect(stepDecision(PENDING, 'medium')).toEqual({ kind: 'ask', asking: { ...P_HIGH, picker: 'medium' } })
    expect(stepDecision(PENDING, undefined)).toEqual({ kind: 'none' }) // a model without effort: it keeps waiting
    expect(stepDecision(PENDING, 32000)).toEqual({ kind: 'none' })
    expect(stepDecision({ ...LOCKED, pending: P_LOW }, 'medium')).toEqual({ kind: 'none' })
    expect(stepDecision({ ...OFF, pending: P_LOW }, 'medium')).toEqual({ kind: 'none' })
  })

  test('the question: one line with the reason, Use <level> / Keep <picker>; Not now when the picker is unknown', () => {
    expect(effortQuestion(P_HIGH, 'medium')).toEqual({
      text: 'Effort router: Bug fix in existing code. Use high effort instead of medium?',
      options: ['Use high', 'Keep medium'],
      between: [],
      header: 'Effort',
    })
    expect(effortQuestion(P_LOW, undefined)).toEqual({ text: 'Effort router: Minimal patch. Use low effort?', options: ['Use low', 'Not now'], between: [], header: 'Effort' })
  })

  test('a lock stops reading and clears what was waiting; its reason says who chose', () => {
    const locked = lockedAt({ ...PENDING, hint: 'h', asking: ASKING.asking }, 'medium', lockReason.kept({ ...P_HIGH, picker: 'medium' }))
    expect(locked).toMatchObject({ mode: 'auto', phase: 'locked', level: 'medium' })
    expect(locked.pending).toBeUndefined()
    expect(locked.asking).toBeUndefined()
    expect(locked.hint).toBeUndefined()
    expect(locked.reason).toBe('your choice')
    expect(lockReason.agreed(P_HIGH)).toBe('bug fix in existing code')
    expect(lockReason.chosen(P_HIGH)).toBe('bug fix in existing code')
    expect(wantsRead({ ...locked, prompts: 1 }, 6)).toBe(false)
    expect(appliedLevel(LOCKED)).toBe('high')
    expect(appliedLevel(OFF)).toBeUndefined()
    expect(appliedLevel(ASKING)).toBeUndefined()
  })

  test('first sighting: earlier prompts count; past the budget the router is left off', () => {
    expect(firstSighting(0, 6, true)).toEqual(freshState())
    expect(firstSighting(4, 6, true)).toEqual({ ...freshState(), prompts: 4 })
    expect(firstSighting(10, 6, true)).toMatchObject({ mode: 'picker', gaveUp: true, offReason: 'session started before the router' })
    expect(footerLabel(firstSighting(10, 6, true)).text).toBe('off')
    expect(firstSighting(10, 6, false)).toMatchObject({ mode: 'auto', phase: 'undecided', gaveUp: true })
    expect(wantsRead({ ...firstSighting(10, 6, false), prompts: 11 }, 6)).toBe(false)
    expect(
      humanPromptCount([
        { role: 'user', text: 'one' },
        { role: 'assistant', text: 'ok' },
        { role: 'user', text: '' }, // a tool result
        { role: 'user', text: '<command-name>/effort</command-name>' },
        { role: 'user', text: '[Request interrupted by user]' },
        { role: 'user', text: 'two' },
      ]),
    ).toBe(2)
  })

  test('the decision budget; a waiting verdict is still asked before the router turns off', () => {
    expect(wantsRead({ ...DECIDING, prompts: 1 }, 6)).toBe(true)
    expect(wantsRead({ ...DECIDING, prompts: 6 }, 6)).toBe(true)
    expect(wantsRead({ ...DECIDING, prompts: 7 }, 6)).toBe(false)
    expect(wantsRead({ ...PENDING, prompts: 3 }, 6)).toBe(true)
    expect(wantsRead({ ...OFF, prompts: 1 }, 6)).toBe(false)
    expect(wantsRead({ ...DECIDING, prompts: 1, gaveUp: true }, 6)).toBe(false)

    expect(afterBudget({ ...DECIDING, prompts: 5 }, 6, true)).toEqual({ ...DECIDING, prompts: 5 })
    const off = afterBudget({ ...DECIDING, prompts: 6 }, 6, true)
    expect(off).toMatchObject({ mode: 'picker', gaveUp: true, offReason: 'no clear task after 6 prompts' })
    expect(footerLabel(off).text).toBe('off')
    const idle = afterBudget({ ...DECIDING, prompts: 6 }, 6, false)
    expect(idle).toMatchObject({ mode: 'auto', phase: 'undecided', gaveUp: true })
    expect(afterBudget(idle, 6, false)).toBe(idle) // settled: unchanged
    expect(footerLabel(idle)).toEqual({ text: 'deciding', dim: true })

    const waiting = afterBudget({ ...PENDING, prompts: 6 }, 6, true)
    expect(waiting).toMatchObject({ mode: 'auto', pending: P_HIGH, gaveUp: true })
    expect(wantsRead(waiting, 6)).toBe(false)
    expect(afterBudget({ ...waiting, pending: undefined }, 6, true)).toMatchObject({ mode: 'picker' }) // dismissed: now it turns off
    expect(afterBudget({ ...LOCKED, prompts: 9 }, 6, true)).toEqual({ ...LOCKED, prompts: 9 })
  })

  test('turn on and off clear what was waiting', () => {
    expect(turnedOn({ ...OFF, prompts: 6, gaveUp: true, offReason: 'x' })).toMatchObject({ mode: 'auto', phase: 'undecided', prompts: 0, gaveUp: false, offReason: undefined })
    expect(turnedOff(PENDING).pending).toBeUndefined()
    expect(turnedOff(LOCKED)).toMatchObject({ mode: 'picker', level: undefined, offReason: undefined })
  })

  test('footer labels: deciding, high? only while asking, high 🔒, off', () => {
    expect(footerLabel(DECIDING)).toEqual({ text: 'deciding', dim: true })
    expect(footerLabel(PENDING)).toEqual({ text: 'deciding', dim: true })
    expect(footerLabel(ASKING)).toEqual({ text: 'high?', color: 'yellow', dim: false })
    expect(footerLabel({ ...LOCKED, asking: { ...P_LOW, picker: 'medium' } }).text).toBe('low?') // /route asking while locked
    expect(footerLabel(LOCKED)).toEqual({ text: 'using high', color: 'yellow', dim: false })
    expect(footerLabel(OFF)).toEqual({ text: 'off', dim: true })
  })

  test('the band: headline per state; Assess now or Reassess / Stop routing, or Start routing; the auto notice with Stop routing', () => {
    const labels = (state: typeof DECIDING, allowOff = true, setting?: 'medium') => bandActions(state, allowOff, setting).map(a => a.label)
    expect(labels(DECIDING, true, 'medium')).toEqual(['Assess now', 'Stop routing (back to medium)'])
    expect(labels(LOCKED, true, 'medium')).toEqual(['Reassess now', 'Reassess with my next prompt', 'Stop routing (back to medium)'])
    expect(labels(LOCKED)).toEqual(['Reassess now', 'Reassess with my next prompt', 'Stop routing'])
    expect(labels(OFF)).toEqual(['Start routing'])
    expect(labels(DECIDING, false)).toEqual(['Assess now'])
    expect(labels(LOCKED, false)).toEqual(['Reassess now', 'Reassess with my next prompt'])
    expect(parseRoute('next')).toEqual({ kind: 'next' })

    expect(bandHeadline(LOCKED)).toBe('Effort router: using high for this session (bug fix in existing code).')
    expect(bandHeadline({ ...LOCKED, why: 'A crash fix needs the code traced, but the scope is one function.' })).toBe(
      'Effort router: using high for this session (bug fix in existing code). A crash fix needs the code traced, but the scope is one function.',
    )
    expect(bandHeadline(ASKING)).toBe('Effort router: high? Waiting for your answer.')
    expect(bandHeadline(OFF)).toBe('Effort router: off. Your effort setting applies.')
    expect(bandHeadline(DECIDING)).toBe('Effort router: deciding. Your effort setting applies until the task is clear.')
    expect(bandHeadline({ ...DECIDING, gaveUp: true })).toBe('Effort router: stopped checking (no clear task yet). Your effort setting applies.')

    expect(noticeHeadline(P_HIGH)).toBe('Effort router: using high for this session (bug fix in existing code).')
    expect(noticeHeadline({ ...P_HIGH, from: 'xhigh', why: 'Tracing the crash needs care.' })).toBe(
      'Effort router: changed from xhigh to high for this session (bug fix in existing code). Tracing the crash needs care.',
    )
    expect(noticeActions(true, 'medium', 'medium').map(a => a.label)).toEqual(['OK', 'Stop routing (back to medium)']) // from your setting: no separate Go back
    expect(noticeActions(true, 'medium', 'xhigh').map(a => a.label)).toEqual(['OK', 'Go back to xhigh', 'Stop routing (back to medium)'])
    expect(noticeActions(false, 'medium', 'medium').map(a => a.label)).toEqual(['OK'])
  })

  test('a check can say why, in a sentence or two, and the reply keeps it', () => {
    expect(parseDecision('{"decision":"level","level":"high","confidence":0.8,"reason":"bug fix","why":"Tracing  the crash\\nneeds care."}')).toEqual({
      decision: 'lock', level: 'high', reason: 'bug fix', why: 'Tracing the crash needs care.', confidence: 0.8,
    })
    expect(classifierSystem('RULES')).toContain('"why":"<one or two sentences')
  })

  test('reasons and status', () => {
    expect(routeReport(afterBudget({ ...DECIDING, prompts: 6 }, 6, true), 6)).toStartWith('Off (no clear task after 6 prompts), so your effort setting applies. /route on turns it back on.')
    expect(afterBudget({ ...DECIDING, prompts: 1 }, 1, true).offReason).toBe('no clear task after 1 prompt')
    expect(afterBudget({ ...DECIDING, prompts: 6 }, 6, true, { level: 'high', reason: 'tax advice', confidence: 0.65 }).offReason).toBe(
      'not sure enough after 6 prompts, last check high at 65%',
    )
    expect(routeReport(LOCKED, 6)).toStartWith('Using high for this session (bug fix in existing code). Subagents use it too.')
    expect(routeReport(ASKING, 6)).toStartWith('high? Waiting for your answer: use high effort instead of medium (bug fix in existing code)?')
    expect(routeReport(PENDING, 6, 'medium')).toStartWith("Deciding. The last check suggested high (bug fix in existing code). If that isn't your setting, you'll be asked before Claude carries on.")
    expect(routeReport({ ...DECIDING, prompts: 2 }, 6, 'medium')).toContain('Prompts checked: 2 of up to 6.')
    const report = routeReport({ ...DECIDING, prompts: 2 }, 6, 'medium', {
      now: 100_000,
      calls: 3,
      consent: 'ask',
      lastReadMs: 1240,
      verdict: { at: 88_000, trigger: 'after a prompt', raw: '```json\n{"decision":"undecided"}\n```', decision: { decision: 'undecided' } },
      error: { at: 100_000 - 5 * 60_000, text: 'Error: timeout' },
      sent: { sentChars: 23_900, fullChars: 91_000, maxChars: 24_000, omitted: 210 },
    })
    expect(report).toContain("If that level isn't your setting, it asks you first (consent: ask).")
    expect(report).toContain('Checks this session: 3.')
    expect(report).toContain('Last check (after a prompt, 12s ago, took 1.2s): no clear task yet.')
    expect(report).toContain('Last error (5m ago): Error: timeout')
    expect(report).toContain("It read 23900 of the conversation's 91000 characters (limit 24000).")
    expect(routeReport(DECIDING, 6, 'medium', { now: 0, calls: 1, sent: { sentChars: 80, fullChars: 80, maxChars: 24_000, omitted: 0 } })).not.toContain('It read')
    expect(ago(0, 2 * 3600_000)).toBe('0s ago')
    expect(ago(3 * 3600_000, 0)).toBe('3h ago')
    expect(routeReport({ ...DECIDING, hint: 'keep it quick' }, 6)).toContain('Your hint: keep it quick')
  })

  test('saved state: a lock and off round-trip; a waiting verdict is not kept; old provisional and proposed come back deciding', () => {
    expect(restored(withSaved(undefined, 's1', LOCKED, 1).s1)).toMatchObject({ mode: 'auto', phase: 'locked', level: 'high', reason: 'bug fix in existing code' })
    const saved = restored(withSaved(undefined, 's2', ASKING, 1).s2)
    expect(saved).toEqual(freshState())
    const gaveUp = afterBudget({ ...DECIDING, prompts: 6 }, 6, true)
    expect(restored(withSaved(undefined, 's3', gaveUp, 1).s3)).toMatchObject({ mode: 'picker', offReason: gaveUp.offReason })
    expect(restored({ mode: 'auto', phase: 'provisional', level: 'high', reason: 'r', savedAt: 1 })).toEqual(freshState())
    expect(restored({ mode: 'auto', phase: 'proposed', savedAt: 1 })).toEqual(freshState())
    expect(restored({ mode: 'pinned', phase: 'locked', level: 'max', reason: 'you chose max' })).toMatchObject({ mode: 'auto', phase: 'locked', level: 'max' })
    expect(restored({ mode: 'pinned', level: 'nope' })).toEqual(freshState())
    let all: ReturnType<typeof withSaved> = {}
    for (let i = 0; i < 105; i++) all = withSaved(all, `id${i}`, LOCKED, i)
    expect(Object.keys(all)).toHaveLength(100)
    expect(all.id0).toBeUndefined()
  })
})

describe('settings-borne rules', () => {
  test('reads pluginConfigs options under any marketplace key, then a top-level effortRouter object', () => {
    expect(settingsRulesOf({ pluginConfigs: { 'effort-router@tommy-mods': { options: { rules: 'R', rulesMode: 'enforce', allowOff: false } } } }))
      .toEqual({ rules: 'R', rulesMode: 'enforce', allowOff: false })
    expect(settingsRulesOf({ effortRouter: { rules: 'TOP' } })).toEqual({ rules: 'TOP' })
    expect(settingsRulesOf({ pluginConfigs: { 'other@x': { options: { rules: 'NO' } } } })).toEqual({})
    expect(settingsRulesOf({ effortRouter: { rules: '  ', rulesMode: 'bogus', allowOff: 'no' } })).toEqual({})
    expect(settingsRulesOf(undefined)).toEqual({})
  })

  test('layer order and enforce', () => {
    const base = { defaults: 'D', org: { rules: '$defaults\nO' }, userFile: { path: 'u.md', text: '$defaults\nU' }, projectSettings: '$defaults\nP' }
    expect(composeRules(ruleLayers(base).layers).text).toBe('D\nO\nU\nP')
    const enforced = ruleLayers({ ...base, org: { rules: '$defaults\nO', rulesMode: 'enforce' as const } })
    expect(enforced.enforced).toBe(true)
    expect(composeRules(enforced.layers).text).toBe('D\nO')
    expect(ruleLayers({ defaults: 'D', userFile: { path: 'u.md', text: 'FILE' }, userSettings: 'SETTING' }).layers.map(l => l.text)).toEqual(['D', 'FILE'])
    expect(ruleLayers({ defaults: 'D', userFile: { path: 'u.md', text: undefined }, userSettings: 'SETTING' }).layers.map(l => l.text)).toEqual(['D', 'SETTING'])
  })
})

describe('subagent reads', () => {
  const BRIEF = { subagentType: 'Explore', description: 'Find webhook handlers', prompt: 'List every webhook handler with file and line.' }

  test('the system prompt: the subagent frame, the composed rules, a contract with no undecided', () => {
    const system = subagentSystem('MY RULE')
    expect(system).toStartWith(SUBAGENT_FRAME)
    expect(system).toContain('<rules>\nMY RULE\n</rules>')
    expect(system).toEndWith(SUBAGENT_CONTRACT)
    expect(SUBAGENT_CONTRACT).not.toContain('undecided')
    expect(SUBAGENT_FRAME).toContain('No user is in the loop')
    expect(SUBAGENT_FRAME).toContain('There is no undecided')
  })

  test('the user prompt: type, description and the brief', () => {
    expect(subagentPrompt(BRIEF)).toBe(
      'Agent type: Explore\nDescription: Find webhook handlers\n<brief>\nList every webhook handler with file and line.\n</brief>\n\nPick the effort level this subagent should run at, from its brief alone: decide from it and do not assume context it does not state. JSON only.',
    )
    expect(subagentPrompt({ subagentType: '', description: ' ', prompt: 'x' })).toStartWith('Agent type: unknown\nDescription: (none)\n')
  })

  test('a long brief keeps its head and tail within the cap', () => {
    const brief = `START ${'m'.repeat(5000)} END`
    const capped = capBrief(brief, 1000)
    expect(capped.length).toBeLessThanOrEqual(1000)
    expect(capped).toStartWith('START ')
    expect(capped).toEndWith(' END')
    expect(capped).toMatch(/\[… \d+ chars omitted …\]/)
    expect(capBrief('short', 1000)).toBe('short')
    expect(subagentPrompt({ ...BRIEF, prompt: brief }, 1000).length).toBeLessThan(1300)
  })

  test('the subagent read knows the model the subagent runs on, and a fork of the parent is asked with the brief', () => {
    const notes = { name: 'Sonnet 5.5', notes: '- low: chat and lookups.' }
    expect(subagentSystem('RULES', notes)).toContain('The subagent runs on Sonnet 5.5. What each level can do on this model (the main guide to the level):\n<model_notes>\n- low: chat and lookups.\n</model_notes>')
    const fork = subagentForkPrompt({ rules: 'RULES', brief: BRIEF, runsOn: 'Sonnet 5.5', model: notes })
    expect(fork).toStartWith('Pause the task for a moment. Do not use any tools and do not start the subagent yourself')
    expect(fork).toContain('You are about to start a Explore subagent on Sonnet 5.5 ("Find webhook handlers") with the brief below. You know the task and why you are delegating this part of it: use that.')
    expect(fork).toContain('<brief>\nList every webhook handler with file and line.\n</brief>')
    expect(fork).toContain('<rules>\nRULES\n</rules>')
    expect(fork).not.toContain('from its brief alone')
  })

  test('agent definitions carry their model, unless it inherits', () => {
    expect(agentFileDefinition('---\nname: scout\nmodel: haiku\n---\nbody', 'scout.md', 'user')).toEqual({ name: 'scout', model: 'haiku', source: 'user' })
    expect(agentFileDefinition('---\nname: scout\nmodel: inherit\neffort: low\n---\n', 'scout.md', 'user')).toEqual({ name: 'scout', effort: 'low', source: 'user' })
    expect(settingsAgentDefinitions({ agents: { scout: { model: 'sonnet' } } }, 'project')).toEqual([{ name: 'scout', model: 'sonnet', source: 'project' }])
  })

  test('parses a level and reason; decision may be left out; anything else falls back (undefined)', () => {
    expect(parseSubagentReply('{"decision":"lock","level":"low","reason":"codebase search"}')).toEqual({ level: 'low', reason: 'codebase search' })
    expect(parseSubagentReply('```json\n{"level":"HIGH","reason":"debugging"}\n```')).toEqual({ level: 'high', reason: 'debugging' })
    expect(parseSubagentReply('{"level":"xhigh"}')).toEqual({ level: 'xhigh', reason: 'classifier' })
    // Sonnet 5.5 live, 2026-10-04: the level named as the decision.
    expect(parseSubagentReply('{"decision":"medium","reason":"thorough read-only codebase search for call sites"}')).toEqual({ level: 'medium', reason: 'thorough read-only codebase search for call sites' })
    expect(parseSubagentReply('{"decision":"level","level":"low"}')).toEqual({ level: 'low', reason: 'classifier' })
    expect(parseDecision('{"decision":"High","confidence":0.8,"reason":"bug fix"}')).toEqual({ decision: 'lock', level: 'high', reason: 'bug fix', confidence: 0.8 })
    expect(parseSubagentReply('{"decision":"undecided"}')).toBeUndefined()
    expect(parseSubagentReply('{"decision":"undecided","level":"low"}')).toBeUndefined()
    expect(parseSubagentReply('{"level":"extreme","reason":"x"}')).toBeUndefined()
    expect(parseSubagentReply('high, because it is debugging')).toBeUndefined()
    expect(parseSubagentReply('{not json')).toBeUndefined()
    expect(parseSubagentReply(undefined)).toBeUndefined()
  })

  test("the parent's level: the parent subagent's routed level, else the main level in use, else none", () => {
    const agents = new Map([['agent-1', { level: 'xhigh' as const, reason: 'security audit', subagentType: 'general-purpose', description: 'audit' }]])
    const provisional = lockedAt(freshState(), 'high', 'router: bug fix')
    expect(parentLevel(provisional, agents)).toBe('high')
    expect(parentLevel(provisional, agents, 'agent-1')).toBe('xhigh')
    expect(parentLevel(provisional, agents, 'agent-unknown')).toBe('high') // it ran at the main level
    expect(parentLevel(freshState(), agents)).toBeUndefined()
    expect(parentLevel(freshState(), agents, 'agent-1')).toBe('xhigh')
  })

  test('routed unless the person turned the router off', () => {
    expect(routesSubagents(freshState())).toBe(true)
    expect(routesSubagents(firstSighting(10, 6, true))).toBe(true) // existing session: off, but by the router
    expect(routesSubagents(afterBudget({ ...freshState(), prompts: 6 }, 6, true))).toBe(true) // no clear task: off, by the router
    expect(routesSubagents(turnedOff(lockedAt(freshState(), 'high', 'router: r')))).toBe(false) // /route off, Revert, Turn off
    expect(routesSubagents(turnedOn(turnedOff(freshState())))).toBe(true)
    expect(routesSubagents(restored({ mode: 'picker' }))).toBe(false)
    expect(routesSubagents(restored({ mode: 'picker', offReason: 'session started before the router' }))).toBe(true)
  })

  test('/route status lists routed subagents, newest first, at most 10', () => {
    const agents = Array.from({ length: 12 }, (_, i) => ({ level: 'low' as const, reason: `reason ${i}`, subagentType: 'Explore', description: `task ${i}` }))
    const lines = subagentReport({ routing: 'on', agents })
    expect(lines[0]).toBe('Subagents: each gets its own level from its task.')
    expect(lines[1]).toBe('Recent subagents (12, newest 10 shown):')
    expect(lines[2]).toBe('  low: task 11 (reason 11)')
    expect(lines).toHaveLength(12)
    expect(lines.at(-1)).toBe('  low: task 2 (reason 2)')
    expect(subagentReport({ routing: 'setting', agents: [] })).toEqual(['Subagents: not routed (routeSubagents is off), so they use the session level.'])
    expect(subagentReport({ routing: 'user-off', agents: [] })[0]).toContain('they use your effort setting')

    const locked = lockedAt(freshState(), 'high', 'router: bug fix')
    expect(routeReport(locked, 6, 'high', { now: 0, calls: 1, subagents: { routing: 'on', agents: [] } }))
      .toStartWith('Using high for this session (router: bug fix). Subagents get their own level.')
    expect(routeReport(locked, 6)).toContain('Subagents use it too.')
  })

  test("the organisation's routeSubagents is read from settings", () => {
    expect(settingsRulesOf({ pluginConfigs: { 'effort-router@tommy-mods': { options: { routeSubagents: false } } } })).toEqual({ routeSubagents: false })
    expect(settingsRulesOf({ effortRouter: { routeSubagents: 'no' } })).toEqual({})
  })
})

describe('agent definitions that set their own effort', () => {
  test('frontmatter: top-level key/value pairs, unquoted; none without a leading --- block', () => {
    const text = '---\nname: "effort-probe-low"\ndescription: Temporary test agent: low\neffort: low # in the definition\ntools:\n  - Read\n---\n\nBody with effort: max\n'
    expect(frontmatterOf(text)).toEqual({ name: 'effort-probe-low', description: 'Temporary test agent: low', effort: 'low' })
    expect(frontmatterOf('---\r\nname: x\r\neffort: high\r\n---\r\n')).toEqual({ name: 'x', effort: 'high' })
    expect(frontmatterOf('﻿---\nname: x\n---')).toEqual({ name: 'x' })
    expect(frontmatterOf('# no frontmatter\nname: x')).toBeUndefined()
    expect(frontmatterOf('intro\n---\nname: x\n---')).toBeUndefined()
  })

  test('an effort counts when it is a level or a positive number', () => {
    expect(definitionEffort('low')).toBe('low')
    expect(definitionEffort(' XHigh ')).toBe('xhigh')
    expect(definitionEffort("'max'")).toBe('max')
    expect(definitionEffort(32000)).toBe(32000)
    expect(definitionEffort('2048')).toBe(2048)
    for (const value of ['', 'inherit', 'very high', '0', 0, -1, null, undefined, true]) expect(definitionEffort(value)).toBeUndefined()
  })

  test('a definition file is named by its frontmatter name, else its file name', () => {
    expect(agentFileDefinition('---\nname: effort-probe-low\neffort: low\n---\n', 'probe.md', 'u/probe.md')).toEqual({ name: 'effort-probe-low', effort: 'low', source: 'u/probe.md' })
    expect(agentFileDefinition('---\ndescription: d\n---\n', 'Scout.md', 'p')).toEqual({ name: 'Scout', source: 'p' })
    expect(agentFileDefinition('---\nname: x\neffort: whatever\n---\n', 'x.md', 'p')).toEqual({ name: 'x', source: 'p' })
    expect(agentFileDefinition('just notes', 'notes.md', 'p')).toBeUndefined()
  })

  test("a settings source's agents key: an object by name or a list of named specs", () => {
    expect(settingsAgentDefinitions({ agents: { auditor: { prompt: 'p', effort: 'xhigh' }, helper: { prompt: 'p' }, bad: 'x' } }, 'user settings')).toEqual([
      { name: 'auditor', effort: 'xhigh', source: 'user settings' },
      { name: 'helper', source: 'user settings' },
    ])
    expect(settingsAgentDefinitions({ agents: [{ name: 'a', effort: 'low' }, { effort: 'high' }] }, 'policy')).toEqual([{ name: 'a', effort: 'low', source: 'policy' }])
    expect(settingsAgentDefinitions({}, 's')).toEqual([])
    expect(settingsAgentDefinitions(undefined, 's')).toEqual([])
  })

  test('the first definition with the name wins, effort or not; plugin agents are never matched', () => {
    const definitions = [
      { name: 'scout', source: 'project' },
      { name: 'reviewer', effort: 'max' as const, source: 'project' },
      { name: 'scout', effort: 'low' as const, source: 'user' },
      { name: 'probe-low', effort: 'low' as const, source: 'user' },
    ]
    expect(definitionFor('scout', definitions)).toEqual({ name: 'scout', source: 'project' })
    expect(definitionFor('reviewer', definitions)?.effort).toBe('max')
    expect(definitionFor('general-purpose', definitions)).toBeUndefined()
    expect(definitionFor('subagent-probe:probe-low', definitions)).toBeUndefined()
  })

  test('status marks a level set by a definition; a nested spawn inherits only a level', () => {
    const lines = subagentReport({ routing: 'on', agents: [{ level: 'low', reason: 'from u/probe.md', subagentType: 'probe', description: 'Probe', byDefinition: true }] })
    expect(lines.at(-1)).toBe('  low: Probe (set by its agent definition)')
    const agents = new Map([
      ['a', { level: 'low' as const, reason: 'r', subagentType: 't', description: 'd', byDefinition: true }],
      ['b', { level: 32000, reason: 'r', subagentType: 't', description: 'd', byDefinition: true }],
    ])
    const provisional = lockedAt(freshState(), 'high', 'router: bug fix')
    expect(parentLevel(provisional, agents, 'a')).toBe('low')
    expect(parentLevel(provisional, agents, 'b')).toBe('high')
  })
})

describe('the spend ledger', () => {
  const usage = (output: number, input = 100) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: 1000, cache_creation_input_tokens: 10 })
  const add = (ledger: SpendLedger, day: string, caller: 'main' | 'subagent', from: string, to: string, output: number, times = 1, byDefinition = false) => {
    let out = ledger
    for (let i = 0; i < times; i++) out = withSpend(out, { day, caller, from, to, byDefinition, usage: usage(output) })
    return out
  }

  test('requests sum into one row per day, caller and pair of levels; input counts cache reads and writes', () => {
    let ledger = emptyLedger('s1', 'mods')
    ledger = add(ledger, '2026-10-04', 'main', 'medium', 'high', 500, 2)
    ledger = add(ledger, '2026-10-04', 'subagent', 'medium', 'high', 50)
    ledger = add(ledger, '2026-10-05', 'main', 'medium', 'high', 7)
    ledger = add(ledger, '2026-10-05', 'subagent', 'low', 'low', 9, 1, true)
    ledger = withSpend(ledger, { day: '2026-10-05', caller: 'main', from: undefined, to: undefined, usage: usage(3) })
    expect(ledger.rows).toEqual([
      { day: '2026-10-04', caller: 'main', from: 'medium', to: 'high', requests: 2, output: 1000, input: 2220 },
      { day: '2026-10-04', caller: 'subagent', from: 'medium', to: 'high', requests: 1, output: 50, input: 1110 },
      { day: '2026-10-05', caller: 'main', from: 'medium', to: 'high', requests: 1, output: 7, input: 1110 },
      { day: '2026-10-05', caller: 'subagent', from: 'low', to: 'low', byDefinition: true, requests: 1, output: 9, input: 1110 },
      { day: '2026-10-05', caller: 'main', from: 'none', to: 'none', requests: 1, output: 3, input: 1110 },
    ])
    ledger = withRead(withRead(ledger, '2026-10-05', usage(40, 2000)), '2026-10-05', usage(60, 2000))
    expect(ledger.reads).toEqual([{ day: '2026-10-05', calls: 2, output: 100, input: 6020 }])
  })

  test('a saved ledger round-trips; junk is refused and bad rows are dropped', () => {
    const ledger = withRead(add(emptyLedger('s1', 'mods'), '2026-10-04', 'main', 'medium', 'high', 5), '2026-10-04', usage(1))
    expect(parseLedger(JSON.stringify(ledger))).toEqual(ledger)
    expect(parseLedger('not json')).toBeUndefined()
    expect(parseLedger('{"version":2,"session":"s"}')).toBeUndefined()
    const bad = { ...ledger, repo: 7, rows: [...ledger.rows, { day: '2026-10-04', caller: 'main', from: 'low', to: 'low', requests: -1, output: 0, input: 0 }, null] }
    expect(parseLedger(JSON.stringify(bad))).toEqual({ ...ledger, repo: 'unknown' })
  })

  test('token counts read short; days are UTC', () => {
    expect([950, 1234, 12_345, 450_000, 1_234_567].map(tokens)).toEqual(['950', '1.2k', '12k', '450k', '1.23M'])
    expect(dayOf(Date.parse('2026-10-04T23:30:00Z'))).toBe('2026-10-04')
  })

  test('nothing recorded: says so and where records go', () => {
    expect(spendReport([emptyLedger('s1', 'mods')], 'week', { today: '2026-10-04', session: 's1' })).toBe(
      'Nothing recorded for the last 7 days (since 2026-09-28). Recording started with version 0.9.0.',
    )
  })

  test('the report: by level, what the router moved beside requests left at that level, definitions, reads, repos', () => {
    let a = emptyLedger('s1', 'mods')
    a = add(a, '2026-10-04', 'main', 'medium', 'medium', 1000, 4) // left at medium: avg 1.0k
    a = add(a, '2026-10-04', 'subagent', 'medium', 'low', 200, 10)
    a = add(a, '2026-10-04', 'main', 'medium', 'high', 3000, 2)
    a = add(a, '2026-10-04', 'subagent', 'medium', 'low', 300, 1, true)
    a = withRead(a, '2026-10-04', usage(50, 3000))
    let b = emptyLedger('s2', 'employment')
    b = add(b, '2026-10-01', 'main', 'high', 'high', 2000, 1)
    b = add(b, '2026-09-20', 'main', 'high', 'high', 9999, 5) // outside the week
    const report = spendReport([a, b], 'week', { today: '2026-10-04', session: 's1' })
    expect(report.split('\n')).toEqual([
      'Effort for the last 7 days (since 2026-09-28): 18 requests in 2 sessions, 14k output tokens.',
      'By level:',
      '  low: 11 requests, 2.3k output tokens (avg 209)',
      '  medium: 4 requests, 4.0k output tokens (avg 1.0k)',
      '  high: 3 requests, 8.0k output tokens (avg 2.7k)',
      'Changed by the router: 12 requests',
      '  subagents, medium → low: 10 requests, 2.0k output tokens (avg 200, vs 1.0k for those left at medium)',
      '  main conversation, medium → high: 2 requests, 6.0k output tokens (avg 3.0k, vs 1.0k for those left at medium)',
      'Set by agent definitions: 1 request (low 1).',
      "The router's own checks: 1, using 50 output and 4.0k input tokens.",
      'By repo (output tokens): mods 12k, employment 2.0k.',
      'No "saved" figure: the router lowers easy tasks and raises hard ones, so these averages can\'t show what a changed request would have cost.',
    ])
    const session = spendReport([a, b], 'session', { today: '2026-10-04', session: 's2' })
    expect(session.split('\n')[0]).toBe('Effort for this session: 6 requests, 52k output tokens.')
    expect(session).toContain('Changed by the router: none.')
    expect(session).not.toContain('By repo')
    expect(spendReport([a, b], 'all', { today: '2026-10-04', session: 's1' }).split('\n')[0]).toBe(
      'Effort for all recorded sessions: 23 requests in 2 sessions, 64k output tokens.',
    )
  })
})

describe('0.10: confidence, models, size, verdicts', () => {
  test('a reply carries its confidence; "level", "lock" and "suggest" all read as a level', () => {
    expect(parseDecision('{"decision":"level","level":"high","confidence":0.72,"reason":"bug fix"}')).toEqual({ decision: 'lock', level: 'high', reason: 'bug fix', confidence: 0.72 })
    expect(parseDecision('{"decision":"lock","level":"low","confidence":"85%","reason":"rename"}')).toEqual({ decision: 'lock', level: 'low', reason: 'rename', confidence: 0.85 })
    expect(parseDecision('{"decision":"suggest","level":"low","reason":"rename"}')).toEqual({ decision: 'lock', level: 'low', reason: 'rename' })
  })

  test('confidence values: 0 to 1, percentages, nonsense', () => {
    expect([0, 0.5, 1, 80, '0.9', '70%', -1, 150, 'sure', undefined].map(confidenceOf)).toEqual([0, 0.5, 1, 0.8, 0.9, 0.7, undefined, undefined, undefined, undefined])
  })

  test('the bar: a level with no confidence never clears it, unless the bar is 0', () => {
    expect(isConfident({ level: 'high', reason: 'x', confidence: 0.8 }, 0.8)).toBe(true)
    expect(isConfident({ level: 'high', reason: 'x', confidence: 0.79 }, 0.8)).toBe(false)
    expect(isConfident({ level: 'high', reason: 'x' }, 0.8)).toBe(false)
    expect(isConfident({ level: 'high', reason: 'x' }, 0)).toBe(true)
  })

  test('supported models: ids, aliases, context-window suffixes and cloud ids; others are named', () => {
    expect(['claude-opus-5-5', 'claude-opus-5-5[1m]', 'opus', 'us.anthropic.claude-sonnet-5-5-v1:0', 'claude-fable-5-1-20261001'].map(m => supportedModel(m)?.name)).toEqual([
      'Opus 5.5', 'Opus 5.5', 'Opus 5.5', 'Sonnet 5.5', 'Fable 5.1',
    ])
    expect(['claude-haiku-4-5-20251001', 'claude-opus-4-8', 'claude-opus-5', 'claude-fable-5', 'gpt-x', undefined].map(m => supportedModel(m))).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
    expect(['claude-haiku-4-5-20251001', 'claude-opus-4-8', 'claude-opus-5-20260101', 'gpt-x', undefined].map(modelName)).toEqual(['Haiku 4.5', 'Opus 4.8', 'Opus 5', 'gpt-x', 'this model'])
    expect(SUPPORTED_NAMES).toBe('Fable 5.1, Opus 5.5 and Sonnet 5.5')
  })

  test('on an unsupported model the router stands aside: no level, no checks, off in the footer and band', () => {
    const locked = lockedAt(freshState(), 'high', 'bug fix')
    const away = onModel(locked, 'claude-haiku-4-5-20251001')
    expect(onModel(locked, 'claude-opus-5-5')).toBe(locked)
    expect(appliedLevel(away)).toBeUndefined()
    expect(wantsRead(onModel(freshState(), 'claude-opus-4-8'), 6)).toBe(false)
    expect(footerLabel(away).text).toBe('off')
    expect(bandHeadline(away)).toBe('Effort router: off on Haiku 4.5. It works with Fable 5.1, Opus 5.5 and Sonnet 5.5.')
    expect(bandActions(away)).toEqual([])
  })

  test('first sighting: a conversation longer than the limit is left alone, whatever its prompt count', () => {
    expect(firstSighting(1, 6, true, { tokens: 30_000, limit: 20_000 })).toMatchObject({ mode: 'picker', offReason: 'session started before the router' })
    expect(firstSighting(1, 6, true, { tokens: 5_000, limit: 20_000 })).toMatchObject({ mode: 'auto', prompts: 1 })
    expect(conversationTokens([{ role: 'user', text: 'x'.repeat(400) }, { role: 'assistant', text: '', toolUses: [{ tool: 'Read', input: { p: 'a' }, text: 'y'.repeat(380) }] }])).toBe(197) // (400 + 380 + 9) / 4
  })

  test("the fork's message: the job, the rules, the model's notes, the last reply and the new message", () => {
    const text = forkPrompt({ rules: 'RULES', model: { name: 'Opus 5.5', notes: '- medium is the default' }, current: 'fix it', lastReply: 'Found the bug.', hint: 'be careful' })
    expect(text).toStartWith('Pause the task for a moment.')
    expect(text).toContain('<rules>\nRULES\n</rules>')
    expect(text).toContain('The session runs on Opus 5.5.')
    expect(text).toContain('<last_reply>\nFound the bug.\n</last_reply>')
    expect(text).toContain('<new_message>\nfix it\n</new_message>')
    expect(text).toContain('<user_hint>\nbe careful\n</user_hint>')
    expect(forkPrompt({ rules: 'RULES' })).not.toContain('<new_message>')
    expect(forkPrompt({ rules: 'RULES', answered: '"Which platforms?"="Xero"' })).toContain('You asked the user questions, and they have just answered:\n<answers>\n"Which platforms?"="Xero"\n</answers>')
  })

  test('levels: held to the highest level (xhigh unless set); the prompts offer no more; a jump of two offers the middle', () => {
    expect(levelsUpTo()).toEqual(['low', 'medium', 'high', 'xhigh'])
    expect(levelsUpTo('max')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(levelsBetween('xhigh', 'medium')).toEqual(['high'])
    expect(levelsBetween('low', 'xhigh')).toEqual(['medium', 'high']) // nearest the proposal first
    expect(levelsBetween('xhigh', 'low')).toEqual(['high', 'medium'])
    expect(levelsBetween('high', 'medium')).toEqual([])
    expect(levelsBetween('high', undefined)).toEqual([])
    expect(effortQuestion({ level: 'xhigh', reason: 'tricky migration' }, 'medium')).toEqual({ text: 'Effort router: Tricky migration. Use xhigh effort instead of medium?', options: ['Use xhigh', 'Use high', 'Keep medium'], between: ['high'], header: 'Effort' })
    expect(effortQuestion({ level: 'high', reason: 'bug fix' }, 'medium').options).toEqual(['Use high', 'Keep medium'])
    expect(effortQuestion({ level: 'low', reason: 'typo' }, 'xhigh').options).toEqual(['Use low', 'Use medium', 'Use high', 'Keep xhigh'])
    expect(effortQuestion({ level: 'max', reason: 'x' }, 'low').options).toEqual(['Use max', 'Use xhigh', 'Use high', 'Keep low']) // four at most
    expect(clampLevel('max', ['low', 'medium', 'high'])).toBe('high')
    expect(clampLevel('low', ['medium', 'high', 'xhigh'])).toBe('medium')
    expect(clampLevel('medium', ['low', 'medium', 'high'])).toBe('medium')
    expect(classifierSystem('RULES')).toContain('Levels you may pick, lowest to highest: low, medium, high, xhigh.')
    expect(classifierSystem('RULES')).toContain('"level":"<low|medium|high|xhigh>"')
    expect(classifierSystem('RULES', undefined, ['low', 'medium', 'high'])).toContain('"level":"<low|medium|high>"')
    expect(subagentSystem('RULES', undefined, ['low', 'medium', 'high'])).toContain('Levels you may pick, lowest to highest: low, medium, high.')
    expect(subagentSystem('RULES')).toContain('"level":"<low|medium|high|xhigh>"')
  })

  test('the separate check carries the instructions first when given', () => {
    expect(classifierPrompt('USER: hi', undefined, 'Use bun.')).toStartWith("The session's instructions (CLAUDE.md files, rules and memory), as its model sees them:\n<instructions>\nUse bun.\n</instructions>")
    expect(classifierPrompt('USER: hi')).toStartWith('Transcript so far')
  })

  test('status: a check below the bar says it leaned, and the bar is stated', () => {
    const report = routeReport(freshState(), 6, 'medium', {
      now: 10_000, calls: 1, consent: 'ask', threshold: 0.8, checkModel: "your session's model (Opus 5.5)",
      verdict: { at: 5_000, trigger: 'after a prompt', raw: '', decision: { decision: 'lock', level: 'high', reason: 'bug fix', confidence: 0.6 } },
    })
    expect(report).toStartWith('Deciding. The last check leaned high but was only 60% sure, so it checks again after your next prompt.')
    expect(report).toContain("It acts once a check is at least 80% sure. If that level isn't your setting, it asks you first (consent: ask).")
    expect(report).toContain("Checks this session: 1, on your session's model (Opus 5.5).")
    expect(report).toContain('Last check (after a prompt, 5s ago): high, 60% sure (bug fix).')
  })

  test('ledger: reads by kind, verdicts with their outcome, both survive a save; the report splits checks by kind', () => {
    const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 }
    let ledger = emptyLedger('s1', 'repo')
    ledger = withRead(ledger, '2026-10-04', usage, 'first')
    ledger = withRead(ledger, '2026-10-04', usage, 'fork')
    ledger = withRead(ledger, '2026-10-04', usage, 'fork')
    ledger = withRead(ledger, '2026-10-04', usage, 'subagent')
    ledger = withVerdictRow(ledger, { at: 1, kind: 'first', model: 'claude-opus-5-5', prompt: 1, level: 'high', confidence: 0.6, outcome: 'below the bar', withInstructions: true })
    ledger = withVerdictRow(ledger, { at: 2, kind: 'fork', model: 'claude-opus-5-5', prompt: 2, level: 'high', confidence: 0.9, outcome: 'waiting' })
    ledger = withVerdictRow(ledger, { at: 3, kind: 'fork', model: 'claude-opus-5-5', prompt: 2, level: 'medium', confidence: 0.9, outcome: 'manual' })
    ledger = withVerdictOutcome(ledger, 'asked: use', 2) // a manual check came in while the question was open
    expect(ledger.reads.map(r => `${r.kind} ${r.calls}`)).toEqual(['first 1', 'fork 2', 'subagent 1'])
    expect(ledger.verdicts?.map(v => v.outcome)).toEqual(['below the bar', 'asked: use', 'manual'])
    expect(withVerdictOutcome(ledger, 'asked: keep').verdicts?.map(v => v.outcome)).toEqual(['below the bar', 'asked: use', 'asked: keep'])
    const back = parseLedger(JSON.stringify(ledger))
    expect(back).toEqual(ledger)
    ledger = withSpend(ledger, { day: '2026-10-04', caller: 'main', from: 'medium', to: 'high', usage })
    expect(spendReport([ledger], 'session', { today: '2026-10-04', session: 's1' })).toContain(
      "The router's own checks: 4 (1 of a first prompt, 2 of a conversation, 1 for subagents), using 20 output and 400 input tokens.",
    )
  })
})

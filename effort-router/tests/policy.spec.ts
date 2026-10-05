// Unit tests for the pure policy module. Run with `bun test` from the mod folder.
// Named *.spec.ts so `claude plugin test` (which loads *.test.ts with the
// engine's own kit) leaves it to bun.
import { describe, expect, test } from 'bun:test'

import {
  telemetryAttributes,
  DEFAULT_TRIM,
  GLYPH,
  ROUTE_USAGE,
  SUPPORTED_NAMES,
  appliedLevel,
  bandActions,
  bandHeadline,
  capLines,
  clampLevel,
  classifierPrompt,
  classifierSystem,
  composeRules,
  dayOf,
  definitionEffort,
  definitionFor,
  emptyLedger,
  firstSighting,
  footerLabel,
  forkPrompt,
  freshState,
  frontmatterOf,
  humanPromptCount,
  lastAssessmentLine,
  levelsUpTo,
  lockedByYou,
  message,
  modelName,
  offeredLevels,
  onModel,
  parentLevel,
  parseDecision,
  parseLedger,
  withSubagentRow,
  parseRoute,
  parseSubagentReply,
  progressGlyph,
  questionText,
  renderTranscript,
  restored,
  routeReport,
  routesSubagents,
  ruleLayers,
  savedOf,
  settingsAgentDefinitions,
  settingsRulesOf,
  settle,
  spendReport,
  subagentForkPrompt,
  subagentLine,
  subagentPrompt,
  subagentReport,
  subagentSystem,
  supportedModel,
  tokens,
  trimTranscript,
  turnedOff,
  turnedOnLocked,
  turnedOnUnlocked,
  unlocked,
  wantsAssessment,
  withQuestionAnswer,
  withRead,
  withSpend,
  withVerdictOutcome,
  withVerdictRow,
  agentFileDefinition,
  ago,
  capBrief,
  SUBAGENT_CONTRACT,
  SUBAGENT_FRAME,
  QUESTION,
  notesFor,
  type RouterState,
  type SpendLedger,
  type TranscriptMessage,
  type View,
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
    expect(out.sentChars).toBeLessThanOrEqual(3000 + 'USER: 2'.length + 1) // the prompt being assessed is outside the cap
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

  test('the prompt being assessed goes in whole, outside the cap: a long dictated brief matters most', () => {
    const brief = 'Build the whole thing. '.repeat(2000) // 46k characters, past both the cap and the per-prompt cap
    const out = renderTranscript([{ role: 'user', text: 'earlier' }], brief, DEFAULT_TRIM)
    expect(out.text).toBe(`USER: earlier\nUSER: ${brief.trim()}`)
    expect(trimTranscript([], brief)).toBe(`USER: ${brief.trim()}`)
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
    // 0.18's reply format: undecided is a value of level.
    ['{"level":"undecided","reason":"greeting","why":"No task yet."}', { decision: 'undecided' }],
    ['{"level":"low","reason":"typo fix","why":"Mechanical."}', { decision: 'lock', level: 'low', reason: 'typo fix', why: 'Mechanical.' }],
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

  test('marker must be the whole line; CRLF ok; empty files change nothing', () => {
    expect(composeRules([D, { source: 'user', text: 'see $defaults here' }]).text).toBe('see $defaults here')
    expect(composeRules([D, { source: 'user', text: 'A\r\n  $defaults  \r\nB' }]).text).toBe('A\nDEFAULTS\nB')
    expect(composeRules([D, { source: 'user', text: '   \n' }]).contributors).toHaveLength(1)
  })

  test('the system prompt wraps the rules between the fixed frame and contract', () => {
    const system = classifierSystem('MY RULES')
    expect(system).toContain('<rules>\nMY RULES\n</rules>')
    expect(system).toContain('"level":"<undecided|low|medium|high|xhigh>"')
  })
})

describe('the classifier prompt', () => {
  test('undecided only before any task; an underspecified task still gets a level; no worked examples', () => {
    const system = classifierSystem('RULES')
    expect(system).toContain('If no task has been stated yet')
    expect(system).toContain('pick a level for it even if details are still unclear')
    expect(system).not.toContain('When unsure, answer undecided')
    // 0.18: no worked examples. The checks run on Opus 5.5 and Fable 5.1, which read a conversation unaided.
    expect(system).not.toMatch(/^\d+\. USER:/m)
    // 0.11: nothing names the level a kind of task gets; the model notes say what each level can do
    expect(system).not.toMatch(/"level":"(low|medium|high|xhigh|max)"/)
    expect(classifierPrompt('USER: hi')).toEndWith(QUESTION)
  })

  test('people use the router to spend less, and their own words about effort win', () => {
    const system = classifierSystem('RULES')
    expect(system).toContain('People turn this router on to spend less, so when two levels would both get the work done, pick the cheaper one')
    expect(system).toContain('If the user says how hard to think or how quickly to go')
    expect(SUBAGENT_FRAME).toContain('If the brief says how hard to think, follow it.')
  })
  test('a manual hint is passed and weighted', () => {
    const prompt = classifierPrompt('USER: hi', 'this is a security review')
    expect(prompt).toContain('<user_hint>\nthis is a security review\n</user_hint>')
    expect(prompt).toContain('weigh it strongly')
    expect(classifierPrompt('USER: hi')).not.toContain('user_hint')
  })
})

describe('replies', () => {
  test('a check names one level: the one that gets the work done in the least time and total cost', () => {
    expect(classifierSystem('RULES')).toContain('least time and total inference cost')
    expect(classifierSystem('RULES')).toContain('"level":"<undecided|low|medium|high|xhigh>"')
    expect(classifierSystem('RULES')).not.toContain('probability')
    expect(parseDecision('{"decision":"level","level":"high","reason":"race condition fix"}')).toEqual({ decision: 'lock', level: 'high', reason: 'race condition fix' })
    // A level with no decision field is still a level.
    expect(parseDecision('{"level":"Medium","reason":"spec feature"}')).toEqual({ decision: 'lock', level: 'medium', reason: 'spec feature' })
    // A spread or a confidence from an older prompt is ignored: only the level counts.
    expect(parseDecision('{"decision":"level","level":"low","confidence":0.4,"levels":{"low":0.4,"medium":0.6},"reason":"rename"}')).toEqual({ decision: 'lock', level: 'low', reason: 'rename' })
  })

  test('a reply that stops before its last brace, or runs on after the object, still parses', () => {
    // Seen from Fable 5.1 in the eval: the reply ends after the why, with no closing brace.
    expect(parseDecision('{"decision":"level","level":"high","reason":"edge-case tests","why":"hidden cases {DST}"\n')).toMatchObject({ level: 'high' })
    expect(parseDecision('{"decision":"level","level":"low","reason":"typo"} and {"note":"extra"}')).toMatchObject({ level: 'low' })
    expect(parseDecision('{"decision":"level","level":"low","reason":"cut off mid-str')).toEqual({ decision: 'undecided' })
  })

  test('a check can say why, in a sentence or two, and the reply keeps it', () => {
    expect(parseDecision('{"decision":"level","level":"high","reason":"bug fix","why":"Tracing  the crash\\nneeds care."}')).toEqual({
      decision: 'lock', level: 'high', reason: 'bug fix', why: 'Tracing the crash needs care.',
    })
    expect(classifierSystem('RULES')).toContain('"why":"<one or two sentences')
  })
})

describe('settings-borne rules', () => {
  test('reads rules from pluginConfigs options under any marketplace key, then a top-level effortRouter object', () => {
    expect(settingsRulesOf({ pluginConfigs: { 'effort-router@tommy5dollar': { options: { rules: 'R', rulesMode: 'enforce', allowOff: false } } } })).toBe('R')
    expect(settingsRulesOf({ effortRouter: { rules: 'TOP' } })).toBe('TOP')
    expect(settingsRulesOf({ pluginConfigs: { 'other@x': { options: { rules: 'NO' } } } })).toBeUndefined()
    expect(settingsRulesOf({ effortRouter: { rules: '  ' } })).toBeUndefined()
    expect(settingsRulesOf(undefined)).toBeUndefined()
  })

  test('layer order: defaults, the organisation, you, the project. Nothing is enforced', () => {
    const base = { defaults: 'D', org: '$defaults\nO', userFile: { path: 'u.md', text: '$defaults\nU' }, projectSettings: '$defaults\nP' }
    expect(composeRules(ruleLayers(base)).text).toBe('D\nO\nU\nP')
    expect(composeRules(ruleLayers({ ...base, userFile: { path: 'u.md', text: 'MINE ONLY' } })).text).toBe('MINE ONLY\nP') // a user can replace the organisation's
    expect(ruleLayers(base)[1]?.source).toBe('managed settings')
    expect(ruleLayers({ defaults: 'D', userFile: { path: 'u.md', text: 'FILE' }, userSettings: 'SETTING' }).map(l => l.text)).toEqual(['D', 'FILE'])
    expect(ruleLayers({ defaults: 'D', userFile: { path: 'u.md', text: undefined }, userSettings: 'SETTING' }).map(l => l.text)).toEqual(['D', 'SETTING'])
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
    expect(subagentSystem('RULES', notes)).toContain('The subagent runs on Sonnet 5.5. Level names buy different amounts of thinking on different models. On this one:\n<model_notes>\n- low: chat and lookups.\n</model_notes>')
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
    expect(parseDecision('{"decision":"High","reason":"bug fix"}')).toEqual({ decision: 'lock', level: 'high', reason: 'bug fix' })
    expect(parseSubagentReply('{"decision":"undecided"}')).toBeUndefined()
    expect(parseSubagentReply('{"decision":"undecided","level":"low"}')).toBeUndefined()
    expect(parseSubagentReply('{"level":"extreme","reason":"x"}')).toBeUndefined()
    expect(parseSubagentReply('high, because it is debugging')).toBeUndefined()
    expect(parseSubagentReply('{not json')).toBeUndefined()
    expect(parseSubagentReply(undefined)).toBeUndefined()
  })

  test("the parent's level: the parent subagent's routed level, else the main level in use, else none", () => {
    const agents = new Map([['agent-1', { level: 'xhigh' as const, reason: 'security audit', subagentType: 'general-purpose', description: 'audit' }]])
    const provisional = lockedByYou(freshState(), 'high')
    expect(parentLevel(provisional, agents)).toBe('high')
    expect(parentLevel(provisional, agents, 'agent-1')).toBe('xhigh')
    expect(parentLevel(provisional, agents, 'agent-unknown')).toBe('high') // it ran at the main level
    expect(parentLevel(freshState(), agents)).toBeUndefined()
    expect(parentLevel(freshState(), agents, 'agent-1')).toBe('xhigh')
  })

  test('routed unless you turned the router off', () => {
    expect(routesSubagents(freshState())).toBe(true)
    expect(routesSubagents(firstSighting(10, 5))).toBe(true) // started before the router: off, but not by you
    expect(routesSubagents(turnedOff(freshState(), 'you'))).toBe(false)
    expect(routesSubagents(turnedOff(freshState(), 'picker'))).toBe(false)
    expect(routesSubagents(turnedOnUnlocked(turnedOff(freshState(), 'you')))).toBe(true)
    expect(routesSubagents(lockedByYou(freshState(), 'high'))).toBe(true)
  })

  test('/er status lists routed subagents, newest first, at most 10', () => {
    const agents = Array.from({ length: 12 }, (_, i) => ({ level: 'low' as const, reason: `reason ${i}`, subagentType: 'Explore', description: `task ${i}` }))
    const lines = subagentReport({ routing: 'on', agents })
    expect(lines[0]).toBe('Subagents: each gets its own level from its task.')
    expect(lines[1]).toBe('Recent subagents (12, newest 10 shown):')
    expect(lines[2]).toBe('- low: task 11 (reason 11)')
    expect(lines).toHaveLength(12)
    expect(lines.at(-1)).toBe('- low: task 2 (reason 2)')
    expect(subagentReport({ routing: 'setting', agents: [] })).toEqual(['Subagents: not routed (routeSubagents is off), so they use the session level.'])
    expect(subagentReport({ routing: 'user-off', agents: [] })[0]).toContain('they use your effort setting')

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
    expect(lines.at(-1)).toBe('- low: Probe (set by its agent definition)')
    const agents = new Map([
      ['a', { level: 'low' as const, reason: 'r', subagentType: 't', description: 'd', byDefinition: true }],
      ['b', { level: 32000, reason: 'r', subagentType: 't', description: 'd', byDefinition: true }],
    ])
    const provisional = lockedByYou(freshState(), 'high')
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
      '- low: 11 requests, 2.3k output tokens (avg 209)',
      '- medium: 4 requests, 4.0k output tokens (avg 1.0k)',
      '- high: 3 requests, 8.0k output tokens (avg 2.7k)',
      'Changed by the router: 12 requests',
      '- subagents, medium → low: 10 requests, 2.0k output tokens (avg 200, vs 1.0k for those left at medium)',
      '- main conversation, medium → high: 2 requests, 6.0k output tokens (avg 3.0k, vs 1.0k for those left at medium)',
      'Set by agent definitions: 1 request (low 1).',
      "The router's own assessments: 1, using 50 output and 4.0k input tokens.",
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

describe('0.10: models, size, verdicts', () => {
  test('"level", "lock" and "suggest" all read as a level', () => {
    expect(parseDecision('{"decision":"level","level":"high","reason":"bug fix"}')).toEqual({ decision: 'lock', level: 'high', reason: 'bug fix' })
    expect(parseDecision('{"decision":"lock","level":"low","reason":"rename"}')).toEqual({ decision: 'lock', level: 'low', reason: 'rename' })
    expect(parseDecision('{"decision":"suggest","level":"low","reason":"rename"}')).toEqual({ decision: 'lock', level: 'low', reason: 'rename' })
  })

  test('supported models: ids, aliases, context-window suffixes and cloud ids; others are named', () => {
    expect(['claude-opus-5-5', 'claude-opus-5-5[1m]', 'opus', 'us.anthropic.claude-sonnet-5-5-v1:0', 'claude-fable-5-1-20261001'].map(m => supportedModel(m)?.name)).toEqual([
      'Opus 5.5', 'Opus 5.5', 'Opus 5.5', 'Sonnet 5.5', 'Fable 5.1',
    ])
    expect(['claude-haiku-4-5-20251001', 'claude-opus-4-8', 'claude-opus-5', 'claude-fable-5', 'gpt-x', undefined].map(m => supportedModel(m))).toEqual([undefined, undefined, undefined, undefined, undefined, undefined])
    expect(['claude-haiku-4-5-20251001', 'claude-opus-4-8', 'claude-opus-5-20260101', 'gpt-x', undefined].map(modelName)).toEqual(['Haiku 4.5', 'Opus 4.8', 'Opus 5', 'gpt-x', 'this model'])
    expect(SUPPORTED_NAMES).toBe('Fable 5.1, Opus 5.5 and Sonnet 5.5')
  })

  test('on an unsupported model the router stands aside: no level, no assessments, off in the footer and band', () => {
    const locked: RouterState = { status: 'locked', level: 'high', assessed: 5, lockedBy: 'router' }
    const away = onModel(locked, 'claude-haiku-4-5-20251001')
    expect(onModel(locked, 'claude-opus-5-5')).toBe(locked)
    expect(appliedLevel(away)).toBeUndefined()
    expect(wantsAssessment(onModel(freshState(), 'claude-opus-4-8'), 5)).toBe(false)
    expect(footerLabel(away, VIEW).text).toBe('⏸️ MEDIUM')
    expect(bandHeadline(away, VIEW)).toBe('Effort router: off on Haiku 4.5. It works with Fable 5.1, Opus 5.5 and Sonnet 5.5.')
    expect(bandActions(away, VIEW).map(a => a.label)).toEqual(['Hide'])
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

  test('levels: held to the highest level (xhigh unless set); the prompts offer no more', () => {
    expect(levelsUpTo()).toEqual(['low', 'medium', 'high', 'xhigh'])
    expect(levelsUpTo('max')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(clampLevel('max', ['low', 'medium', 'high'])).toBe('high')
    expect(clampLevel('low', ['medium', 'high', 'xhigh'])).toBe('medium')
    expect(clampLevel('medium', ['low', 'medium', 'high'])).toBe('medium')
    expect(classifierSystem('RULES')).toContain('Levels you may pick, lowest to highest: low, medium, high, xhigh.')
    expect(classifierSystem('RULES')).toContain('"level":"<undecided|low|medium|high|xhigh>"')
    expect(classifierSystem('RULES', undefined, ['low', 'medium', 'high'])).toContain('"level":"<undecided|low|medium|high>"')
    expect(subagentSystem('RULES', undefined, ['low', 'medium', 'high'])).toContain('Levels you may pick, lowest to highest: low, medium, high.')
    expect(subagentSystem('RULES')).toContain('"level":"<low|medium|high|xhigh>"')
  })

  test('model notes leave out the lines about a level the check cannot pick', () => {
    const notes = '| level | score |\n|---|---|\n| high | 2 |\n| xhigh | 3 |\n| max | 4 |\n\n- xhigh: thorough.\n- max: prone to overthinking.\n- Effort pays from low to max on edge cases.'
    expect(notesFor(notes, levelsUpTo())).toBe('| level | score |\n|---|---|\n| high | 2 |\n| xhigh | 3 |\n\n- xhigh: thorough.\n- Effort pays from low to max on edge cases.')
    expect(notesFor(notes, levelsUpTo('max'))).toBe(notes)
    expect(notesFor(notes, levelsUpTo('high'))).not.toContain('xhigh')
    expect(classifierSystem('RULES', { name: 'Opus 5.5', notes })).not.toContain('overthinking')
    expect(classifierSystem('RULES', { name: 'Opus 5.5', notes }, levelsUpTo('max'))).toContain('overthinking')
  })

  test('the separate check carries the instructions first when given', () => {
    expect(classifierPrompt('USER: hi', undefined, 'Use bun.')).toStartWith("The session's instructions (CLAUDE.md files, rules and memory), as its model sees them:\n<instructions>\nUse bun.\n</instructions>")
    expect(classifierPrompt('USER: hi')).toStartWith('Transcript so far')
  })

  test('ledger: reads by kind, verdicts with their outcome, both survive a save; the report splits checks by kind', () => {
    const usage = { input_tokens: 10, output_tokens: 5, cache_read_input_tokens: 90, cache_creation_input_tokens: 0 }
    let ledger = emptyLedger('s1', 'repo')
    ledger = withRead(ledger, '2026-10-04', usage, 'first')
    ledger = withRead(ledger, '2026-10-04', usage, 'fork')
    ledger = withRead(ledger, '2026-10-04', usage, 'fork')
    ledger = withRead(ledger, '2026-10-04', usage, 'subagent')
    // Rows from before 0.18 carry a confidence and a spread; they still read back.
    ledger = withVerdictRow(ledger, { at: 1, kind: 'first', model: 'claude-opus-5-5', prompt: 1, level: 'high', confidence: 0.6, spread: { medium: 0.4, high: 0.6 }, outcome: 'below the bar', withInstructions: true })
    ledger = withVerdictRow(ledger, { at: 2, kind: 'fork', model: 'claude-opus-5-5', prompt: 2, level: 'high', against: 'medium', outcome: 'waiting' })
    ledger = withVerdictRow(ledger, { at: 3, kind: 'fork', model: 'claude-opus-5-5', prompt: 2, level: 'medium', outcome: 'manual' })
    ledger = withVerdictOutcome(ledger, 'asked: use', 2) // a manual check came in while the question was open
    expect(ledger.reads.map(r => `${r.kind} ${r.calls}`)).toEqual(['first 1', 'fork 2', 'subagent 1'])
    expect(ledger.verdicts?.map(v => v.outcome)).toEqual(['below the bar', 'asked: use', 'manual'])
    expect(withVerdictOutcome(ledger, 'asked: keep').verdicts?.map(v => v.outcome)).toEqual(['below the bar', 'asked: use', 'asked: keep'])
    const back = parseLedger(JSON.stringify(ledger))
    expect(back).toEqual(ledger)
    ledger = withSpend(ledger, { day: '2026-10-04', caller: 'main', from: 'medium', to: 'high', usage })
    expect(spendReport([ledger], 'session', { today: '2026-10-04', session: 's1' })).toContain(
      "The router's own assessments: 4 (1 of a first prompt, 2 of a conversation, 1 for subagents), using 20 output and 400 input tokens.",
    )
  })
})

const VIEW: View = { setting: 'medium', limit: 5, offered: levelsUpTo() }
const at = (state: Partial<RouterState>): RouterState => ({ ...freshState(), ...state })

describe('0.18: assess the first prompts, go where the check says, then lock', () => {
  const pick = (level: 'low' | 'medium' | 'high' | 'xhigh') => ({ level, reason: 'bug fix', against: 'medium' as const })

  test('an assessment moves to the level it picked and stays unlocked; picking the level running stays', () => {
    const moved = settle(freshState(), pick('high'), { limit: 5, running: 'medium', counted: true })
    expect(moved.state).toMatchObject({ status: 'unlocked', level: 'high', lastLevel: 'high', assessed: 1 })
    expect(moved.moved).toEqual({ from: 'medium', to: 'high' })
    expect(moved.outcome).toBe('moved to high')
    expect(moved.locked).toBeUndefined() // a move never locks
    // Two levels in one go, with no bar to clear: the check weighed it.
    expect(settle(freshState(), pick('low'), { limit: 5, running: 'xhigh', counted: true }).moved).toEqual({ from: 'xhigh', to: 'low' })
    const stayed = settle(freshState(), pick('medium'), { limit: 5, running: 'medium', counted: true })
    expect(stayed.state).toMatchObject({ status: 'unlocked', assessed: 1 })
    expect(stayed.state.level).toBeUndefined()
    expect(stayed.outcome).toBe('stayed')
    expect(settle(freshState(), undefined, { limit: 5, running: 'medium', counted: true }).outcome).toBe('no clear task')
  })

  test('the same pick lands on the same level from any setting', () => {
    for (const running of ['low', 'medium', 'high', 'xhigh'] as const) {
      const settled = settle(freshState(), pick('medium'), { limit: 5, running, counted: true })
      expect(settled.state.level ?? running).toBe('medium')
    }
  })

  test('the last prompt of the window locks whatever is running; a move on it moves first', () => {
    const last = settle(at({ assessed: 4, level: 'high' }), pick('high'), { limit: 5, running: 'high', counted: true })
    expect(last.state).toMatchObject({ status: 'locked', level: 'high', lockedBy: 'router', lockedAfter: 5 })
    expect(last.locked).toBe('high')
    const moveThenLock = settle(at({ assessed: 4 }), pick('xhigh'), { limit: 5, running: 'medium', counted: true })
    expect(moveThenLock.moved).toEqual({ from: 'medium', to: 'xhigh' })
    expect(moveThenLock.locked).toBe('xhigh')
    // Your setting runs: the lock takes it.
    expect(settle(at({ assessed: 4 }), undefined, { limit: 5, running: 'medium', counted: true }).state).toMatchObject({ status: 'locked', level: 'medium' })
    // No level known yet: nothing to lock until a request shows it.
    expect(settle(at({ assessed: 4 }), undefined, { limit: 5, counted: true }).state.status).toBe('unlocked')
  })

  test('a manual assessment while locked moves the locked level and stays locked, without counting', () => {
    const locked = at({ status: 'locked', level: 'medium', assessed: 5, lockedBy: 'router' })
    const done = settle(locked, pick('high'), { limit: 5, running: 'medium', counted: false })
    expect(done.state).toMatchObject({ status: 'locked', level: 'high', assessed: 5 })
    expect(done.moved).toEqual({ from: 'medium', to: 'high' })
    expect(done.locked).toBeUndefined()
  })

  test('wanting an assessment: unlocked and within the window only', () => {
    expect(wantsAssessment(freshState(), 5)).toBe(true)
    expect(wantsAssessment(at({ assessed: 5 }), 5)).toBe(false)
    expect(wantsAssessment(at({ status: 'locked', level: 'high' }), 5)).toBe(false)
    expect(wantsAssessment(turnedOff(freshState(), 'you'), 5)).toBe(false)
  })

  test('a first sighting: earlier prompts count; with the window used up it starts off, as started before the router', () => {
    expect(firstSighting(0, 5)).toEqual(freshState())
    expect(firstSighting(3, 5)).toMatchObject({ status: 'unlocked', assessed: 3 })
    expect(firstSighting(5, 5)).toEqual({ status: 'off', assessed: 0, offReason: 'mid-flow' })
  })

  test('lock, unlock, off and the two ways on; only a label that names a level changes it', () => {
    const moved = at({ level: 'high', lastLevel: 'high', assessed: 2 })
    expect(lockedByYou(moved, 'high')).toMatchObject({ status: 'locked', level: 'high', lockedBy: 'you', lockedAfter: 2 })
    const open = unlocked(at({ status: 'locked', level: 'low', assessed: 5, lockedBy: 'router', lockedAfter: 5 }))
    expect(open).toMatchObject({ status: 'unlocked', level: 'low', assessed: 0 }) // the locked level keeps running
    expect(appliedLevel(open)).toBe('low')
    const off = turnedOff(moved, 'you')
    expect(off).toEqual({ status: 'off', assessed: 2, offReason: 'you', lastLevel: 'high' })
    expect(appliedLevel(off)).toBeUndefined()
    expect(turnedOnUnlocked(off)).toEqual({ status: 'unlocked', assessed: 0, lastLevel: 'high' })
    expect(appliedLevel(turnedOnUnlocked(off))).toBeUndefined() // your setting runs
    expect(turnedOnLocked(off)).toMatchObject({ status: 'locked', level: 'high' })
    const never = turnedOff(freshState(), 'picker')
    expect(turnedOnLocked(never)).toBe(never) // no level of its own: unchanged
  })

  test('levels offered: up to highestLevel, or up to your own setting when it is higher (a session at max)', () => {
    expect(offeredLevels('xhigh')).toEqual(['low', 'medium', 'high', 'xhigh'])
    expect(offeredLevels('xhigh', 'max')).toEqual(['low', 'medium', 'high', 'xhigh', 'max'])
    expect(offeredLevels('high', 'medium')).toEqual(['low', 'medium', 'high'])
  })
})

describe('0.17: the footer', () => {
  test('the status glyph, the level running, and the window as a circle that never fills', () => {
    expect(footerLabel(freshState(), VIEW)).toEqual({ text: '🔓 MEDIUM ○', dim: false })
    expect(footerLabel(at({ assessed: 1 }), VIEW).text).toBe('🔓 MEDIUM ◔')
    expect(footerLabel(at({ assessed: 2 }), VIEW).text).toBe('🔓 MEDIUM ◑')
    expect(footerLabel(at({ assessed: 3 }), VIEW).text).toBe('🔓 MEDIUM ◑')
    expect(footerLabel(at({ assessed: 4, level: 'high' }), VIEW).text).toBe('🔓 HIGH ◕')
    expect(footerLabel(at({ status: 'locked', level: 'high', assessed: 5 }), VIEW)).toEqual({ text: '🔒 HIGH', dim: false })
    expect(footerLabel(turnedOff(freshState(), 'you'), VIEW)).toEqual({ text: '⏸️ MEDIUM', dim: true })
    expect(footerLabel(freshState(), { ...VIEW, setting: undefined }).text).toBe('🔓 …')
    expect(footerLabel(freshState(), { ...VIEW, assessing: true }).text).toBe('🔓 …')
    expect([0, 1, 2, 3, 4].map(n => progressGlyph(n, 5))).toEqual(['○', '◔', '◑', '◑', '◕'])
    expect(GLYPH).toEqual({ unlocked: '🔓', locked: '🔒', off: '⏸️' })
  })
})

describe('0.17: the band', () => {
  const stayed = { at: 1, level: 'medium' as const, against: 'medium' as const, reason: 'notes summary', outcome: 'stayed' }
  const moved = { at: 1, level: 'high' as const, against: 'medium' as const, reason: 'bug fix touching three services', why: 'A crash fix needs the code traced.', outcome: 'moved to high' }

  test('line 1 is the footer in words: status, the level and where it came from, what changes next', () => {
    expect(bandHeadline(at({ assessed: 2 }), { ...VIEW, last: stayed })).toBe('Effort router: unlocked. Medium (your effort setting). Locks after 3 more prompts.')
    expect(bandHeadline(at({ assessed: 4, level: 'high' }), { ...VIEW, last: moved })).toBe('Effort router: unlocked. High (chosen by the router). Locks after 1 more prompt.')
    expect(bandHeadline(at({ status: 'locked', level: 'high', lockedBy: 'router', lockedAfter: 5 }), { ...VIEW, last: moved })).toBe('Effort router: locked. High (chosen by the router after 5 prompts).')
    expect(bandHeadline(lockedByYou(at({ assessed: 2 }), 'medium'), VIEW)).toBe('Effort router: locked. Medium (locked by you after 2 prompts).')
    expect(bandHeadline(turnedOff(freshState(), 'picker'), { ...VIEW, setting: 'xhigh' })).toBe('Effort router: off. Xhigh (your effort setting). You changed the effort picker.')
    expect(bandHeadline(firstSighting(9, 5), VIEW)).toBe('Effort router: off. Medium (your effort setting). This session started before the router.')
    expect(bandHeadline(turnedOff(freshState(), 'you'), VIEW)).toBe('Effort router: off. Medium (your effort setting).')
    expect(bandHeadline(freshState(), { ...VIEW, setting: undefined })).toBe('Effort router: unlocked. Your effort setting applies. Locks after 5 more prompts.')
  })

  test('line 2 is the last assessment: its level and task, and what it did', () => {
    expect(lastAssessmentLine(stayed, false)).toBe('Last assessment: medium (notes summary), the level it was already on.')
    expect(lastAssessmentLine(moved, false)).toBe('Last assessment: high (bug fix touching three services), so it moved from medium.')
    expect(lastAssessmentLine(moved, true)).toEndWith('so it moved from medium. A crash fix needs the code traced.') // the why, when locked
    expect(lastAssessmentLine({ at: 1, level: 'low', against: 'high', outcome: 'moved to low' }, false)).toBe('Last assessment: low, so it moved from high.')
    expect(lastAssessmentLine({ at: 1, level: 'low', against: 'high', outcome: 'failed' }, false)).toBe('Last assessment: low, but the assessment failed, so it stayed.')
    expect(lastAssessmentLine({ at: 1, outcome: 'no clear task' }, false)).toBe('Last assessment: no clear task yet, so it stayed.')
    expect(lastAssessmentLine(undefined, false)).toBeUndefined()
    expect(subagentLine(4)).toBe('Subagents get their own level: 4 routed this session.')
    expect(subagentLine(0)).toBeUndefined()
  })

  test('four fixed slots: Hide, the lock, on and off, Assess. Greyed slots stay in place and say why', () => {
    const labels = (state: RouterState, view: View = VIEW) => bandActions(state, view).map(a => (a.disabled ? `(${a.label})` : a.label))
    expect(labels(freshState())).toEqual(['Hide', 'Lock at medium', 'Turn off', '(Assess)'])
    expect(labels(at({ level: 'high' }))).toEqual(['Hide', 'Lock at high', 'Turn off', '(Assess)'])
    expect(labels(at({ status: 'locked', level: 'high' }))).toEqual(['Hide', 'Unlock', 'Turn off', 'Assess'])
    expect(labels(turnedOff(at({ level: 'high' }), 'you'))).toEqual(['Hide', 'Turn on, locked at high', 'Turn on, unlocked', 'Turn on and assess'])
    expect(labels(turnedOff(freshState(), 'picker'))).toEqual(['Hide', '(Turn on, locked)', 'Turn on, unlocked', 'Turn on and assess'])
    expect(labels(freshState(), { ...VIEW, setting: undefined })).toEqual(['Hide', '(Lock)', 'Turn off', '(Assess)'])
    expect(bandActions(freshState(), VIEW)[3]?.disabled).toBe('It assesses before your next prompt anyway.')
  })
})

describe('0.17: messages, /er and saved state', () => {
  test('one dim line per change', () => {
    expect(message.moved('medium', 'high', 'bug fix touching three services')).toBe('Assessed, medium to high (bug fix touching three services).')
    expect(message.locked('high')).toBe('Locked at high.')
    expect(message.lockedByYou('high')).toBe('You locked it at high.')
    expect(message.unlocked()).toBe('Unlocked. Assessing again from your next prompt.')
    expect(message.picker('xhigh')).toBe('You changed the effort to xhigh, so routing is off.')
    expect(message.off('medium')).toBe('Off. Your effort (medium) applies.')
    expect(message.onLocked('high')).toBe('On, locked at high.')
    expect(message.onUnlocked()).toBe('On, unlocked.')
  })

  test('/er: bare opens the band; explicit verbs; assess takes a hint; anything else is refused, not run as a hint', () => {
    expect(parseRoute('')).toEqual({ kind: 'band' })
    for (const verb of ['lock', 'unlock', 'on', 'off', 'status', 'rules'] as const) expect(parseRoute(` ${verb.toUpperCase()} `)).toEqual({ kind: verb })
    expect(parseRoute('assess')).toEqual({ kind: 'assess' })
    expect(parseRoute('assess this is a Security review now')).toEqual({ kind: 'assess', hint: 'this is a Security review now' })
    expect(parseRoute('report')).toEqual({ kind: 'report', period: 'week' })
    expect(parseRoute('report month')).toEqual({ kind: 'report', period: 'month' })
    expect(parseRoute('report forever')).toEqual({ kind: 'unknown', text: 'report forever' })
    expect(parseRoute('stauts')).toEqual({ kind: 'unknown', text: 'stauts' })
    expect(parseRoute('lock now')).toEqual({ kind: 'unknown', text: 'lock now' })
    expect(ROUTE_USAGE).toContain('/er is short for /effort-router')
  })

  test('/er status: short blocks (where it stands, the last assessment, counts, subagents), no raw reply when it parsed', () => {
    const last = { at: 5_000, level: 'medium' as const, against: 'medium' as const, reason: 'small fix', why: 'One function.', outcome: 'stayed' }
    const report = routeReport(at({ assessed: 2, hint: 'security review' }), { ...VIEW, last }, {
      now: 10_000, calls: 2, verdict: { at: 5_000, trigger: 'after a prompt', raw: '{"decision":"level"}', kind: 'fork' }, lastReadMs: 1500,
      subagents: { routing: 'on', agents: [] },
    })
    expect(report).toBe([
      'Unlocked. Medium (your effort setting). Locks after 3 more prompts.',
      'Assessed 2 of 5 prompts.',
      'Your hint for the next assessment: security review',
      '',
      'Last assessment (after a prompt, a fork of the conversation, 5s ago, took 1.5s, the session was on medium):',
      'Medium, the level it was already on.',
      'Task: small fix',
      'Why: One function.',
      '',
      'Assessments this session: 2.',
      '',
      'Subagents: each gets its own level from its task.',
    ].join('\n'))
    // A reply that couldn't be read as a level is shown.
    const odd = routeReport(freshState(), { ...VIEW, last: { at: 5_000, outcome: 'no clear task' } }, { now: 10_000, calls: 1, verdict: { at: 5_000, trigger: 'after a prompt', raw: 'I think high?', kind: 'first' } })
    expect(odd).toContain('No clear task yet, so it stayed.\nIts reply: I think high?')
  })

  test('the state is saved in the ledger and comes back; anything malformed is ignored', () => {
    const states: RouterState[] = [
      freshState(),
      at({ assessed: 3, level: 'high', lastLevel: 'high', hint: 'h' }),
      at({ status: 'locked', level: 'high', assessed: 5, lockedBy: 'router', lockedAfter: 5, lastLevel: 'high' }),
      turnedOff(at({ level: 'low' }), 'picker'),
      firstSighting(7, 5),
    ]
    for (const state of states) expect(restored(savedOf(state))).toEqual(state)
    expect(savedOf({ ...freshState(), pending: { level: 'high', reason: 'r' }, unsupported: 'Haiku 4.5' })).toEqual({ status: 'unlocked', assessed: 0 })
    expect(restored(undefined)).toBeUndefined()
    expect(restored({ mode: 'auto', phase: 'locked', level: 'high' })).toBeUndefined() // a pre-0.17 store entry
    expect(restored({ status: 'locked' })).toEqual({ status: 'unlocked', assessed: 0 }) // locked with no level can't be
    let ledger = emptyLedger('s1', 'repo')
    ledger = { ...ledger, state: savedOf(states[2] as RouterState) }
    expect(parseLedger(JSON.stringify(ledger))?.state).toEqual(savedOf(states[2] as RouterState))
    expect(parseLedger(JSON.stringify({ ...ledger, state: { status: 'bogus' } }))?.state).toBeUndefined()
    expect(parseLedger(JSON.stringify({ ...ledger, setting: 'xhigh' }))?.setting).toBe('xhigh')
    expect(parseLedger(JSON.stringify({ ...ledger, setting: 'huge' }))?.setting).toBeUndefined()
  })

  test('routed subagents are kept in the ledger, and malformed rows dropped', () => {
    const row = { at: 1, model: 'opus', subagentType: 'general-purpose', description: 'Find usages', parent: 'xhigh' as const, level: 'low' as const, reason: 'a search', ms: 2300 }
    const ledger = withSubagentRow(emptyLedger('s1', 'repo'), row)
    expect(parseLedger(JSON.stringify(ledger))?.subagents).toEqual([row])
    expect(parseLedger(JSON.stringify({ ...ledger, subagents: [row, { ...row, level: 'huge' }, null] }))?.subagents).toEqual([row])
    expect(parseLedger(JSON.stringify(emptyLedger('s1', 'repo')))?.subagents).toBeUndefined()
  })
})

describe('telemetryAttributes', () => {
  test('unlocked before anything moved: your setting, no level of its own', () => {
    expect(telemetryAttributes(freshState(), 'medium', '1.0.0')).toEqual({
      'effort_router.version': '1.0.0', 'effort_router.status': 'unlocked', 'effort_router.setting': 'medium',
    })
  })
  test('locked at a level of its own', () => {
    expect(telemetryAttributes({ status: 'locked', level: 'high', assessed: 5, lockedBy: 'router', lockedAfter: 5 }, 'medium', '1.0.0')).toEqual({
      'effort_router.version': '1.0.0', 'effort_router.status': 'locked', 'effort_router.setting': 'medium', 'effort_router.level': 'high',
    })
  })
  test('off says why, and has no level', () => {
    expect(telemetryAttributes({ status: 'off', assessed: 2, offReason: 'picker', lastLevel: 'high' }, 'xhigh', '1.0.0')).toEqual({
      'effort_router.version': '1.0.0', 'effort_router.status': 'off', 'effort_router.setting': 'xhigh', 'effort_router.off_reason': 'picker',
    })
  })
  test('on a model it does not support it stands aside, and the setting is left out until seen', () => {
    expect(telemetryAttributes({ status: 'locked', level: 'high', assessed: 5, unsupported: 'Haiku 4.5' }, undefined, '1.0.0')).toEqual({
      'effort_router.version': '1.0.0', 'effort_router.status': 'standing aside',
    })
  })
})

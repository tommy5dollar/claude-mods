// Unit tests for the pure policy module. Run with `bun test` from the mod folder.
// Named *.spec.ts so `claude plugin test` (which loads *.test.ts with the
// engine's own kit) leaves it to bun.
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_TRIM,
  afterBudget,
  appliedLevel,
  classifierPrompt,
  classifierSystem,
  composeRules,
  footerLabel,
  bandActions,
  bandHeadline,
  offerKey,
  freshState,
  lockedAt,
  parseDecision,
  parseRoute,
  reasonText,
  restored,
  routeReport,
  ruleLayers,
  settingsRulesOf,
  STARTER_RULES,
  trimTranscript,
  turnedOff,
  turnedOn,
  wantsRead,
  withReading,
  withQuestionAnswer,
  capLines,
  renderTranscript,
  firstSighting,
  humanPromptCount,
  withSaved,
  questionText,
  ago,
  type TranscriptMessage,
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
    expect(system).toContain('implement for me a new finance solution pulling from multiple accountancy platforms → {"decision":"lock","level":"high"')
    expect(system).toContain('USER: pull the latest code → {"decision":"undecided"}')
    expect(system).toContain('2, keep it simple → {"decision":"lock","level":"low"')
    expect(system).toContain('USER answered:')
    expect((system.match(/^\d+\. USER:/gm) ?? []).length).toBeGreaterThanOrEqual(6)
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
  const PROPOSED = withReading(DECIDING, P_HIGH)
  const LOCKED = lockedAt(PROPOSED, P_HIGH)
  const OFF = turnedOff(DECIDING)

  test('apply: a reading puts the level in use (provisional); re-reads change it; undecided keeps it', () => {
    const provisional = withReading(DECIDING, P_HIGH, true)
    expect(provisional).toMatchObject({ mode: 'auto', phase: 'provisional', level: 'high', reason: 'bug fix in existing code' })
    expect(appliedLevel(provisional)).toBe('high')
    const lowered = withReading(provisional, P_LOW, true)
    expect(lowered).toMatchObject({ phase: 'provisional', level: 'low', reason: 'minimal patch' })
    expect(withReading(lowered, undefined, true)).toBe(lowered)
    expect(withReading(DECIDING, undefined, true)).toBe(DECIDING)
    expect(withReading(OFF, P_HIGH, true)).toMatchObject({ mode: 'auto', phase: 'provisional', level: 'high' })
    expect(withReading(LOCKED, P_LOW, true)).toMatchObject({ phase: 'locked', level: 'high', proposal: P_LOW }) // locked: still a switch offer
  })

  test('apply: footer, band and identity of a provisional level', () => {
    const provisional = withReading(DECIDING, P_HIGH, true)
    expect(footerLabel(provisional)).toEqual({ text: 'high?', color: 'yellow', dim: false })
    expect(bandHeadline(provisional)).toBe('Using high — bug fix in existing code')
    expect(bandActions(provisional).map(a => a.label)).toEqual(['Keep high', 'Revert to picker'])
    expect(bandActions(provisional, true, true).map(a => a.label)).toEqual(['Keep high', 'Revert to picker', 'Suggest now'])
    expect(bandActions(provisional, false).map(a => a.label)).toEqual(['Keep high'])
    expect(offerKey(provisional)).toBe('provisional:high')
    expect(offerKey(withReading(provisional, { level: 'high', reason: 'other words' }, true))).toBe('provisional:high') // same level: the band stays closed
    expect(offerKey(withReading(provisional, P_LOW, true))).toBe('provisional:low')
    expect(reasonText(provisional)).toBe('router: bug fix in existing code (in use, not yet kept)')
    expect(routeReport(provisional, 6)).toStartWith('high? The router\'s level is in use')
  })

  test('apply: the budget running out locks a provisional level', () => {
    const provisional = { ...withReading(DECIDING, P_HIGH, true), prompts: 6 }
    expect(afterBudget(provisional, 6, true)).toMatchObject({ mode: 'auto', phase: 'locked', level: 'high', reason: 'bug fix in existing code' })
    expect(afterBudget({ ...provisional, prompts: 5 }, 6, true)).toEqual({ ...provisional, prompts: 5 })
  })

  test('a provisional level survives a resume', () => {
    const provisional = withReading(DECIDING, P_HIGH, true)
    expect(restored(withSaved(undefined, 's1', provisional, 1).s1)).toMatchObject({ mode: 'auto', phase: 'provisional', level: 'high' })
  })

  test('first sighting: earlier prompts count; past the budget the router is left off', () => {
    expect(firstSighting(0, 6, true)).toEqual(freshState())
    expect(firstSighting(4, 6, true)).toEqual({ ...freshState(), prompts: 4 })
    expect(firstSighting(10, 6, true)).toMatchObject({ mode: 'picker', gaveUp: true, offReason: 'existing session — /route to ask' })
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

  test('status shows the consent mode, the read time and what was sent', () => {
    const report = routeReport(DECIDING, 6, 'medium', { now: 0, calls: 2, consent: 'apply', lastReadMs: 1240, sent: { sentChars: 23_900, fullChars: 91_000, maxChars: 24_000, omitted: 210 } })
    expect(report).toContain('Consent: apply.')
    expect(report).toContain('Classifier calls this session: 2. Last read took 1240 ms.')
    expect(report).toContain('Last read sent 23900 of 91000 transcript chars (cap 24000; 210 messages left out).')
    expect(routeReport(DECIDING, 6, 'medium', { now: 0, calls: 1, sent: { sentChars: 80, fullChars: 80, maxChars: 24_000, omitted: 0 } })).toContain('Last read sent the whole transcript: 80 chars (cap 24000).')
  })

  test('only a lock touches effort', () => {
    expect(appliedLevel(DECIDING)).toBeUndefined()
    expect(appliedLevel(PROPOSED)).toBeUndefined()
    expect(appliedLevel(LOCKED)).toBe('high')
    expect(appliedLevel(OFF)).toBeUndefined()
  })

  test('a re-read while pending can change the level or withdraw it', () => {
    expect(PROPOSED).toMatchObject({ phase: 'proposed', proposal: P_HIGH })
    expect(withReading(PROPOSED, P_LOW)).toMatchObject({ phase: 'proposed', proposal: P_LOW })
    const withdrawn = withReading({ ...PROPOSED, hint: 'h' }, undefined)
    expect(withdrawn.phase).toBe('undecided')
    expect(withdrawn.proposal).toBeUndefined()
    expect(withdrawn.hint).toBeUndefined()
    expect(withReading(DECIDING, undefined)).toBe(DECIDING)
  })

  test('while locked a different level is offered as a switch; the same level confirms', () => {
    expect(withReading(LOCKED, P_LOW)).toMatchObject({ phase: 'locked', level: 'high', proposal: P_LOW })
    expect(withReading(LOCKED, P_HIGH).proposal).toBeUndefined()
    expect(appliedLevel(withReading(LOCKED, P_LOW))).toBe('high')
  })

  test('a manual read from off brings the router back with a suggestion; undecided leaves it off', () => {
    expect(withReading(OFF, P_HIGH)).toMatchObject({ mode: 'auto', phase: 'proposed', proposal: P_HIGH })
    expect(withReading(OFF, undefined)).toBe(OFF)
  })

  test('the decision budget', () => {
    expect(wantsRead({ ...DECIDING, prompts: 1 }, 6)).toBe(true)
    expect(wantsRead({ ...DECIDING, prompts: 6 }, 6)).toBe(true)
    expect(wantsRead({ ...DECIDING, prompts: 7 }, 6)).toBe(false)
    expect(wantsRead({ ...PROPOSED, prompts: 3 }, 6)).toBe(true)
    expect(wantsRead({ ...LOCKED, prompts: 1 }, 6)).toBe(false)
    expect(wantsRead({ ...OFF, prompts: 1 }, 6)).toBe(false)
    expect(wantsRead({ ...DECIDING, prompts: 1, gaveUp: true }, 6)).toBe(false)

    expect(afterBudget({ ...DECIDING, prompts: 5 }, 6, true)).toEqual({ ...DECIDING, prompts: 5 })
    const off = afterBudget({ ...DECIDING, prompts: 6 }, 6, true)
    expect(off).toMatchObject({ mode: 'picker', gaveUp: true, offReason: 'no clear task after 6 prompts — /route to ask again' })
    expect(footerLabel(off).text).toBe('off')
    const idle = afterBudget({ ...DECIDING, prompts: 6 }, 6, false)
    expect(idle).toMatchObject({ mode: 'auto', phase: 'undecided', gaveUp: true })
    expect(footerLabel(idle)).toEqual({ text: 'deciding', dim: true })
    expect(afterBudget({ ...PROPOSED, prompts: 6 }, 6, true)).toMatchObject({ phase: 'proposed', proposal: P_HIGH, gaveUp: true })
    expect(afterBudget({ ...LOCKED, prompts: 9 }, 6, true)).toEqual({ ...LOCKED, prompts: 9 })
  })

  test('turn on: deciding over the whole conversation with a fresh budget', () => {
    expect(turnedOn({ ...OFF, prompts: 6, gaveUp: true, offReason: 'x' })).toMatchObject({ mode: 'auto', phase: 'undecided', prompts: 0, gaveUp: false, offReason: undefined })
  })

  test('footer labels per state', () => {
    expect(footerLabel(DECIDING)).toEqual({ text: 'deciding', dim: true })
    expect(footerLabel(PROPOSED)).toEqual({ text: 'high?', color: 'yellow', dim: false })
    expect(footerLabel(LOCKED)).toEqual({ text: 'high 🔒', color: 'yellow', dim: false })
    expect(footerLabel(withReading(LOCKED, P_LOW)).text).toBe('high 🔒 → low?')
    expect(footerLabel(OFF)).toEqual({ text: 'off', dim: true })

  })

  test('band headline and actions per state', () => {
    const labels = (state: typeof DECIDING, allowOff = true) => bandActions(state, allowOff).map(a => a.label)
    expect(labels(PROPOSED)).toEqual(['Accept high', 'Turn off'])
    expect(labels(DECIDING)).toEqual(['Suggest now', 'Turn off'])
    expect(labels(LOCKED)).toEqual(['Suggest now', 'Turn off'])
    expect(labels(withReading(LOCKED, P_LOW))).toEqual(['Accept low', 'Keep high', 'Turn off'])
    expect(labels(OFF)).toEqual(['Turn on'])
    expect(labels(DECIDING, false)).toEqual(['Suggest now'])
    expect(labels(PROPOSED, false)).toEqual(['Accept high'])

    expect(bandHeadline(LOCKED)).toBe('Effort router: high 🔒 — router: bug fix in existing code')
    expect(bandHeadline(PROPOSED)).toBe('Effort router: high? — bug fix in existing code')
    expect(bandHeadline(withReading(LOCKED, P_LOW))).toBe('Effort router: high 🔒 → low? — switch to low: minimal patch')
    expect(bandHeadline(OFF)).toBe('Effort router: off — the effort picker decides')
    expect(bandHeadline(DECIDING)).toStartWith('Effort router: deciding — ')
    expect(bandHeadline({ ...DECIDING, gaveUp: true })).toBe('Effort router: deciding — stopped reading; Suggest now asks again')
  })

  test('a suggestion has an identity so a closed band stays closed until it changes', () => {
    expect(offerKey(DECIDING)).toBeUndefined()
    expect(offerKey(LOCKED)).toBeUndefined()
    expect(offerKey(PROPOSED)).toBe(offerKey(withReading(PROPOSED, P_HIGH)))
    expect(offerKey(PROPOSED)).not.toBe(offerKey(withReading(PROPOSED, P_LOW)))
    expect(offerKey(withReading(LOCKED, P_LOW))).toBeDefined()
  })

  test('reasons and status', () => {
    expect(reasonText(LOCKED)).toBe('router: bug fix in existing code')
    expect(reasonText(afterBudget({ ...DECIDING, prompts: 6 }, 6, true))).toBe('router off: no clear task after 6 prompts — /route to ask again')
    expect(routeReport(LOCKED, 6)).toStartWith('high 🔒 (router: bug fix in existing code)')
    expect(routeReport({ ...DECIDING, prompts: 2 }, 6, 'medium')).toContain('Automatic reads: 2 of 6 used.')
    const report = routeReport({ ...DECIDING, prompts: 2 }, 6, 'medium', {
      now: 100_000,
      calls: 3,
      verdict: { at: 88_000, trigger: 'after a prompt', raw: '```json\n{"decision":"undecided"}\n```', decision: { decision: 'undecided' } },
      error: { at: 100_000 - 5 * 60_000, text: 'Error: timeout' },
    })
    expect(report).toContain('Classifier calls this session: 3.')
    expect(report).toContain('Last verdict (after a prompt, 12s ago): undecided. Raw: ```json {"decision":"undecided"} ```')
    expect(report).toContain('Last error (5m ago): Error: timeout')
    expect(ago(0, 2 * 3600_000)).toBe('0s ago')
    expect(ago(3 * 3600_000, 0)).toBe('3h ago')
    expect(routeReport({ ...PROPOSED, hint: 'keep it quick' }, 6)).toContain('Hint: keep it quick')
  })

  test('saved state round-trips a lock and off; a pending proposal is not persisted; old pinned entries come back locked', () => {
    const saved = withSaved(undefined, 's1', LOCKED, 1)
    expect(restored(saved.s1)).toMatchObject({ mode: 'auto', phase: 'locked', level: 'high', reason: 'bug fix in existing code' })
    expect(restored(withSaved(undefined, 's2', PROPOSED, 1).s2).phase).toBe('undecided')
    const gaveUp = afterBudget({ ...DECIDING, prompts: 6 }, 6, true)
    expect(restored(withSaved(undefined, 's3', gaveUp, 1).s3)).toMatchObject({ mode: 'picker', offReason: gaveUp.offReason })
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

// Unit tests for the pure policy module. Run with `bun test` from the mod folder.
// Named *.spec.ts so `claude plugin test` (which loads *.test.ts with the
// engine's own kit) leaves it to bun.
import { describe, expect, test } from 'bun:test'

import {
  DEFAULT_TRIM,
  appliedLevel,
  classifierSystem,
  composeRules,
  footerLabel,
  footerMenu,
  reasonText,
  routeReport,
  freshState,
  parseDecision,
  ruleLayers,
  settingsRulesOf,
  parseRoute,
  proposalChoices,
  restored,
  STARTER_RULES,
  trimTranscript,
  withSaved,
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
    ]
    const out = trimTranscript(messages, 'now fix the flaky checkout test')
    const lines = out.split('\n')
    expect(lines[0]).toBe('USER: pull the latest code')
    expect(lines[1]).toStartWith('ASSISTANT: xxx')
    expect(lines[1]).toContain(`[${1000 - DEFAULT_TRIM.assistantChars} more chars]`)
    expect(lines[1]).toEndWith('[tools: Bash×2, Read]')
    expect(lines[2]).toBe('USER: now fix the flaky checkout test')
    expect(out).not.toContain('huge tool output')
    expect(out).not.toContain('command-name')
  })

  test('drops the middle but keeps the first prompt and the latest lines when too long', () => {
    const messages: TranscriptMessage[] = [{ role: 'user', text: 'FIRST' }]
    for (let i = 0; i < 50; i++) messages.push({ role: 'assistant', text: `reply ${i} ${'y'.repeat(200)}` })
    const out = trimTranscript(messages, 'LATEST', { userChars: 100, assistantChars: 300, totalChars: 2000 })
    expect(out.length).toBeLessThanOrEqual(2000)
    expect(out.split('\n')[0]).toBe('USER: FIRST')
    expect(out).toContain('earlier messages omitted')
    expect(out).toEndWith('USER: LATEST')
  })

  test('assistant message with only tool uses', () => {
    expect(trimTranscript([{ role: 'assistant', text: '', toolUses: [{ tool: 'Edit' }] }])).toBe('ASSISTANT: [tools: Edit]')
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
  const cases: [string, ReturnType<typeof parseRoute>['kind'], unknown?][] = [
    ['', 'show'],
    ['  ', 'show'],
    ['decide', 'decide'],
    ['fix high', 'fix', 'high'],
    ['FIX XHigh', 'fix', 'xhigh'],
    ['off', 'off'],
    ['fix', 'error'],
    ['fix ultra', 'error'],
    ['fix picker', 'error'],
    ['off now', 'error'],
    ['decide now', 'error'],
    // 0.1 names, kept as hidden aliases
    ['auto', 'decide'],
    ['pin max', 'fix', 'max'],
    ['pin picker', 'off'],
    ['rules', 'rules'],
    ['rules init', 'rules-init', 'user'],
    ['rules init project', 'rules-init', 'project'],
    ['rules critique', 'rules-critique'],
    ['rules init team', 'error'],
  ]
  for (const [args, kind, arg] of cases) {
    test(`/route ${args}`, () => {
      const parsed = parseRoute(args)
      expect(parsed.kind).toBe(kind)
      if (parsed.kind === 'fix') expect(parsed.level).toBe(arg as never)
      if (parsed.kind === 'rules-init') expect(parsed.scope).toBe(arg as never)
    })
  }
})

describe('state', () => {
  test('only a lock or a pin touches effort', () => {
    expect(appliedLevel(freshState())).toBeUndefined()
    expect(appliedLevel({ ...freshState(), phase: 'proposed', proposal: { level: 'high', reason: 'r' } })).toBeUndefined()
    expect(appliedLevel({ ...freshState(), phase: 'locked', level: 'high' })).toBe('high')
    expect(appliedLevel({ ...freshState(), mode: 'pinned', level: 'max' })).toBe('max')
    expect(appliedLevel({ ...freshState(), mode: 'picker', level: 'max' })).toBeUndefined()
  })

  const DECIDING = freshState()
  const PROPOSED = { ...freshState(), phase: 'proposed' as const, proposal: { level: 'high' as const, reason: 'bug fix in existing code' } }
  const BY_ROUTER = { ...freshState(), phase: 'locked' as const, level: 'high' as const, reason: 'bug fix in existing code' }
  const BY_YOU = { ...freshState(), mode: 'pinned' as const, phase: 'locked' as const, level: 'max' as const, reason: 'you chose max' }
  const OFF = { ...freshState(), mode: 'picker' as const }

  test('three states, compact labels, no auto/pin jargon', () => {
    expect(footerLabel(DECIDING, 'medium')).toEqual({ text: 'medium · deciding', dim: true })
    expect(footerLabel(DECIDING).text).toBe('default · deciding')
    expect(footerLabel(PROPOSED, 'medium')).toEqual({ text: 'medium → high?', color: 'yellow', dim: false })
    expect(footerLabel(BY_ROUTER, 'medium')).toEqual({ text: 'high 🔒', color: 'yellow', dim: false })
    expect(footerLabel(BY_YOU, 'medium').text).toBe('max 🔒')
    expect(footerLabel(OFF, 'low')).toEqual({ text: 'router off', dim: true })
  })

  test('the reason keeps who fixed it', () => {
    expect(reasonText(BY_ROUTER)).toBe('router: bug fix in existing code')
    expect(reasonText(BY_YOU)).toBe('you chose max')
    expect(routeReport(BY_YOU)).toStartWith('max 🔒 (you chose max)')
    expect(routeReport(DECIDING, 'medium')).toStartWith('medium · deciding.')
    for (const state of [DECIDING, PROPOSED, BY_ROUTER, BY_YOU, OFF]) {
      expect(routeReport(state, 'medium')).not.toMatch(/\bauto\b|\bpin(ned)?\b/)
    }
  })

  test('footer menu: the closed dropdown reads as the state', () => {
    const label = (menu: ReturnType<typeof footerMenu>) => menu.options.find(o => o.value === menu.value)?.label
    const deciding = footerMenu(DECIDING, 'medium')
    expect(deciding.options.map(o => o.label)).toEqual(['Low 🔒', 'Medium 🔒', 'High 🔒', 'XHigh 🔒', 'Max 🔒', 'medium · deciding', 'Router off'])
    expect(label(deciding)).toBe('medium · deciding')

    const proposed = footerMenu(PROPOSED, 'medium')
    expect(proposed.options[0]).toEqual({ value: 'accept', label: 'Accept high' })
    expect(label(proposed)).toBe('medium → high?')

    const fixed = footerMenu(BY_ROUTER, 'medium')
    expect(fixed.value).toBe('fix high')
    expect(label(fixed)).toBe('high 🔒')
    expect(fixed.options.map(o => o.label)).toContain('Decide again')
    expect(fixed.options.map(o => o.label)).toContain('Max 🔒')

    const off = footerMenu(OFF, 'medium')
    expect(label(off)).toBe('router off')
    expect(off.options.map(o => o.label)).toContain('Let the router decide')

    for (const menu of [deciding, proposed, fixed, off]) {
      expect(new Set(menu.options.map(o => o.value)).size).toBe(menu.options.length)
      expect(menu.options.every(o => o.value === 'accept' || parseRoute(o.value).kind !== 'error')).toBe(true)
    }
  })

  test('footer menu without fixing (org allowPin: false)', () => {
    const deciding = footerMenu(DECIDING, 'medium', false)
    expect(deciding.options.map(o => o.value)).toEqual(['decide', 'off'])
    const fixed = footerMenu(BY_ROUTER, 'medium', false)
    expect(fixed.options.map(o => o.value)).toEqual(['fix high', 'decide', 'off'])
    expect(fixed.options[0]?.label).toBe('high 🔒')
  })

  test('the band offers the proposal first, four choices', () => {
    expect(proposalChoices({ level: 'high', reason: '' })).toEqual(['high', 'medium', 'low', 'max'])
    expect(proposalChoices({ level: 'medium', reason: '' })).toEqual(['medium', 'low', 'high', 'max'])
  })

  test('saved state round-trips a lock; a pending proposal is not persisted; old sessions are evicted', () => {
    const locked = { ...freshState(), phase: 'locked' as const, level: 'high' as const, reason: 'bug fix' }
    const saved = withSaved(undefined, 's1', locked, 1)
    expect(restored(saved.s1)).toMatchObject({ mode: 'auto', phase: 'locked', level: 'high', reason: 'bug fix' })
    const proposed = withSaved(undefined, 's2', { ...freshState(), phase: 'proposed', proposal: { level: 'max', reason: 'x' } }, 1)
    expect(restored(proposed.s2).phase).toBe('undecided')
    expect(restored({ mode: 'pinned', level: 'nope' })).toEqual(freshState())
    let all: ReturnType<typeof withSaved> = {}
    for (let i = 0; i < 105; i++) all = withSaved(all, `id${i}`, locked, i)
    expect(Object.keys(all)).toHaveLength(100)
    expect(all.id0).toBeUndefined()
    expect(all.id104).toBeDefined()
  })
})

describe('settings-borne rules', () => {
  test('reads pluginConfigs options under any marketplace key, then a top-level effortRouter object', () => {
    expect(settingsRulesOf({ pluginConfigs: { 'effort-router@tommy-mods': { options: { rules: 'R', rulesMode: 'enforce', allowPin: false } } } }))
      .toEqual({ rules: 'R', rulesMode: 'enforce', allowPin: false })
    expect(settingsRulesOf({ effortRouter: { rules: 'TOP' } })).toEqual({ rules: 'TOP' })
    expect(settingsRulesOf({ pluginConfigs: { 'other@x': { options: { rules: 'NO' } } } })).toEqual({})
    expect(settingsRulesOf({ effortRouter: { rules: '  ', rulesMode: 'bogus', allowPin: 'no' } })).toEqual({})
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

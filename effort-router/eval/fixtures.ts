// Classifier eval fixtures: a transcript (as `$.session.messages()` rows, plus
// the prompt being submitted) and the outcomes that count as a pass.
// `undecided` is a valid expectation; a list means any of those levels passes.
// SUBAGENT_FIXTURES are subagent briefs (what `agent.spawn` carries), read with
// the subagent frame; they have no undecided.
import type { Level, SubagentBrief, TranscriptMessage } from '../hooks/policy'

export type Expected = Level | 'undecided'

export type Fixture = {
  name: string
  messages: TranscriptMessage[]
  /** The prompt being submitted (the read at prompt.submit sees it beside the transcript). */
  current?: string
  expect: readonly Expected[]
  /**
   * Where the evidence says a model should differ (rules/models/research-2026-10.md), the levels that pass on it,
   * replacing `expect`. These are predictions from the evidence, not measured truth.
   */
  expectOn?: Partial<Record<'opus' | 'sonnet' | 'fable', readonly Expected[]>>
}

const u = (text: string): TranscriptMessage => ({ role: 'user', text })
const a = (text: string, toolUses: TranscriptMessage['toolUses'] = []): TranscriptMessage => ({ role: 'assistant', text, toolUses })
const asked = (questions: { question: string; options: string[] }[], answer: string): TranscriptMessage =>
  a('', [
    {
      tool: 'AskUserQuestion',
      tool_use_id: 'q1',
      input: { questions: questions.map(q => ({ question: q.question, header: '', options: q.options.map(label => ({ label, description: '' })), multiSelect: false })) },
      text: answer,
    },
  ])

export const FIXTURES: Fixture[] = [
  // --- filler: no actionable task yet ---------------------------------------------
  { name: 'greeting', messages: [], current: 'hi', expect: ['undecided'] },
  { name: 'pull latest', messages: [], current: 'pull latest code', expect: ['undecided'] },
  {
    name: 'repo question before work',
    messages: [u("what's in this repo?")],
    current: undefined,
    expect: ['undecided'],
  },
  {
    name: 'pull, then what does it do',
    messages: [u('pull the latest code'), a('Pulled 3 new commits on main.', [{ tool: 'Bash' }])],
    current: 'what does the billing module do?',
    expect: ['undecided', 'low'],
  },
  { name: 'install and run (housekeeping)', messages: [], current: 'install the deps and start the dev server', expect: ['undecided', 'low'] },

  // --- a stated task, even underspecified, gets a level -------------------------------
  {
    name: 'finance build after filler (the live miss)',
    messages: [u('pull latest code'), a('Pulled. You are up to date with origin/main.', [{ tool: 'Bash' }])],
    current: 'implement for me a new finance solution pulling from multiple accountancy platforms',
    expect: ['high', 'xhigh', 'medium'],
  },
  { name: 'vague feature', messages: [], current: "I want to add some kind of reporting feature, not sure exactly what yet", expect: ['low', 'medium'] },
  { name: 'ordinary feature', messages: [], current: 'add a dark mode toggle to the settings page', expect: ['medium', 'low'] },
  { name: 'brownfield bug fix', messages: [], current: 'the checkout total is wrong when a coupon expires mid-session, fix it', expect: ['high'] },
  // Sonnet 5.5 at low can skip verifying a code change and report it done (its notes), so medium is fair there
  { name: 'mechanical rename', messages: [], current: 'rename getUser to fetchUser across the repo', expect: ['low'], expectOn: { sonnet: ['low', 'medium'] } },
  { name: 'edge-case tests', messages: [], current: "write tests for the date parser's edge cases: leap years, DST, bad input", expect: ['high', 'xhigh'] },
  { name: 'storage engine concurrency', messages: [], current: 'implement a lock-free ring buffer for the write-ahead log in our storage engine', expect: ['xhigh', 'high'] },
  {
    name: 'autonomous vulnerability hunt',
    messages: [],
    current: "find security vulnerabilities in our auth service and fix them. Work through it on your own, I'm away all day",
    // max isn't offered (highestLevel xhigh); Opus 5.5's notes (returns flatten above medium) can make high a fair answer
    expect: ['xhigh', 'high'],
  },
  {
    name: 'autonomous end-to-end build',
    messages: [],
    current: "build the whole booking app end to end and verify it works, don't ask me any questions, I'll check tomorrow",
    expect: ['xhigh', 'high'],
  },
  {
    name: 'research on current tools',
    messages: [],
    current: 'find out which of the current AI coding assistants support remote MCP servers over HTTP today, and put it in a table with links',
    expect: ['low', 'medium'],
    // Fable 5.1 at low calls search tools less and answers from memory, most of all about current products
    expectOn: { fable: ['medium', 'high'] },
  },

  // --- held out: not mirrored by the prompt's worked examples ---------------------------
  { name: 'held out: morning + git status', messages: [], current: 'morning! can you run git status for me', expect: ['undecided', 'low'] },
  {
    name: 'held out: payout reconciliation webhook',
    messages: [],
    current: 'build a Stripe webhook handler that reconciles payouts against our ledger',
    expect: ['high', 'xhigh'],
  },
  {
    name: 'held out: bank statement importer, vague',
    messages: [u('hey'), a('Hi! What are we working on?')],
    current: 'need something that imports statements from our three banks, details tbd',
    expect: ['high', 'medium', 'xhigh'],
  },
  { name: 'held out: pagination', messages: [], current: 'add pagination to the GET /users endpoint', expect: ['medium', 'low'] },
  {
    name: 'held out: "b" after a lettered question',
    messages: [u('migrate the database to the new schema'), a('Should I (a) migrate every table with backfills and a rollback plan, or (b) just add the new status column to orders?')],
    current: 'b',
    expect: ['low', 'medium'],
  },

  // --- re-reads in context ----------------------------------------------------------
  {
    name: '"2, keep it simple" after a numbered question',
    messages: [
      u('refactor the payment retry logic'),
      a('Two ways to go: 1. a full rewrite with a state machine and jittered backoff (complex) or 2. just extract the backoff constant into config (simple). Which?'),
    ],
    current: '2, keep it simple',
    expect: ['low'],
    expectOn: { sonnet: ['low', 'medium'] }, // as for the rename
  },
  {
    name: 'scope narrowed by a later clarification',
    messages: [u('fix the whole auth system'), a('Before I start: what is broken? Login, sessions, password reset?')],
    current: 'actually just the typo in the login error message',
    expect: ['low'],
  },
  {
    name: 'AskUserQuestion answers refine the task',
    messages: [
      u('build a sync job for our invoices'),
      asked(
        [
          { question: 'Which platforms?', options: ['Xero', 'QuickBooks', 'Sage'] },
          { question: 'How often?', options: ['Nightly', 'Real time'] },
        ],
        'User has answered your questions: "Which platforms?"="Xero, QuickBooks", "How often?"="Nightly". You can now continue with the user\'s answers in mind.',
      ),
    ],
    current: undefined,
    expect: ['high', 'xhigh', 'medium'],
  },
  // --- added 2026-10-05 for the routing set: everyday asks in a small payments repo (probe-mix.txt) ----------------
  { name: 'pay: what does this repo do', messages: [], current: 'What does this repo do?', expect: ['undecided'] },
  { name: 'pay: README typo', messages: [], current: 'Fix the typo in the README: "recieve" should be "receive".', expect: ['low'] },
  { name: 'pay: rename and run tests', messages: [], current: 'Rename getAccount to findAccount everywhere and run the tests.', expect: ['low'] },
  { name: 'pay: explain fees, no changes', messages: [], current: "How are monthly fees worked out today? Just explain, don't change anything.", expect: ['undecided', 'low'] },
  { name: 'pay: --json flag', messages: [], current: "Add a --json flag to the CLI's balance command that prints the same data as JSON.", expect: ['low', 'medium'] },
  { name: 'pay: CSV exporter', messages: [], current: 'Add a CSV exporter for payouts next to the JSON one, with the same fields.', expect: ['low', 'medium'] },
  { name: 'pay: fees from a spec', messages: [], current: 'Implement the monthly fees described in docs/monthly-fees.md.', expect: ['medium'] },
  { name: 'pay: date edge-case tests', messages: [], current: 'Add unit tests for src/fees.ts covering month ends, leap years and accounts opened mid-month.', expect: ['medium'] },
  { name: 'pay: sketch designs, no code', messages: [], current: 'Sketch three ways we could support accounts in more than one currency. No code yet, I want to pick one first.', expect: ['medium'] },
  { name: 'pay: double debit bug', messages: [], current: 'A customer got debited twice for the same payout last week. Find out why and fix it.', expect: ['medium', 'high'] },
  { name: 'pay: concurrency-safe billing', messages: [], current: "Make chargeMonthlyFees safe to run on two servers at the same time. Today the only guard is the ledger's duplicate key, and we're moving to a database that doesn't have one.", expect: ['high'] },
  { name: 'pay: security review', messages: [], current: "Do a security review of the CLI and the exporters: can anyone see or change another account's money?", expect: ['high'] },
  { name: 'pay: unattended bigint migration', messages: [], current: "I'm going offline for the evening. Change every amount from a number to a bigint without changing any output, and don't stop until the whole test suite passes.", expect: ['medium', 'high'] },

  // --- added 2026-10-05: everyday work that should step down from the default (Opus medium or high, Fable high) --
  // These are the router's bread and butter (Tommy, 2026-10-05): most of its value is moving routine sessions to a
  // cheaper level, so the set needs plenty of them.
  { name: 'cheap: fix a lint error', messages: [], current: 'npm run lint is failing on an unused import in src/cli.ts. Fix it.', expect: ['low'] },
  { name: 'cheap: bump a dependency', messages: [], current: 'Bump zod to the latest 3.x and make sure the build still passes.', expect: ['low'] },
  { name: 'cheap: add a log line', messages: [], current: 'Add a debug log in chargeMonthlyFees that prints the account id and the fee before it posts.', expect: ['low'] },
  { name: 'cheap: document a flag', messages: [], current: 'Add the new --json flag to the README usage section, matching how the other flags are written up.', expect: ['low'] },
  { name: 'cheap: commit message', messages: [], current: 'Write a commit message for the staged changes and commit them.', expect: ['low'] },
  { name: 'cheap: explain an error', messages: [], current: 'What does this mean? TypeError: Cannot read properties of undefined (reading \'currency\') at formatAmount (src/format.ts:12)', expect: ['low', 'medium'] },
  { name: 'cheap: add a field following the pattern', messages: [], current: 'Add an optional reference field to Payout, the same way description is done: type, parser, JSON output and the existing tests.', expect: ['low', 'medium'] },
  { name: 'cheap: update snapshots', messages: [], current: 'The output format changed on purpose. Update the snapshot tests and check nothing else broke.', expect: ['low'] },
  { name: 'cheap: change a default', messages: [], current: 'Change the default page size from 20 to 50.', expect: ['low'] },
  { name: 'cheap: convert config', messages: [], current: 'Convert config/settings.json to YAML and update the loader to read the YAML file.', expect: ['low', 'medium'] },
  { name: 'cheap: delete dead code', messages: [], current: 'Delete the old v1 exporter and anything only it uses. Nothing calls it any more.', expect: ['low', 'medium'] },
  { name: 'cheap: small UI tweak', messages: [], current: 'Make the balance header bold and move the currency code after the amount.', expect: ['low'] },
  {
    name: 'cheap: follow-up, same again',
    messages: [u('Add a --json flag to the balance command.'), a('Done: the balance command takes --json and prints the same fields as JSON. Tests added and passing.', [{ tool: 'Edit', text: 'src/commands/balance.ts' }, { tool: 'Bash', text: 'npm test' }])],
    current: 'Nice. Same for the payouts command.',
    expect: ['low'],
  },
  {
    name: 'cheap: follow-up, run and fix the tests',
    messages: [u('Rename Ledger to AccountLedger everywhere.'), a('Renamed across 14 files.', [{ tool: 'Edit', text: 'src/ledger.ts' }])],
    current: 'Run the tests and fix anything that broke.',
    expect: ['low'],
  },
  { name: 'cheap: ordinary feature with tests', messages: [], current: 'Add a command that lists the last 10 payouts for an account, with a test.', expect: ['medium', 'low'] },
  { name: 'cheap: ordinary bug with a clear cause', messages: [], current: 'Amounts under £1 print as "£.50" instead of "£0.50". Fix it and add a test.', expect: ['low', 'medium'] },

  // --- the user's own words about effort win -------------------------------------------------------------------
  { name: 'ask: think hard on a small task', messages: [], current: "Think particularly hard, long and deep on this one, and use way more inference than usual: add a --json flag to the CLI's balance command that prints the same data as JSON.", expect: ['xhigh'] },
  { name: 'ask: quick one on a money bug', messages: [], current: "No need to be thorough, just get a fix in fast: a customer got debited twice for the same payout last week. Find out why and fix it.", expect: ['low'] },
  { name: 'ask: low effort on a spec', messages: [], current: 'Use low effort for this: implement the monthly fees described in docs/monthly-fees.md.', expect: ['low'] },
  { name: 'ask: xhigh on a typo', messages: [], current: 'Run this at xhigh: fix the typo in the README, "recieve" should be "receive".', expect: ['xhigh'] },
  { name: 'ask: medium on a security review', messages: [], current: "Use medium effort. Do a security review of the CLI and the exporters: can anyone see or change another account's money?", expect: ['medium'] },
  { name: 'ask: max on a rename', messages: [], current: 'Do this on max effort please: rename getAccount to findAccount everywhere and run the tests.', expect: ['xhigh'] },
]

// --- subagent briefs: one read of the brief at spawn, no undecided -------------------

export type SubagentFixture = { name: string; brief: SubagentBrief; expect: readonly Level[]; expectOn?: Partial<Record<'opus' | 'sonnet' | 'fable', readonly Level[]>> }

const brief = (subagentType: string, description: string, prompt: string): SubagentBrief => ({ subagentType, description, prompt })

export const SUBAGENT_FIXTURES: SubagentFixture[] = [
  // --- mechanical: low ---------------------------------------------------------------
  {
    name: 'web research, tabulate lender criteria',
    brief: brief(
      'general-purpose',
      'BTL lender criteria research',
      'Research UK lenders that offer buy-to-let mortgages to limited companies. For each of Precise, Paragon, Kent Reliance and The Mortgage Works, find the maximum LTV, the minimum interest cover ratio for higher-rate taxpayers and the product fee from their published criteria pages. Return a markdown table with a source URL per row. Do not spawn sub-agents.',
    ),
    expect: ['low'],
    expectOn: { fable: ['low', 'medium'] }, // Fable 5.1 at low searches less and answers from memory (its notes)
  },
  {
    name: 'Explore: where is the token refreshed',
    brief: brief(
      'Explore',
      'Find token refresh code',
      'Find where the frontend refreshes the session token and which React hooks or components trigger it. Report each file path with a one-line note on what it does. Search breadth: medium.',
    ),
    expect: ['low'],
  },
  {
    name: 'summarise a given doc',
    brief: brief('general-purpose', 'Summarise payments architecture doc', 'Read docs/architecture/payments.md and give me a 10-bullet summary of the payment flows it describes. Quote the section headings you drew each bullet from.'),
    expect: ['low'],
  },
  {
    name: 'run the tests and report, no fixing',
    brief: brief('general-purpose', 'Run API tests', 'Run `bun test` in packages/api and report which tests fail, with the first lines of each error. Do not change any code.'),
    expect: ['low'],
  },
  {
    name: 'list npm scripts across the monorepo',
    brief: brief('general-purpose', 'Inventory npm scripts', 'List the npm scripts defined in every package.json in this monorepo, as a table of package name, script name and command.'),
    expect: ['low'],
  },
  {
    name: 'extract action items from given text',
    brief: brief(
      'general-purpose',
      'Extract action items',
      'From the meeting notes below, extract every action item with its owner and due date as a markdown table. Leave the due date blank where none is given.\n\nNotes: Priya to send the revised pricing deck by Friday. Tom will chase legal on the DPA. We agreed Sam owns the onboarding survey, due end of month. Next sync in two weeks.',
    ),
    expect: ['low'],
  },
  {
    name: 'add translation keys in the existing format',
    brief: brief('general-purpose', 'Add i18n keys', 'In src/i18n/en.json and src/i18n/fr.json add the key checkout.promo.expired with the strings "This code has expired" and "Ce code a expiré", following the existing nesting and ordering.'),
    expect: ['low', 'medium'],
  },

  // --- open-ended judgement, no user in the loop: high and up --------------------------
  {
    name: 'implement rate limiting from a spec, with tests',
    brief: brief(
      'general-purpose',
      'Implement API rate limiting',
      'Implement rate limiting for the public REST API. Spec: token bucket per API key, 100 requests per minute with a burst of 20, state in Redis, respond 429 with a Retry-After header, limits configurable by environment variable, internal service keys exempt. Add unit tests for the bucket maths and an integration test against the Express app. Report what you changed.',
    ),
    expect: ['high', 'xhigh'],
  },
  {
    name: 'debug a failing test after a merge',
    brief: brief(
      'general-purpose',
      'Fix failing ledger test',
      "The test 'settles partial refunds across currencies' in src/ledger/ledger.spec.ts started failing after yesterday's merge to main. Find the root cause and fix it. Do not just change the assertion; explain what broke.",
    ),
    expect: ['high', 'xhigh'],
  },
  {
    name: 'security review of a branch',
    brief: brief(
      'general-purpose',
      'Security review of auth branch',
      'Do a security review of the changes on this branch: the OAuth callback handler and the new session cookie settings. Look for CSRF, open redirects, token leakage in logs or URLs, and missing cookie flags. Report each finding with severity and a suggested fix.',
    ),
    expect: ['high', 'xhigh'],
  },
  {
    name: 'Plan: design proposal for event-driven reconciliation',
    brief: brief(
      'Plan',
      'Design event-driven reconciliation',
      'Write a design proposal for moving our nightly batch reconciliation of card settlements to an event-driven model. Cover at least two options, the trade-offs, a migration path that keeps both running in parallel, and the risks to month-end close.',
    ),
    expect: ['high', 'xhigh'],
  },
  {
    name: 'review a PR for correctness',
    brief: brief('general-purpose', 'Review retry middleware PR', 'Review PR #482, which adds retry middleware to the HTTP client, for correctness bugs and missed edge cases (idempotency, timeouts, retry storms). Report issues with file and line; do not change code.'),
    expect: ['high', 'xhigh'],
  },
  {
    name: 'autonomous port with property tests',
    brief: brief(
      'general-purpose',
      'Port payment state machine to TS',
      "Port the payment state machine from the legacy C# service (legacy/Payments/StateMachine.cs) to TypeScript in src/payments/state.ts, keeping behaviour identical. Write property-based tests against the recorded fixtures in legacy/fixtures and keep iterating until they all pass. Work on your own; I won't be around to answer questions.",
    ),
    expect: ['high', 'xhigh', 'max'],
  },

  // --- the fragile point: a short brief that leans on shared context ------------------
  {
    name: 'vague: "same for the invoices table"',
    brief: brief('general-purpose', 'Same for invoices', 'Now do the same for the invoices table.'),
    expect: ['low', 'medium', 'high'],
  },
]

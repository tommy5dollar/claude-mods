// Classifier eval fixtures: a transcript (as `$.session.messages()` rows, plus
// the prompt being submitted) and the outcomes that count as a pass.
// `undecided` is a valid expectation; a list means any of those levels passes.
import type { Level, TranscriptMessage } from '../hooks/policy'

export type Expected = Level | 'undecided'

export type Fixture = {
  name: string
  messages: TranscriptMessage[]
  /** The prompt being submitted (the read at prompt.submit sees it beside the transcript). */
  current?: string
  expect: readonly Expected[]
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
  { name: 'mechanical rename', messages: [], current: 'rename getUser to fetchUser across the repo', expect: ['low'] },
  { name: 'edge-case tests', messages: [], current: "write tests for the date parser's edge cases: leap years, DST, bad input", expect: ['high', 'xhigh'] },
  { name: 'storage engine concurrency', messages: [], current: 'implement a lock-free ring buffer for the write-ahead log in our storage engine', expect: ['xhigh', 'high'] },
  {
    name: 'autonomous vulnerability hunt',
    messages: [],
    current: "find security vulnerabilities in our auth service and fix them. Work through it on your own, I'm away all day",
    expect: ['max', 'xhigh'],
  },
  {
    name: 'autonomous end-to-end build',
    messages: [],
    current: "build the whole booking app end to end and verify it works, don't ask me any questions, I'll check tomorrow",
    expect: ['max'],
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
]

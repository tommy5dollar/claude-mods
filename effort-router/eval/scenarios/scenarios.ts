// The end-to-end scenarios: a real `claude -p` session in a copy of a fixture repo, router on against router off,
// graded by tests the session never sees. See README.md in this folder.
//
// Ordinary work runs on Opus 5.5. Fable 5.1 is for very tricky tasks and for orchestrating subagents (Opus for the
// work, Sonnet for web research). Main threads are Opus or Fable, never Sonnet; subagents are Opus or Sonnet.
// Haiku isn't tested.

export type Level = 'low' | 'medium' | 'high' | 'xhigh' | 'max'

/** One arm: the session's effort setting, whether the router is loaded, and any overlay of its own (e.g. a rules file). */
export type Arm = { name: string; router: boolean; effort: Level; options?: Record<string, unknown>; overlay?: string }

/** A human turn. Text starting with "/" is a command (e.g. "/er unlock"). */
export type Step = string

export type Scenario = {
  name: string
  claim: string
  model: string
  fixture: string
  /** Folders under overlays/ copied over the fixture in order (files added or replaced for this scenario). */
  overlay?: string | string[]
  /** Folders under hidden/ with the grading tests. */
  hidden?: string | string[]
  steps: Step[]
  arms: Arm[]
}

const OPUS = 'claude-opus-5-5'
const on = (effort: Level): Arm => ({ name: `router-from-${effort}`, router: true, effort })
const off = (effort: Level): Arm => ({ name: `fixed-${effort}`, router: false, effort })

// Step down: a user who keeps Opus on high. The third arm is the level the router should pick, set by hand.
const stepDown = [off('high'), on('high'), off('low')]
// Step up: Opus on its default, medium. The third arm is the most a user would set by hand.
const stepUp = [off('medium'), on('medium'), off('xhigh')]

// The parent builds a hard feature, then launches four subagents with fixed briefs: three simple, one hard (a control).
// Each subagent's level comes from a fork of the parent's whole conversation, so this checks the fork judges the brief,
// not the parent's task: the simple ones should come out low, the review high. Read from the ledger's `subagents`.
const anchoring =
  'Implement the monthly fees in docs/monthly-fees.md. When your implementation passes its tests, launch these four ' +
  'subagents in parallel, each with exactly the brief given, then tell me what they found:\n' +
  '1. An Opus subagent: list every file in this repo that imports from src/payouts.ts.\n' +
  '2. A Sonnet subagent: find the current Node.js LTS version on the web.\n' +
  '3. An Opus subagent: add a one-line comment above chargeMonthlyFees in src/fees.ts pointing to docs/monthly-fees.md.\n' +
  '4. An Opus subagent: independently review src/fees.ts against docs/monthly-fees.md and list every rule it gets wrong, with an input that shows each one.'

export const scenarios: Scenario[] = [
  {
    name: 'opus-small-jobs',
    claim: 'The daily driver: Opus on high through a run of ordinary small jobs in one session. Each prompt is assessed, so easy ones step down.',
    model: OPUS,
    fixture: 'payouts',
    hidden: ['rename', 'pretty-flag', 'balance-command'],
    steps: [
      'Rename getTxns to listTransactions everywhere.',
      'Add a --pretty flag to the export command that indents the JSON.',
      "Add a balance command to the CLI that prints an account's closing balance.",
      'Update the README so it documents the new flag and command.',
      'Write me a commit message for all of this.',
    ],
    arms: [off('high'), on('high')],
  },
  {
    name: 'bigint',
    claim: 'A codebase-wide change that must not change any output steps up (probe: high at 72%): easy to miss a place, and JSON can\'t hold a bigint.',
    model: OPUS,
    fixture: 'payouts',
    hidden: 'bigint',
    steps: ['Change every amount in the codebase from a number to a bigint without changing any output, so we can hold amounts above 2^53.'],
    arms: [off('medium'), on('medium'), off('high'), { ...on('medium'), name: 'router-from-medium-lean-rule', overlay: 'rules-lean' }],
  },
  {
    name: 'inherit-check',
    claim: 'Without the router, a subagent runs at the session\'s effort whatever its model, unless its definition sets one.',
    model: OPUS,
    fixture: 'payouts',
    overlay: 'agent-def',
    steps: [
      'This is a test of subagents. Launch these three in parallel, then tell me what each replied:\n' +
        '1. A general-purpose subagent on Sonnet: reply with the word "one".\n' +
        '2. A general-purpose subagent on Opus: reply with the word "two".\n' +
        '3. The quick-check agent: reply with the word "three".',
    ],
    arms: [off('low'), off('medium'), off('high'), off('xhigh')],
  },
  {
    name: 'haiku-check',
    claim: 'A Haiku subagent gets no effort, whatever the session\'s: does it think more on an xhigh session than on a low one?',
    model: OPUS,
    fixture: 'payouts',
    steps: [
      'This is a test of subagents. Launch one general-purpose subagent on Haiku with this brief, then tell me what it replied: ' +
        '"How many months in 2027 and 2028 have a Friday the 13th? Work it out without running any code or tools, then reply with the number and the months."',
    ],
    arms: [off('low'), off('xhigh')],
  },
  {
    name: 'tokyo-complaint',
    claim: 'One customer\'s complaint about a module with five bugs steps up (probe: high at 72%): does the extra effort find the other four?',
    model: OPUS,
    fixture: 'payouts',
    overlay: ['fees', 'fees-buggy'],
    hidden: 'monthly-fees',
    steps: ['A customer in Tokyo says their September fee included a payout they made on 1 October. Can you fix it?'],
    arms: [off('medium'), on('medium'), off('high'), { ...on('medium'), name: 'router-from-medium-lean-rule', overlay: 'rules-lean' }],
  },
  {
    name: 'fee-complaints',
    claim: 'A vague complaint about a module with several unrelated bugs steps up: only a thorough audit against the spec finds them all.',
    model: OPUS,
    fixture: 'payouts',
    overlay: ['fees', 'fees-buggy'],
    hidden: 'monthly-fees',
    steps: ["Finance has had complaints from a few customers about September's monthly fees. Can you find what's wrong in src/fees.ts and fix it?"],
    arms: [off('medium'), on('medium'), off('xhigh'), { ...on('medium'), name: 'router-from-medium-with-rule', overlay: 'rules-payments' }],
  },
  {
    name: 'fees-from-xhigh',
    claim: 'Someone who keeps Opus on xhigh to be safe: the router brings a spec\'d feature down to the level it needs.',
    model: OPUS,
    fixture: 'payouts',
    overlay: 'fees',
    hidden: 'monthly-fees',
    steps: ['Implement the monthly fees in docs/monthly-fees.md.'],
    arms: [off('xhigh'), on('xhigh'), off('high'), on('high')],
  },
  {
    name: 'provider-research',
    claim: 'A Fable session (high) fans research out to 12 Sonnet subagents: without the router each inherits high; with it they run at the level a web lookup needs.',
    model: 'claude-fable-5-1',
    fixture: 'payouts',
    overlay: 'team',
    hidden: 'provider-research',
    steps: [
      'We need a payout provider that can pay suppliers in JPY and BHD as well as GBP and EUR. Research these 12 from ' +
        'their own public websites: Wise, Airwallex, Stripe Connect, Adyen, Currencycloud, Modulr, Banking Circle, ' +
        'Thunes, Nium, Rapyd, dLocal and Payoneer. For each: whether it supports payouts in JPY and in BHD, whether it ' +
        'sends webhooks for payout status, and a link to its API docs. Use one subagent per provider, in parallel, and ' +
        'feel free to use appropriately powered subagents. Write the comparison to docs/providers.md with a link for ' +
        'every finding, and recommend three.',
    ],
    arms: [off('high'), on('high')],
  },
  {
    name: 'subagents-after-hard-work',
    claim: 'Subagents launched from a hard task still get their own level: simple briefs low, a hard review high.',
    model: OPUS,
    fixture: 'payouts',
    overlay: 'fees',
    hidden: 'monthly-fees',
    steps: [anchoring],
    arms: [on('high')],
  },
  {
    name: 'subagents-after-hard-work-fable',
    claim: 'The same, from a Fable parent.',
    model: 'claude-fable-5-1',
    fixture: 'payouts',
    overlay: 'fees',
    hidden: 'monthly-fees',
    steps: [anchoring],
    arms: [on('high')],
  },
  {
    name: 'monthly-fees',
    claim: 'A feature built from a spec with many interacting rules steps up: rounding, limits, local months, re-runs.',
    model: OPUS,
    fixture: 'payouts',
    overlay: 'fees',
    hidden: 'monthly-fees',
    steps: ['Implement the monthly fees in docs/monthly-fees.md.'],
    arms: stepUp,
  },
  {
    name: 'fable-delegates',
    claim: 'A Fable session (its default, high) takes a tricky feature and uses subagents where it sees fit: the router keeps the main thread on the hard work and lowers the helpers, which otherwise inherit high.',
    model: 'claude-fable-5-1',
    fixture: 'payouts',
    overlay: ['fees', 'team'],
    hidden: ['monthly-fees', 'fees-cli'],
    steps: [
      'Implement the monthly fees in docs/monthly-fees.md, add a `fees <month>` command to the CLI that runs them, and document the command in the README. Feel free to use appropriately powered subagents.',
    ],
    arms: [off('high'), on('high')],
  },
  {
    name: 'fable-chores',
    claim: 'A Fable session on xhigh given a fixed list of chores to delegate: the same plan in both arms, so the difference is the router (main thread and helpers both come down).',
    model: 'claude-fable-5-1',
    fixture: 'payouts',
    hidden: ['pretty-flag', 'balance-command', 'rename'],
    steps: [
      'Three small jobs, all independent. Give each one to its own Opus subagent and run them in parallel:\n' +
        '1. Add a --pretty flag to the export command that indents the JSON.\n' +
        "2. Add a balance command to the CLI that prints an account's closing balance.\n" +
        '3. Rename getTxns to listTransactions everywhere.\n' +
        "Check their work when they're done.",
    ],
    arms: [off('xhigh'), on('xhigh'), off('high'), on('high')],
  },
  {
    name: 'pretty-flag',
    claim: 'An easy task steps down: a small flag on a CLI.',
    model: OPUS,
    fixture: 'payouts',
    hidden: 'pretty-flag',
    steps: ['Add a --pretty flag to the export command that indents the JSON.'],
    arms: stepDown,
  },
  {
    name: 'balance-command',
    claim: 'An easy task steps down: a new CLI command built from code that exists.',
    model: OPUS,
    fixture: 'payouts',
    hidden: 'balance-command',
    steps: ['Add a balance command to the CLI that prints an account\'s closing balance.'],
    arms: stepDown,
  },
  {
    name: 'rename',
    claim: 'An easy task steps down: a rename. (Weak: high barely thinks on a rename either.)',
    model: OPUS,
    fixture: 'payouts',
    hidden: 'rename',
    steps: ['Rename getTxns to listTransactions everywhere.'],
    arms: stepDown,
  },
  {
    name: 'local-days',
    claim: 'A one-customer report steps up: the fix has to work in every time zone, summer time included.',
    model: OPUS,
    fixture: 'payouts',
    hidden: 'local-days',
    steps: ['Statements should use the customer\'s own calendar days, not UTC. Kaito Trading in Tokyo say a payment from the morning of 1 October showed on their September statement. Can you fix it?'],
    arms: stepUp,
  },
  {
    name: 'currency-bug',
    claim: 'A task that sounds small steps up. (Pilot: Opus at medium already fixes it.)',
    model: OPUS,
    fixture: 'payouts',
    hidden: 'currency-bug',
    steps: ['Support says the statement total for one of our Japanese customers (acc_jp) is way off. Can you fix it?'],
    arms: stepUp,
  },
  {
    name: 'double-debit',
    claim: 'A bug that sounds like a one-line fix steps up: the fix has to hold when the bank\'s duplicates arrive together. (Pilot on Sonnet: medium already fixes it.)',
    model: OPUS,
    fixture: 'payouts',
    hidden: 'double-debit',
    steps: ['The bank sometimes sends us the settled webhook twice for the same payout, and a customer got debited twice last week. Can you fix it?'],
    arms: stepUp,
  },
]

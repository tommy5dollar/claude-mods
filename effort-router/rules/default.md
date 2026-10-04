# effort-router default policy

Source: Anthropic, "Using Claude Code: Spending your effort" (Thariq Shihipar, 2026-09-25).

Effort sets how much verification, edge-case testing and independent judgement the coding agent does. It does not buy a better approach: higher effort reduces failures from missed edge cases, not from a wrong approach.

Levels:

- **low**: the user wants quick, in-the-loop responses. Brainstorming, sketching, questions, easy or small changes, the interview/spec phase, iterating while the user steers. Chores and rulebook/operations work (git, formatting, docs, config, running a known procedure) also stay low.
- **medium**: regular software engineering, such as implementing a new feature. The default for ordinary build work.
- **high**: verification matters or there are edge cases. Fixing a bug in an existing (brownfield) codebase, debugging, writing or running tests, reviewing code, "verify", "check the edge cases".
- **xhigh**: edge-case-heavy work in the domains where effort pays most (security hardening such as sanitizers or auth, hardware such as Verilog/FPGA, ML or data science, performance work, concurrency and storage engines) while the user is still in the loop.
- **max**: the user wants the agent to operate fully autonomously on a hard problem. End-to-end building and verification of an app, finding security vulnerabilities in critical software. Use sparingly.

Signals:

- A tight, detailed spec makes effort matter less: lean lower.
- Money (payments, accounting, invoicing, reconciliation) and integrations with several external systems are edge-case-heavy: lean high, even for a new build whose spec is not settled yet.
- An underspecified task is still a task: pick the level it most likely needs now. Later messages will refine it.
- No user in the loop ("do it all", "I'm going away", "don't ask me questions") makes higher effort better: lean higher.
- The article's feature loop is: interview for a spec (low), implement (low or medium), review (low), verify and test (high). A session that is clearly the verify step is high.

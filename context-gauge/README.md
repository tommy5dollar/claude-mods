# context-gauge

A Claude Code mod that shows one thing: how full the context window is.

```
                                                 focus 34%
```

`34%` sits at the right of the prompt footer, beside Claude Code's own mode labels. It is coloured by how
close you are to compacting:

| Colour | When | Meaning |
| --- | --- | --- |
| green | below 30% | plenty of room |
| yellow | 30% to 40% | getting full |
| red | above 40% | compact soon (it suits an auto-compact set at 50%) |

<!-- screenshot: terminal footer showing a yellow "34%" -->

It does not show 5-hour or 7-day rate limits or cost. That is deliberate.

`/ctx` prints the breakdown by category, largest first:

```
Session context: 68k / 200k (34%)
  Messages       60k
  System prompt  3.1k
  ...
```

## Why

The Desktop app's usage ring mixes context with rate limits and is hard to read at a glance. Mods can't replace
native chrome, so this puts a small, honest number in a place a mod can draw, in the terminal and in Desktop,
without adding a separate usage panel.

## Install

```
claude plugin marketplace add tommy5dollar/claude-mods
claude plugin install context-gauge@tommy-mods
```

Needs Claude Code 2.1.286 or later (Claude Mods).

## Settings

Set these in `/config`, `/plugin configure context-gauge@tommy-mods`, or under `pluginConfigs` in settings.

| Option | Default | What it does |
| --- | --- | --- |
| `yellowAt` | `30` | Yellow from this percent |
| `redAbove` | `40` | Red above this percent |
| `site` | `footer` | Where to draw: `footer`, `hint`, `band` or `status` (see below) |

A threshold outside 0 to 100, or a `yellowAt` above `redAbove`, falls back to the defaults.

### Where it draws

| `site` | Render site | Notes |
| --- | --- | --- |
| `footer` (default) | `SessionMode`, the dim mode labels at the right of the prompt footer | Least intrusive. Takes no row of its own. |
| `hint` | `PromptHint`, the hint line under the prompt | Shares the line with `? for shortcuts` and the pills. |
| `band` | `AbovePrompt`, the band above the prompt | Takes a row, and the engine adds a `[-]` beside it. Yields to surveys. |
| `status` | `$.ui.status`, the plugin status line | Plain text, no colour. The fallback if the others don't show. |

The colours are Claude Code theme keys (`success`, `warning`, `error`), so they follow light and dark themes.

## How it works

- `session.measure` fires after each main-thread turn with the context figures. The gauge updates when the
  `context` unit moved.
- `classic.SessionStart` (startup, `/clear`, `/resume`, `/branch`, after compaction) re-reads
  `$.session.usage()`.
- It uses the engine's `percent`. If that is missing it works out tokens over window. If neither is known, as in a
  fresh or just-compacted session before the next response, it shows nothing rather than a wrong number.
- Every hook fails open. If anything throws, Claude Code draws what it would have drawn anyway.

The percentage is the status line's `used_percentage`: the last response's input tokens over the model's context
window. `/context` measures against the compaction window, so the two can differ by a few points.

## Known limits

- Desktop: issue [#99265](https://github.com/anthropics/claude-code/issues/99265), the band draws in only one
  active chat. That bug is reported against the band, and it may also affect the footer.
- Not tested in the Desktop app yet. The test kit checks the tree against Desktop's element table, but not how
  Desktop paints it.
- VS Code ([#99045](https://github.com/anthropics/claude-code/issues/99045)), Remote Control
  ([#99217](https://github.com/anthropics/claude-code/issues/99217)) and `-p` run hooks but draw no UI.
  `/ctx` still answers where commands run.
- Subagent context is not shown. `session.measure` follows the main thread.

## Development

```
bun test                                   # pure logic (spec/)
claude plugin test .                       # hooks and drawing on terminal and desktop (tests/)
claude plugin validate . --strict
claude --plugin-dir .                      # live, reloads on save; writes .claude-plugin/types/
```

`tsconfig.json` extends the types Claude Code writes to `.claude-plugin/types/` on load.

## Licence

MIT

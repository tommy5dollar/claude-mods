# Manual checks

Automated coverage: `bun test` (pure logic) and `claude plugin test .` (hooks, and the drawing validated
against the terminal and desktop element tables). A headless `claude -p` run with `--debug` shows the mod loading
and `session.measure` firing. What no automated check covers is the paint: whether the footer shows the text,
and whether the theme colours look right. Do these by eye.

## Terminal (Claude Code 2.1.287 or later)

1. `claude --plugin-dir D:\code\mods\context-gauge --model haiku`
2. Before the first reply, the footer shows no gauge (no reading yet).
3. Send `hi`. After the reply, `ctx N%` shows at the right of the prompt footer, green.
4. Toggle a mode that adds a footer label (for example focus). Both show: `focus ctx N%`.
5. Run `/ctx`. It prints the headline figure and the used categories, largest first.
6. Colour check without filling the window. Run `/config`, find context-gauge, set `yellowAt` to `1` and
   `redAbove` to `2`, then `/reload-plugins` and send another message. It should be red. Set `redAbove` to `50`
   to see yellow. Put both back to 30 and 40.
7. Check it in both a light and a dark theme (`/theme`).
8. `/compact`. The gauge disappears and comes back after the next reply.
9. `/clear`. The gauge disappears and comes back after the next reply.
10. If nothing shows in the footer, try `site` = `hint`, then `band`, then `status`. With `--plugin-dir`, a
    refused tree prints a transcript line such as `ui.render (SessionMode) refused: ...`. Note it.

## Desktop app (once its bundled Claude Code is 2.1.287 or later)

1. Install it: `claude plugin marketplace add tommy5dollar/claude-mods`, then
   `claude plugin install context-gauge@tommy-mods`, or set `CLAUDE_CODE_PLUGIN_DIRS=D:\code\mods\context-gauge`.
2. Open a Code tab chat, send a message, and look for `ctx N%` near the prompt footer.
3. Open a second chat. Issue #99265 says the band draws only in the active chat, so check whether the footer has
   the same problem.
4. If the footer doesn't render in Desktop, try `site` = `band`, then `status`. Note which one works.

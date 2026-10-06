// Prints each run's final reply per step, and the files its diff touched.
//   bun eval/scenarios/replies.ts .evals/<stamp>/<scenario>
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const root = process.argv[2]
for (const name of readdirSync(root).sort()) {
  const dir = join(root, name)
  if (!existsSync(join(dir, 'events.jsonl'))) continue
  console.log(`\n## ${name}`)
  for (const line of readFileSync(join(dir, 'events.jsonl'), 'utf8').split('\n').filter(Boolean)) {
    const e = JSON.parse(line)
    if (e.type === 'result') console.log(`[result] ${String(e.result ?? '').slice(0, 1500)}`)
  }
  const diff = readFileSync(join(dir, 'diff.patch'), 'utf8')
  console.log(`files: ${[...diff.matchAll(/^diff --git a\/(\S+)/gm)].map(m => m[1]).join(', ')}`)
}

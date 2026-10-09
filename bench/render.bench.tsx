import type { On, RenderElement } from 'claude-code'
import { expect, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

// Render time per row type and for a long mixed transcript, through the same `$.ui.mount`
// the tests use: the skin's hook, the engine's check of the tree it returns and the test
// host's drawing of it. Not the terminal's or the desktop's own paint. Run with
// scripts/bench.sh, which names this file as a test for one run; `claude plugin test .`
// alone skips it.

// A test file's environment has a console for its output; the hooks' types leave it out.
declare const console: { log: (...values: unknown[]) => void }

const SURFACES = ['terminal', 'desktop'] as const
type Surface = (typeof SURFACES)[number]

const SITE = { plugin: 'skins', viewport: { columns: 100, rows: 40 } } as const
const STOCK: RenderElement = { type: 'Text', props: {}, children: ['stock row'] }
const WARMUP = 10
const RUNS = 100
const SIZES = [1000, 5000] as const

const TEXT = [
  '## What changed',
  '',
  'The hub now limits each route per user. Requests over the limit get **429** with a `Retry-After` header.',
  '',
  '- `/chat` allows 60 a minute',
  '- `/upload` allows 10 a minute',
  '',
  '> [!NOTE]',
  '> Limits reset on deploy; see `apps/hub/src/limits.ts`.',
].join('\n')

const TABLE = [
  '| Route | Limit | Window | Burst |',
  '|---|---:|---|---:|',
  ...Array.from({ length: 6 }, (_, i) => `| /route-${i} | ${(i + 1) * 10} | 1 min | ${i + 2} |`),
].join('\n')

const CODE = ['```ts', ...Array.from({ length: 20 }, (_, i) => `export const limit${i} = (used: number) => used < ${i * 10} // route ${i}`), '```'].join('\n')

const MATH = 'The bound:\n\n$$\\sum_{i=1}^{n} \\frac{x_i^2}{\\sqrt{1 + y_i}} \\le \\int_0^1 f(t)\\,dt$$'

const MERMAID = ['```mermaid', 'flowchart LR', '  A[Client] --> B{Limit?}', '  B -->|under| C[Handler]', '  B -->|over| D[429]', '  C --> E[(Store)]', '  D --> F[Retry-After]', '```'].join('\n')

const DIFF = {
  filePath: '/work/apps/hub/src/server.ts',
  structuredPatch: [{ oldStart: 12, newStart: 12, lines: [' const app = fastify()', '-app.listen(7447)', '+app.register(rateLimit, { max: 60 })', '+app.listen(7447)', ' export default app'] }],
}

const SHELL = {
  stdout: Array.from({ length: 60 }, (_, i) => `✓ test ${i + 1} passed (${i}ms)`).join('\n'),
  stderr: 'warn: 2 tests were slow',
  interrupted: false,
}

type Row = { name: string; event: (id: string, surface: Surface) => Parameters<Engine['ui']['mount']>[0] }

const reply = (text: string) => (id: string, surface: Surface) =>
  ({ ...SITE, surface, component: 'AssistantMessage', requestId: id, props: { text, isFirstOfReply: true } }) as const

const ROWS: readonly Row[] = [
  {
    name: 'tool row (Bash)',
    event: (id, surface) =>
      ({
        ...SITE,
        surface,
        component: 'ToolUse',
        requestId: id,
        props: { tool_use_id: id, tool: 'Bash', input: { command: 'pnpm test --filter hub' }, isRunning: false, isErrored: false, isInterrupted: false },
      }) as const,
  },
  { name: 'text (markdown)', event: reply(TEXT) },
  { name: 'table (6 rows)', event: reply(TABLE) },
  { name: 'code (20 lines)', event: reply(CODE) },
  { name: 'math (display)', event: reply(MATH) },
  { name: 'mermaid (flowchart)', event: reply(MERMAID) },
  {
    name: 'diff (Edit result)',
    event: (id, surface) => ({ ...SITE, surface, component: 'ToolResult', requestId: id, props: { tool_use_id: id, tool: 'Edit', output: DIFF, isErrored: false } }) as const,
  },
  {
    name: 'shell (61 lines)',
    event: (id, surface) => ({ ...SITE, surface, component: 'ToolResult', requestId: id, props: { tool_use_id: id, tool: 'Bash', output: SHELL, isErrored: false } }) as const,
  },
]

function stubEngine(on: On) {
  on('session.cwd', () => ({ value: '/work' }))
  on('env.get', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('clock.now', () => ({ value: 10_000 }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [] } }))
  on('ui.render', () => STOCK)
}

let serial = 0

async function timeMount($: Engine, row: Row, surface: Surface): Promise<number> {
  const event = row.event(`b${(serial += 1)}`, surface)
  const started = performance.now()
  const ui = await $.ui.mount(event)
  const ms = performance.now() - started
  await ui.unmount()

  return ms
}

const at = (sorted: readonly number[], share: number): number => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0

const fixed = (ms: number): string => ms.toFixed(2)

async function perRow($: Engine): Promise<string[]> {
  const lines = ['| Row | Surface | Median ms | p95 ms | Mean ms |', '|---|---|---:|---:|---:|']

  for (const row of ROWS) {
    for (const surface of SURFACES) {
      for (let i = 0; i < WARMUP; i++) {
        await timeMount($, row, surface)
      }

      const times: number[] = []

      for (let i = 0; i < RUNS; i++) {
        times.push(await timeMount($, row, surface))
      }

      const sorted = [...times].sort((a, b) => a - b)
      const mean = times.reduce((sum, ms) => sum + ms, 0) / times.length
      lines.push(`| ${row.name} | ${surface} | ${fixed(at(sorted, 0.5))} | ${fixed(at(sorted, 0.95))} | ${fixed(mean)} |`)
    }
  }

  return lines
}

async function transcript($: Engine, size: number, surface: Surface): Promise<number> {
  const started = performance.now()

  for (let i = 0; i < size; i++) {
    const row = ROWS[i % ROWS.length]

    if (row !== undefined) {
      await timeMount($, row, surface)
    }
  }

  return performance.now() - started
}

async function transcripts($: Engine, label: string): Promise<string[]> {
  const lines: string[] = []

  for (const size of SIZES) {
    for (const surface of SURFACES) {
      const ms = await transcript($, size, surface)
      lines.push(`| ${size.toLocaleString('en')} mixed rows | ${surface} | ${label} | ${(ms / 1000).toFixed(2)} | ${fixed(ms / size)} |`)
    }
  }

  return lines
}

const runSkin = ($: Engine, args: string) =>
  $.command.run({ command: 'skin', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

test('render time per row type and for 1,000 and 5,000 mixed rows', { timeoutMs: 600_000 }, async ($, on) => {
  stubEngine(on)

  const rows = await perRow($)
  const header = ['| Transcript | Surface | Skin | Total s | ms per row |', '|---|---|---|---:|---:|']
  const skinned = await transcripts($, 'noir')

  // The same rows with the skin off: what the harness and Claude Code's stand-in cost alone.
  await runSkin($, 'off')
  const stock = await transcripts($, 'off')

  console.log(['BENCH-START', ...rows, '', ...header, ...skinned, ...stock, 'BENCH-END'].join('\n'))
  expect(rows.length).toBe(2 + ROWS.length * SURFACES.length)
})

import type { RenderElement } from 'claude-code'

import type { Table } from './markdown'
import {
  askBand,
  codeCard,
  desktopSpinnerRow,
  diffCard,
  footerRow,
  groupRow,
  promptRow,
  replyRows,
  spinnerRow,
  terminalCard,
  toolRow,
  usageBand,
} from './rows'
import type { Look } from './rows'

// Every element the skin draws, numbered, from the same builders the transcript uses, so
// a note on #4 is a note on the real thing.

const done = { isRunning: false, isErrored: false, isInterrupted: false }

const TABLE: Table = {
  kind: 'table',
  header: ['Skin', 'Accent', 'Time'],
  align: ['left', 'left', 'right'],
  rows: [
    ['noir', '#f5f5f5', '41s'],
    ['tokyo-night', '#7aa2f7', '2.1s'],
    ['dracula', '#bd93f9', '340ms'],
  ],
}

const CODE = ['// Rate limit per route, keyed by user', 'export function limit(route: string, perMinute = 60) {', '  return (used: number) => used < perMinute', '}'].join('\n')

const DIFF = {
  path: '/work/apps/hub/src/server.ts',
  isNewFile: false,
  hunks: [{ oldStart: 12, newStart: 12, lines: [' const app = fastify()', '-app.listen(7447)', '+app.register(rateLimit, { max: 60 })', '+app.listen(7447)'] }],
}

export function galleryPane(look: Look, columns: number) {
  const { Box, Text } = look.ui
  const { palette } = look.skin
  const svg = look.svg
  let number = 0
  const section = (title: string, ...items: RenderElement[]) => {
    number += 1

    return (
      <Box flexDirection="column" marginBottom={1}>
        <Text color={palette.muted} bold>{`${number}  ${title}`}</Text>
        {items}
      </Box>
    )
  }
  const width = Math.max(40, columns - 4)

  return (
    <Box flexDirection="column">
      {section('Your prompt', promptRow(look, 'add rate limiting to the hub api'))}
      {section(
        'Tool rows: finished, running, failed',
        toolRow(look, { tool: 'Bash', input: {}, ...done }, 'run', 'pnpm test --filter hub', { ms: 2140 }),
        toolRow(look, { tool: 'Read', input: {}, ...done, isRunning: true }, 'read', 'docs/protocols.md', {}),
        toolRow(look, { tool: 'Edit', input: {}, ...done, isErrored: true }, 'write', 'apps/hub/src/server.ts', {}),
      )}
      {section('Folded group of reads and searches', groupRow(look, [{ tool: 'Read', input: {}, ...done }, { tool: 'Read', input: {}, ...done }, { tool: 'Grep', input: {}, ...done }]))}
      {svg === undefined
        ? section('Edit diff card', <Text color={palette.muted}>Desktop only; the terminal keeps Claude Code's diff.</Text>)
        : section('Edit diff card', diffCard(look, svg, DIFF, 'apps/hub/src/server.ts', width))}
      {svg === undefined
        ? section('Shell output card', <Text color={palette.muted}>Desktop only.</Text>)
        : section(
            'Shell output card: ok, failed',
            terminalCard(look, svg, { stdout: 'Test Files  12 passed (12)\n     Tests  148 passed (148)', stderr: '', interrupted: false }, false, width),
            terminalCard(look, svg, { stdout: '', stderr: 'error TS2322: Type string is not assignable to number', interrupted: false }, true, width, 'copy-output-failed'),
          )}
      {svg === undefined
        ? section('Code block card', <Text color={palette.muted}>Desktop only; the terminal keeps Claude Code's markdown.</Text>)
        : section('Code block card', codeCard(look, 'ts', CODE, svg, width))}
      {section('Table', replyRows(look, [TABLE], width, svg))}
      {svg === undefined
        ? section('Spinner', spinnerRow(look, look.skin.spinner[0] ?? 'Working', 3, 12_000))
        : section(
            'Spinner: thinking, tool running, writing, waiting',
            desktopSpinnerRow(look, svg, 'thinking', 'Thinking'),
            desktopSpinnerRow(look, svg, 'tool-use', 'Running pnpm test'),
            desktopSpinnerRow(look, svg, 'responding', 'Writing the reply'),
            desktopSpinnerRow(look, svg, 'requesting', 'Waiting for the model'),
          )}
      {section(
        'Band above the prompt: normal, then nudging to compact',
        usageBand(look, [{ label: 'context', percent: 42 }, { label: '5h', percent: 18 }], true, () => undefined),
        usageBand(look, [{ label: 'context', percent: 85 }, { label: '5h', percent: 61 }], true, () => undefined),
      )}
      {section('Band above a question', askBand(look, ['Approach', 'Store']))}
      {section('Turn footer (terminal)', footerRow(look, look.skin.done[0] ?? 'Done', 41_000, { tools: 6, added: 18, removed: 3 }))}
    </Box>
  )
}

import { FOLD_CODE, foldButton, shownCount } from './fold'
import type { Look, Ui } from './rows'
import { diffLines } from './svg-diff'
import type { DiffInput, Hunk } from './svg-diff'

// A ```diff fence drawn as a diff: old and new line numbers, added and removed lines in the
// skin's colours, and the code as it stands after the change for `copy new only`.

const HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/
const FILE_LINE = /^(?:diff |index |--- |\+\+\+ |similarity |rename |new file|deleted file)/

// The fence's hunks, or null when it holds no added or removed line. A fence without
// `@@` headers is one hunk numbered from 1.
export function fenceDiff(code: string): DiffInput | null {
  const lines = code.replace(/\n$/, '').split('\n')
  const path = /^\+\+\+ (?:b\/)?(.+)$/m.exec(code)?.[1]?.trim() ?? ''
  const hunks: Hunk[] = []
  let current: { oldStart: number; newStart: number; lines: string[] } | null = null

  for (const line of lines) {
    const header = HEADER.exec(line)

    if (header !== null) {
      current = { oldStart: Number(header[1]), newStart: Number(header[2]), lines: [] }
      hunks.push(current)
      continue
    }

    if (FILE_LINE.test(line) && (current === null || line.startsWith('diff '))) {
      continue
    }

    if (current === null) {
      current = { oldStart: 1, newStart: 1, lines: [] }
      hunks.push(current)
    }

    current.lines.push(/^[+\- \\]/.test(line) ? line : ` ${line}`)
  }

  const changes = hunks.some(hunk => hunk.lines.some(line => line.startsWith('+') || line.startsWith('-')))

  return changes ? { path: path === '/dev/null' ? '' : path, hunks, isNewFile: false } : null
}

// The code after the change: context and added lines, markers off.
export const newOnly = (diff: DiffInput): string =>
  diff.hunks
    .flatMap(hunk => hunk.lines.filter(line => !line.startsWith('-') && !line.startsWith('\\')).map(line => line.slice(1)))
    .join('\n')

// The terminal's drawing: a frame like a code block's, the numbers in a gutter.
export function diffRows(look: Look, diff: DiffInput, control: ReturnType<Ui['Button']> | ReturnType<Ui['Box']> | undefined, foldKey: string) {
  const { Box, Text } = look.ui
  const { palette } = look.skin
  const lines = diffLines(diff.hunks)
  const shown = lines.slice(0, shownCount(look, foldKey, lines.length, FOLD_CODE))
  const digits = String(Math.max(1, ...lines.map(line => ('kind' in line && line.kind !== 'gap' ? Math.max(line.old ?? 0, line.new ?? 0) : 0)))).length
  const number = (value: number | undefined) => (value === undefined ? ' '.repeat(digits) : String(value).padStart(digits))
  const added = lines.filter(line => line.kind === 'add').length
  const removed = lines.filter(line => line.kind === 'del').length

  return (
    <Box flexDirection="column" marginY={1}>
      <Box flexDirection="column" borderStyle="round" borderColor={palette.muted} paddingX={1}>
        {shown.map(line =>
          line.kind === 'gap' ? (
            <Text color={palette.muted}>{`${' '.repeat(digits * 2 + 2)}⋯ line ${line.at}`}</Text>
          ) : (
            <Text wrap="truncate-end">
              <Text color={palette.muted}>{`${number(line.old)} ${number(line.new)} `}</Text>
              <Text color={line.kind === 'add' ? palette.ok : line.kind === 'del' ? palette.err : palette.muted}>
                {`${line.kind === 'add' ? '+' : line.kind === 'del' ? '-' : ' '} ${line.text === '' ? ' ' : line.text}`}
              </Text>
            </Text>
          ),
        )}
        <Box position="absolute" top={-1} left={1}>
          <Text color={palette.muted}>
            {` ${diff.path === '' ? 'diff' : diff.path} `}
            <Text color={palette.ok}>{`+${added}`}</Text>
            <Text color={palette.err}>{` −${removed} `}</Text>
          </Text>
        </Box>
        {control === undefined ? (
          ''
        ) : (
          <Box position="absolute" top={-1} right={1}>
            {control}
          </Box>
        )}
      </Box>
      {foldButton(look, foldKey, lines.length, FOLD_CODE)}
    </Box>
  )
}

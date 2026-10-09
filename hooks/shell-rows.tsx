import { outputLine } from './code-rows'
import { copyButton } from './rows'
import type { Look } from './rows'
import { foldLines, linesOf, shellStatus } from './shell'
import type { Folded, ShellLine, ShellResult } from './shell'

// The terminal's shell card, the text counterpart of the desktop's terminal card: a
// header with the command and how it ended, stdout, then stderr in the error colour under
// a label of its own, each stream folded to its head and tail.

// How many lines of each stream stay above and below the fold; null keeps every line.
export type Fold = { head: number; tail: number } | null

export function shellRows(look: Look, command: string, result: ShellResult, isErrored: boolean, folds: { stdout: Fold; stderr: Fold }) {
  const { Box, Text } = look.ui
  const { palette } = look.skin
  const lines = linesOf(result)
  const status = shellStatus(result, isErrored, look.prefs.icons === 'ascii')
  const fold = (stream: ShellLine[], at: Fold): Folded<ShellLine>[] => (at === null ? stream : foldLines(stream, at.head, at.tail))
  const row = (line: Folded<ShellLine>) =>
    'fold' in line ? (
      <Text color={palette.muted}>{`… ${line.fold} lines hidden`}</Text>
    ) : look.prefs.highlight && !line.isErr && line.text !== '' ? (
      outputLine(look, line.text)
    ) : (
      <Text color={line.isErr ? palette.err : palette.fg}>{line.text === '' ? ' ' : line.text}</Text>
    )
  const text = [result.stdout, result.stderr].filter(part => part.trim() !== '').join('\n')
  const control = text === '' ? undefined : copyButton(look, 'copy-output', text)
  const isEmpty = lines.stdout.length === 0 && lines.stderr.length === 0

  return (
    <Box flexDirection="column" borderStyle="round" borderColor={palette.muted} paddingX={1}>
      <Box flexDirection="row">
        <Box flexGrow={1} flexShrink={1}>
          <Text wrap="truncate-end">
            <Text color={palette.run}>$ </Text>
            <Text color={palette.fg} bold>
              {command === '' ? 'Output' : command}
            </Text>
          </Text>
        </Box>
        <Box flexShrink={0} paddingLeft={2}>
          <Text color={palette[status.tone]}>{status.text}</Text>
        </Box>
      </Box>
      {isEmpty ? <Text color={palette.muted}>no output</Text> : ''}
      {fold(lines.stdout, folds.stdout).map(row)}
      {lines.stderr.length > 0 && lines.stdout.length > 0 ? <Text color={palette.muted}>stderr</Text> : ''}
      {fold(lines.stderr, folds.stderr).map(row)}
      {control === undefined ? (
        ''
      ) : (
        <Box position="absolute" top={-1} right={1}>
          {control}
        </Box>
      )}
    </Box>
  )
}

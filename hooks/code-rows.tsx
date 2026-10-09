import { highlight, outputTokens, roleColors } from './highlight'
import type { Role, Token } from './highlight'
import type { Look, Ui } from './rows'

// Code on the terminal in the skin's colours: a fenced block as a framed run of lines with
// its language on the top border, and shell output with its paths, numbers and verdicts
// picked out. The roles come from highlight.ts.

export function tokenSpans(look: Look, tokens: readonly Token[]) {
  const { Text } = look.ui
  const colors = roleColors(look.skin.palette)

  return tokens.map(token => (
    <Text color={colors[token.role]} bold={token.role === 'keyword' || token.role === 'heading'} italic={token.role === 'comment'}>
      {token.text}
    </Text>
  ))
}

// A shell output line in colour; stderr stays the error colour whole.
export function outputLine(look: Look, text: string) {
  const { Text } = look.ui

  return <Text wrap="truncate-end">{tokenSpans(look, outputTokens(text))}</Text>
}

// A fenced block: the language and a control (Copy) on the frame, then each line highlighted.
export function codeRows(look: Look, lang: string, code: string, control?: ReturnType<Ui['Button']>) {
  const { Box, Text } = look.ui
  const { palette } = look.skin
  const lines = highlight(code.replace(/\t/g, '  ').replace(/\n$/, ''), lang)

  return (
    <Box flexDirection="column" marginY={1} borderStyle="round" borderColor={palette.muted} paddingX={1}>
      {lines.map(tokens => (
        <Text>{tokens.length === 0 || tokens.every(token => token.text === '') ? ' ' : tokenSpans(look, tokens)}</Text>
      ))}
      <Box position="absolute" top={-1} left={1}>
        <Text color={palette.muted}>{` ${lang} `}</Text>
      </Box>
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

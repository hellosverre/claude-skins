import type { ElementTable, RenderSurface } from 'claude-code'

import type { Prefs, TurnStats } from '../types'
import { formatDuration, formatMs } from './format'
import { columnWidths, cutCell, isShell } from './markdown'
import type { Segment, Table } from './markdown'
import { splitBlocks } from './blocks'
import { artRows, chartRows } from './chart-rows'
import { chartArt } from './chart-art'
import { chartHeading, parseMermaid } from './mermaid'
import { mermaidArt } from './mermaid-art'
import type { Chart } from './mermaid'
import { blockRows } from './prose'
import type { Icons, Kind, Skin } from './skin'
import { spinnerIcon, toolIcon } from './icons'
import type { SpinnerMode } from './icons'
import { chartSvg } from './svg-chart'
import { codeSvg } from './svg-code'
import { diffSvg } from './svg-diff'
import type { DiffInput } from './svg-diff'
import { cardWidth, settled } from './svg-kit'
import { tableSvg } from './svg-table'
import { terminalSvg } from './svg-terminal'
import type { ShellOutput } from './svg-terminal'
import { usageLine, usageSvg } from './svg-usage'
import type { Meter } from './svg-usage'
import { kindOf, toolLabel } from './tools'
import { inlineMath, mathArt, parseTex } from './math'
import { mathSvg } from './svg-math'

export type Ui = Pick<ElementTable, 'Box' | 'Text' | 'Markdown' | 'Button' | 'Code'>

// The vector element, on the surfaces that have one (the desktop app).
export type SvgElement = ElementTable<'desktop'>['Svg']

export type Look = {
  ui: Ui
  skin: Skin
  icons: Icons
  prefs: Prefs
  surface: RenderSurface
  // The vector element where the surface draws one: icons replace glyphs there.
  svg?: SvgElement
  // Puts text on the clipboard of the surface drawing; absent where nothing can copy.
  copy?: (text: string) => void
  // True the first time this drawing shows the card by that key; a card drawn again is
  // drawn settled. Absent, every card animates.
  isFirstDraw?: (key: string) => boolean
}

export type Call = {
  tool: string
  input: unknown
  isRunning: boolean
  isErrored: boolean
  isInterrupted: boolean
}

// What a tool row shows at its right edge.
export type Meta = { ms?: number; added?: number; removed?: number }

const KIND_LABEL: Readonly<Record<Kind, string>> = {
  read: 'Read',
  write: 'Edit',
  run: 'Run',
  search: 'Search',
  web: 'Web',
  mcp: 'MCP',
  other: 'Other',
}

const CELL_PAD = 1

// The worst thing that happened to any of the calls, else how far along they are.
function status({ skin, icons }: Look, calls: readonly Call[]) {
  if (calls.some(call => call.isInterrupted)) {
    return { glyph: icons.interrupted, color: skin.palette.warn }
  }

  if (calls.some(call => call.isErrored)) {
    return { glyph: icons.err, color: skin.palette.err }
  }

  if (calls.some(call => call.isRunning)) {
    return { glyph: icons.running, color: skin.palette.muted }
  }

  return { glyph: icons.ok, color: skin.palette.ok }
}

// The connector above a node, which ties a turn's calls into one line down the left.
function railLine(look: Look) {
  const { Text } = look.ui

  return <Text color={look.skin.palette.user}>{look.icons.rail}</Text>
}

function node(look: Look, calls: readonly Call[]) {
  const { Text } = look.ui
  const { glyph, color } = status(look, calls)
  const branch = look.prefs.rail && look.surface === 'terminal' ? look.icons.branch : ''

  return (
    <Text color={color}>
      {`${glyph}`}
      <Text color={look.skin.palette.muted}>{`${branch} `}</Text>
    </Text>
  )
}

function metaSpans(look: Look, meta: Meta) {
  const { Text } = look.ui
  const { palette } = look.skin
  const spans = []

  if (meta.added !== undefined && meta.removed !== undefined && meta.added + meta.removed > 0) {
    spans.push(<Text color={palette.ok}>{`+${meta.added}`}</Text>)
    spans.push(<Text color={palette.err}>{` −${meta.removed}`}</Text>)
  }

  if (meta.ms !== undefined) {
    spans.push(<Text color={palette.muted}>{`${spans.length > 0 ? '  ' : ''}${formatMs(meta.ms)}`}</Text>)
  }

  return spans
}

// A line with its facts flush right on the terminal and trailing it on the desktop,
// which lays a row out its own way.
function withMeta(look: Look, main: ReturnType<Ui['Text']>, meta: Meta) {
  const { Box, Text } = look.ui
  const spans = metaSpans(look, meta)

  if (spans.length === 0) {
    return main
  }

  if (look.surface !== 'terminal') {
    return (
      <Text wrap="truncate-end">
        {main}
        {'   '}
        {spans}
      </Text>
    )
  }

  return (
    <Box flexDirection="row">
      <Box flexGrow={1} flexShrink={1}>
        {main}
      </Box>
      <Box flexShrink={0} paddingLeft={2}>
        <Text>{spans}</Text>
      </Box>
    </Box>
  )
}

function stack(look: Look, line: ReturnType<Ui['Text']>) {
  const { Box } = look.ui

  // Box-drawing rails need a monospace font, which only the terminal draws mod text in.
  return look.prefs.rail && look.surface === 'terminal' ? (
    <Box flexDirection="column">
      {railLine(look)}
      {line}
    </Box>
  ) : (
    line
  )
}

// On a surface with vector icons, the icon leads the row in place of the status glyph.
function iconRow(look: Look, Svg: SvgElement, kind: Kind, calls: readonly Call[], line: ReturnType<Ui['Text']>) {
  const { Box } = look.ui
  const { color } = status(look, calls)
  // Calm keeps a running icon still.
  const source = toolIcon(kind, color, look.prefs.calm === null && calls.some(call => call.isRunning))

  return (
    <Box flexDirection="row" columnGap={1} alignItems="center">
      <Svg source={source} alt={kind} width={16} height={16} />
      {line}
    </Box>
  )
}

export function toolRow(look: Look, call: Call, kind: Kind, target: string, meta: Meta, label = toolLabel(call.tool)) {
  const { Text } = look.ui
  const { palette } = look.skin

  if (look.svg !== undefined) {
    const line = (
      <Text wrap="truncate-end">
        <Text color={palette[kind]} bold>
          {label}
        </Text>
        <Text color={call.isErrored ? palette.err : palette.muted}>{`  ${target}`}</Text>
      </Text>
    )

    return iconRow(look, look.svg, kind, [call], withMeta(look, line, meta))
  }

  const main = (
    <Text wrap="truncate-end">
      {node(look, [call])}
      <Text color={palette[kind]}>{label}</Text>
      <Text color={call.isErrored ? palette.err : palette.muted}>{`  ${target}`}</Text>
    </Text>
  )

  return stack(look, withMeta(look, main, meta))
}

// A quiet call's result: nothing when it worked, the one line that says why when it failed.
export function quietResult(look: Look, failure: string | null) {
  const { Box, Text } = look.ui

  return failure === null ? (
    <Box />
  ) : (
    <Text color={look.skin.palette.err} wrap="truncate-end">{`${look.prefs.icons === 'ascii' ? 'x' : '✖'} ${failure}`}</Text>
  )
}

// A run of reads and searches on one node: `●─ Read 3 · Search 2`.
export function groupRow(look: Look, calls: readonly Call[]) {
  const { Text } = look.ui
  const { palette } = look.skin
  const counts = new Map<Kind, number>()

  for (const call of calls) {
    const kind = kindOf(call.tool) ?? 'other'
    counts.set(kind, (counts.get(kind) ?? 0) + 1)
  }

  const parts = [...counts].flatMap(([kind, count], i) => [
    ...(i === 0 ? [] : [<Text color={palette.muted}>{' · '}</Text>]),
    <Text color={palette[kind]}>{KIND_LABEL[kind]}</Text>,
    <Text color={palette.muted}>{` ${count}`}</Text>,
  ])

  if (look.svg !== undefined) {
    const lead = [...counts].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'other'

    return iconRow(look, look.svg, lead, calls, <Text wrap="truncate-end">{parts}</Text>)
  }

  return stack(
    look,
    <Text wrap="truncate-end">
      {node(look, calls)}
      {parts}
    </Text>,
  )
}

// The desktop's spinner row: an animated icon for what the turn is doing, beside the
// step the desktop names (`Creating notes.md`).
export function desktopSpinnerRow(look: Look, Svg: SvgElement, mode: SpinnerMode, text: string) {
  const { Box, Text } = look.ui

  return (
    <Box flexDirection="row" columnGap={1} alignItems="center">
      <Svg source={spinnerIcon(mode, look.skin.palette.user)} alt={mode} width={20} height={20} />
      <Text color={look.skin.palette.muted}>{text}</Text>
    </Box>
  )
}

// Your message in a rounded outline sized to what you typed, so it stands apart from
// replies without taking the full width. Images it carried follow below it, drawn by
// Claude Code.
export function promptRow(look: Look, text: string, images?: ReturnType<Ui['Text']>) {
  const { Box, Text } = look.ui

  return (
    <Box flexDirection="column" alignItems="flex-start" marginY={1}>
      <Box borderStyle="round" borderColor={look.skin.palette.muted} paddingX={1} flexShrink={1}>
        <Text color={look.skin.palette.fg}>{text}</Text>
      </Box>
      {images ?? ''}
    </Box>
  )
}

const JUSTIFY = { left: 'flex-start', right: 'flex-end', center: 'center' } as const

// The share of the reported width a table may take at its natural size. Past it, the
// table spans its container and splits it between columns in proportion: the desktop
// app reports the window's width, wider than the transcript column a reply sits in.
const NATURAL_SHARE = 0.55

// A grid of cells, so columns line up in the terminal's monospace and in the desktop
// app's proportional font alike. `control`, such as a Copy button, sits on the frame's
// top border at the right, as ╭──── Copy ─╮.
export function tableRows(look: Look, table: Table, maxWidth: number, control?: ReturnType<Ui['Button']>) {
  const { Box, Text } = look.ui
  const { palette } = look.skin
  const widths = columnWidths(table, maxWidth - 4, CELL_PAD * 2)
  const natural = widths.reduce((sum, width) => sum + width + CELL_PAD * 2, 2)
  const isFluid = natural > maxWidth * NATURAL_SHARE
  const size = (i: number) =>
    isFluid
      ? { width: 0, flexGrow: Math.max(1, widths[i] ?? 1), flexShrink: 1 }
      : { width: (widths[i] ?? 0) + CELL_PAD * 2, flexShrink: 0 }
  const row = (cells: readonly string[], isHeader: boolean, band: string | undefined) => (
    <Box flexDirection="row" {...(band === undefined ? {} : { backgroundColor: band })}>
      {cells.map((cell, i) => (
        <Box {...size(i)} paddingX={CELL_PAD} justifyContent={JUSTIFY[table.align[i] ?? 'left']}>
          <Text color={palette.fg} bold={isHeader} wrap="truncate-end">
            {cutCell(cell, widths[i] ?? 0)}
          </Text>
        </Box>
      ))}
    </Box>
  )

  return (
    <Box
      flexDirection="column"
      marginY={1}
      borderStyle="round"
      borderColor={palette.muted}
      {...(isFluid ? { width: '100%' } : { alignSelf: 'flex-start' as const })}
    >
      {row(table.header, true, palette.surface)}
      {table.rows.map((cells, i) => row(cells, false, i % 2 === 1 ? palette.zebra : undefined))}
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

// A card's source: animated on its first draw, settled on every draw after it.
const sourceOf = (look: Look, key: string, source: string): string =>
  look.isFirstDraw === undefined || look.isFirstDraw(key) ? source : settled(source)

// A card drawn as an image, with its Copy button laid over the top-right corner the card
// left free. The image cannot be pressed, so the button is a real one on top of it; the
// box hugs the image so the corner is the card's, not the column's.
function cardWithCopy(look: Look, Svg: SvgElement, built: { source: string; alt: string; width: number; height: number }, key: string, text: string) {
  const { Box, Button } = look.ui
  const copy = look.copy

  return (
    <Box marginY={1} alignSelf="flex-start">
      <Svg source={sourceOf(look, key, built.source)} alt={built.alt} width={built.width} height={built.height} />
      {copy === undefined ? (
        ''
      ) : (
        <Box position="absolute" top={1} right={3}>
          <Button key={key} label="Copy" plain dimColor onPress={() => copy(text)} />
        </Box>
      )}
    </Box>
  )
}

function tableCard(look: Look, table: Table, Svg: SvgElement, columns: number, key: string) {
  const card = tableSvg(table, look.skin.palette, cardWidth(columns), look.copy !== undefined)

  return cardWithCopy(look, Svg, card, key, tableMarkdown(table))
}

function mathCard(look: Look, tex: string, Svg: SvgElement, columns: number, key: string) {
  const card = mathSvg(tex, look.skin.palette, cardWidth(columns), look.copy !== undefined)

  return cardWithCopy(look, Svg, card, key, tex.trim())
}

// A formula in cells: stacked fractions, radicals and tall brackets, one Text per row.
function mathRows(look: Look, tex: string, maxWidth: number, key: string) {
  const { Box, Text } = look.ui
  const { palette } = look.skin

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color={palette.muted} bold>
        MATH
      </Text>
      <Box flexDirection="column" marginTop={1} paddingLeft={2}>
        {mathArt(parseTex(tex), Math.max(10, maxWidth - 2)).map(row => (
          <Text color={palette.fg}>{row === '' ? ' ' : row}</Text>
        ))}
      </Box>
      {copyRow(look, key, tex.trim())}
    </Box>
  )
}

// A table as markdown again, for the clipboard.
const tableMarkdown = (table: Table): string =>
  [table.header, table.header.map(() => '---'), ...table.rows].map(cells => `| ${cells.join(' | ')} |`).join('\n')

// A Copy button padded to sit on a border line; nothing where nothing can copy.
export function copyButton(look: Look, key: string, text: string) {
  const { Button } = look.ui
  const copy = look.copy

  return copy === undefined ? undefined : <Button key={key} label=" Copy " plain dimColor onPress={() => copy(text)} />
}

// A small Copy button under a card or block, flush right; nothing where nothing can copy.
export function copyRow(look: Look, key: string, text: string) {
  const { Box, Button } = look.ui
  const copy = look.copy

  if (copy === undefined) {
    return ''
  }

  return (
    <Box flexDirection="row" justifyContent="flex-end">
      <Button key={key} label="Copy" plain dimColor onPress={() => copy(text)} />
    </Box>
  )
}

export function replyRows(look: Look, segments: readonly Segment[], maxWidth: number, Svg?: SvgElement) {
  const { Box, Markdown } = look.ui

  return (
    <Box flexDirection="column">
      {segments.map((segment, i) => {
        if (segment.kind === 'text') {
          const text = look.prefs.math ? inlineMath(segment.text) : segment.text

          return look.prefs.markdown ? (
            <Box flexDirection="column">{blockRows(look, splitBlocks(text, { prose: look.surface === 'terminal' }))}</Box>
          ) : (
            <Markdown text={text} />
          )
        }

        if (segment.kind === 'math') {
          return Svg === undefined ? mathRows(look, segment.tex, maxWidth, `copy-${i}`) : mathCard(look, segment.tex, Svg, maxWidth, `copy-${i}`)
        }

        // A shell fence on the desktop stays the app's own block, which has Run and Copy.
        if (segment.kind === 'code' && Svg !== undefined && isShell(segment)) {
          return <Markdown text={segment.raw} />
        }

        if (segment.kind === 'code') {
          const chart = segment.lang === 'mermaid' && look.prefs.charts ? parseMermaid(segment.code) : null
          const ascii = look.prefs.icons === 'ascii'
          // The terminal lays diagrams out in two dimensions: the kinds we parse in our own
          // drawings, flowcharts, xy charts and the kinds we do not parse in the vendored one.
          const ours = Svg === undefined && chart !== null ? chartArt(chart, maxWidth, ascii) : null
          const vendored = Svg === undefined && segment.lang === 'mermaid' && look.prefs.charts && (chart === null || chart.kind === 'flow' || chart.kind === 'xy')
          const art = ours ?? (vendored ? mermaidArt(segment.code, maxWidth, ascii) : null)

          if (art !== null) {
            return (
              <Box flexDirection="column">
                {artRows(look, art, chart === null ? '' : chartHeading(chart).count)}
                {copyRow(look, `copy-${i}`, segment.code)}
              </Box>
            )
          }

          if (chart !== null && Svg !== undefined) {
            return chartCard(look, chart, segment.code, Svg, maxWidth, `copy-${i}`)
          }

          // A terminal too narrow for a drawing falls back to rows, or to the code.
          if (chart !== null && (chart.kind === 'flow' || chart.kind === 'xy' || chart.kind === 'pie')) {
            return (
              <Box flexDirection="column">
                {chartRows(look, chart, maxWidth)}
                {copyRow(look, `copy-${i}`, segment.code)}
              </Box>
            )
          }

          return Svg === undefined ? (
            <Box flexDirection="column">
              <Markdown text={segment.raw} />
              {copyRow(look, `copy-${i}`, segment.code)}
            </Box>
          ) : (
            codeCard(look, segment.lang, segment.code, Svg, maxWidth, `copy-${i}`)
          )
        }

        return Svg === undefined ? (
          tableRows(look, segment, maxWidth, copyButton(look, `copy-${i}`, tableMarkdown(segment)))
        ) : (
          tableCard(look, segment, Svg, maxWidth, `copy-${i}`)
        )
      })}
    </Box>
  )
}

// The word with a band of light sweeping through it, one letter a frame.
export function spinnerRow(look: Look, word: string, frame: number, elapsedMs: number) {
  const { Text } = look.ui
  const { palette } = look.skin
  const letters = [...word]
  const head = (frame % (letters.length + 8)) - 4
  const shade = (i: number): string => {
    const distance = Math.abs(i - head)

    return distance === 0 ? palette.fg : distance === 1 ? palette.user : palette.muted
  }
  const runs: { color: string; text: string }[] = []

  for (const [i, letter] of letters.entries()) {
    const color = shade(i)
    const last = runs.at(-1)

    if (last?.color === color) {
      last.text += letter
    } else {
      runs.push({ color, text: letter })
    }
  }

  return (
    <Text>
      <Text color={palette.user}>{`${look.icons.frames[frame % look.icons.frames.length] ?? ''} `}</Text>
      {runs.map(run => (
        <Text color={run.color}>{run.text}</Text>
      ))}
      <Text color={palette.muted}>{`…  ${formatDuration(elapsedMs)}`}</Text>
    </Text>
  )
}

export function footerRow(look: Look, word: string, durationMs: number, stats: TurnStats | undefined) {
  const { Text } = look.ui
  const { palette } = look.skin
  const facts = [
    ...(stats === undefined || stats.tools === 0 ? [] : [`${stats.tools} tool${stats.tools === 1 ? '' : 's'}`]),
  ]
  const hasDiff = stats !== undefined && stats.added + stats.removed > 0

  return (
    <Text color={palette.muted}>
      <Text color={palette.user}>{`${look.icons.done} `}</Text>
      {`${word} in ${formatDuration(durationMs)}`}
      {facts.length > 0 ? `  ·  ${facts.join('  ·  ')}` : ''}
      {hasDiff ? '  ·  ' : ''}
      {hasDiff ? <Text color={palette.ok}>{`+${stats.added}`}</Text> : ''}
      {hasDiff ? <Text color={palette.err}>{` −${stats.removed}`}</Text> : ''}
    </Text>
  )
}

// A band above Claude Code's own question dialog: the topics it asks about, in the skin.
export function askBand(look: Look, headers: readonly string[]) {
  const { Text } = look.ui
  const { palette } = look.skin

  return (
    <Text color={palette.muted}>
      <Text color={palette.user}>{`${look.icons.prompt} `}</Text>
      {headers.map((header, i) => (
        <Text color={i === 0 ? palette.fg : palette.muted} bold={i === 0}>
          {`${i === 0 ? '' : '  ·  '}${header}`}
        </Text>
      ))}
    </Text>
  )
}

// A vector card in a reply or under a tool row, a line's breath above and below it.
function card(look: Look, Svg: SvgElement, built: { source: string; alt: string }, key: string) {
  const { Box } = look.ui

  return (
    <Box marginY={1}>
      <Svg source={sourceOf(look, key, built.source)} alt={built.alt} />
    </Box>
  )
}

export function codeCard(look: Look, lang: string, code: string, Svg: SvgElement, columns: number, key = 'copy-code') {
  return cardWithCopy(look, Svg, codeSvg(code, lang, look.skin.palette, cardWidth(columns), look.copy !== undefined), key, code)
}

// A chart too crowded to draw at this width keeps its source as a code card.
function chartCard(look: Look, chart: Chart, source: string, Svg: SvgElement, columns: number, key: string) {
  const built = chartSvg(chart, look.skin.palette, cardWidth(columns), look.copy !== undefined)

  return built === null ? codeCard(look, 'mermaid', source, Svg, columns, key) : cardWithCopy(look, Svg, built, key, source)
}

export function diffCard(look: Look, Svg: SvgElement, input: DiffInput, shownPath: string, columns: number) {
  return card(look, Svg, diffSvg(input, shownPath, look.skin.palette, cardWidth(columns)), 'diff')
}

export function terminalCard(look: Look, Svg: SvgElement, output: ShellOutput, isErrored: boolean, columns: number) {
  const text = [output.stdout, output.stderr].filter(part => part.trim() !== '').join('\n')
  const withCopy = text === '' ? { ...look, copy: undefined } : look

  return cardWithCopy(withCopy, Svg, terminalSvg(output, isErrored, look.skin.palette, cardWidth(columns), withCopy.copy !== undefined), 'copy-output', text)
}

// From this full, the band suggests compacting and makes it the main action.
export const COMPACT_NUDGE = 70

export const COMPACT_HOTKEY = '0'

function meterView(look: Look, meters: readonly Meter[]) {
  const { Box, Text } = look.ui
  const { palette } = look.skin

  if (look.svg !== undefined) {
    const Svg = look.svg
    const built = usageSvg(meters, palette)

    return <Svg source={built.source} alt={built.alt} width={built.width} height={built.height} />
  }

  return (
    <Box flexDirection="row" columnGap={3}>
      {usageLine(meters).map(meter => (
        <Text color={palette.muted}>
          <Text color={palette.user}>{meter.bar}</Text>
          {` ${meter.percent}% ${meter.label}`}
        </Text>
      ))}
    </Box>
  )
}

// The band above the prompt: the meters, and a Compact button that becomes the main
// action, with a word on why, once the context is full enough to be worth it.
export function usageBand(look: Look, meters: readonly Meter[], canCompact: boolean, compact: () => void) {
  const { Box, Text, Button } = look.ui
  const { palette } = look.skin
  const context = meters.find(meter => meter.label === 'context')?.percent ?? 0
  const isNudge = context >= COMPACT_NUDGE

  return (
    // The right edge stays clear: the band draws its own collapse mark ([-]) there.
    <Box flexDirection="row" alignItems="center" columnGap={2} paddingRight={5}>
      {meterView(look, meters)}
      <Box flexGrow={1} />
      {canCompact && isNudge ? <Text color={palette.warn}>{`Context is ${context}% full`}</Text> : ''}
      {canCompact ? (
        // A digit hotkey: typed alone into an empty prompt it presses the band's button, which
        // is the only way in where the terminal reports no clicks. `plain` shows it: `0: Compact`.
        <Button
          key="compact"
          label={isNudge ? 'Compact now' : 'Compact'}
          hotkey={COMPACT_HOTKEY}
          plain
          {...(isNudge ? { variant: 'primary' as const } : { dimColor: true })}
          onPress={compact}
        />
      ) : (
        ''
      )}
    </Box>
  )
}

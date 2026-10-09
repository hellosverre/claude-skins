import { chartHeading, formatValue } from './mermaid'
import type { Chart, Flow, FlowEdge, Pie, XyChart } from './mermaid'
import { cutCell, widthOf } from './markdown'
import type { Look } from './rows'
import type { Slot } from './skin'

// A Mermaid fence drawn in terminal cells: flowcharts as boxes rank by rank with the
// links between them spelled out, bar, line and pie charts as rows of block bars.

const SHAPE_SLOT = { box: 'user', round: 'read', diamond: 'warn' } as const
const SERIES: readonly Slot[] = ['user', 'read', 'ok', 'warn', 'web', 'mcp', 'search', 'err']
const EIGHTHS = ['', '▏', '▎', '▍', '▌', '▋', '▊', '▉']
const LABEL_MAX = 24
const EDGE_LABEL_MAX = 16

const seriesColor = (look: Look, i: number): string => look.skin.palette[SERIES[i % SERIES.length] ?? 'user']

// A bar `cells` wide at most, `share` of it filled, to the eighth of a cell.
export function blockBar(share: number, cells: number): string {
  const eighths = Math.round(Math.max(0, Math.min(1, share)) * cells * 8)

  return '█'.repeat(Math.floor(eighths / 8)) + (EIGHTHS[eighths % 8] ?? '')
}

export function chartRows(look: Look, chart: Chart, maxWidth: number) {
  const { Box, Text } = look.ui
  const { palette } = look.skin
  const { kind, count } = chartHeading(chart)
  const title = chart.kind === 'flow' ? '' : chart.title

  return (
    <Box flexDirection="column" marginY={1}>
      <Text color={palette.muted}>
        <Text bold>{kind.toUpperCase()}</Text>
        {title === '' ? '' : <Text color={palette.fg} bold>{`  ${title}`}</Text>}
        {`  ·  ${count}`}
      </Text>
      {chart.kind === 'flow' ? flowRows(look, chart, maxWidth) : chart.kind === 'xy' ? xyRows(look, chart, maxWidth) : pieRows(look, chart, maxWidth)}
    </Box>
  )
}

// --- Flowcharts ---------------------------------------------------------------------

const labelOf = (flow: Flow, id: string): string => flow.nodes.find(node => node.id === id)?.label ?? id

const edgeText = (flow: Flow, edge: FlowEdge): string =>
  `${cutCell(labelOf(flow, edge.from), LABEL_MAX)} → ${cutCell(labelOf(flow, edge.to), LABEL_MAX)}${edge.label === '' ? '' : ` (${cutCell(edge.label, EDGE_LABEL_MAX)})`}`

function nodeBox(look: Look, flow: Flow, id: string) {
  const { Box, Text } = look.ui
  const node = flow.nodes.find(other => other.id === id)
  const color = look.skin.palette[SHAPE_SLOT[node?.shape ?? 'box']]

  return (
    <Box borderStyle="round" borderColor={color} paddingX={1} flexShrink={0}>
      <Text color={look.skin.palette.fg}>{cutCell(node?.label ?? id, LABEL_MAX)}</Text>
    </Box>
  )
}

function flowRows(look: Look, flow: Flow, maxWidth: number) {
  const { Box, Text } = look.ui
  const { palette } = look.skin
  const forward = flow.edges.filter(edge => !flow.back.includes(edge) && edge.from !== edge.to)
  const loops = flow.edges.filter(edge => flow.back.includes(edge) || edge.from === edge.to)
  const boxWidth = (id: string) => widthOf(cutCell(labelOf(flow, id), LABEL_MAX)) + 4
  const isChain = flow.ranks.every(rank => rank.length === 1)
  const chainWidth = flow.ranks.reduce((sum, rank) => sum + boxWidth(rank[0] ?? ''), 0) + (flow.ranks.length - 1) * 3

  // A straight run left to right fits on one line when its labels all live on arrows.
  if (flow.direction === 'right' && isChain && chainWidth <= maxWidth && forward.every(edge => edge.label === '')) {
    return (
      <Box flexDirection="column">
        <Box flexDirection="row" alignItems="center">
          {flow.ranks.map((rank, r) => (
            <Box flexDirection="row" alignItems="center">
              {r === 0 ? '' : <Text color={palette.muted}> → </Text>}
              {nodeBox(look, flow, rank[0] ?? '')}
            </Box>
          ))}
        </Box>
        {loopRows(look, flow, loops)}
      </Box>
    )
  }

  const rankOf = (id: string) => flow.ranks.findIndex(rank => rank.includes(id))

  return (
    <Box flexDirection="column">
      {flow.ranks.map((rank, r) => {
        const into = forward.filter(edge => rankOf(edge.to) === r)
        const isSimple = into.length === 1 && rank.length === 1 && (flow.ranks[r - 1]?.length ?? 0) === 1 && rankOf(into[0]?.from ?? '') === r - 1

        return (
          <Box flexDirection="column">
            {r === 0 || into.length === 0 ? (
              ''
            ) : isSimple ? (
              <Text color={palette.muted}>{`  ↓${into[0]?.label ? `  ${cutCell(into[0].label, EDGE_LABEL_MAX)}` : ''}`}</Text>
            ) : (
              <Text color={palette.muted} wrap="wrap">{`  ↓  ${into.map(edge => edgeText(flow, edge)).join('  ·  ')}`}</Text>
            )}
            <Box flexDirection="row" flexWrap="wrap" columnGap={2}>
              {rank.map(id => nodeBox(look, flow, id))}
            </Box>
          </Box>
        )
      })}
      {loopRows(look, flow, loops)}
    </Box>
  )
}

function loopRows(look: Look, flow: Flow, loops: readonly FlowEdge[]) {
  const { Text } = look.ui

  return loops.length === 0 ? '' : <Text color={look.skin.palette.muted} wrap="wrap">{`  ↺  ${loops.map(edge => edgeText(flow, edge)).join('  ·  ')}`}</Text>
}

// --- Bar, line and pie charts -------------------------------------------------------

type BarRow = { label: string; value: number; color: string; note?: string }

// One row per value: label, bar, value. Bars run from zero; a chart with negative values
// draws their magnitude, the value beside it carrying the sign.
function barRows(look: Look, rows: readonly BarRow[], maxWidth: number) {
  const { Box, Text } = look.ui
  const { palette } = look.skin
  const labelWidth = Math.min(LABEL_MAX, Math.max(...rows.map(row => widthOf(row.label))))
  const valueWidth = Math.max(...rows.map(row => widthOf(formatValue(row.value) + (row.note ?? ''))))
  const peak = Math.max(...rows.map(row => Math.abs(row.value)), Number.MIN_VALUE)
  const cells = Math.max(4, Math.min(48, maxWidth - labelWidth - valueWidth - 6))

  return rows.map(row => (
    <Box flexDirection="row">
      <Text color={palette.fg}>{`${cutCell(row.label, labelWidth)}${' '.repeat(labelWidth - widthOf(cutCell(row.label, labelWidth)))}  `}</Text>
      <Text color={row.color}>{blockBar(Math.abs(row.value) / peak, cells)}</Text>
      <Text color={palette.muted}>
        {` ${formatValue(row.value)}`}
        {row.note ?? ''}
      </Text>
    </Box>
  ))
}

function legend(look: Look, names: readonly { name: string; color: string }[]) {
  const { Text } = look.ui

  return (
    <Text color={look.skin.palette.muted}>
      {names.map((entry, i) => (
        <Text>
          {i === 0 ? '' : '   '}
          <Text color={entry.color}>■</Text>
          {` ${entry.name}`}
        </Text>
      ))}
    </Text>
  )
}

function xyRows(look: Look, chart: XyChart, maxWidth: number) {
  const { Box, Text } = look.ui
  const many = chart.series.length > 1
  const rows = chart.labels.flatMap((label, i) =>
    chart.series.flatMap((series, j) => {
      const value = series.values[i]

      return value === undefined ? [] : [{ label: many && j > 0 ? '' : label, value, color: seriesColor(look, j) }]
    }),
  )

  return (
    <Box flexDirection="column">
      {chart.yLabel === '' ? '' : <Text color={look.skin.palette.muted}>{chart.yLabel}</Text>}
      {barRows(look, rows, maxWidth)}
      {many ? legend(look, chart.series.map((series, j) => ({ name: series.name || `${series.kind} ${j + 1}`, color: seriesColor(look, j) }))) : ''}
    </Box>
  )
}

function pieRows(look: Look, pie: Pie, maxWidth: number) {
  const { Box } = look.ui
  const total = pie.slices.reduce((sum, slice) => sum + slice.value, 0)
  const rows = pie.slices.map((slice, i) => {
    const share = slice.value / total

    return { label: slice.label, value: slice.value, color: seriesColor(look, i), note: `  ${(share * 100).toFixed(share < 0.1 ? 1 : 0)}%` }
  })

  return <Box flexDirection="column">{barRows(look, rows, maxWidth)}</Box>
}

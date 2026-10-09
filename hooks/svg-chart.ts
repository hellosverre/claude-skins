import { chartHeading, formatValue, niceStep } from './mermaid'
import type { Chart, Flow, FlowEdge, FlowNode, Pie, Shape, XyChart } from './mermaid'
import type { Palette, Slot } from './skin'
import { CONTROL_SLOT, escape, fitText, HEADER_MID, measure, riseDelay, svgCard } from './svg-kit'

// A Mermaid fence drawn as a card in the same shell as code and tables: the kind and
// title in a header, then the flowchart, bars, lines or donut in the skin's colours.

const HEADER_H = 56
const PAD = 24

type Built = { source: string; width: number; height: number; alt: string }

// Series and slices take the skin's accent slots in this order.
const SERIES: readonly Slot[] = ['user', 'read', 'ok', 'warn', 'web', 'mcp', 'search', 'err']

const seriesColor = (palette: Palette, i: number): string => palette[SERIES[i % SERIES.length] ?? 'user']

function header(chart: Chart, palette: Palette, width: number, hasControl: boolean): string {
  const { kind, count } = chartHeading(chart)
  const label = kind.toUpperCase()
  const title = chart.kind === 'flow' ? '' : chart.title
  const titleX = 16 + measure(label, false, 11) * 1.15 + 12
  const right = width - 16 - (hasControl ? CONTROL_SLOT : 0)
  const room = right - titleX - measure(count, false, 11) - 16

  return [
    `<text x="16" y="${HEADER_MID + 4}" font-size="11" style="fill:${palette.muted};letter-spacing:.1em;font-weight:600">${escape(label)}</text>`,
    title === '' ? '' : `<text x="${titleX}" y="${HEADER_MID + 4}" font-size="13" style="font-weight:600">${escape(fitText(title, room, false, 13))}</text>`,
    `<text x="${right}" y="${HEADER_MID + 4}" text-anchor="end" font-size="11" style="fill:${palette.muted}">${escape(count)}</text>`,
    `<line x1="0" y1="${HEADER_H - 0.5}" x2="${width}" y2="${HEADER_H - 0.5}" stroke="${palette.muted}" stroke-opacity=".3"/>`,
  ].join('')
}

// Null when the chart cannot be drawn legibly at this width; the fence then keeps its
// code card.
export function chartSvg(chart: Chart, palette: Palette, width: number, hasControl = false): Built | null {
  const drawn = chart.kind === 'flow' ? flowBody(chart, palette, width) : chart.kind === 'xy' ? xyBody(chart, palette, width) : pieBody(chart, palette, width)

  if (drawn === null) {
    return null
  }

  return {
    source: svgCard(width, drawn.height, palette, '', header(chart, palette, width, hasControl) + drawn.body),
    width,
    height: drawn.height,
    alt: altOf(chart),
  }
}

function altOf(chart: Chart): string {
  const label = (flow: Flow, id: string) => flow.nodes.find(node => node.id === id)?.label ?? id

  switch (chart.kind) {
    case 'flow':
      return ['Flowchart:', ...chart.edges.map(edge => `${label(chart, edge.from)} → ${label(chart, edge.to)}${edge.label === '' ? '' : ` (${edge.label})`}`)].join('\n')
    case 'xy':
      return [
        `Chart${chart.title === '' ? '' : `: ${chart.title}`}`,
        ...chart.series.map(series => `${series.name || series.kind}: ${series.values.map((value, i) => `${chart.labels[i] ?? i + 1} ${formatValue(value)}`).join(', ')}`),
      ].join('\n')
    case 'pie': {
      const total = chart.slices.reduce((sum, slice) => sum + slice.value, 0)

      return [`Pie${chart.title === '' ? '' : `: ${chart.title}`}`, ...chart.slices.map(slice => `${slice.label}: ${formatValue(slice.value)} (${Math.round((slice.value / total) * 100)}%)`)].join('\n')
    }
  }
}

// --- Flowcharts ---------------------------------------------------------------------

const NODE_H = 36
const RANK_GAP = 44
const SIBLING_GAP = 20
const MIN_NODE = 56
// The room a loop back up the ranks takes beside the nodes.
const LOOP_ROOM = 44

const SHAPE_SLOT: Readonly<Record<Shape, Slot>> = { box: 'user', round: 'read', diamond: 'warn' }

type Placed = { node: FlowNode; x: number; y: number; w: number }

const naturalWidth = (node: FlowNode): number => Math.min(220, Math.max(72, measure(node.label, false, 12.5) + 28))

function placeDown(flow: Flow, width: number): Map<string, Placed> | null {
  const avail = width - PAD * 2 - (flow.back.length > 0 ? LOOP_ROOM : 0)
  const placed = new Map<string, Placed>()

  for (const [r, rank] of flow.ranks.entries()) {
    const nodes = rank.map(id => flow.nodes.find(node => node.id === id) as FlowNode)
    const share = (avail - SIBLING_GAP * (nodes.length - 1)) / nodes.length
    const widths = nodes.map(node => Math.min(naturalWidth(node), share))

    if (share < MIN_NODE) {
      return null
    }

    const total = widths.reduce((sum, w) => sum + w, 0) + SIBLING_GAP * (nodes.length - 1)
    let x = PAD + (avail - total) / 2

    for (const [i, node] of nodes.entries()) {
      const w = widths[i] ?? MIN_NODE
      placed.set(node.id, { node, x, y: HEADER_H + PAD + r * (NODE_H + RANK_GAP), w })
      x += w + SIBLING_GAP
    }
  }

  return placed
}

const STACK_GAP = 16
const COLUMN_GAP = 56

// Left to right, each rank a column; null when the columns run past the card.
function placeRight(flow: Flow, width: number): Map<string, Placed> | null {
  const columns = flow.ranks.map(rank => rank.map(id => flow.nodes.find(node => node.id === id) as FlowNode))
  const widths = columns.map(column => Math.max(...column.map(naturalWidth)))
  const total = widths.reduce((sum, w) => sum + w, 0) + COLUMN_GAP * (columns.length - 1)

  if (total > width - PAD * 2) {
    return null
  }

  const tallest = Math.max(...columns.map(column => column.length * NODE_H + (column.length - 1) * STACK_GAP))
  const placed = new Map<string, Placed>()
  let x = PAD + (width - PAD * 2 - total) / 2

  for (const [c, column] of columns.entries()) {
    const height = column.length * NODE_H + (column.length - 1) * STACK_GAP
    const w = widths[c] ?? MIN_NODE

    for (const [i, node] of column.entries()) {
      placed.set(node.id, { node, x, y: HEADER_H + PAD + (tallest - height) / 2 + i * (NODE_H + STACK_GAP), w })
    }

    x += w + COLUMN_GAP
  }

  return placed
}

function nodeSvg(placed: Placed, palette: Palette): string {
  const { node, x, y, w } = placed
  const color = palette[SHAPE_SLOT[node.shape]]
  const paint = `fill="${color}" fill-opacity=".12" stroke="${color}" stroke-opacity=".6"`
  const shape =
    node.shape === 'diamond'
      ? `<path d="M${x} ${y + NODE_H / 2}L${x + 12} ${y}H${x + w - 12}L${x + w} ${y + NODE_H / 2}L${x + w - 12} ${y + NODE_H}H${x + 12}Z" ${paint}/>`
      : `<rect x="${x + 0.5}" y="${y + 0.5}" width="${w - 1}" height="${NODE_H - 1}" rx="${node.shape === 'round' ? NODE_H / 2 : 7}" ${paint}/>`

  return `${shape}<text x="${x + w / 2}" y="${y + NODE_H / 2 + 4.5}" text-anchor="middle" font-size="12.5">${escape(fitText(node.label, w - (node.shape === 'diamond' ? 28 : 16), false, 12.5))}</text>`
}

function edgeSvg(edge: FlowEdge, from: Placed, to: Placed, isDown: boolean, isBack: boolean, palette: Palette, marker: string): string {
  let path: string
  let labelAt: { x: number; y: number; anchor: string }

  if (isBack && isDown) {
    // Up the ranks, out to the right of both nodes and back in.
    const x1 = from.x + from.w
    const x2 = to.x + to.w
    const y1 = from.y + NODE_H / 2
    const y2 = to.y + NODE_H / 2
    const reach = Math.max(x1, x2) + LOOP_ROOM - 8
    path = `M${x1} ${y1}C${reach} ${y1} ${reach} ${y2} ${x2} ${y2}`
    labelAt = { x: reach - 4, y: (y1 + y2) / 2 + 4, anchor: 'end' }
  } else if (isBack) {
    const x1 = from.x + from.w / 2
    const x2 = to.x + to.w / 2
    const y1 = from.y + NODE_H
    const y2 = to.y + NODE_H
    const reach = Math.max(y1, y2) + 30
    path = `M${x1} ${y1}C${x1} ${reach} ${x2} ${reach} ${x2} ${y2}`
    labelAt = { x: (x1 + x2) / 2, y: reach - 2, anchor: 'middle' }
  } else if (isDown) {
    const x1 = from.x + from.w / 2
    const x2 = to.x + to.w / 2
    const y1 = from.y + NODE_H
    const y2 = to.y - 2
    const bend = (y2 - y1) / 2
    path = `M${x1} ${y1}C${x1} ${y1 + bend} ${x2} ${y2 - bend} ${x2} ${y2}`
    labelAt = { x: (x1 + x2) / 2 + 6, y: (y1 + y2) / 2 + 4, anchor: 'start' }
  } else {
    const x1 = from.x + from.w
    const x2 = to.x - 2
    const y1 = from.y + NODE_H / 2
    const y2 = to.y + NODE_H / 2
    const bend = (x2 - x1) / 2
    path = `M${x1} ${y1}C${x1 + bend} ${y1} ${x2 - bend} ${y2} ${x2} ${y2}`
    labelAt = { x: (x1 + x2) / 2, y: (y1 + y2) / 2 - 6, anchor: 'middle' }
  }

  const stroke = `stroke="${palette.muted}" stroke-opacity=".85" fill="none" stroke-width="${edge.line === 'thick' ? 2.2 : 1.3}"${edge.line === 'dotted' ? ' stroke-dasharray="4 4"' : ''}`
  const label =
    edge.label === ''
      ? ''
      : `<text x="${labelAt.x}" y="${labelAt.y}" text-anchor="${labelAt.anchor}" font-size="11" style="fill:${palette.muted}">${escape(fitText(edge.label, 120, false, 11))}</text>`

  return `<path d="${path}" ${stroke}${edge.isArrow ? ` marker-end="url(#${marker})"` : ''}/>${label}`
}

function flowBody(flow: Flow, palette: Palette, width: number): { body: string; height: number } | null {
  const right = flow.direction === 'right' ? placeRight(flow, width) : null
  const placed = right ?? placeDown(flow, width)

  if (placed === null) {
    return null
  }

  const isDown = right === null
  const bottom = Math.max(...[...placed.values()].map(node => node.y + NODE_H))
  const height = bottom + PAD + (!isDown && flow.back.length > 0 ? 32 : 0)
  const marker = `arrow-${width}x${height}`
  const rankOf = (id: string) => flow.ranks.findIndex(rank => rank.includes(id))

  const edges = flow.edges.map(edge => {
    const from = placed.get(edge.from)
    const to = placed.get(edge.to)

    if (from === undefined || to === undefined || edge.from === edge.to) {
      return ''
    }

    return `<g class="rise" ${riseDelay(rankOf(edge.to), 70, 120)}>${edgeSvg(edge, from, to, isDown, flow.back.includes(edge), palette, marker)}</g>`
  })

  const nodes = [...placed.values()].map(node => `<g class="rise" ${riseDelay(rankOf(node.node.id), 70, 60)}>${nodeSvg(node, palette)}</g>`)
  const defs = `<defs><marker id="${marker}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 1L9 5L0 9z" fill="${palette.muted}"/></marker></defs>`

  return { body: defs + edges.join('') + nodes.join(''), height }
}

// --- Bar and line charts ------------------------------------------------------------

const PLOT_H = 200

function xyBody(chart: XyChart, palette: Palette, width: number): { body: string; height: number } {
  const step = niceStep(chart.max - chart.min)
  const ticks: number[] = []

  for (let value = Math.ceil(chart.min / step) * step; value <= chart.max + step / 1e6; value += step) {
    ticks.push(Number(value.toFixed(10)))
  }

  const gutter = Math.max(32, ...ticks.map(tick => measure(formatValue(tick), false, 11))) + 12
  const x0 = PAD + gutter
  const x1 = width - PAD
  const top = HEADER_H + (chart.yLabel === '' ? 22 : 38)
  const y1 = top + PLOT_H
  const scale = (value: number) => y1 - ((Math.min(chart.max, Math.max(chart.min, value)) - chart.min) / (chart.max - chart.min)) * PLOT_H
  const band = (x1 - x0) / chart.labels.length
  const bars = chart.series.filter(series => series.kind === 'bar')
  const lines = chart.series.filter(series => series.kind === 'line')
  const colorOf = (series: (typeof chart.series)[number]) => seriesColor(palette, chart.series.indexOf(series))
  const baseline = scale(Math.max(chart.min, Math.min(chart.max, 0)))
  const parts: string[] = []

  if (chart.yLabel !== '') {
    parts.push(`<text x="${PAD}" y="${HEADER_H + 24}" font-size="11" style="fill:${palette.muted}">${escape(fitText(chart.yLabel, x1 - PAD, false, 11))}</text>`)
  }

  for (const tick of ticks) {
    const y = scale(tick)
    parts.push(
      `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${palette.fg}" stroke-opacity="${tick === 0 ? 0.22 : 0.08}"/>`,
      `<text x="${x0 - 8}" y="${y + 4}" text-anchor="end" font-size="11" style="fill:${palette.muted}">${escape(formatValue(tick))}</text>`,
    )
  }

  // Bars side by side within each label's band, the group taking most of the band.
  const group = band * 0.72
  const barW = bars.length === 0 ? 0 : group / bars.length
  const showValues = bars.length === 1 && lines.length === 0 && barW >= 26

  for (let i = 0; i < chart.labels.length; i++) {
    for (const [j, series] of bars.entries()) {
      const value = series.values[i]

      if (value === undefined) {
        continue
      }

      const x = x0 + i * band + (band - group) / 2 + j * barW
      const y = scale(value)
      const h = Math.max(1, Math.abs(baseline - y))
      const label = showValues
        ? `<text x="${x + barW / 2}" y="${Math.min(y, baseline) - 6}" text-anchor="middle" font-size="10.5" style="fill:${palette.muted}">${escape(formatValue(value))}</text>`
        : ''

      parts.push(
        `<g class="rise" ${riseDelay(i, 30, 80)}><rect x="${x + 1}" y="${Math.min(y, baseline)}" width="${Math.max(1, barW - 2)}" height="${h}" rx="${Math.min(4, barW / 4)}" fill="${colorOf(series)}" fill-opacity=".85"/>${label}</g>`,
      )
    }
  }

  for (const series of lines) {
    const points = series.values.map((value, i) => `${x0 + i * band + band / 2},${scale(value)}`)
    const color = colorOf(series)
    const dots = series.values.map((value, i) => `<circle cx="${x0 + i * band + band / 2}" cy="${scale(value)}" r="3" fill="${color}"/>`)

    parts.push(`<g class="rise" ${riseDelay(0, 0, 200)}><polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>${dots.join('')}</g>`)
  }

  // Labels thin out to every second, third... when the bands are too narrow for each.
  const every = Math.max(1, Math.ceil(64 / band))

  for (const [i, label] of chart.labels.entries()) {
    if (i % every === 0) {
      parts.push(`<text x="${x0 + i * band + band / 2}" y="${y1 + 18}" text-anchor="middle" font-size="11" style="fill:${palette.muted}">${escape(fitText(label, band * every - 6, false, 11))}</text>`)
    }
  }

  const named = chart.series.length > 1
  let height = y1 + 30

  if (named) {
    let x = x0

    for (const [i, series] of chart.series.entries()) {
      const name = series.name || `${series.kind} ${i + 1}`
      parts.push(
        series.kind === 'line'
          ? `<line x1="${x}" y1="${height + 6}" x2="${x + 14}" y2="${height + 6}" stroke="${colorOf(series)}" stroke-width="2.2" stroke-linecap="round"/>`
          : `<rect x="${x}" y="${height}" width="12" height="12" rx="3" fill="${colorOf(series)}" fill-opacity=".85"/>`,
        `<text x="${x + 20}" y="${height + 10}" font-size="11.5" style="fill:${palette.muted}">${escape(name)}</text>`,
      )
      x += 20 + measure(name, false, 11.5) + 20
    }

    height += 22
  }

  return { body: parts.join(''), height: height + 12 }
}

// --- Pies ---------------------------------------------------------------------------

const OUTER = 76
const INNER = 46
const LEGEND_ROW = 24

const polar = (cx: number, cy: number, r: number, turn: number): string => {
  const angle = turn * Math.PI * 2 - Math.PI / 2

  return `${(cx + r * Math.cos(angle)).toFixed(2)} ${(cy + r * Math.sin(angle)).toFixed(2)}`
}

function pieBody(pie: Pie, palette: Palette, width: number): { body: string; height: number } {
  const total = pie.slices.reduce((sum, slice) => sum + slice.value, 0)
  const legendH = pie.slices.length * LEGEND_ROW
  const cx = PAD + OUTER
  const cy = HEADER_H + PAD + Math.max(OUTER, legendH / 2)
  const parts: string[] = []
  let at = 0

  for (const [i, slice] of pie.slices.entries()) {
    const share = slice.value / total
    const color = seriesColor(palette, i)

    if (share >= 0.9999) {
      parts.push(`<circle cx="${cx}" cy="${cy}" r="${(OUTER + INNER) / 2}" fill="none" stroke="${color}" stroke-opacity=".85" stroke-width="${OUTER - INNER}"/>`)
    } else if (share > 0) {
      const large = share > 0.5 ? 1 : 0
      const end = at + share
      parts.push(
        `<path class="rise" ${riseDelay(i, 60, 80)} d="M${polar(cx, cy, OUTER, at)}A${OUTER} ${OUTER} 0 ${large} 1 ${polar(cx, cy, OUTER, end)}L${polar(cx, cy, INNER, end)}A${INNER} ${INNER} 0 ${large} 0 ${polar(cx, cy, INNER, at)}Z" fill="${color}" fill-opacity=".85"/>`,
      )
    }

    at += share
  }

  parts.push(
    `<text x="${cx}" y="${cy + 2}" text-anchor="middle" font-size="16" style="font-weight:600">${escape(formatValue(total))}</text>`,
    `<text x="${cx}" y="${cy + 18}" text-anchor="middle" font-size="10.5" style="fill:${palette.muted}">total</text>`,
  )

  const legendX = cx + OUTER + 40
  const legendRight = width - PAD
  const legendTop = cy - legendH / 2

  for (const [i, slice] of pie.slices.entries()) {
    const y = legendTop + i * LEGEND_ROW
    const percent = `${((slice.value / total) * 100).toFixed(slice.value / total < 0.1 ? 1 : 0)}%`
    const value = formatValue(slice.value)
    const room = legendRight - legendX - 20 - measure(`${value}   ${percent}`, false, 12) - 16

    parts.push(
      `<g class="rise" ${riseDelay(i, 40, 120)}>`,
      `<rect x="${legendX}" y="${y + 6}" width="11" height="11" rx="3" fill="${seriesColor(palette, i)}" fill-opacity=".85"/>`,
      `<text x="${legendX + 20}" y="${y + 16}" font-size="12.5">${escape(fitText(slice.label, room, false, 12.5))}</text>`,
      `<text x="${legendRight - 48}" y="${y + 16}" text-anchor="end" font-size="12" style="fill:${palette.muted}">${escape(value)}</text>`,
      `<text x="${legendRight}" y="${y + 16}" text-anchor="end" font-size="12" style="font-weight:600">${percent}</text>`,
      `</g>`,
    )
  }

  return { body: parts.join(''), height: cy + Math.max(OUTER, legendH / 2) + PAD }
}

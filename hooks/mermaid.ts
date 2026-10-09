// The Mermaid people actually write in a reply, read well enough to draw: flowcharts,
// xy charts and pies. Anything past that (subgraphs, styling, other diagram kinds) reads
// as null, and the fence keeps its code-block drawing.

export type Shape = 'box' | 'round' | 'diamond'

export type FlowNode = { id: string; label: string; shape: Shape }

export type FlowEdge = { from: string; to: string; label: string; line: 'solid' | 'dotted' | 'thick'; isArrow: boolean }

// `ranks` are the nodes by depth, each rank in the order the source named its nodes;
// `back` marks the edges that point up the ranks, as in a retry loop.
export type Flow = {
  kind: 'flow'
  direction: 'down' | 'right'
  nodes: FlowNode[]
  edges: FlowEdge[]
  ranks: string[][]
  back: FlowEdge[]
}

export type Series = { kind: 'bar' | 'line'; name: string; values: number[] }

export type XyChart = { kind: 'xy'; title: string; labels: string[]; yLabel: string; min: number; max: number; series: Series[] }

export type Slice = { label: string; value: number }

export type Pie = { kind: 'pie'; title: string; slices: Slice[] }

export type Chart = Flow | XyChart | Pie

// Past these a picture stops being easier to read than the source.
export const MAX_NODES = 40
const MAX_POINTS = 60
const MAX_SLICES = 16

// Lines that carry no meaning for the drawing, kept out of the statement list.
const IGNORED = /^(%%|classDef\s|class\s|style\s|linkStyle\s|click\s|accTitle|accDescr)/

const unquote = (text: string): string =>
  text
    .trim()
    .replace(/^"(.*)"$/s, '$1')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()

function statementsOf(body: readonly string[]): string[] {
  return body
    .flatMap(line => line.split(';'))
    .map(line => line.trim())
    .filter(line => line !== '' && !IGNORED.test(line))
}

export function parseMermaid(source: string): Chart | null {
  const lines = source.replace(/\r/g, '').split('\n')
  const start = lines.findIndex(line => line.trim() !== '' && !line.trim().startsWith('%%'))
  const head = (lines[start] ?? '').trim()
  const body = lines.slice(start + 1)

  // `graph LR; a-->b` puts its first statements on the header line.
  if (/^(flowchart|graph)\b/.test(head)) {
    const [direction = '', ...inline] = head.split(';')

    return parseFlow(direction.trim(), [...inline, ...body])
  }

  if (/^xychart(-beta)?\b/.test(head)) {
    return parseXy(body)
  }

  if (/^pie\b/.test(head)) {
    return parsePie(head, body)
  }

  return null
}

// A node reference with its optional label: `A`, `A[Box]`, `A(Round)`, `A{Choice}`, and
// the doubled forms Mermaid draws as circles, stadiums, subroutines and hexagons.
const NODE =
  /^([A-Za-z0-9_]+)\s*(?:\(\((.*?)\)\)|\(\[(.*?)\]\)|\[\[(.*?)\]\]|\{\{(.*?)\}\}|\[(.*?)\]|\((.*?)\)|\{(.*?)\})?/

// An edge: `-->`, `---`, `-.->`, `==>`, with a label as `-->|yes|` or `-- yes -->`.
const EDGE =
  /^(?:(-->|---|-\.->|-\.-|==>|===)\s*(?:\|([^|]*)\|)?|(--|-\.|==)\s*([^|>-][^>]*?)\s*(-->|---|\.->|\.-|==>|===))\s*/

function readNode(text: string): { node: FlowNode; label: boolean; rest: string } | null {
  const match = NODE.exec(text)

  if (match === null) {
    return null
  }

  const [whole, id = ''] = match
  const groups = match.slice(2)
  const at = groups.findIndex(group => group !== undefined)
  const shape: Shape = at === 3 || at === 6 ? 'diamond' : at === 0 || at === 1 || at === 5 ? 'round' : 'box'

  return {
    node: { id, label: at === -1 ? id : unquote(groups[at] ?? ''), shape },
    label: at !== -1,
    rest: text.slice(whole.length).trim(),
  }
}

function parseFlow(head: string, body: readonly string[]): Flow | null {
  const direction = /\b(LR|RL)\b/.test(head) ? 'right' : 'down'
  const nodes = new Map<string, FlowNode>()
  const edges: FlowEdge[] = []

  const meet = (read: { node: FlowNode; label: boolean }) => {
    const known = nodes.get(read.node.id)

    // A later bare mention keeps the label an earlier one gave.
    if (known === undefined || read.label) {
      nodes.set(read.node.id, read.node)
    }
  }

  for (const statement of statementsOf(body)) {
    if (/^(subgraph\b|end$|direction\s)/.test(statement)) {
      return null
    }

    let read = readNode(statement)

    if (read === null) {
      return null
    }

    meet(read)

    while (read.rest !== '') {
      const edge = EDGE.exec(read.rest)

      if (edge === null) {
        return null
      }

      const arrow = edge[1] ?? edge[5] ?? ''
      const from: string = read.node.id
      const next = readNode(read.rest.slice(edge[0].length))

      if (next === null) {
        return null
      }

      meet(next)
      edges.push({
        from,
        to: next.node.id,
        label: unquote(edge[2] ?? edge[4] ?? ''),
        line: arrow.includes('.') ? 'dotted' : arrow.includes('=') ? 'thick' : 'solid',
        isArrow: arrow.endsWith('>'),
      })
      read = next
    }
  }

  if (nodes.size === 0 || nodes.size > MAX_NODES) {
    return null
  }

  const order = [...nodes.keys()]
  const back = backEdges(order, edges)
  const forward = edges.filter(edge => !back.includes(edge))
  const depth = new Map(order.map(id => [id, 0]))

  // Longest path from a source: each node one rank below the deepest node feeding it.
  for (let pass = 0; pass < order.length; pass++) {
    for (const edge of forward) {
      if (edge.from !== edge.to) {
        depth.set(edge.to, Math.max(depth.get(edge.to) ?? 0, (depth.get(edge.from) ?? 0) + 1))
      }
    }
  }

  const ranks: string[][] = []

  for (const id of order) {
    const rank = depth.get(id) ?? 0
    ranks[rank] = [...(ranks[rank] ?? []), id]
  }

  return { kind: 'flow', direction, nodes: order.map(id => nodes.get(id) as FlowNode), edges, ranks: ranks.filter(rank => rank !== undefined), back }
}

// The edges that close a cycle, found walking from each node in source order.
function backEdges(order: readonly string[], edges: readonly FlowEdge[]): FlowEdge[] {
  const state = new Map<string, 'open' | 'done'>()
  const back: FlowEdge[] = []

  const walk = (id: string) => {
    state.set(id, 'open')

    for (const edge of edges.filter(candidate => candidate.from === id)) {
      const seen = state.get(edge.to)

      if (seen === 'open') {
        back.push(edge)
      } else if (seen === undefined) {
        walk(edge.to)
      }
    }

    state.set(id, 'done')
  }

  for (const id of order) {
    if (!state.has(id)) {
      walk(id)
    }
  }

  return back
}

const NUMBER = /^-?\d+(?:\.\d+)?$/

function numbersOf(list: string): number[] | null {
  const values = list
    .split(',')
    .map(value => value.trim())
    .filter(value => value !== '')

  return values.every(value => NUMBER.test(value)) ? values.map(Number) : null
}

const listOf = (list: string): string[] =>
  list
    .split(',')
    .map(unquote)
    .filter(item => item !== '')

// A nice round step for about `count` gridlines across `span`.
export function niceStep(span: number, count = 4): number {
  const raw = span / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const unit = raw / power

  return (unit <= 1 ? 1 : unit <= 2 ? 2 : unit <= 2.5 ? 2.5 : unit <= 5 ? 5 : 10) * power
}

function parseXy(body: readonly string[]): XyChart | null {
  let title = ''
  let labels: string[] = []
  let yLabel = ''
  let range: [number, number] | null = null
  const series: Series[] = []

  for (const statement of statementsOf(body)) {
    const titled = /^title\s+(.*)$/.exec(statement)
    const xAxis = /^x-axis\s*(?:("[^"]*"|[^[\d\s-][^[]*?))?\s*(?:\[(.*)\]|(-?[\d.]+)\s*-->\s*(-?[\d.]+))?$/.exec(statement)
    const yAxis = /^y-axis\s*(?:("[^"]*"|[^\d\s-][^\d]*?))?\s*(?:(-?[\d.]+)\s*-->\s*(-?[\d.]+))?$/.exec(statement)
    const plotted = /^(bar|line)\s*(?:("[^"]*"|\S+)\s*)?\[(.*)\]$/.exec(statement)

    if (titled !== null) {
      title = unquote(titled[1] ?? '')
    } else if (xAxis !== null) {
      labels = xAxis[2] === undefined ? [] : listOf(xAxis[2])
    } else if (yAxis !== null) {
      yLabel = unquote(yAxis[1] ?? '')
      range = yAxis[2] === undefined ? null : [Number(yAxis[2]), Number(yAxis[3])]
    } else if (plotted !== null) {
      const values = numbersOf(plotted[3] ?? '')

      if (values === null || values.length === 0 || values.length > MAX_POINTS) {
        return null
      }

      series.push({ kind: plotted[1] === 'line' ? 'line' : 'bar', name: unquote(plotted[2] ?? ''), values })
    } else {
      return null
    }
  }

  if (series.length === 0) {
    return null
  }

  const points = Math.max(...series.map(one => one.values.length))
  const all = series.flatMap(one => one.values)
  const low = Math.min(0, ...all)
  const high = Math.max(...all)
  const [min, max] = range ?? [low, high === low ? low + 1 : low + Math.ceil((high - low) / niceStep(high - low)) * niceStep(high - low)]

  if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
    return null
  }

  return {
    kind: 'xy',
    title,
    labels: Array.from({ length: points }, (_, i) => labels[i] ?? String(i + 1)),
    yLabel,
    min,
    max,
    series,
  }
}

function parsePie(head: string, body: readonly string[]): Pie | null {
  let title = unquote(/\btitle\s+(.*)$/.exec(head)?.[1] ?? '')
  const slices: Slice[] = []

  for (const statement of statementsOf(body)) {
    const titled = /^title\s+(.*)$/.exec(statement)
    const slice = /^"([^"]*)"\s*:\s*(\d+(?:\.\d+)?)$/.exec(statement)

    if (titled !== null) {
      title = unquote(titled[1] ?? '')
    } else if (slice !== null) {
      slices.push({ label: unquote(slice[1] ?? ''), value: Number(slice[2]) })
    } else {
      return null
    }
  }

  const total = slices.reduce((sum, slice) => sum + slice.value, 0)

  return slices.length === 0 || slices.length > MAX_SLICES || total <= 0 ? null : { kind: 'pie', title, slices }
}

// What a chart is called in a card header and how much it holds.
export function chartHeading(chart: Chart): { kind: string; count: string } {
  const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

  switch (chart.kind) {
    case 'flow':
      return { kind: 'Flowchart', count: plural(chart.nodes.length, 'step') }
    case 'xy':
      return { kind: 'Chart', count: chart.series.length > 1 ? `${chart.series.length} series` : plural(chart.labels.length, 'point') }
    case 'pie':
      return { kind: 'Pie', count: plural(chart.slices.length, 'slice') }
  }
}

// A number as a chart labels it: whole where it is, else to two places, with thousands
// grouped.
export const formatValue = (value: number): string =>
  value.toLocaleString('en-US', { maximumFractionDigits: Number.isInteger(value) ? 0 : 2 })

// A share as a percent, one decimal under 10% and none where it would read `9.0%`.
export const formatPercent = (share: number): string => `${Number((share * 100).toFixed(share < 0.1 ? 1 : 0))}%`

// A series' legend name: its own, else its kind, numbered among the unnamed ones of that kind.
export function seriesName(chart: XyChart, i: number): string {
  const series = chart.series[i]

  if (series === undefined || series.name !== '') {
    return series?.name ?? ''
  }

  const same = chart.series.filter(other => other.kind === series.kind && other.name === '')

  return same.length === 1 ? series.kind : `${series.kind} ${same.indexOf(series) + 1}`
}

// What reaches the model: one short paragraph, sent only while charts are on.
export const CHART_HINT = [
  '# Charts',
  'This transcript draws ```mermaid fences as pictures. Supported: `flowchart TD|LR` (nodes A[box], A(round), A{decision};',
  'edges -->, -.->, ==>, with labels -->|yes|), `xychart-beta` (title "…", x-axis [a, b], y-axis "unit" 0 --> 100,',
  'bar [..], line [..]) and `pie` (title …, "label" : value). No subgraphs or styling; at most 40 nodes.',
  'When a process, a comparison of numbers or a breakdown reads better as a picture than as prose or a table, draw one.',
].join(' ')

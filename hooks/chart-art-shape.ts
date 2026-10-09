import { blit, dot, dotsOf, gridOf, line, padTo, runsOf, runsOfLines, seg, stamp, write, writeAll } from './art-canvas'
import type { Segment } from './art-canvas'
import { cutCell, widthOf } from './markdown'
import { formatPercent, formatValue } from './mermaid'
import type { GitGraph, MindNode, Mindmap, Quadrant, Radar, Sankey } from './mermaid'
import type { Run, Tone } from './mermaid-art'

// The terminal drawings for the charts that are shapes rather than schedules: trees,
// planes, webs, flows and branches. See chart-art.ts for how they are chosen.

const series = (i: number): Tone => ({ series: i })

// --- Mindmap ------------------------------------------------------------------------

// A tree from the root down, each first-level branch in its own colour.
export function mindmapArt(chart: Mindmap, room: number, ascii: boolean): Run[][] | null {
  if (room < 12) {
    return null
  }

  const lines: Segment[][] = [[seg(cutCell(chart.root.label, room), 'title')]]
  const [tee, elbow, stem] = ascii ? ['+- ', '`- ', '|  '] : ['├─ ', '└─ ', '│  ']

  const walk = (node: MindNode, prefix: string, tone: Tone, depth: number): void =>
    node.children.forEach((child, k) => {
      const last = k === node.children.length - 1
      const branch = depth === 0 ? series(k) : tone
      const left = room - widthOf(prefix) - 3

      if (left < 1) {
        return
      }

      lines.push([seg(prefix + (last ? elbow : tee), branch), seg(cutCell(child.label, left), depth === 0 ? branch : 'fg')])
      walk(child, prefix + (last ? '   ' : stem), branch, depth + 1)
    })

  walk(chart.root, '', 'muted', 0)

  return runsOfLines(lines)
}

// --- Quadrant -----------------------------------------------------------------------

// Rows inside each half of the box.
const HALF_ROWS = 4

export function quadrantArt(chart: Quadrant, room: number, ascii: boolean): Run[][] | null {
  const half = Math.min(24, Math.floor((room - 3) / 2))

  if (half < 8) {
    return null
  }

  const width = half * 2 + 3
  const height = HALF_ROWS * 2 + 3
  const box = gridOf(width, height)
  const [h, v, cross] = ascii ? ['-', '|', '+'] : ['─', '│', '┼']
  const corners = ascii
    ? [['+', '+', '+'], ['+', '+', '+'], ['+', '+', '+']]
    : [['┌', '┬', '┐'], ['├', cross, '┤'], ['└', '┴', '┘']]
  const rule = (y: number, [a, b, c]: string[]): void => {
    write(box, 0, y, `${a}${h.repeat(half)}${b}${h.repeat(half)}${c}`, 'muted')
  }

  rule(0, corners[0] ?? [])
  rule(HALF_ROWS + 1, corners[1] ?? [])
  rule(height - 1, corners[2] ?? [])

  for (let y = 1; y < height - 1; y++) {
    if (y !== HALF_ROWS + 1) {
      ;[0, half + 1, width - 1].forEach(x => write(box, x, y, v, 'muted'))
    }
  }

  const [q1, q2, q3, q4] = chart.quadrants
  const corner = (text: string, y: number, right: boolean): void => {
    const cut = cutCell(text, half - 2)
    write(box, right ? width - 2 - widthOf(cut) : 2, y, cut, 'muted')
  }

  corner(q2, 1, false)
  corner(q1, 1, true)
  corner(q3, height - 2, false)
  corner(q4, height - 2, true)

  // A point's cell: the halves skip the middle rule.
  const cellOf = (point: { x: number; y: number }): [number, number] => {
    const ci = Math.max(0, Math.min(half * 2 - 1, Math.floor(point.x * half * 2)))
    const ri = Math.max(0, Math.min(HALF_ROWS * 2 - 1, Math.floor((1 - point.y) * HALF_ROWS * 2)))

    return [1 + ci + (ci >= half ? 1 : 0), 1 + ri + (ri >= HALF_ROWS ? 1 : 0)]
  }

  const cells = chart.points.map(cellOf)
  cells.forEach(([x, y], i) => write(box, x, y, ascii ? '*' : '●', series(i)))

  // Labelled beside the point where the cells are free, in the legend otherwise.
  const listed: number[] = []

  chart.points.forEach((point, i) => {
    const [x, y] = cells[i] ?? [0, 0]
    const label = cutCell(point.label, 12)
    const wall = x <= half ? half + 1 : width - 1
    const free = Array.from({ length: widthOf(label) + 1 }, (_, k) => box[y]?.[x + 1 + k]?.char === ' ')

    if (x + 2 + widthOf(label) <= wall && free.every(Boolean)) {
      write(box, x + 2, y, label, 'fg')
    } else {
      listed.push(i)
    }
  })

  const [xLow, xHigh] = chart.x
  const [yLow, yHigh] = chart.y
  const grid = gridOf(width, height + 3 + listed.length)
  const axis = ascii ? ['^', 'v', '<-', '->'] : ['↑', '↓', '←', '→']

  if (yHigh !== '') {
    write(grid, half + 1, 0, `${axis[0] ?? ''} ${cutCell(yHigh, half)}`, 'muted')
  }

  blit(grid, box, 0, 1)

  if (yLow !== '') {
    write(grid, half + 1, height + 1, `${axis[1] ?? ''} ${cutCell(yLow, half)}`, 'muted')
  }

  if (xLow !== '') {
    write(grid, 0, height + 2, `${axis[2] ?? ''} ${cutCell(xLow, half - 2)}`, 'muted')
  }

  if (xHigh !== '') {
    const text = `${cutCell(xHigh, half - 2)} ${axis[3] ?? ''}`
    write(grid, width - widthOf(text), height + 2, text, 'muted')
  }

  listed.forEach((i, row) => {
    const point = chart.points[i]

    if (point !== undefined) {
      writeAll(grid, 0, height + 3 + row, [
        seg(ascii ? '*' : '●', series(i)),
        seg(` ${cutCell(point.label, width - 16)}`, 'fg'),
        seg(`  ${point.x.toFixed(2)}, ${point.y.toFixed(2)}`, 'muted'),
      ])
    }
  })

  return runsOf(grid)
}

// --- Radar --------------------------------------------------------------------------

// The web in braille: 22 × 11 cells is 44 × 44 dots, centre 22, radius 20.
const WEB_COLS = 22
const WEB_ROWS = 11
const CENTRE = 22
const RADIUS = 20

export function radarArt(chart: Radar, room: number, ascii: boolean): Run[][] | null {
  const n = chart.axes.length
  const labelMax = Math.min(12, Math.max(...chart.axes.map(axis => widthOf(axis.label))), Math.floor((room - WEB_COLS) / 2) - 1)

  if (n < 3 || labelMax < 4) {
    return null
  }

  const margin = labelMax + 1
  const width = WEB_COLS + margin * 2
  const dots = dotsOf(WEB_COLS, WEB_ROWS)
  const angle = (k: number): number => -Math.PI / 2 + (2 * Math.PI * k) / n
  const at = (k: number, r: number): [number, number] => [CENTRE + r * Math.cos(angle(k)), CENTRE + r * Math.sin(angle(k))]
  const span = chart.max - chart.min || 1

  for (let k = 0; k < n; k++) {
    line(dots, CENTRE, CENTRE, ...at(k, RADIUS), 'muted')
  }

  for (let t = 1; t <= chart.ticks; t++) {
    const r = (RADIUS * t) / chart.ticks

    if (chart.graticule === 'circle') {
      const steps = Math.ceil(2 * Math.PI * r)

      for (let s = 0; s < steps; s++) {
        dot(dots, CENTRE + r * Math.cos((2 * Math.PI * s) / steps), CENTRE + r * Math.sin((2 * Math.PI * s) / steps), 'muted')
      }
    } else {
      for (let k = 0; k < n; k++) {
        line(dots, ...at(k, r), ...at(k + 1, r), 'muted')
      }
    }
  }

  // Curves last, so where they cross the web they win the cell.
  chart.curves.forEach((curve, i) => {
    const radiusOf = (k: number): number => RADIUS * Math.max(0, Math.min(1, ((curve.values[k] ?? chart.min) - chart.min) / span))

    for (let k = 0; k < n; k++) {
      line(dots, ...at(k, radiusOf(k)), ...at((k + 1) % n, radiusOf((k + 1) % n)), series(i))
    }
  })

  const legend = chart.curves.map((curve, i): Segment[] => [seg(ascii ? '*' : '●', series(i)), seg(` ${curve.label}`, 'fg')])
  const inline = legend.reduce((sum, segments) => sum + widthOfSegments(segments) + 3, -3) <= room
  const legendRows = legend.length === 0 ? 0 : inline ? 1 : legend.length
  const grid = gridOf(Math.max(width, room), WEB_ROWS + 3 + legendRows)

  stamp(grid, dots, margin, 1, ascii)

  // Labels just past the spoke ends: after the point on the right, before it on the
  // left, centred over it at the top and bottom.
  chart.axes.forEach((axis, k) => {
    const label = cutCell(axis.label, labelMax)
    const [dx, dy] = at(k, RADIUS + 3)
    const cos = Math.cos(angle(k))
    const x = margin + Math.floor(dx / 2)
    const y = Math.max(0, Math.min(WEB_ROWS + 1, 1 + Math.floor(dy / 4)))
    const start = cos > 0.3 ? x : cos < -0.3 ? x - widthOf(label) + 1 : x - Math.floor(widthOf(label) / 2)

    write(grid, Math.max(0, start), y, label, 'fg')
  })

  if (inline) {
    writeAll(grid, 0, WEB_ROWS + 3, legend.flatMap((segments, i) => (i === 0 ? segments : [seg('   '), ...segments])))
  } else {
    legend.forEach((segments, i) => writeAll(grid, 0, WEB_ROWS + 3 + i, segments))
  }

  return runsOf(grid)
}

const widthOfSegments = (segments: readonly Segment[]): number =>
  segments.reduce((sum, segment) => sum + widthOf(segment.text), 0)

// --- Sankey -------------------------------------------------------------------------

const EIGHTHS = ['▏', '▎', '▍', '▌', '▋', '▊', '▉']

function barOf(fraction: number, width: number, ascii: boolean): string {
  const cells = Math.max(0, Math.min(1, fraction)) * width

  if (ascii) {
    return '#'.repeat(Math.max(1, Math.round(cells)))
  }

  const full = Math.floor(cells)
  const part = Math.round((cells - full) * 8)
  const tail = part === 0 ? '' : part === 8 ? '█' : (EIGHTHS[part - 1] ?? '')
  const bar = '█'.repeat(full) + tail

  return bar === '' ? '▏' : bar
}

// Each source with the flows out of it, the bars on one scale across the chart and
// coloured by where they go.
export function sankeyArt(chart: Sankey, room: number, ascii: boolean): Run[][] | null {
  const links = chart.links

  if (links.length === 0) {
    return null
  }

  const most = Math.max(...links.map(link => link.value))
  const targetW = Math.min(20, Math.max(...links.map(link => widthOf(link.to))))
  const valueW = Math.max(...links.map(link => widthOf(formatValue(link.value))))
  const barW = room - (4 + targetW + 2 + 2 + valueW + 2 + 4)

  if (barW < 6) {
    return null
  }

  const lines: Segment[][] = []

  chart.nodes.forEach((node, i) => {
    const out = links.filter(link => link.from === node)
    const total = out.reduce((sum, link) => sum + link.value, 0)

    if (out.length === 0) {
      return
    }

    if (lines.length > 0) {
      lines.push([])
    }

    lines.push([seg(cutCell(node, room - 12), series(i)), seg(`  ${formatValue(total)}`, 'muted')])

    for (const link of out) {
      const bar = barOf(link.value / most, barW, ascii)

      lines.push([
        seg(ascii ? ' -> ' : '  → ', 'muted'),
        seg(padTo(link.to, targetW), 'fg'),
        seg('  '),
        seg(bar, series(Math.max(0, chart.nodes.indexOf(link.to)))),
        seg(' '.repeat(Math.max(0, barW - widthOf(bar)))),
        seg(`  ${formatValue(link.value).padStart(valueW)}`, 'fg'),
        seg(`  ${formatPercent(link.value / total).padStart(4)}`, 'muted'),
      ])
    }
  })

  return runsOfLines(lines)
}

// --- Git graph ----------------------------------------------------------------------

const GLYPHS = {
  normal: ['●', '*'],
  reverse: ['✕', 'x'],
  highlight: ['■', '#'],
  merge: ['◉', '@'],
  cherry: ['●', '*'],
} as const

// Branches as lanes down the page, oldest commit first. A lane runs from where its
// branch forks to its last commit or the last merge out of it; forks and merges each
// take a connector row of their own.
export function gitArt(chart: GitGraph, room: number, ascii: boolean): Run[][] | null {
  const { branches, commits } = chart
  const lanes = branches.length
  const textX = lanes * 2 + 1

  if (commits.length === 0 || room < textX + 8) {
    return null
  }

  const laneOf = (branch: string): number => branches.indexOf(branch)
  const indexOf = new Map(commits.map((commit, i) => [commit.id, i]))
  const last = branches.map(() => -1)

  commits.forEach((commit, i) => {
    const lane = laneOf(commit.branch)
    last[lane] = Math.max(last[lane] ?? -1, i)

    if (commit.type === 'merge' && laneOf(commit.from) >= 0) {
      last[laneOf(commit.from)] = Math.max(last[laneOf(commit.from)] ?? -1, i)
    }
  })

  // Where each lane starts: just after its parent's commit when it forks off another
  // lane, so forks off the same commit stack in order; at its first commit otherwise.
  const start = branches.map(() => Infinity)
  const forks = new Map<number, { lane: number; parent: number }[]>()

  branches.forEach((branch, lane) => {
    const first = commits.findIndex(commit => commit.branch === branch)
    const parentId = commits[first]?.parents[0]
    const parentAt = parentId === undefined ? undefined : indexOf.get(parentId)
    const parentLane = parentAt === undefined ? -1 : laneOf(commits[parentAt]?.branch ?? '')

    if (parentAt !== undefined && parentLane >= 0 && parentLane !== lane) {
      const after = forks.get(parentAt) ?? []
      after.push({ lane, parent: parentLane })
      forks.set(parentAt, after)
      start[lane] = parentAt + after.length / 100
    } else {
      start[lane] = first
    }
  })

  const [V, H, CROSS] = ascii ? ['|', '-', '+'] : ['│', '─', '┼']
  const corner = (char: string): string => (ascii ? '+' : char)
  const live = (lane: number, at: number): boolean => (start[lane] ?? Infinity) < at && (last[lane] ?? -1) > at
  const height = commits.length * 2 + lanes + 1
  const grid = gridOf(room, height)
  let y = 0

  const passes = (at: number, skip: readonly number[]): void => {
    for (let lane = 0; lane < lanes; lane++) {
      if (!skip.includes(lane) && live(lane, at)) {
        write(grid, lane * 2, y, V, series(lane))
      }
    }
  }

  // A row joining lane `a` to lane `b`, crossing the lanes still running between them.
  const connector = (at: number, a: number, aChar: string, b: number, bChar: string, tone: Tone): void => {
    passes(at, [a, b])

    for (let x = Math.min(a, b) * 2 + 1; x < Math.max(a, b) * 2; x++) {
      write(grid, x, y, x % 2 === 0 && live(x / 2, at) ? CROSS : H, tone)
    }

    write(grid, a * 2, y, corner(aChar), tone)
    write(grid, b * 2, y, corner(bChar), tone)
    y++
  }

  const seen = new Set<string>()

  commits.forEach((commit, i) => {
    const lane = laneOf(commit.branch)
    const tone = series(lane)

    if (commit.type === 'merge') {
      const source = laneOf(commit.from)
      const goesOn = (last[source] ?? -1) > i

      if (source >= 0 && source !== lane) {
        if (source > lane) {
          connector(i - 0.5, lane, '├', source, goesOn ? '┤' : '╯', series(source))
        } else {
          connector(i - 0.5, source, goesOn ? '├' : '╰', lane, '┤', series(source))
        }
      }
    }

    passes(i, [lane])
    write(grid, lane * 2, y, GLYPHS[commit.type][ascii ? 1 : 0], tone)

    const notes: Segment[] = []

    if (!seen.has(commit.branch)) {
      seen.add(commit.branch)
      notes.push(seg(commit.branch, tone))
    }

    if (commit.shown !== '') {
      notes.push(seg(commit.shown, 'fg'))
    }

    if (commit.tag !== '') {
      notes.push(seg(`[${commit.tag}]`, { slot: 'warn' }))
    }

    if (commit.type === 'merge' && commit.from !== '') {
      notes.push(seg(`merge ${commit.from}`, 'muted'))
    } else if (commit.type === 'cherry' && commit.from !== '') {
      notes.push(seg(`cherry-pick ${commit.from}`, 'muted'))
    }

    writeAll(grid, textX, y, notes.flatMap((note, k) => (k === 0 ? [note] : [seg('  '), note])))
    y++

    for (const fork of forks.get(i) ?? []) {
      const at = start[fork.lane] ?? i
      const goesOn = (last[fork.parent] ?? -1) > at

      if (fork.lane > fork.parent) {
        connector(at, fork.parent, goesOn ? '├' : '╰', fork.lane, '╮', series(fork.lane))
      } else {
        connector(at, fork.lane, '╭', fork.parent, goesOn ? '┤' : '╯', series(fork.lane))
      }
    }
  })

  return runsOf(grid)
}

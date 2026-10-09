import { gridOf, runsOf, runsOfLines, seg, write } from './art-canvas'
import type { Grid, Segment } from './art-canvas'
import { cutCell, widthOf } from './markdown'
import { formatPercent, formatValue } from './mermaid'
import { packetRows, squarify } from './mermaid-data'
import type { Packet, Rect, TreeNode, Treemap } from './mermaid-data'
import type { Run, Tone } from './mermaid-art'

// The terminal drawings for the data kinds: a treemap as boxes tiled to their share,
// coloured by section, and a packet diagram as rows of bit cells. See chart-art.ts for
// how they are chosen.

const series = (i: number): Tone => ({ series: i })

// --- Treemap ------------------------------------------------------------------------

const TREE_MAX_W = 100
// A cell is about twice as tall as it is wide, so tiles are cut in a space with rows doubled.
const CELL_ASPECT = 2

const leavesOf = (node: TreeNode): TreeNode[] => (node.children.length === 0 ? (node.value > 0 ? [node] : []) : node.children.flatMap(leavesOf))

// The tile's cells: its edges rounded, so neighbouring tiles meet without a gap or overlap.
const cellsOf = (rect: Rect) => {
  const x0 = Math.round(rect.x)
  const y0 = Math.round(rect.y / CELL_ASPECT)

  return { x0, y0, w: Math.round(rect.x + rect.w) - x0, h: Math.round((rect.y + rect.h) / CELL_ASPECT) - y0 }
}

function tile(grid: Grid, rect: Rect, leaf: TreeNode, tone: Tone, ascii: boolean): void {
  const { x0, y0, w, h } = cellsOf(rect)

  if (w < 3 || h < 2) {
    for (let y = y0; y < y0 + h; y++) {
      write(grid, x0, y, (ascii ? ':' : '░').repeat(Math.max(0, w)), tone)
    }

    return
  }

  const [tl, tr, bl, br, across, down] = ascii ? ['+', '+', '+', '+', '-', '|'] : ['┌', '┐', '└', '┘', '─', '│']
  const label = cutCell(leaf.label, w - 2)

  // The name sits in the top edge, so a tile two rows tall still says what it is.
  write(grid, x0, y0, `${tl}${label}${across.repeat(w - 2 - widthOf(label))}${tr}`, tone)
  write(grid, x0 + 1, y0, label, 'fg')

  for (let y = y0 + 1; y < y0 + h - 1; y++) {
    write(grid, x0, y, down, tone)
    write(grid, x0 + w - 1, y, down, tone)
  }

  write(grid, x0, y0 + h - 1, `${bl}${across.repeat(w - 2)}${br}`, tone)

  if (h >= 3) {
    write(grid, x0 + 1, y0 + 1, cutCell(formatValue(leaf.value), w - 2), 'muted')
  }
}

export function treemapArt(chart: Treemap, room: number, ascii: boolean): Run[][] | null {
  const width = Math.min(room, TREE_MAX_W)

  if (width < 24) {
    return null
  }

  const height = Math.max(8, Math.min(16, Math.round(width / 5)))
  const grid = gridOf(width, height)
  const plot = { x: 0, y: 0, w: width, h: height * CELL_ASPECT }
  const sections = squarify(
    chart.roots.map(root => root.value),
    plot,
  )

  chart.roots.forEach((root, i) => {
    const area = sections[i]
    const leaves = leavesOf(root)

    if (area === undefined) {
      return
    }

    const cuts = squarify(
      leaves.map(leaf => leaf.value),
      area,
    )

    leaves.forEach((leaf, k) => {
      const cut = cuts[k]

      if (cut !== undefined) {
        tile(grid, cut, leaf, series(i), ascii)
      }
    })
  })

  // The sections, in their colours, under the tiles: where the nesting shows.
  const total = chart.roots.reduce((sum, root) => sum + root.value, 0)
  const legend: Segment[][] = [[]]
  let used = 0

  chart.roots.forEach((root, i) => {
    const entry = [seg(ascii ? '#' : '■', series(i)), seg(` ${root.label} `, 'fg'), seg(`${formatValue(root.value)} · ${formatPercent(root.value / total)}`, 'muted')]
    const size = entry.reduce((sum, part) => sum + widthOf(part.text), 0)

    if (used > 0 && used + 3 + size > width) {
      legend.push([])
      used = 0
    }

    const row = legend[legend.length - 1] ?? []
    row.push(...(used > 0 ? [seg('   ')] : []), ...entry.map(part => ({ ...part, text: cutCell(part.text, width) })))
    used += (used > 0 ? 3 : 0) + size
  })

  return [...runsOf(grid), [], ...runsOfLines(legend)]
}

// --- Packet -------------------------------------------------------------------------

export function packetArt(chart: Packet, room: number, ascii: boolean): Run[][] | null {
  const perRow = room >= 32 * 2 + 1 ? 32 : 16
  const cell = Math.min(3, Math.floor((room - 1) / perRow))

  if (cell < 2) {
    return null
  }

  const rows = packetRows(chart, perRow)
  const width = perRow * cell + 1
  const grid = gridOf(width, rows.length * 4)
  const [down, across] = ascii ? ['|', '-'] : ['│', '─']
  const [tl, tm, tr, bl, bm, br] = ascii ? ['+', '+', '+', '+', '+', '+'] : ['┌', '┬', '┐', '└', '┴', '┘']
  // Fields too narrow for their names, named in full under the rows.
  const notes: Segment[][] = [[]]
  let used = 0

  const note = (piece: { field: number; start: number; end: number; label: string }) => {
    const bits = piece.start === piece.end ? `${piece.start}` : `${piece.start}-${piece.end}`
    const size = widthOf(bits) + 1 + widthOf(piece.label)

    if (used > 0 && used + 3 + size > width) {
      notes.push([])
      used = 0
    }

    notes[notes.length - 1]?.push(...(used > 0 ? [seg('   ')] : []), seg(bits, 'muted'), seg(` ${cutCell(piece.label, width)}`, series(piece.field)))
    used += (used > 0 ? 3 : 0) + size
  }

  rows.forEach((row, r) => {
    const y = r * 4
    const end = ((row[row.length - 1]?.end ?? 0) % perRow) + 1
    let free = 0

    write(grid, 0, y + 1, across.repeat(end * cell + 1), 'muted')
    write(grid, 0, y + 3, across.repeat(end * cell + 1), 'muted')

    for (const piece of row) {
      const left = (piece.start % perRow) * cell
      const right = ((piece.end % perRow) + 1) * cell
      const inner = right - left - 1
      const label = cutCell(piece.label, inner)
      const first = String(piece.start)
      const last = String(piece.end)

      write(grid, left, y + 1, left === 0 ? tl : tm, 'muted')
      write(grid, right, y + 1, right === end * cell ? tr : tm, 'muted')
      write(grid, left, y + 2, down, 'muted')
      write(grid, right, y + 2, down, 'muted')
      write(grid, left, y + 3, left === 0 ? bl : bm, 'muted')
      write(grid, right, y + 3, right === end * cell ? br : bm, 'muted')
      write(grid, left + 1 + Math.floor((inner - widthOf(label)) / 2), y + 2, label, series(piece.field))

      if (label !== piece.label && !piece.cut) {
        note(piece)
      }

      // The bit numbers over each field's edges, where they fit without running together.
      if (left >= free && left + first.length <= right) {
        free = write(grid, left, y, first, 'muted') + 1
      }

      if (piece.end !== piece.start && right - last.length >= free) {
        free = write(grid, right - last.length + 1, y, last, 'muted') + 1
      }
    }
  })

  return used === 0 ? runsOf(grid) : [...runsOf(grid), [], ...runsOfLines(notes)]
}

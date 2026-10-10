import type { Align, Table } from './markdown'
import type { Palette } from './skin'
import { CONTROL_SLOT, escape, HEADER_MID, measure as measureAt, MONO, riseDelay, staggerEnd, staggerStep, svgCard } from './svg-kit'

// A table as an animated vector card in the skin's colours, with no background of its
// own so the page shows through, for the surfaces that draw `Svg` (the desktop app).
// Long cells wrap onto more lines instead of being cut, so nothing is hidden: the
// desktop draws the card as an image, which cannot show a tooltip on hover.

const SIZE = 15
const LINE_H = 21
const HEADER_H = 58
const ROW_PAD_Y = 12
const MIN_ROW_H = 44
const MAX_CELL_LINES = 6
const PAD_X = 24
const COL_GAP = 28
const MIN_COL = 56
const MIN_WIDTH = 420
const MAX_WIDTH = 1600
const STAGGER_MS = 60
const ROW_START_MS = 120
const ROW_RISE_MS = 500
const RULE_DELAY_MS = 50
const RULE_MS = 800

export type SvgTable = { source: string; width: number; height: number; alt: string; entranceMs: number }

type CellKind = 'text' | 'code' | 'number' | 'colour' | 'diff'

const HEX = /^#[0-9a-f]{6}$/i
const DIFF = /^\+(\d+)\s*[−-](\d+)$/
const NUMBER = /^[+−-]?[$€£]?\d[\d.,]*\s?(%|ms|s|min|h|kb|mb|gb|x|×)?$/i
const CODE = /^[^\s]*[/_.:@][^\s]*$/

export const kindOfCell = (cell: string): CellKind => {
  const text = cell.trim()

  if (HEX.test(text)) {
    return 'colour'
  }

  if (DIFF.test(text)) {
    return 'diff'
  }

  if (NUMBER.test(text)) {
    return 'number'
  }

  return CODE.test(text) && text.length > 1 ? 'code' : 'text'
}

// Width of a string in pixels at the table's type size.
export const measure = (text: string, isMono: boolean): number => measureAt(text, isMono, SIZE)

const isMonoKind = (kind: CellKind): boolean => kind !== 'text'

// Splits a word too long for its column into pieces that each fit.
function breakWord(word: string, width: number, isMono: boolean): string[] {
  const pieces: string[] = []
  let piece = ''

  for (const char of word) {
    if (piece !== '' && measure(piece + char, isMono) > width) {
      pieces.push(piece)
      piece = char
    } else {
      piece += char
    }
  }

  return piece === '' ? pieces : [...pieces, piece]
}

// The cell's text as lines that fit its column; past the cap, the last line ends in `…`.
export function wrapCell(text: string, width: number, isMono: boolean, maxLines = MAX_CELL_LINES): string[] {
  const lines: string[] = []
  let line = ''

  for (const word of text.split(/\s+/).filter(Boolean)) {
    const candidate = line === '' ? word : `${line} ${word}`

    if (measure(candidate, isMono) <= width) {
      line = candidate
      continue
    }

    if (line !== '') {
      lines.push(line)
    }

    const pieces = measure(word, isMono) <= width ? [word] : breakWord(word, width, isMono)
    lines.push(...pieces.slice(0, -1))
    line = pieces.at(-1) ?? ''
  }

  const all = line === '' ? lines : [...lines, line]

  if (all.length <= maxLines) {
    return all.length === 0 ? [''] : all
  }

  const kept = all.slice(0, maxLines)
  const last = kept[maxLines - 1] ?? ''
  const chars = [...last]

  while (chars.length > 0 && measure(`${chars.join('')}…`, isMono) > width) {
    chars.pop()
  }

  return [...kept.slice(0, -1), `${chars.join('')}…`]
}

function naturalWidths(table: Table): number[] {
  return table.header.map((header, col) => {
    const cells = table.rows.map(row => row[col] ?? '')
    const widest = Math.max(
      measure(header.toUpperCase(), false) * 0.85,
      ...cells.map(cell => measure(cell, isMonoKind(kindOfCell(cell))) + (kindOfCell(cell) === 'colour' ? 22 : 0)),
    )

    return Math.max(MIN_COL, Math.ceil(widest))
  })
}

// Columns that fit their fair share keep their natural width; the rest share what is
// left in proportion to how much they hold, and wrap. With room to spare, every column
// stretches in proportion, so the card spans its width.
export function fitColumns(natural: readonly number[], width: number, reserve = 0): number[] {
  const room = width - PAD_X * 2 - reserve - COL_GAP * (natural.length - 1)
  const total = natural.reduce((sum, w) => sum + w, 0)

  if (total <= room) {
    return natural.map(w => w + ((room - total) * w) / total)
  }

  const fair = room / natural.length
  const fixed = natural.reduce((sum, w) => sum + (w <= fair ? w : 0), 0)
  const flexTotal = natural.reduce((sum, w) => sum + (w > fair ? w : 0), 0)
  const flexRoom = Math.max(0, room - fixed)

  return natural.map(w => (w <= fair ? w : Math.max(MIN_COL, (flexRoom * w) / flexTotal)))
}

const anchorOf = (align: Align): string => (align === 'right' ? 'end' : align === 'center' ? 'middle' : 'start')

const xOf = (left: number, width: number, align: Align): number =>
  align === 'right' ? left + width : align === 'center' ? left + width / 2 : left

type Cell = { kind: CellKind; text: string; lines: string[] }

function layoutCell(text: string, width: number): Cell {
  const kind = kindOfCell(text)
  const isWrapped = kind === 'text' || kind === 'code'

  return { kind, text, lines: isWrapped ? wrapCell(text, width, kind === 'code') : [text] }
}

function cellMarkup(cell: Cell, left: number, width: number, align: Align, rowH: number, palette: Palette): string {
  const isMono = isMonoKind(cell.kind)
  const font = isMono ? `font-family="${MONO}" font-size="${SIZE - 0.5}"` : ''
  const blockH = cell.lines.length * LINE_H
  const firstY = (rowH - blockH) / 2 + LINE_H / 2 + 5
  const middle = rowH / 2

  if (cell.kind === 'colour') {
    const x = align === 'right' ? left + width - measure(cell.text, true) - 22 : left

    return `<circle cx="${x + 6}" cy="${middle}" r="6" fill="${cell.text}" stroke="${palette.muted}"/><text x="${x + 22}" y="${middle + 5}" ${font} fill="${palette.fg}">${escape(cell.text)}</text>`
  }

  if (cell.kind === 'diff') {
    const [, added = '0', removed = '0'] = DIFF.exec(cell.text.trim()) ?? []

    return `<text x="${xOf(left, width, align)}" y="${middle + 5}" text-anchor="${anchorOf(align)}" ${font}><tspan fill="${palette.ok}">+${added}</tspan><tspan fill="${palette.muted}"> </tspan><tspan fill="${palette.err}">−${removed}</tspan></text>`
  }

  return cell.lines
    .map(
      (line, i) =>
        `<text x="${xOf(left, width, align)}" y="${firstY + i * LINE_H}" text-anchor="${anchorOf(align)}" ${font} fill="${palette.fg}" class="${cell.kind === 'number' ? 'num' : ''}">${escape(line)}</text>`,
    )
    .join('')
}

// `width` is the room the reply gives the card, in pixels; it is clamped to a sane range.
// `hasControl` keeps a gutter at the right for a Copy button laid over the header.
export function tableSvg(table: Table, palette: Palette, width: number, hasControl = false): SvgTable {
  const cardWidth = Math.round(Math.min(MAX_WIDTH, Math.max(MIN_WIDTH, width)))
  const reserve = hasControl ? CONTROL_SLOT : 0
  const widths = fitColumns(naturalWidths(table), cardWidth, reserve)
  const lefts = widths.map((_, i) => PAD_X + widths.slice(0, i).reduce((sum, w) => sum + w + COL_GAP, 0))
  const align = (i: number): Align => table.align[i] ?? 'left'
  const step = staggerStep(table.rows.length, STAGGER_MS)

  const laid = table.rows.map(row => row.map((cell, i) => layoutCell(cell, (widths[i] ?? MIN_COL) - (kindOfCell(cell) === 'colour' ? 22 : 0))))
  const heights = laid.map(cells => Math.max(MIN_ROW_H, Math.max(...cells.map(cell => cell.lines.length)) * LINE_H + ROW_PAD_Y * 2))
  const tops = heights.map((_, r) => HEADER_H + heights.slice(0, r).reduce((sum, h) => sum + h, 0))
  const height = HEADER_H + heights.reduce((sum, h) => sum + h, 0) + 6

  const header = table.header
    .map((cell, i) => {
      const [text = ''] = wrapCell(cell.toUpperCase(), widths[i] ?? MIN_COL, false, 1)

      return `<text x="${xOf(lefts[i] ?? 0, widths[i] ?? 0, align(i))}" y="${HEADER_MID + 4}" text-anchor="${anchorOf(align(i))}" class="head">${escape(text)}</text>`
    })
    .join('')

  const rows = laid
    .map((cells, r) => {
      const rowH = heights[r] ?? MIN_ROW_H
      const markup = cells.map((cell, i) => cellMarkup(cell, lefts[i] ?? 0, widths[i] ?? 0, align(i), rowH, palette)).join('')
      const band = r % 2 === 1 ? `fill="${palette.fg}" fill-opacity=".05"` : 'fill="none"'

      // The outer group places the row; the inner one rises relative to that place.
      return `<g transform="translate(0 ${tops[r] ?? 0})"><g class="row" ${riseDelay(r, step, ROW_START_MS)}><rect class="bg" x="0" y="0" width="${cardWidth}" height="${rowH}" ${band}/>${markup}</g></g>`
    })
    .join('')

  const style = [
    `text{font-size:${SIZE}px}`,
    `.head{font-size:12px;font-weight:600;letter-spacing:.1em;fill:${palette.muted}}`,
    `.num{font-variant-numeric:tabular-nums}`,
    `.row{opacity:0;animation:rise ${ROW_RISE_MS}ms cubic-bezier(.2,.8,.2,1) forwards}`,
    `.rule{stroke-dasharray:${cardWidth};stroke-dashoffset:${cardWidth};animation:draw ${RULE_MS}ms cubic-bezier(.6,0,.2,1) ${RULE_DELAY_MS}ms forwards}`,
    `@keyframes rise{from{opacity:0;transform:translateY(6px)}to{opacity:1}}`,
    `@keyframes draw{to{stroke-dashoffset:0}}`,
    `@media (prefers-reduced-motion:reduce){.row,.rule{animation:none;opacity:1;stroke-dashoffset:0}}`,
  ].join('')

  const body = [
    header,
    `<line class="rule" x1="${PAD_X}" y1="${HEADER_H - 1}" x2="${cardWidth - PAD_X - reserve}" y2="${HEADER_H - 1}" stroke="${palette.user}" stroke-width="1" stroke-linecap="square"/>`,
    rows,
  ].join('')

  return {
    source: svgCard(cardWidth, height, palette, style, body),
    width: cardWidth,
    height,
    alt: [table.header.join(' | '), ...table.rows.map(row => row.join(' | '))].join('\n'),
    entranceMs: Math.max(staggerEnd(table.rows.length, step, ROW_START_MS, ROW_RISE_MS), RULE_DELAY_MS + RULE_MS),
  }
}

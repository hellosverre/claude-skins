import { renderMermaidAscii, seriesColors, setChartSize } from './vendor/mermaid-ascii.js'
import type { AsciiTheme } from './vendor/mermaid-ascii.js'
import { widthOf } from './markdown'

// A Mermaid fence laid out in two dimensions by beautiful-mermaid's terminal renderer,
// then handed back as runs of text tagged with what they draw, so the skin can colour
// them: each box its own colour, the links quiet, the arrowheads and labels plain.

export type Tone = 'fg' | 'muted' | 'title' | { box: number } | { series: number }

export interface Run {
  text: string
  tone: Tone | null
}

export interface Art {
  kind: string
  rows: Run[][]
}

const KINDS: readonly (readonly [RegExp, string])[] = [
  [/^(flowchart|graph)\b/i, 'Flowchart'],
  [/^statediagram(-v2)?\s*$/i, 'State'],
  [/^sequencediagram\s*$/i, 'Sequence'],
  [/^classdiagram\s*$/i, 'Class'],
  [/^erdiagram\s*$/i, 'ER'],
  [/^xychart(-beta)?\b/i, 'Chart'],
]

const MAX_LINES = 80
const MAX_CHARS = 8000
const MAX_ROWS = 120
const CACHE_SIZE = 64

// Colours no theme uses, one per role, so the renderer's HTML output says what each
// cell is.
const SENTINEL: AsciiTheme = {
  fg: '#000001',
  border: '#000002',
  line: '#000003',
  arrow: '#000004',
  corner: '#000005',
  junction: '#000006',
  accent: '#000007',
  bg: '#000000',
}

type Role = 'text' | 'border' | 'line' | 'arrow'

const ROLE_OF: Readonly<Record<string, Role>> = {
  [SENTINEL.fg]: 'text',
  [SENTINEL.border]: 'border',
  [SENTINEL.line]: 'line',
  [SENTINEL.arrow]: 'arrow',
  [SENTINEL.corner ?? '']: 'line',
  [SENTINEL.junction ?? '']: 'border',
}

interface Cell {
  char: string
  role: Role | null
  series?: number
}

// Diamond corners come back as label text; they belong to the box.
const BOX_GLYPHS = new Set(['◇'])

const cache = new Map<string, Art | null>()

// What kind of diagram the renderer draws for `source`, or null for one it does not.
export function artKind(source: string): string | null {
  const header = source.trim().split(/\r?\n/, 1)[0]?.trim() ?? ''

  return KINDS.find(([pattern]) => pattern.test(header))?.[1] ?? null
}

// `source` drawn to fit `columns`, or null where it cannot be: unsupported, malformed,
// too long, or too wide even top to bottom. The fence then shows as code.
export function mermaidArt(source: string, columns: number, ascii: boolean): Art | null {
  const key = `${ascii ? 'a' : 'u'}|${columns}|${source}`

  if (cache.has(key)) {
    return cache.get(key) ?? null
  }

  const art = drawArt(source, columns, ascii)

  if (cache.size >= CACHE_SIZE) {
    cache.delete(cache.keys().next().value ?? '')
  }

  cache.set(key, art)

  return art
}

function drawArt(source: string, columns: number, ascii: boolean): Art | null {
  const kind = artKind(source)
  const text = source.trim().replace(/\r\n?/g, '\n')

  if (kind === null || text.length > MAX_CHARS || text.split('\n').length > MAX_LINES) {
    return null
  }

  const room = columns - 2
  // Left to right first where asked; a wide one is tried again top to bottom.
  const attempts = kind === 'Flowchart' && /^(flowchart|graph)\s+(LR|RL)\b/i.test(text)
    ? [text, text.replace(/^(flowchart|graph)\s+(LR|RL)\b/i, '$1 TD')]
    : [text]

  for (const attempt of attempts) {
    const grid = render(attempt, kind, room, ascii)

    // The renderer draws what it cannot read as nothing rather than throwing.
    if (grid === null || grid.length === 0) {
      return null
    }

    if (grid.length <= MAX_ROWS && grid.every(row => widthOf(row.map(cell => cell.char).join('')) <= room)) {
      return { kind, rows: paint(grid, kind) }
    }
  }

  return null
}

function render(text: string, kind: string, room: number, ascii: boolean): Cell[][] | null {
  if (kind === 'Chart') {
    const width = Math.max(24, Math.min(60, room - 10))
    setChartSize(width, Math.max(8, Math.min(16, Math.round(width * 0.3))))
  }

  try {
    const html = renderMermaidAscii(text, { useAscii: ascii, paddingX: 4, paddingY: 2, colorMode: 'html', theme: SENTINEL })
    const series = new Map(seriesColors(8, SENTINEL).map((hex, i) => [hex.toLowerCase(), i]))
    series.set(SENTINEL.accent ?? '', 0)

    return trimGrid(html.split('\n').map(line => cellsOf(line, series)))
  } catch {
    return null
  }
}

const unescape = (text: string): string => text.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')

// One line of the renderer's HTML as cells, each with the role its colour names.
function cellsOf(line: string, series: ReadonlyMap<string, number>): Cell[] {
  const cells: Cell[] = []
  const span = /<span style="color:(#[0-9a-fA-F]{6})">(.*?)<\/span>/g
  let at = 0

  const plain = (text: string) => {
    for (const char of unescape(text)) {
      cells.push({ char, role: null })
    }
  }

  for (const match of line.matchAll(span)) {
    plain(line.slice(at, match.index))
    const hex = (match[1] ?? '').toLowerCase()
    const role = ROLE_OF[hex]
    const index = role === undefined ? series.get(hex) : undefined

    for (const char of unescape(match[2] ?? '')) {
      cells.push(index === undefined ? { char, role: role ?? 'text' } : { char, role: null, series: index })
    }

    at = (match.index ?? 0) + match[0].length
  }

  plain(line.slice(at))

  return cells
}

// Trailing blanks off every row, and blank rows off both ends.
function trimGrid(grid: Cell[][]): Cell[][] {
  const rows = grid.map(row => {
    let end = row.length

    while (end > 0 && row[end - 1]?.char === ' ') {
      end--
    }

    return row.slice(0, end)
  })

  while (rows.length > 0 && rows[0]?.length === 0) {
    rows.shift()
  }

  while (rows.length > 0 && rows[rows.length - 1]?.length === 0) {
    rows.pop()
  }

  return rows
}

// --- Colour ------------------------------------------------------------------------

function paint(grid: Cell[][], kind: string): Run[][] {
  const boxes = kind === 'Chart' ? null : boxColours(grid)
  const titleRow = kind === 'Chart' ? grid.findIndex(row => row.some(cell => cell.role === 'text')) : -1

  return grid.map((row, y) => {
    const runs: Run[] = []

    row.forEach((cell, x) => {
      const tone = toneOf(cell, boxes?.get(`${x},${y}`), y === titleRow)
      const last = runs[runs.length - 1]

      if (last !== undefined && sameTone(last.tone, tone)) {
        last.text += cell.char
      } else {
        runs.push({ text: cell.char, tone })
      }
    })

    return runs
  })
}

function toneOf(cell: Cell, box: number | undefined, title: boolean): Tone | null {
  if (cell.series !== undefined) {
    return { series: cell.series }
  }

  if (box !== undefined) {
    return { box }
  }

  switch (cell.role) {
    case 'text':
      return title ? 'title' : 'fg'
    case 'arrow':
      return 'fg'
    case 'border':
    case 'line':
      return 'muted'
    default:
      return null
  }
}

const sameTone = (a: Tone | null, b: Tone | null): boolean =>
  a === b || (typeof a === 'object' && typeof b === 'object' && a !== null && b !== null && JSON.stringify(a) === JSON.stringify(b))

const isBorder = (cell: Cell | undefined): boolean =>
  cell !== undefined && (cell.role === 'border' || (cell.role === 'text' && BOX_GLYPHS.has(cell.char)))

// Every box outline found, its cells mapped to a colour index. Outlines with the same
// label inside share one, so an actor drawn at both ends of a sequence matches itself.
function boxColours(grid: Cell[][]): Map<string, number> {
  const seen = new Set<string>()
  const colours = new Map<string, number>()
  const byLabel = new Map<string, number>()

  grid.forEach((row, y) => {
    row.forEach((cell, x) => {
      if (!isBorder(cell) || seen.has(`${x},${y}`)) {
        return
      }

      const outline = floodBorder(grid, x, y, seen)
      const label = labelInside(grid, outline)
      const colour = byLabel.get(label) ?? byLabel.size

      byLabel.set(label, colour)
      outline.forEach(([cx, cy]) => colours.set(`${cx},${cy}`, colour))
    })
  })

  return colours
}

function floodBorder(grid: Cell[][], x: number, y: number, seen: Set<string>): [number, number][] {
  const outline: [number, number][] = []
  const stack: [number, number][] = [[x, y]]
  seen.add(`${x},${y}`)

  while (stack.length > 0) {
    const [cx, cy] = stack.pop() ?? [0, 0]
    outline.push([cx, cy])

    for (const [nx, ny] of [[cx + 1, cy], [cx - 1, cy], [cx, cy + 1], [cx, cy - 1]] as const) {
      if (!seen.has(`${nx},${ny}`) && isBorder(grid[ny]?.[nx])) {
        seen.add(`${nx},${ny}`)
        stack.push([nx, ny])
      }
    }
  }

  return outline
}

function labelInside(grid: Cell[][], outline: readonly [number, number][]): string {
  const xs = outline.map(([x]) => x)
  const ys = outline.map(([, y]) => y)
  const [left, right, top, bottom] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]
  let label = ''

  for (let y = top + 1; y < bottom; y++) {
    for (let x = left + 1; x < right; x++) {
      const cell = grid[y]?.[x]
      label += cell?.role === 'text' ? cell.char : ' '
    }
  }

  return label.replace(/\s+/g, ' ').trim() || `@${left},${top}`
}

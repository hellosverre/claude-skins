import type { Palette, Slot } from './skin'
import { escape, fitText, measure } from './svg-kit'

// What the chart cards share: the header band's height, the inset, the order the skin's
// accent slots colour series, slices, sections and branches in, and text placement.

export const HEADER_H = 56
export const PAD = 24

export type Body = { body: string; height: number }

const SERIES: readonly Slot[] = ['user', 'read', 'ok', 'warn', 'web', 'mcp', 'search', 'err']

export const seriesColor = (palette: Palette, i: number): string => palette[SERIES[i % SERIES.length] ?? 'user']

export const text = (x: number, y: number, body: string, attrs = ''): string => `<text x="${x}" y="${y}"${attrs === '' ? '' : ` ${attrs}`}>${escape(body)}</text>`

// `body` broken at spaces into lines `width` wide at `size`, `most` at most, the last
// cut short where text is left over.
export function wrapText(body: string, width: number, size: number, most: number): string[] {
  const lines: string[] = []
  let current = ''

  for (const word of body.split(' ').filter(word => word !== '')) {
    const next = current === '' ? word : `${current} ${word}`

    if (measure(next, false, size) <= width || current === '') {
      current = next
    } else {
      lines.push(current)
      current = word
    }
  }

  if (current !== '') {
    lines.push(current)
  }

  const kept = lines.slice(0, most)

  if (lines.length > most) {
    kept[most - 1] = `${kept[most - 1] ?? ''} ${lines.slice(most).join(' ')}`
  }

  return kept.map(line => fitText(line, width, false, size))
}

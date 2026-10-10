import type { UsageSnap } from '../types'
import type { Palette } from './skin'
import { escape, FONT } from './svg-kit'

// The band above the prompt: how full the context window is and how much of each plan
// limit is spent, as rings that fill in when they draw.

const RING_R = 9
const FILL_MS = 900
const ITEM_W = 132

export type Meter = { label: string; percent: number }

// `five_hour` reads as `5h`, `seven_day` as `7d`; any other kind as its own name.
export function limitLabel(kind: string): string {
  const name = kind.toLowerCase()

  if (name.includes('five') || name.includes('5h') || name.includes('5_h')) {
    return '5h'
  }

  if (name.includes('seven') || name.includes('7d') || name.includes('week')) {
    return '7d'
  }

  return name.replace(/_/g, ' ')
}

export function metersOf(usage: UsageSnap): Meter[] {
  return [
    ...(usage.context === null ? [] : [{ label: 'context', percent: usage.context }]),
    ...usage.limits.map(limit => ({ label: limit.label, percent: limit.percent })),
  ].map(meter => ({ ...meter, percent: Math.max(0, Math.min(100, Math.round(meter.percent))) }))
}

// Accent while there is room; the warning colour from 80 %, the error colour from 95 %.
export const meterColor = (percent: number, palette: Palette): string =>
  percent >= 95 ? palette.err : percent >= 80 ? palette.warn : palette.user

export function usageSvg(meters: readonly Meter[], palette: Palette): { source: string; width: number; height: number; alt: string; entranceMs: number } {
  const width = meters.length * ITEM_W
  const height = 30
  const circumference = 2 * Math.PI * RING_R

  const items = meters
    .map((meter, i) => {
      const x = i * ITEM_W + RING_R + 4
      const filled = (circumference * meter.percent) / 100
      const color = meterColor(meter.percent, palette)

      return [
        `<circle cx="${x}" cy="15" r="${RING_R}" fill="none" stroke="${palette.muted}" stroke-opacity=".25" stroke-width="3"/>`,
        `<circle class="fill" cx="${x}" cy="15" r="${RING_R}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round" stroke-dasharray="${filled} ${circumference}" transform="rotate(-90 ${x} 15)" style="--len:${filled}"/>`,
        `<text x="${x + RING_R + 8}" y="19.5" font-size="12.5"><tspan style="fill:${palette.fg};font-weight:600">${meter.percent}%</tspan><tspan style="fill:${palette.muted}"> ${escape(meter.label)}</tspan></text>`,
      ].join('')
    })
    .join('')

  const style = [
    `text{font-family:${FONT}}`,
    `.fill{animation:fill ${FILL_MS}ms cubic-bezier(.2,.8,.2,1)}`,
    '@keyframes fill{from{stroke-dasharray:0 100}}',
    '@media (prefers-reduced-motion:reduce){.fill{animation:none}}',
  ].join('')

  return {
    source: `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}"><style>${style}</style>${items}</svg>`,
    width,
    height,
    alt: meters.map(meter => `${meter.label} ${meter.percent}%`).join(', '),
    entranceMs: FILL_MS,
  }
}

// The terminal's version: one line of block meters.
export function usageLine(meters: readonly Meter[]): { label: string; bar: string; percent: number }[] {
  return meters.map(meter => {
    const filled = Math.round(meter.percent / 12.5)

    return { label: meter.label, bar: '▰'.repeat(filled) + '▱'.repeat(8 - filled), percent: meter.percent }
  })
}

import { expect, test } from 'claude-code/testing'

import { commandSegments } from '../hooks/command-output'
import { splitReply } from '../hooks/markdown'
import { inlineMath, linear, mathArt, parseTex } from '../hooks/math'
import { mathSvg } from '../hooks/svg-math'
import tokyoNight from '../hooks/themes/tokyo-night'

const line = (tex: string): string => linear(parseTex(tex))

const MATH = { tables: true, fence: () => true, math: true }

test('TeX reads as one line of Unicode', () => {
  expect(line('x^2 + y^2 = z^2')).toBe('x² + y² = z²')
  expect(line('\\alpha \\leq \\beta')).toBe('α ≤ β')
  expect(line('\\frac{1}{2}')).toBe('½')
  expect(line('\\frac{a+b}{c}')).toBe('(a + b)/c')
  expect(line('\\sqrt{x}')).toBe('√x')
  expect(line('\\mathbb{R}')).toBe('ℝ')
  expect(line('a \\neq b')).toBe('a ≠ b')
})

test('the parser never throws, and keeps a command it does not know', () => {
  expect(() => parseTex('\\frac{')).not.toThrow()
  expect(() => parseTex('}{^_&\\\\')).not.toThrow()
  expect(line('\\unknowncmd x')).toContain('\\unknowncmd')
})

test('the terminal stacks a fraction and falls back to one line when narrow', () => {
  const art = mathArt(parseTex('\\frac{a+b}{c}'), 80)

  expect(art.length).toBe(3)
  expect(art[0]).toContain('a + b')
  expect(art[1]).toMatch(/─{3,}/)
  expect(art[2]).toContain('c')

  const sum = mathArt(parseTex('\\sum_{i=1}^{n} i^2'), 80)
  expect(sum.length).toBeGreaterThan(1)
  expect(sum.join('\n')).toContain('∑')

  expect(mathArt(parseTex('\\frac{aaaaaaaaaaaa}{b} + \\frac{cccccccccccc}{d}'), 8)).toEqual([line('\\frac{aaaaaaaaaaaa}{b} + \\frac{cccccccccccc}{d}')])
})

test('inline maths turns into Unicode, prices and code stay as written', () => {
  expect(inlineMath('where $x^2$ grows')).toBe('where x² grows')
  expect(inlineMath('and \\(\\alpha\\) too')).toBe('and α too')
  expect(inlineMath('It costs $5 and $10 now')).toBe('It costs $5 and $10 now')
  expect(inlineMath('run `echo $x^2$` here')).toBe('run `echo $x^2$` here')
})

test('display formulas come out of a reply as their own segments', () => {
  const kinds = (text: string) => splitReply(text, MATH).map(segment => segment.kind)

  expect(kinds('Euler:\n\n$$\ne^{i\\pi} + 1 = 0\n$$\n\ndone')).toEqual(['text', 'math', 'text'])
  expect(kinds('$$ a^2 + b^2 $$')).toEqual(['math'])
  expect(kinds('\\[\nx = 1\n\\]')).toEqual(['math'])
  expect(kinds('```math\n\\int_0^1 x\\,dx\n```')).toEqual(['math'])
  // Still streaming, or broken by a paragraph: text until it closes.
  expect(kinds('$$\ne^{i\\pi}')).toEqual(['text'])
  expect(kinds('$$\na\n\nb\n$$')).toEqual(['text'])
  // Off, the same reply stays text.
  expect(splitReply('$$ a^2 $$', { tables: true, fence: () => true }).map(segment => segment.kind)).toEqual(['text'])

  const [formula] = splitReply('$$\nx^2\n$$', MATH)
  expect(formula).toEqual({ kind: 'math', tex: '\nx^2\n', raw: '$$\nx^2\n$$' })
})

test('a formula card has a header, a divider, paths for radicals and an alt in Unicode', () => {
  const card = mathSvg('\\sqrt{\\frac{a}{b}} = \\left( \\frac{x}{y} \\right)', tokyoNight.palette, 800, true)

  expect(card.source).toContain('MATH')
  expect(card.source).toContain('<line')
  expect(card.source).toContain('<path')
  expect(card.width).toBeGreaterThanOrEqual(480)
  expect(card.width).toBeLessThanOrEqual(800)
  expect(card.alt.startsWith('math:\n')).toBe(true)

  // A long formula scales down to the card rather than spilling out of it.
  const wide = mathSvg(Array.from({ length: 40 }, (_, i) => `x_{${i}}`).join(' + '), tokyoNight.palette, 600)
  expect(wide.width).toBe(600)
  expect(wide.source).toMatch(/scale\(0\.\d+\)/)
})

test('command output: pairs become a table, prose and a lone pair do not', () => {
  const cost = commandSegments('Total cost:            $0.42\nTotal duration (API):  1m 3s\nTotal code changes:    12 lines', 'cost')

  expect(cost?.map(segment => segment.kind)).toEqual(['table'])
  expect(cost?.[0]).toMatchObject({ header: ['cost', ''], rows: [['Total cost', '$0.42'], ['Total duration (API)', '1m 3s'], ['Total code changes', '12 lines']] })

  expect(commandSegments('Compacted the conversation.', 'compact')).toBeNull()
  expect(commandSegments('Model: opus', 'model')).toBeNull()
  expect(commandSegments('\u001b[2mA:\u001b[0m 1\nB: 2', 'x')?.[0]).toMatchObject({ rows: [['A', '1'], ['B', '2']] })
  expect(commandSegments('Usage\n\n| a | b |\n|---|---|\n| 1 | 2 |', 'context')?.map(segment => segment.kind)).toEqual(['text', 'table'])
})

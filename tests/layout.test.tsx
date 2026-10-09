import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { fenceDiff, newOnly } from '../hooks/diff-fence'
import { DEFAULT_PREFS } from '../hooks/command'
import { replySegments } from '../hooks/reply'
import noir from '../hooks/themes/noir'

// Diff fences, blocks side by side, and `$.skins.markdown` for other mods.

const STOCK: RenderElement = { type: 'Text', props: {}, children: ['stock row'] }

function stub(on: On, copied: string[] = []) {
  mock.clock(on, { now: 10_000 })
  on('session.cwd', () => ({ value: '/work' }))
  on('env.get', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.copy', ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [] } }))
  on('ui.render', () => STOCK)
}

const skin = ($: Engine, args: string) =>
  $.command.run({ command: 'skin', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

const reply = (text: string, surface: 'terminal' | 'desktop' = 'terminal', columns = 100, requestId = 'm1') =>
  ({ plugin: 'skins', viewport: { columns, rows: 30 }, surface, component: 'AssistantMessage', requestId, props: { text, isFirstOfReply: true } }) as const

type Node = { type?: string; props: Record<string, unknown>; children?: readonly unknown[] }

const DIFF = '```diff\n--- a/src/limit.ts\n+++ b/src/limit.ts\n@@ -10,3 +10,3 @@\n export function limit(n: number) {\n-  return n < 10\n+  return n <= 10\n }\n```'

test('a diff fence reads its hunks, numbered from its headers or from 1', () => {
  const headed = fenceDiff('--- a/x.ts\n+++ b/x.ts\n@@ -4,2 +4,3 @@\n keep\n-old\n+new\n+more')
  expect(headed?.path).toBe('x.ts')
  expect(headed?.hunks).toEqual([{ oldStart: 4, newStart: 4, lines: [' keep', '-old', '+new', '+more'] }])
  expect(newOnly(headed!)).toBe('keep\nnew\nmore')

  const bare = fenceDiff('-a\n+b\n c')
  expect(bare?.hunks).toEqual([{ oldStart: 1, newStart: 1, lines: ['-a', '+b', ' c'] }])
  expect(bare?.path).toBe('')

  expect(fenceDiff('no change here\nat all')).toBeNull()
})

test('a diff fence on the terminal is numbered rows in the skin’s colours, with copy new only', async ($, on) => {
  const copied: string[] = []
  stub(on, copied)

  const ui = await $.ui.mount(reply(DIFF))
  const added = (await ui.find({ type: 'Text', text: /11 \+ {3}return n <= 10/ })) as Node | undefined
  expect(added).toBeDefined()
  expect(JSON.stringify(added)).toContain(noir.palette.ok)
  expect(await ui.find({ type: 'Text', text: /11 {4}- {3}return n < 10/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /src\/limit\.ts/ })).toBeDefined()

  await ui.press({ key: 'copy-0-new' })
  expect(copied).toEqual(['export function limit(n: number) {\n  return n <= 10\n}'])
})

test('a diff fence on the desktop is the diff card, with copy new only under it', async ($, on) => {
  stub(on)

  const ui = await $.ui.mount(reply(DIFF, 'desktop'))
  const card = (await ui.find({ type: 'Svg' })) as Node | undefined
  expect(card?.props.alt).toBe('src/limit.ts: +1 −1')
  expect(await ui.find({ key: 'copy-0-new' })).toBeDefined()
})

const SMALL = (name: string) => `| ${name} | n |\n|---|---|\n| a | 1 |\n| b | 2 |`

// The Box rows in a drawing that hold more than one block.
async function sideBySide(ui: { findAll: (q: { type: string }) => Promise<unknown[]> }): Promise<Node[]> {
  return ((await ui.findAll({ type: 'Box' })) as Node[]).filter(box => box.props.columnGap === 2 && box.props.flexDirection === 'row')
}

test('small tables in a row sit side by side on a wide terminal and stack on a narrow one', async ($, on) => {
  stub(on)
  const text = `${SMALL('left')}\n\n${SMALL('right')}\n\nAfter.`

  const wide = await $.ui.mount(reply(text, 'terminal', 100))
  const rows = await sideBySide(wide)
  expect(rows).toHaveLength(1)
  expect(rows[0]?.children).toHaveLength(2)
  expect(await wide.find({ type: 'Text', text: 'left' })).toBeDefined()
  expect(await wide.find({ type: 'Text', text: 'right' })).toBeDefined()
  await wide.unmount()

  const narrow = await $.ui.mount(reply(text, 'terminal', 24, 'm2'))
  expect(await sideBySide(narrow)).toHaveLength(0)
})

test('prose between two tables keeps them apart', async ($, on) => {
  stub(on)

  const ui = await $.ui.mount(reply(`${SMALL('left')}\n\nBetween them.\n\n${SMALL('right')}`))
  expect(await sideBySide(ui)).toHaveLength(0)
})

test('on the desktop two table cards share a wide window and stack in a narrow one', async ($, on) => {
  stub(on)
  const text = `${SMALL('left')}\n\n${SMALL('right')}`

  const wide = await $.ui.mount(reply(text, 'desktop', 200))
  expect(await sideBySide(wide)).toHaveLength(1)
  expect(await wide.findAll({ type: 'Svg' })).toHaveLength(2)
  await wide.unmount()

  const narrow = await $.ui.mount(reply(text, 'desktop', 120, 'm2'))
  expect(await sideBySide(narrow)).toHaveLength(0)
})

test('$.skins.markdown shares the reply path: what it draws and what it leaves', () => {
  const prefs = { ...DEFAULT_PREFS }

  // The kit cannot raise a plugin noun's event from a test (the host lets only a module that
  // calls a noun call it), so this checks the choice the noun and replies share.
  expect(replySegments(`Totals:\n\n${SMALL('left')}`, prefs, 'terminal')?.map(segment => segment.kind)).toEqual(['text', 'table'])
  expect(replySegments('Just words.', prefs, 'desktop')).toBeNull()
  expect(replySegments('Just words.', prefs, 'terminal')?.map(segment => segment.kind)).toEqual(['text'])
  expect(replySegments(SMALL('left'), { ...prefs, tables: 'off', markdown: false }, 'terminal')).toBeNull()
  expect(replySegments('```bash\nls\n```', prefs, 'desktop')).toBeNull()
})

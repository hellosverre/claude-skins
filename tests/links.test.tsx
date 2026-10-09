import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { inlineRuns } from '../hooks/blocks'
import { hyperlinksFrom, safeHref, touchOf } from '../hooks/links'
import { tableArt } from '../hooks/markdown'
import noir from '../hooks/themes/noir'

// Links, this turn's files, copy controls and folding.

const SITE = { plugin: 'skins', viewport: { columns: 100, rows: 30 } } as const
const STOCK: RenderElement = { type: 'Text', props: {}, children: ['stock row'] }

function stub(on: On, env: Record<string, string> = {}, copied: string[] = []) {
  mock.clock(on, { now: 10_000 })
  on('session.cwd', () => ({ value: '/work' }))
  on('env.get', ($, e) => ({ value: env[e.name] }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.copy', ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [] } }))
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: { command: 'skin' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__skins__design' } }))
  on('config.list', () => ({ value: [] }))
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('ui.render', () => STOCK)
}

const start = ($: Engine) => $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

const skin = ($: Engine, args: string) =>
  $.command.run({ command: 'skin', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

const reply = (text: string, surface: 'terminal' | 'desktop' = 'terminal', requestId = 'm1') =>
  ({ ...SITE, surface, component: 'AssistantMessage', requestId, props: { text, isFirstOfReply: true } }) as const

type Node = { type?: string; props: Record<string, unknown>; children?: readonly unknown[] }

function colorOf(node: unknown, text: string): unknown {
  const element = node as Node | undefined

  if (element?.children?.length === 1 && element.children[0] === text) {
    return element.props.color
  }

  for (const child of element?.children ?? []) {
    const found = colorOf(child, text)

    if (found !== undefined) {
      return found
    }
  }

  return undefined
}

test('hyperlinks are drawn where the terminal is known to draw them', () => {
  expect(hyperlinksFrom({ FORCE_HYPERLINK: '1' })).toBe(true)
  expect(hyperlinksFrom({ FORCE_HYPERLINK: '0', TERM_PROGRAM: 'iTerm.app' })).toBe(false)
  expect(hyperlinksFrom({ WT_SESSION: 'abc' })).toBe(true)
  expect(hyperlinksFrom({ TERM: 'xterm-kitty' })).toBe(true)
  expect(hyperlinksFrom({ TERM_PROGRAM: 'vscode' })).toBe(true)
  expect(hyperlinksFrom({ VTE_VERSION: '7600' })).toBe(true)
  expect(hyperlinksFrom({ TERM_PROGRAM: 'Apple_Terminal', TERM_PROGRAM_VERSION: '453' })).toBe(false)
  expect(hyperlinksFrom({ TERM_PROGRAM: 'Apple_Terminal', TERM_PROGRAM_VERSION: '455.1' })).toBe(true)
  expect(hyperlinksFrom({ TERM_PROGRAM: 'iTerm.app', TMUX: '/tmp/tmux' })).toBe(false)
  expect(hyperlinksFrom({ TERM: 'xterm-256color' })).toBe(false)
})

test('only URLs the engine’s Link takes become links', () => {
  expect(safeHref('https://github.com/hellosverre/claude-skins')).toBe('https://github.com/hellosverre/claude-skins')
  expect(safeHref('http://localhost:5173/x')).toBe('http://localhost:5173/x')
  expect(safeHref('http://example.com')).toBeNull()
  expect(safeHref('https://user@example.com')).toBeNull()
  expect(safeHref('https://example.com/ä')).toBe('https://example.com/%C3%A4')
  expect(safeHref('javascript:alert(1)')).toBeNull()
  expect(safeHref('not a url')).toBeNull()
})

test('a path finds the file this turn touched, absolute, relative or with a line', () => {
  const touched = { '/work/src/a.ts': 'created', '/work/README.md': 'edited' } as const

  expect(touchOf(touched, 'src/a.ts', '/work')).toBe('created')
  expect(touchOf(touched, './src/a.ts:12', '/work')).toBe('created')
  expect(touchOf(touched, '/work/README.md:3:7', '/work')).toBe('edited')
  expect(touchOf(touched, 'src/b.ts', '/work')).toBeUndefined()
})

test('prose picks out URLs whole, and paths with their line', () => {
  const runs = inlineRuns('See https://example.com/a/b.ts, then src/app.ts:42 and v1.2.3.')

  expect(runs.filter(run => run.style !== 'plain').map(run => [run.style, run.text])).toEqual([
    ['url', 'https://example.com/a/b.ts'],
    ['path', 'src/app.ts:42'],
    ['version', 'v1.2.3'],
  ])
})

test('a URL in prose is a Link where the terminal draws them, and text elsewhere or with links off', async ($, on) => {
  stub(on, { FORCE_HYPERLINK: '1' })
  await start($)
  const text = 'Docs at https://code.claude.com/docs for more.'

  const linked = await $.ui.mount(reply(text))
  expect(((await linked.find({ type: 'Link' })) as Node | undefined)?.props.href).toBe('https://code.claude.com/docs')
  await linked.unmount()

  await skin($, 'links off')
  const plain = await $.ui.mount(reply(text))
  expect(await plain.find({ type: 'Link' })).toBeUndefined()
  expect(await plain.find({ type: 'Text', text: /code\.claude\.com/ })).toBeDefined()
})

test('a terminal that does not draw OSC 8 gets the URL as text', async ($, on) => {
  stub(on, { TERM: 'xterm-256color' })
  await start($)

  const ui = await $.ui.mount(reply('Docs at https://code.claude.com/docs for more.'))
  expect(await ui.find({ type: 'Link' })).toBeUndefined()
})

test('files this turn created or edited take their colour in rows and prose, until the next turn', async ($, on) => {
  stub(on)
  on('tool.call', ($, e) =>
    e.tool === 'Write'
      ? { result: { type: 'create', filePath: '/work/src/new.ts', content: 'x', structuredPatch: [], originalFile: null } }
      : { result: { filePath: '/work/src/old.ts', structuredPatch: [], oldString: 'a', newString: 'b', originalFile: 'a', userModified: false, replaceAll: false } },
  )
  await start($)
  await $.turn.start({ text: 'go', turnId: 't1' } as never)
  await $.tool.call({ tool: 'Write', file_path: '/work/src/new.ts', content: 'x' })
  await $.tool.call({ tool: 'Edit', file_path: '/work/src/old.ts', old_string: 'a', new_string: 'b' })

  const prose = await $.ui.mount(reply('Made src/new.ts and changed src/old.ts:4, left src/other.ts alone.'))
  const line = await prose.find({ type: 'Text', text: /Made/ })
  expect(colorOf(line, 'src/new.ts')).toBe(noir.palette.ok)
  expect(colorOf(line, 'src/old.ts:4')).toBe(noir.palette.warn)
  expect(colorOf(line, 'src/other.ts')).toBe(noir.palette.read)
  await prose.unmount()

  const call = { tool_use_id: 'tu9', tool: 'Read', input: { file_path: '/work/src/old.ts' }, isRunning: false, isErrored: false, isInterrupted: false }
  const row = await $.ui.mount({ ...SITE, surface: 'terminal', component: 'ToolUse', requestId: 'tu9', props: call })
  expect(colorOf(await row.find({ type: 'Text', text: /Read/ }), '  src/old.ts')).toBe(noir.palette.warn)
  await row.unmount()

  await $.turn.start({ text: 'again', turnId: 't2' } as never)
  const fresh = await $.ui.mount(reply('Made src/new.ts and changed src/old.ts:4.', 'terminal', 'm2'))
  expect(colorOf(await fresh.find({ type: 'Text', text: /Made/ }), 'src/new.ts')).toBe(noir.palette.read)
})

const TABLE = '| Skin | Accent |\n|---|---|\n| noir | white |\n| nord | frost |'

test('a table copies as markdown or as drawn, and /skin copy off takes the buttons away', async ($, on) => {
  const copied: string[] = []
  stub(on, {}, copied)
  await start($)

  const ui = await $.ui.mount(reply(TABLE))
  await ui.press({ key: 'copy-0' })
  await ui.press({ key: 'copy-0-art' })
  expect(copied[0]).toBe('| Skin | Accent |\n| --- | --- |\n| noir | white |\n| nord | frost |')
  expect(copied[1]).toBe(tableArt({ kind: 'table', header: ['Skin', 'Accent'], align: ['left', 'left'], rows: [['noir', 'white'], ['nord', 'frost']] }))
  expect(copied[1]?.split('\n')[0]).toBe('╭──────┬────────╮')
  await ui.unmount()

  const desktop = await $.ui.mount(reply(TABLE, 'desktop', 'm3'))
  expect(await desktop.find({ key: 'copy-0-art' })).toBeDefined()
  await desktop.unmount()

  await skin($, 'copy off')
  const bare = await $.ui.mount(reply(TABLE, 'terminal', 'm4'))
  expect(await bare.find({ type: 'Button' })).toBeUndefined()
})

test('a reply of several blocks has copy reply, which copies it as written', async ($, on) => {
  const copied: string[] = []
  stub(on, {}, copied)
  await start($)
  const text = `Here:\n\n${TABLE}\n\nAnd code:\n\n\`\`\`ts\nconst a = 1\n\`\`\``

  const ui = await $.ui.mount(reply(text))
  await ui.press({ key: 'copy-reply' })
  expect(copied).toEqual([text])
  await ui.unmount()

  const single = await $.ui.mount(reply(TABLE, 'terminal', 'm5'))
  expect(await single.find({ key: 'copy-reply' })).toBeUndefined()
})

test('long code and tables fold behind ▾ N more on the terminal; fold off shows them whole', async ($, on) => {
  stub(on)
  await start($)
  const code = `\`\`\`ts\n${Array.from({ length: 30 }, (_, i) => `const line${i + 1} = ${i + 1}`).join('\n')}\n\`\`\``
  const table = `| n | sq |\n|---|---|\n${Array.from({ length: 20 }, (_, i) => `| row${i + 1} | ${(i + 1) ** 2} |`).join('\n')}`
  const label = async (ui: { find: (q: { key: string }) => Promise<unknown> }, key: string) => ((await ui.find({ key })) as Node | undefined)?.props.label

  const ui = await $.ui.mount(reply(`${code}\n\n${table}`))
  expect(await ui.find({ type: 'Text', text: 'const line24 = 24' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'const line25 = 25' })).toBeUndefined()
  expect(await label(ui, 'fold-0')).toBe('▾ 6 more')
  expect(await ui.find({ type: 'Text', text: 'row14' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'row15' })).toBeUndefined()
  expect(await label(ui, 'fold-1')).toBe('▾ 6 more')

  await ui.press({ key: 'fold-0' })
  expect(await ui.find({ type: 'Text', text: 'const line30 = 30' })).toBeDefined()
  expect(await label(ui, 'fold-0')).toBe('▴ less')
  // The table stays folded: each block keeps its own state.
  expect(await ui.find({ type: 'Text', text: 'row15' })).toBeUndefined()
  await ui.unmount()

  await skin($, 'fold off')
  const whole = await $.ui.mount(reply(`${code}\n\n${table}`, 'terminal', 'm6'))
  expect(await whole.find({ type: 'Text', text: 'const line30 = 30' })).toBeDefined()
  expect(await whole.find({ type: 'Text', text: 'row20' })).toBeDefined()
  expect(await whole.find({ key: 'fold-0' })).toBeUndefined()
})

test('a long code card on the desktop is cut at 24 lines until opened', async ($, on) => {
  stub(on)
  await start($)
  const code = `\`\`\`ts\n${Array.from({ length: 30 }, (_, i) => `const line${i + 1} = ${i + 1}`).join('\n')}\n\`\`\``
  const source = async (ui: { find: (q: { type: string }) => Promise<unknown> }) => ((await ui.find({ type: 'Svg' })) as Node | undefined)?.props.source as string

  const ui = await $.ui.mount(reply(code, 'desktop'))
  expect(await source(ui)).toContain('>line24<')
  expect(await source(ui)).not.toContain('>line25<')
  await ui.press({ key: 'fold-0' })
  expect(await source(ui)).toContain('>line30<')
})

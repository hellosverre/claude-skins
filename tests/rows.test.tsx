import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine, Plugin } from 'claude-code/testing'

import { widthOf } from '../hooks/markdown'

const SURFACES = ['terminal', 'desktop'] as const

const SITE = { plugin: 'skins', viewport: { columns: 100, rows: 30 } } as const

// Stands for what Claude Code would draw wherever the skin hands a row back.
const STOCK: RenderElement = { type: 'Text', props: {}, children: ['stock row'] }

const PANE = {
  ...SITE,
  component: 'Pane',
  requestId: 'skins-settings',
  props: {
    title: 'Skins',
    isFocused: true,
    bodyColumns: 80,
    placement: 'inline',
    scroll: { offset: 0, bodyRows: 30 },
    view: {},
  },
} as const

const call = (tool: string, input: unknown, state: object = {}) => ({
  tool_use_id: 'tu1',
  tool,
  input,
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  ...state,
})

type Found = { props: Record<string, unknown>; children?: readonly unknown[] } | undefined

// `find` matches text anywhere in a row, so a span's colour is read from its children.
function spanColor(row: Found, text: string): unknown {
  for (const child of row?.children ?? []) {
    const element = child as { props?: { color?: unknown }; children?: readonly unknown[] }

    if (element.children?.[0] === text) {
      return element.props?.color
    }

    const inner = spanColor(element as Found, text)

    if (inner !== undefined) {
      return inner
    }
  }

  return undefined
}

const runSkin = ($: Engine, args: string) =>
  $.command.run({
    command: 'skin',
    args,
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 100 },
  })

// The engine's own answers, so a hook can mount without a session. A test answering
// the environment or the store itself leaves them out.
function stubEngine(on: On, own: { env?: boolean; store?: boolean; toast?: boolean; usage?: boolean; log?: boolean } = {}) {
  const clock = mock.clock(on, { now: 10_000 })
  on('session.cwd', () => ({ value: '/work' }))
  if (!own.env) {
    on('env.get', () => ({ value: undefined }))
  }
  if (!own.store) {
    on('store.get', () => ({ value: undefined }))
    on('store.set', () => ({ value: undefined }))
  }
  if (!own.toast) {
    on('ui.toast', () => ({ value: undefined }))
  }
  on('ui.open', () => ({ value: { isPlaced: true } }))
  if (!own.log) {
    on('ui.log', () => ({ value: undefined }))
  }
  if (!own.usage) {
    on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [{ kind: 'five_hour', percentUsed: 18 }] } }))
  }
  // The dialog must hold Claude Code's own drawing, which a real engine hands back by reference.
  on('ui.render', ($, e) => (e.component === 'AskUserQuestion' ? { type: 'engine', ref: 0 } : STOCK))

  return clock
}

async function startDesktop($: Engine, on: On) {
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: { command: 'skin' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__skins__design' } }))
  on('config.list', () => ({ value: [] }))

  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
}

const svgSource = async (ui: { find: (q: { type: string }) => Promise<unknown> }) =>
  ((await ui.find({ type: 'Svg' })) as { props: { source: string } } | undefined)?.props.source ?? ''

const isSettled = (source: string) => source.includes('animation:none!important')

const tableReply = (surface: (typeof SURFACES)[number] | 'mobile', requestId = 'm1') =>
  ({ ...SITE, surface, component: 'AssistantMessage', requestId, props: { text: '| a | b |\n|---|---|\n| 1 | 2 |', isFirstOfReply: true } }) as const

function writesOf(on: On, wanted: readonly string[]): string[] {
  const keys: string[] = []
  on('state.set', ($, e, next) => {
    if (wanted.includes(e.key)) {
      keys.push(e.key)
    }

    return next(e)
  })

  return keys
}

function readsOf(on: On, wanted: readonly string[]): string[] {
  const keys: string[] = []
  on('state.get', ($, e, next) => {
    if (wanted.includes(e.key)) {
      keys.push(e.key)
    }

    return next(e)
  })

  return keys
}

const COUNTDOWN: Plugin = {
  name: 'countdown',
  register(on) {
    on('session.start', async ($, e, next) => {
      const started = await next(e)
      $.clock.every(1000, () => $.ui.invalidate('ui.render'))

      return started
    })
    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => next(e))
    on('ui.render', { component: 'Pane' }, async ($, e, next) => next(e))
  },
}

const toolUse = (props: ReturnType<typeof call>, surface: (typeof SURFACES)[number] = 'terminal') =>
  ({ ...SITE, surface, component: 'ToolUse', requestId: props.tool_use_id, props }) as const

test('a Bash call is a node on the terminal\u2019s rail and an icon row on the desktop', async ($, on) => {
  stubEngine(on)

  const terminal = await $.ui.mount(toolUse(call('Bash', { command: 'pnpm test' }), 'terminal'))
  expect(await terminal.find({ type: 'Text', text: '┃' })).toBeDefined()
  expect(await terminal.find({ type: 'Text', text: /●─ Bash {2}pnpm test/ })).toBeDefined()
  await terminal.unmount()

  const desktop = await $.ui.mount(toolUse(call('Bash', { command: 'pnpm test' }), 'desktop'))
  const icon = (await desktop.find({ type: 'Svg' })) as { props: { source: string } } | undefined
  expect(icon?.props.source).toContain('M5 7l5 5-5 5')
  expect(await desktop.find({ type: 'Text', text: /Bash {2}pnpm test/ })).toBeDefined()
  expect(await desktop.find({ type: 'Text', text: '┃' })).toBeUndefined()
  await desktop.unmount()

  const running = await $.ui.mount(toolUse(call('Bash', { command: 'sleep 9' }, { tool_use_id: 'tu3', isRunning: true }), 'desktop'))
  const spinning = (await running.find({ type: 'Svg' })) as { props: { source: string } } | undefined
  expect(spinning?.props.source).toContain('class="spin"')
})

test('an edit shows its added and removed lines', async ($, on) => {
  stubEngine(on)

  const output = { structuredPatch: [{ lines: ['+a', '+b', '-c'] }] }
  const ui = await $.ui.mount(toolUse(call('Edit', { file_path: '/work/a.ts' }, { output })))

  expect(await ui.find({ type: 'Text', text: '+2' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: ' −1' })).toBeDefined()
})

test('a failed call shows the error mark, a running one the running mark', async ($, on) => {
  stubEngine(on)

  const failed = await $.ui.mount(toolUse(call('Read', { file_path: '/work/a.ts' }, { isErrored: true })))
  expect(await failed.find({ type: 'Text', text: /✕─ Read/ })).toBeDefined()

  const running = await $.ui.mount(toolUse(call('Bash', { command: 'sleep 9' }, { tool_use_id: 'tu2', isRunning: true })))
  expect(await running.find({ type: 'Text', text: /○─ Bash/ })).toBeDefined()
})

test('tools a skin cannot redraw faithfully keep their own row', async ($, on) => {
  stubEngine(on)

  const ui = await $.ui.mount(toolUse(call('Task', { description: 'dig' })))

  expect(await ui.find({ type: 'Text', text: 'stock row' })).toBeDefined()
})

test('a folded group is one node, an expanded one keeps its rows', async ($, on) => {
  stubEngine(on)

  const calls = [call('Read', {}), call('Read', {}), call('Grep', { pattern: 'x' })]
  const group = (isExpanded: boolean) =>
    ({ ...SITE, surface: 'terminal', component: 'ToolGroup', requestId: 'g1', props: { calls, isActive: false, isExpanded } }) as const

  const folded = await $.ui.mount(group(false))
  expect(await folded.find({ type: 'Text', text: /Read 2 · Search 1/ })).toBeDefined()
  await folded.unmount()

  const expanded = await $.ui.mount(group(true))
  expect(await expanded.find({ type: 'Text', text: 'stock row' })).toBeDefined()
})

test('a typed prompt sits in an outline sized to its text, other senders keep their row', async ($, on) => {
  stubEngine(on)

  for (const surface of SURFACES) {
    const prompt = (kind: 'composer' | 'task-notification') =>
      ({ ...SITE, surface, component: 'UserMessage', requestId: 'm1', props: { text: 'fix the build', origin: { kind }, isExpanded: false } }) as const

    const typed = await $.ui.mount(prompt('composer'))
    const column = (await typed.find({ type: 'Box' })) as { props: { alignItems?: string }; children?: readonly { props?: { borderStyle?: string } }[] } | undefined
    // The outline hugs the text: its column does not stretch it to the full width.
    expect(column?.props.alignItems).toBe('flex-start')
    expect(column?.children?.[0]?.props?.borderStyle).toBe('round')
    expect(await typed.find({ type: 'Text', text: 'fix the build' })).toBeDefined()
    await typed.unmount()

    const notice = await $.ui.mount(prompt('task-notification'))
    expect(await notice.find({ type: 'Text', text: 'stock row' })).toBeDefined()
    await notice.unmount()
  }
})

test('a reply with a table draws the table, a reply without one keeps its own drawing', async ($, on) => {
  stubEngine(on)

  const reply = (text: string) =>
    ({ ...SITE, surface: 'terminal', component: 'AssistantMessage', requestId: 'r1', props: { text, isFirstOfReply: true } }) as const

  const withTable = await $.ui.mount(reply('Limits:\n\n| Route | Limit |\n|---|--:|\n| /chat | 60 |\n| /up | 10 |'))
  expect(await withTable.find({ type: 'Markdown' })).toBeDefined()
  expect(await withTable.find({ type: 'Text', text: 'Route' })).toBeDefined()
  expect(await withTable.find({ type: 'Text', text: '10' })).toBeDefined()
  await withTable.unmount()

  const plain = await $.ui.mount(reply('No table | here, just a pipe.'))
  expect(await plain.find({ type: 'Text', text: 'stock row' })).toBeDefined()
})

test('a terminal table sizes Korean, Chinese, Japanese and emoji cells to their full width', async ($, on) => {
  stubEngine(on)

  const cells = ['레일, 스피너', '中文字符', 'カタカナ', '🚀 ship']
  const text = `| Slot | Use |\n|---|---|\n${cells.map((cell, i) => `| s${i} | ${cell} |`).join('\n')}`
  const ui = await $.ui.mount({ ...SITE, surface: 'terminal', component: 'AssistantMessage', requestId: 'cjk', props: { text, isFirstOfReply: true } })

  type Node = { type?: string; props?: { width?: unknown }; children?: readonly (Node | string)[] }
  // The box a cell's Text sits in, found by the cell's text.
  const boxOf = (node: Node | string | undefined, cell: string): Node | undefined => {
    if (node === undefined || typeof node === 'string') {
      return undefined
    }
    const holds = node.children?.some(child => typeof child !== 'string' && child.type === 'Text' && child.children?.join('') === cell)
    return holds ? node : node.children?.map(child => boxOf(child, cell)).find(found => found !== undefined)
  }
  const root = (await ui.find({ type: 'Box' })) as Node

  for (const cell of cells) {
    expect(await ui.find({ type: 'Text', text: cell })).toBeDefined()
    // Each cell's box holds its terminal width plus padding, so nothing is cut with an ellipsis.
    expect(boxOf(root, cell)?.props?.width).toBe(widthOf('레일, 스피너') + 2)
  }

  expect(await ui.find({ type: 'Text', text: /…$/ })).toBeUndefined()
  await ui.unmount()
})

test('the terminal spinner shimmers, the desktop one is an animated icon beside its step', async ($, on) => {
  stubEngine(on)

  const spinner = (surface: (typeof SURFACES)[number]) =>
    ({ ...SITE, surface, component: 'Spinner', requestId: 'main', props: { word: 'Sauteing', message: null, suffix: '…', mode: 'responding' } }) as const

  const terminal = await $.ui.mount(spinner('terminal'))
  expect(await terminal.find({ type: 'Text', text: /^⠋ .+…/ })).toBeDefined()
  await terminal.unmount()

  const desktop = await $.ui.mount(spinner('desktop'))
  const icon = (await desktop.find({ type: 'Svg' })) as { props: { source: string } } | undefined
  expect(icon?.props.source).toContain('class="bar')
  expect(await desktop.find({ type: 'Text', text: 'Sauteing' })).toBeDefined()
})

test('the turn footer names the time in the skin’s words', async ($, on) => {
  stubEngine(on)

  const ui = await $.ui.mount({
    ...SITE,
    surface: 'terminal',
    component: 'TurnDuration',
    requestId: 'f1',
    props: { word: 'Baked', durationMs: 64000 },
  })

  expect(await ui.find({ type: 'Text', text: /^◆ .+ in 1m 4s$/ })).toBeDefined()
})

test('the question dialog keeps Claude Code’s drawing under a band naming its topics', async ($, on) => {
  stubEngine(on)

  const ui = await $.ui.mount({
    ...SITE,
    surface: 'terminal',
    component: 'AskUserQuestion',
    requestId: 'q1',
    props: { tool: 'AskUserQuestion', questions: [{ header: 'Approach' }, { header: 'Store' }] },
  })

  expect(await ui.find({ type: 'Text', text: /Approach {2}· {2}Store/ })).toBeDefined()
})

test('the settings pane picks a skin, switches the rail and paints a slot', async ($, on) => {
  stubEngine(on)

  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await pane.press({ key: 'skin-dracula' })
  await pane.press({ key: 'toggle-rail' })
  await pane.unmount()

  const row = await $.ui.mount(toolUse(call('Bash', { command: 'ls' })))
  const found = await row.find({ type: 'Text', text: /Bash/ })
  expect(spanColor(found, 'Bash')).toBe('#f1fa8c')
  expect(await row.find({ type: 'Text', text: '┃' })).toBeUndefined()
  await row.unmount()

  const again = await $.ui.mount({ ...PANE, surface: 'desktop' })
  await again.input({ key: 'hex', text: '#ff0000' })
  await again.unmount()

  expect((await runSkin($, 'list')).text).toContain('● my-dracula')
})

test('the agent’s design tool saves a skin and it applies at once', async ($, on) => {
  stubEngine(on)

  const out = await $.tool.call({
    tool: 'mcp__skins__design',
    action: 'save',
    name: 'sunset',
    base: 'gruvbox',
    palette: { run: '#ff8800' },
  })
  expect(out.deny).toBeUndefined()

  const row = await $.ui.mount(toolUse(call('Bash', { command: 'ls' })))
  expect(spanColor(await row.find({ type: 'Text', text: /Bash/ }), 'Bash')).toBe('#ff8800')

  const refused = await $.tool.call({ tool: 'mcp__skins__design', action: 'save', name: 'dracula' })
  expect(refused.deny).toContain('built-in')
})

test('/skin with no argument opens the settings pane', async ($, on) => {
  stubEngine(on)

  const answer = await runSkin($, '')

  expect(answer.text).toBeUndefined()
})

test('a table wider than its share spans the column instead of running off it', async ($, on) => {
  stubEngine(on)

  const wide = `| File | What changed |\n|---|---|\n| server.ts | ${'a long description '.repeat(6)} |`

  for (const surface of ['terminal'] as const) {
    const ui = await $.ui.mount({
      ...SITE,
      surface,
      component: 'AssistantMessage',
      requestId: 'r2',
      props: { text: wide, isFirstOfReply: true },
    })
    type Node = { props?: { width?: unknown; position?: unknown; top?: unknown }; children?: readonly Node[] }
    const reply = (await ui.find({ type: 'Box' })) as Node
    const frame = reply.children?.[0]
    // Copy sits on the frame's top border, laid over it at the right.
    const control = frame?.children?.at(-1)

    expect(frame?.props?.width).toBe('100%')
    expect(control?.props?.position).toBe('absolute')
    expect(control?.props?.top).toBe(-1)
    expect(await ui.find({ type: 'Text', text: /…$/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the desktop draws a table as an animated vector card, with a tooltip on a cut cell', async ($, on) => {
  stubEngine(on)

  const text = `| Skin | Accent | Note |
|---|---|---|
| dracula | #bd93f9 | ${'a very long note '.repeat(30)} |
| x<y | +18 −3 | ok |`
  const ui = await $.ui.mount({
    ...SITE,
    surface: 'desktop',
    component: 'AssistantMessage',
    requestId: 'r3',
    props: { text, isFirstOfReply: true },
  })
  const svg = (await ui.find({ type: 'Svg' })) as { props: { source: string; isInteractive?: boolean; alt: string } } | undefined

  expect(svg?.props.isInteractive).toBeUndefined()
  expect(svg?.props.source).toContain('class="row"')
  expect(svg?.props.source).toContain('<circle')
  expect(svg?.props.source).toContain('x&lt;y')
  expect(svg?.props.alt).toContain('Skin | Accent | Note')
})

test('a card animates on its first draw only, so a streaming reply does not flicker', async ($, on) => {
  stubEngine(on)

  const reply = (requestId: string, text: string) =>
    ({ ...SITE, surface: 'desktop', component: 'AssistantMessage', requestId, props: { text, isFirstOfReply: true } }) as const
  const sourceOf = async (requestId: string, text: string) => {
    const ui = await $.ui.mount(reply(requestId, text))
    const source = ((await ui.find({ type: 'Svg' })) as { props: { source: string } } | undefined)?.props.source ?? ''

    await ui.unmount()

    return source
  }
  const table = '| a | b |\n|---|---|\n| 1 | 2 |'

  const first = await sourceOf('s1', table)
  const streamed = await sourceOf('s1', `${table}\n| 3 | 4 |`)
  const other = await sourceOf('s2', table)

  expect(first).not.toContain('animation:none!important')
  expect(streamed).toContain('animation:none!important')
  expect(streamed).toContain('>3<')
  expect(other).not.toContain('animation:none!important')
})

test('on the desktop a shell fence keeps the app’s own block, for its Run button', async ($, on) => {
  stubEngine(on)

  const reply = (requestId: string, text: string) =>
    ({ ...SITE, surface: 'desktop', component: 'AssistantMessage', requestId, props: { text, isFirstOfReply: true } }) as const

  const alone = await $.ui.mount(reply('sh1', 'Run:\n\n```bash\npnpm test\n```'))
  expect(await alone.find({ type: 'Text', text: 'stock row' })).toBeDefined()
  await alone.unmount()

  const mixed = await $.ui.mount(reply('sh2', '| a | b |\n|---|---|\n| 1 | 2 |\n\n```bash\npnpm test\n```'))
  const markdown = (await mixed.find({ type: 'Markdown', text: 'pnpm test' })) as { props: { text: string } } | undefined
  expect(markdown?.props.text).toContain('```bash')
  expect(await mixed.find({ type: 'Svg' })).toBeDefined()
})

test('with tables as text the desktop gets a text grid and the app’s own code block, both selectable', async ($, on) => {
  stubEngine(on)

  await runSkin($, 'tables text')

  const ui = await $.ui.mount({
    ...SITE,
    surface: 'desktop',
    component: 'AssistantMessage',
    requestId: 'tx1',
    props: { text: '| Route | Limit |\n|---|---|\n| /chat | 60 |\n\n```ts\nconst a = 1\n```', isFirstOfReply: true },
  })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /\/chat/ })).toBeDefined()
  const code = (await ui.find({ type: 'Markdown', text: 'const a' })) as { props: { text: string } } | undefined
  expect(code?.props.text).toContain('```ts')
  await ui.unmount()

  await runSkin($, 'tables off')

  const stock = await $.ui.mount({ ...SITE, surface: 'desktop', component: 'AssistantMessage', requestId: 'tx2', props: { text: '| a |\n|---|\n| 1 |', isFirstOfReply: true } })
  expect(await stock.find({ type: 'Text', text: 'stock row' })).toBeDefined()
})

test('on the desktop an edit is a diff card and a shell command a terminal card', async ($, on) => {
  stubEngine(on)

  const result = (tool: string, output: unknown, isErrored = false) =>
    ({ ...SITE, surface: 'desktop', component: 'ToolResult', requestId: 'tr1', props: { tool_use_id: 'tr1', tool, output, isErrored } }) as const
  const sourceOf = async (ui: { find: (q: { type: string }) => Promise<unknown> }) =>
    ((await ui.find({ type: 'Svg' })) as { props: { source: string } } | undefined)?.props.source ?? ''

  const edit = await $.ui.mount(result('Edit', { filePath: '/work/src/a.ts', structuredPatch: [{ oldStart: 1, newStart: 1, lines: ['-a', '+b'] }] }))
  expect(await sourceOf(edit)).toContain('src/a.ts')
  await edit.unmount()

  const shell = await $.ui.mount(result('Bash', { stdout: 'built', stderr: '', interrupted: false }))
  expect(await sourceOf(shell)).toContain('built')
  await shell.unmount()

  const terminal = await $.ui.mount({ ...result('Bash', { stdout: 'built', stderr: '', interrupted: false }), surface: 'terminal' })
  expect(await terminal.find({ type: 'Text', text: 'stock row' })).toBeDefined()
})

test('a code fence is a card on the desktop and stays markdown in the terminal', async ($, on) => {
  stubEngine(on)

  const reply = (surface: (typeof SURFACES)[number]) =>
    ({ ...SITE, surface, component: 'AssistantMessage', requestId: 'c1', props: { text: 'Run:\n\n```ts\nconst a = 1\n```', isFirstOfReply: true } }) as const

  const desktop = await $.ui.mount(reply('desktop'))
  expect(((await desktop.find({ type: 'Svg' })) as { props: { source: string } } | undefined)?.props.source).toContain('const')
  await desktop.unmount()

  const terminal = await $.ui.mount(reply('terminal'))
  expect(await terminal.find({ type: 'Svg' })).toBeUndefined()
  expect(await terminal.find({ type: 'Markdown' })).toBeDefined()
})

const BAND = (surface: (typeof SURFACES)[number], isWorking: boolean) =>
  ({
    ...SITE,
    surface,
    component: 'AbovePrompt',
    requestId: 'band',
    props: { hasSurvey: false, isWorking, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} },
  }) as const

test('the band offers Compact, nudges at 70% context, and compacts on a press', async ($, on) => {
  let compacted = 0
  const toasts: string[] = []
  const clock = mock.clock(on, { now: 10_000 })
  on('session.cwd', () => ({ value: '/work' }))
  on('store.get', () => ({ value: undefined }))
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.render', () => STOCK)
  on('command.run', ($, e) => {
    if (e.command === 'compact') {
      compacted += 1
    }

    return {}
  })
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 85 }, rateLimits: [] } }))
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: { command: 'skin' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__skins__design' } }))

  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })

  const band = await $.ui.mount(BAND('desktop', false))
  expect(await band.find({ type: 'Text', text: 'Context is 85% full' })).toBeDefined()
  // A digit hotkey reaches it from an empty prompt where the terminal reports no clicks.
  expect(((await band.find({ key: 'compact' })) as { props: { hotkey?: string } } | undefined)?.props.hotkey).toBe('0')
  await band.press({ key: 'compact' })
  // It starts on a timer, outside the press, so the press ending cannot cancel it.
  expect(compacted).toBe(0)
  // Hidden until that run ends, so more presses cannot queue more runs.
  expect(await band.find({ key: 'compact' })).toBeUndefined()
  await clock.advance(1)
  expect(compacted).toBe(1)
  expect(await band.find({ key: 'compact' })).toBeDefined()
  expect(toasts).toEqual([])
  await band.unmount()

  const busy = await $.ui.mount(BAND('terminal', true))
  expect(await busy.find({ key: 'compact' })).toBeUndefined()
})

test('cards draw no background of their own', async ($, on) => {
  stubEngine(on)

  const ui = await $.ui.mount({
    ...SITE,
    surface: 'desktop',
    component: 'AssistantMessage',
    requestId: 'bg',
    props: { text: '| a | b |\n|---|---|\n| 1 | 2 |\n\n```ts\nconst x = 1\n```', isFirstOfReply: true },
  })
  const svg = (await ui.find({ type: 'Svg' })) as { props: { source: string } } | undefined

  expect(svg?.props.source).not.toContain('background:')
})

test('/skin gallery opens a pane with every element, numbered, on both surfaces', async ($, on) => {
  stubEngine(on)

  expect((await runSkin($, 'gallery')).text).toBeUndefined()

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...PANE, requestId: 'skins-gallery', surface })

    expect(await ui.find({ type: 'Text', text: /^1  Your prompt/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^11  Turn footer/ })).toBeDefined()
    await ui.unmount()
  }
})

test('on a light Claude Code theme the skin draws dark text for a light background', async ($, on) => {
  stubEngine(on)
  on('config.list', () => ({ value: [{ key: 'theme', label: 'Theme', kind: 'enum', value: 'light', provider: { kind: 'engine' }, isLocked: false }] as never }))
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: { command: 'skin' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__skins__design' } }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })

  const row = await $.ui.mount(toolUse(call('Bash', { command: 'ls' })))
  expect(spanColor(await row.find({ type: 'Text', text: /Bash/ }), 'Bash')).toBe('#111111')
})

test('code blocks, tables and shell output get a Copy button that copies their text', async ($, on) => {
  stubEngine(on)
  const copied: string[] = []
  on('ui.copy', ($, e) => {
    copied.push(e.text)
    return { value: { isCopied: true } }
  })

  const text = 'Run:\n\n```ts\nconst a = 1\n```\n\n| A | B |\n|---|---|\n| 1 | 2 |'

  for (const surface of SURFACES) {
    const ui = await $.ui.mount({ ...SITE, surface, component: 'AssistantMessage', requestId: `cp-${surface}`, props: { text, isFirstOfReply: true } })
    await ui.press({ key: 'copy-1' })
    await ui.press({ key: 'copy-2' })
    await ui.unmount()
  }

  const shell = await $.ui.mount({
    ...SITE,
    surface: 'desktop',
    component: 'ToolResult',
    requestId: 'cp-sh',
    props: { tool_use_id: 'cp-sh', tool: 'Bash', output: { stdout: 'built ok', stderr: '', interrupted: false }, isErrored: false },
  })
  await shell.press({ key: 'copy-output' })

  expect(copied).toEqual(['const a = 1', '| A | B |\n| --- | --- |\n| 1 | 2 |', 'const a = 1', '| A | B |\n| --- | --- |\n| 1 | 2 |', 'built ok'])
})

test('on the desktop the Copy button is laid over the card, in the corner the card leaves free', async ($, on) => {
  stubEngine(on)
  on('ui.copy', () => ({ value: { isCopied: true } }))

  const ui = await $.ui.mount({
    ...SITE,
    surface: 'desktop',
    component: 'AssistantMessage',
    requestId: 'ov',
    props: { text: '```ts\nconst a = 1\n```', isFirstOfReply: true },
  })
  type Node = { type?: string; props?: Record<string, unknown>; children?: readonly Node[] }
  const reply = (await ui.find({ type: 'Box' })) as Node
  const card = reply.children?.[0]
  const overlay = card?.children?.[1]

  expect(card?.props?.alignSelf).toBe('flex-start')
  expect(overlay?.props?.position).toBe('absolute')
  expect(overlay?.children?.[0]?.type).toBe('Button')
})

const THEME_AUTO = [{ key: 'theme', label: 'Theme', kind: 'enum', value: 'auto', provider: { kind: 'engine' }, isLocked: false }]

test('an auto theme follows the system, and SKINS_THEME overrides the setting', async ($, on) => {
  let override: string | undefined
  stubEngine(on, { env: true })
  on('env.get', ($, e) => ({ value: e.name === 'SKINS_THEME' ? override : undefined }))
  on('config.list', () => ({ value: THEME_AUTO as never }))
  // macOS answers "does not exist" when the system is light.
  on('process.run', () => ({ value: { exitCode: 1, stdout: '', stderr: 'The domain/default pair does not exist' } as never }))
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: { command: 'skin' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__skins__design' } }))

  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const light = await $.ui.mount(toolUse(call('Bash', { command: 'ls' })))
  expect(spanColor(await light.find({ type: 'Text', text: /Bash/ }), 'Bash')).toBe('#111111')

  override = 'dark'
  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const dark = await $.ui.mount({ ...toolUse(call('Bash', { command: 'ls' })), requestId: 'again' })
  expect(spanColor(await dark.find({ type: 'Text', text: /Bash/ }), 'Bash')).toBe('#ededed')
})

test('a theme set mid-session is drawn at once, though the settings list still holds the old one', async ($, on) => {
  stubEngine(on)
  // Inside the config.set hook the engine still lists the previous value.
  on('config.list', () => ({ value: [{ ...THEME_AUTO[0], value: 'light' }] as never }))
  on('config.set', ($, e) => ({ value: e.value }))
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: { command: 'skin' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__skins__design' } }))

  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  await $.config.set({ key: 'theme', value: 'dark' })

  const row = await $.ui.mount(toolUse(call('Bash', { command: 'ls' })))
  expect(spanColor(await row.find({ type: 'Text', text: /Bash/ }), 'Bash')).toBe('#ededed')
})

test('an auto theme follows the system when it changes mid-session', async ($, on) => {
  let isDark = false
  const clock = stubEngine(on)
  on('config.list', () => ({ value: THEME_AUTO as never }))
  on('process.run', () => ({
    value: (isDark
      ? { exitCode: 0, stdout: 'Dark\n', stderr: '' }
      : { exitCode: 1, stdout: '', stderr: 'The domain/default pair does not exist' }) as never,
  }))
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: { command: 'skin' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__skins__design' } }))

  await $.session.start({ surface: 'desktop', isInteractive: true, cwd: '/work' })
  const before = await $.ui.mount(toolUse(call('Bash', { command: 'ls' })))
  expect(spanColor(await before.find({ type: 'Text', text: /Bash/ }), 'Bash')).toBe('#111111')

  isDark = true
  await clock.advance(5000)

  const after = await $.ui.mount({ ...toolUse(call('Bash', { command: 'ls' })), requestId: 'after' })
  expect(spanColor(await after.find({ type: 'Text', text: /Bash/ }), 'Bash')).toBe('#ededed')
})

test('/skin pin keeps a look to this folder, /skin unpin returns to the default', async ($, on) => {
  const store: Record<string, unknown> = {}
  stubEngine(on, { store: true })
  on('store.get', ($, e) => ({ value: store[e.key] }))
  on('store.set', ($, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: { command: 'skin' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__skins__design' } }))
  on('config.list', () => ({ value: [] }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await runSkin($, 'pin')
  await runSkin($, 'nord')

  expect((store.folders as Record<string, { skin: string }>)['/work']?.skin).toBe('nord')
  expect(store.prefs).toBeUndefined()

  await runSkin($, 'unpin')
  await runSkin($, 'dracula')

  expect(store.folders).toEqual({})
  expect((store.prefs as { skin: string }).skin).toBe('dracula')
})

// The update check runs unawaited off session.start; a macrotask lets it finish.
const unawaited = () =>
  new Promise<void>(resolve => (globalThis as unknown as { setTimeout: (run: () => void, ms: number) => void }).setTimeout(resolve, 0))

test('a session start says when a newer release is out, at most once a day', async ($, on) => {
  const store: Record<string, unknown> = {}
  const toasts: string[] = []
  let latest = '0.1.3'
  let fetches = 0
  stubEngine(on, { store: true, toast: true })
  on('store.get', ($, e) => ({ value: store[e.key] }))
  on('store.set', ($, e) => {
    store[e.key] = e.value
    return { value: undefined }
  })
  on('ui.toast', ($, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  // The engine hands the path back in the platform's own separators.
  on('fs.read', ($, e) => ({ value: /\.claude-plugin[\\/]plugin\.json$/.test(e.path) ? '{ "version": "0.1.2" }' : '' }))
  on('http.fetch', () => {
    fetches += 1
    return { value: { status: 200, ok: true, headers: {}, text: JSON.stringify({ version: latest }) } as never }
  })
  on('session.start', () => ({ cwd: '/work' }))
  on('command.register', () => ({ value: { command: 'skin' } }))
  on('tool.register', () => ({ value: { tool: 'mcp__skins__design' } }))
  on('config.list', () => ({ value: [] }))

  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await unawaited()
  expect(toasts.filter(text => text.startsWith('skins 0.1.3 is out'))).toHaveLength(1)

  latest = '0.1.4'
  await $.session.start({ surface: 'terminal', isInteractive: true, cwd: '/work' })
  await unawaited()
  expect(fetches).toBe(1)
  expect(toasts.some(text => text.includes('0.1.4'))).toBe(false)
})

test('a card settles by itself once its entrance ends, so a repaint of the stored drawing cannot replay it', async ($, on) => {
  const clock = stubEngine(on)
  await startDesktop($, on)

  const reply = await $.ui.mount({
    ...SITE,
    surface: 'desktop',
    component: 'AssistantMessage',
    requestId: 'm1',
    props: { text: '| a | b |\n|---|---|\n| 1 | 2 |', isFirstOfReply: true },
  })
  const spinner = await $.ui.mount({
    ...SITE,
    surface: 'desktop',
    component: 'Spinner',
    requestId: 'main',
    props: { word: 'Sauteing', message: null, suffix: '…', mode: 'responding' },
  })

  expect(isSettled(await svgSource(reply)), 'a new table plays its entrance').toBe(false)

  await clock.advance(700)
  expect(isSettled(await svgSource(reply)), 'the entrance plays until its last frame').toBe(false)

  await clock.advance(150)
  expect(isSettled(await svgSource(reply)), 'the stored table is settled by the end of its 850 ms entrance, without a new prop').toBe(true)
  expect(await svgSource(spinner), 'the spinner keeps spinning').toContain('infinite')
  expect(isSettled(await svgSource(spinner))).toBe(false)
})

test('the band holds its rings still while the numbers stay and fills them once when they change', async ($, on) => {
  let percent = 42
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent }, rateLimits: [{ kind: 'five_hour', percentUsed: 18 }] } }))
  on('session.measure', () => ({ changed: [] }) as never)
  const clock = stubEngine(on, { usage: true })
  await startDesktop($, on)

  const band = await $.ui.mount(BAND('desktop', false))
  expect(isSettled(await svgSource(band)), 'the first rings fill in').toBe(false)

  await band.redraw()
  expect(isSettled(await svgSource(band)), 'the same numbers drawn again stay still').toBe(true)

  percent = 55
  await $.session.measure({ context: { window: 200000, percent }, rateLimits: [{ kind: 'five_hour', percentUsed: 18 }] } as never)
  const changed = await svgSource(band)
  expect(changed).toContain('55%')
  expect(isSettled(changed), 'new numbers fill in once').toBe(false)

  await clock.advance(1200)
  expect(isSettled(await svgSource(band)), 'and then stay still').toBe(true)
})

test('another mod redrawing the band every second replays neither the rings nor the tables', { plugins: [COUNTDOWN] }, async ($, on) => {
  const clock = stubEngine(on)
  await startDesktop($, on)

  const reply = await $.ui.mount({
    ...SITE,
    surface: 'desktop',
    component: 'AssistantMessage',
    requestId: 'm1',
    props: { text: 'Limits:\n\n| Route | Limit |\n|---|--:|\n| /chat | 60 |', isFirstOfReply: true },
  })
  const band = await $.ui.mount(BAND('desktop', false))
  const rings: boolean[] = [isSettled(await svgSource(band))]
  const tables: boolean[] = [isSettled(await svgSource(reply))]

  for (let second = 1; second <= 5; second += 1) {
    await clock.advance(1000)
    rings.push(isSettled(await svgSource(band)))
    tables.push(isSettled(await svgSource(reply)))
  }

  expect(rings).toEqual([false, true, true, true, true, true])
  expect(tables).toEqual([false, true, true, true, true, true])
})

test('more cards than the skin remembers still settle once instead of animating forever', { timeoutMs: 120_000 }, async ($, on) => {
  const writes: number[] = []
  on('state.set', ($, e, next) => {
    if (e.key === 'settle') {
      writes.push(e.value as number)
    }

    return next(e)
  })
  const clock = stubEngine(on)
  await startDesktop($, on)

  const shells = []

  for (let i = 0; i < 2100; i += 1) {
    shells.push(
      await $.ui.mount({
        ...SITE,
        surface: 'desktop',
        component: 'ToolResult',
        requestId: `c${i}`,
        props: { tool_use_id: `c${i}`, tool: 'Bash', output: { stdout: `ran ${i}`, stderr: '', interrupted: false }, isErrored: false },
      }),
    )
  }

  const perRound: number[] = []

  for (let round = 0; round < 3; round += 1) {
    const before = writes.length
    await clock.advance(1500)
    perRound.push(writes.length - before)
  }

  expect(perRound, 'one write settles every card in the first round and none is scheduled again').toEqual([1, 0, 0])
  expect(isSettled(await svgSource(shells[0] ?? { find: async () => undefined })), 'the oldest card is settled').toBe(true)
})

test('a refused settle write is logged instead of left unhandled', async ($, on) => {
  const logs: string[] = []
  on('ui.log', ($, e) => {
    logs.push(e.text)

    return { value: undefined }
  })
  on('state.set', ($, e, next) => (e.key === 'settle' ? { deny: 'refused in a test' } : next(e)))
  const clock = stubEngine(on, { log: true })
  await startDesktop($, on)

  await $.ui.mount({
    ...SITE,
    surface: 'desktop',
    component: 'AssistantMessage',
    requestId: 'm1',
    props: { text: '| a | b |\n|---|---|\n| 1 | 2 |', isFirstOfReply: true },
  })
  await clock.advance(1500)

  expect(logs.some(text => text.startsWith('settle:') && text.includes('refused in a test'))).toBe(true)
})

test('cards waiting to settle are settled by one write, so the desktop redraws once and no card replays another', async ($, on) => {
  const writes: number[] = []
  on('state.set', ($, e, next) => {
    if (e.key === 'settle') {
      writes.push(e.value as number)
    }

    return next(e)
  })
  const clock = stubEngine(on)
  await startDesktop($, on)

  const reply = await $.ui.mount({
    ...SITE,
    surface: 'desktop',
    component: 'AssistantMessage',
    requestId: 'm1',
    props: { text: '| a | b |\n|---|---|\n| 1 | 2 |', isFirstOfReply: true },
  })
  const edit = await $.ui.mount({
    ...SITE,
    surface: 'desktop',
    component: 'ToolResult',
    requestId: 'e1',
    props: { tool_use_id: 'e1', tool: 'Edit', output: { filePath: '/work/a.ts', structuredPatch: [{ oldStart: 1, newStart: 1, lines: ['-a', '+b'] }] }, isErrored: false },
  })

  await clock.advance(400)
  expect(isSettled(await svgSource(reply))).toBe(false)
  expect(isSettled(await svgSource(edit))).toBe(false)

  await clock.advance(300)
  expect(isSettled(await svgSource(edit)), 'the diff settles when its entrance ends').toBe(true)
  expect(isSettled(await svgSource(reply)), 'and the table still waiting settles with it').toBe(true)
  expect(writes, 'in a single write').toHaveLength(1)

  await clock.advance(2000)
  expect(writes, 'and nothing settles again').toHaveLength(1)
})

test('a reply drawn on the desktop and on a phone plays and settles on both', async ($, on) => {
  const writes = writesOf(on, ['settle'])
  const clock = stubEngine(on)
  await startDesktop($, on)

  const desktop = await $.ui.mount(tableReply('desktop'))
  const phone = await $.ui.mount(tableReply('mobile'))
  expect(isSettled(await svgSource(desktop)), 'the desktop plays its entrance').toBe(false)
  expect(isSettled(await svgSource(phone)), 'and so does the phone').toBe(false)

  await clock.advance(3000)
  expect(isSettled(await svgSource(desktop)), 'the desktop card settles').toBe(true)
  expect(isSettled(await svgSource(phone)), 'the phone card settles').toBe(true)
  expect(writes, 'both in one write').toHaveLength(1)
})

test('a terminal drawing of a reply never waits on another surface settling', async ($, on) => {
  const reads = readsOf(on, ['settle'])
  stubEngine(on)
  await startDesktop($, on)

  await $.ui.mount(tableReply('mobile'))
  const afterPhone = reads.length
  await $.ui.mount(tableReply('terminal'))

  expect(reads.length - afterPhone, 'settle reads by the terminal drawing').toBe(0)
})

test('a band hidden while its rings fill still fills new numbers when it shows again', async ($, on) => {
  let percent = 42
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent }, rateLimits: [{ kind: 'five_hour', percentUsed: 18 }] } }))
  on('session.measure', () => ({ changed: [] }) as never)
  const clock = stubEngine(on, { usage: true })
  await startDesktop($, on)

  const band = await $.ui.mount(BAND('desktop', false))
  expect(isSettled(await svgSource(band)), 'the first rings fill in').toBe(false)
  await band.redraw({ ...BAND('desktop', false).props, hasSurvey: true })
  await clock.advance(1500)

  percent = 55
  await $.session.measure({ context: { window: 200000, percent }, rateLimits: [{ kind: 'five_hour', percentUsed: 18 }] } as never)
  await band.redraw(BAND('desktop', false).props)
  const source = await svgSource(band)

  expect(source).toContain('55%')
  expect(isSettled(source), 'the new numbers fill in').toBe(false)
})

test('a reply still entering when the session is cleared ends settled, with at most one settle write', async ($, on) => {
  const writes = writesOf(on, ['settle'])
  on('classic.SessionStart', () => ({}) as never)
  const clock = stubEngine(on)
  await startDesktop($, on)

  const reply = await $.ui.mount(tableReply('desktop'))
  await clock.advance(300)
  await $.classic.SessionStart({ source: 'clear' } as never)
  await clock.advance(1500)

  expect(isSettled(await svgSource(reply)), 'the card ends settled').toBe(true)
  expect(writes.length, 'settle writes').toBeLessThanOrEqual(1)
})

test('a refused settle write is tried again until it lands', async ($, on) => {
  let isRefused = true
  on('state.set', ($, e, next) => (e.key === 'settle' && isRefused ? { deny: 'refused once' } : next(e)))
  const clock = stubEngine(on)
  await startDesktop($, on)

  const reply = await $.ui.mount(tableReply('desktop'))
  await clock.advance(1500)
  expect(isSettled(await svgSource(reply)), 'still animated while refused').toBe(false)

  isRefused = false
  await clock.advance(300)
  expect(isSettled(await svgSource(reply)), 'settled once the refusal clears').toBe(true)
})

test('another mod redrawing mid-entrance settles the card first, so its redraw cannot replay it', { plugins: [COUNTDOWN] }, async ($, on) => {
  const writes = writesOf(on, ['settle'])
  const clock = stubEngine(on)
  await startDesktop($, on)

  await clock.advance(450)
  const reply = await $.ui.mount(tableReply('desktop'))
  await clock.advance(540)
  expect(writes, 'the card is still entering').toHaveLength(0)
  expect(isSettled(await svgSource(reply))).toBe(false)

  await clock.advance(20)
  expect(writes, 'the redraw at one second settled it first').toHaveLength(1)
  expect(isSettled(await svgSource(reply))).toBe(true)
})

test('a running tool row does not wait on its duration, so the tool finishing redraws nothing else', async ($, on) => {
  const reads = readsOf(on, ['duration'])
  stubEngine(on)

  const row = await $.ui.mount(toolUse(call('Bash', { command: 'sleep 9' }, { tool_use_id: 'tu9', isRunning: true }), 'desktop'))
  expect(reads, 'a running row reads no duration').toHaveLength(0)

  await row.redraw(call('Bash', { command: 'sleep 9' }, { tool_use_id: 'tu9' }) as never)
  expect(reads.length, 'a finished row reads its duration').toBeGreaterThan(0)
})

test('new usage numbers settle the cards still entering before the band redraws', async ($, on) => {
  const writes = writesOf(on, ['settle', 'usage'])
  let percent = 42
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent }, rateLimits: [] } }))
  on('session.measure', () => ({ changed: [] }) as never)
  const clock = stubEngine(on, { usage: true })
  await startDesktop($, on)

  const reply = await $.ui.mount(tableReply('desktop'))
  await clock.advance(300)
  writes.length = 0
  percent = 55
  await $.session.measure({ context: { window: 200000, percent }, rateLimits: [] } as never)

  expect(writes, 'the settle lands before the new numbers').toEqual(['settle', 'usage'])
  expect(isSettled(await svgSource(reply))).toBe(true)
})

test('a turn ending with the same usage numbers lets a card still entering finish its entrance', async ($, on) => {
  const writes = writesOf(on, ['settle', 'usage', 'turns'])
  on('turn.complete', () => ({ text: '' }))
  const clock = stubEngine(on)
  await startDesktop($, on)

  const reply = await $.ui.mount(tableReply('desktop'))
  await clock.advance(300)
  writes.length = 0
  await $.turn.complete({ answer: '', durationMs: 4200, isAborted: false, turnId: 't1', reason: 'answer' })

  expect(writes, 'the turn footers are drawn in the terminal only, so nothing settles for them').toEqual(['turns'])
  expect(isSettled(await svgSource(reply)), 'the card keeps entering').toBe(false)

  await clock.advance(1500)
  expect(isSettled(await svgSource(reply)), 'and settles as its entrance ends').toBe(true)
})

test('the same usage numbers again write nothing, so the desktop is not asked to redraw', async ($, on) => {
  const writes = writesOf(on, ['settle', 'usage'])
  on('session.measure', () => ({ changed: [] }) as never)
  stubEngine(on)
  await startDesktop($, on)

  await $.ui.mount(tableReply('desktop'))
  writes.length = 0
  await $.session.measure({ context: { window: 200000, percent: 42 }, rateLimits: [{ kind: 'five_hour', percentUsed: 18 }] } as never)

  expect(writes, 'writes for unchanged numbers').toEqual([])
})

test('a settle write that is always refused backs off to about once a second', async ($, on) => {
  let attempts = 0
  const logs: string[] = []
  on('ui.log', ($, e) => {
    logs.push(e.text)

    return { value: undefined }
  })
  on('state.set', ($, e, next) => {
    if (e.key === 'settle') {
      attempts += 1

      return { deny: 'always refused' }
    }

    return next(e)
  })
  const clock = stubEngine(on, { log: true })
  await startDesktop($, on)

  await $.ui.mount(tableReply('desktop'))
  await clock.advance(5000)
  const early = attempts
  await clock.advance(5000)

  expect(attempts, 'attempts in ten seconds').toBeLessThanOrEqual(20)
  expect(attempts - early, 'attempts in the last five seconds').toBeLessThanOrEqual(6)
  expect(logs.filter(text => text.startsWith('settle:')).length, 'one debug line per attempt').toBe(attempts)
})

const BAND_INVALIDATOR: Plugin = {
  name: 'band-invalidator',
  register(on) {
    let hasInvalidated = false

    on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
      const drawn = await next(e)

      if (!hasInvalidated) {
        hasInvalidated = true
        $.ui.invalidate('ui.render')
      }

      return drawn
    })
  },
}

test('a mod beneath the band invalidating while it draws still settles the entering cards first', { plugins: [BAND_INVALIDATOR] }, async ($, on) => {
  const order: string[] = []
  on('ui.log', ($, e) => {
    if (e.text.startsWith('settle:')) {
      order.push('refused')
    }

    return { value: undefined }
  })
  on('state.set', async ($, e, next) => {
    const result = await next(e)

    if (e.key === 'settle') {
      order.push('settled')
    }

    return result
  })
  on('ui.invalidate', ($, e, next) => {
    order.push('invalidate')

    return next(e)
  })
  const clock = stubEngine(on, { log: true })
  await startDesktop($, on)

  await $.ui.mount(tableReply('desktop'))
  await clock.advance(300)
  await $.ui.mount(BAND('desktop', false))
  await clock.advance(40)

  expect(order, 'the write refused inside the band drawing is retried and lands before the invalidate goes on').toEqual(['refused', 'settled', 'invalidate'])
})

const CLOCK_STEP: Plugin = {
  name: 'clock-step',
  register(on) {
    on('clock.now', async ($, e, next) => {
      const answer = (await next(e)) as { value: number }

      return { value: answer.value - Number((await $.env.get('CLOCK_STEP_MS')) ?? '0') }
    })
  },
}

test('a card entering when the wall clock steps back an hour still settles within seconds', { plugins: [CLOCK_STEP] }, async ($, on) => {
  let step = 0
  on('env.get', ($, e) => ({ value: e.name === 'CLOCK_STEP_MS' ? String(step) : undefined }))
  const clock = stubEngine(on, { env: true })
  await startDesktop($, on)

  const reply = await $.ui.mount(tableReply('desktop'))
  await clock.advance(300)
  step = 3_600_000
  await clock.advance(3000)

  expect(isSettled(await svgSource(reply)), 'settled three seconds after the step').toBe(true)
})

test('a settle refused for seconds lands before the next redraw by another mod once the refusal lifts', { plugins: [COUNTDOWN] }, async ($, on) => {
  let isRefused = true
  on('state.set', ($, e, next) => (e.key === 'settle' && isRefused ? { deny: 'refused for seconds' } : next(e)))
  const clock = stubEngine(on)
  await startDesktop($, on)

  const reply = await $.ui.mount(tableReply('desktop'))
  await clock.advance(4600)
  expect(isSettled(await svgSource(reply)), 'still animated while refused').toBe(false)

  isRefused = false
  await clock.advance(420)
  expect(isSettled(await svgSource(reply)), 'settled by the redraw at five seconds').toBe(true)
})

test('a settle refused for seconds lands before new usage numbers once the refusal lifts', async ($, on) => {
  let isRefused = true
  let percent = 42
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent }, rateLimits: [] } }))
  on('session.measure', () => ({ changed: [] }) as never)
  on('state.set', ($, e, next) => (e.key === 'settle' && isRefused ? { deny: 'refused for seconds' } : next(e)))
  const clock = stubEngine(on, { usage: true })
  await startDesktop($, on)

  const reply = await $.ui.mount(tableReply('desktop'))
  await clock.advance(4600)
  expect(isSettled(await svgSource(reply)), 'still animated while refused').toBe(false)

  isRefused = false
  percent = 55
  await $.session.measure({ context: { window: 200000, percent }, rateLimits: [] } as never)

  expect(isSettled(await svgSource(reply)), 'settled before the band redraws the new numbers').toBe(true)
})

const usageOf = (context: number, fiveHour: number) => ({ startedAt: 0, context: { window: 200000, percent: context }, rateLimits: [{ kind: 'five_hour', percentUsed: fiveHour }] })

test('a turn end moving the 5h limit inside the drawn percent leaves the band and the entering card alone', async ($, on) => {
  let fiveHour = 18.1
  const writes = writesOf(on, ['settle', 'usage', 'turns'])
  on('session.usage', () => ({ value: usageOf(42, fiveHour) }))
  on('turn.complete', () => ({ text: '' }))
  const clock = stubEngine(on, { usage: true })
  await startDesktop($, on)

  const band = await $.ui.mount(BAND('desktop', false))
  await clock.advance(1200)
  const before = await svgSource(band)
  expect(before).toContain('18%')
  expect(isSettled(before), 'the band has settled').toBe(true)

  const reply = await $.ui.mount(tableReply('desktop'))
  await clock.advance(300)
  writes.length = 0
  fiveHour = 18.4
  await $.turn.complete({ answer: '', durationMs: 4200, isAborted: false, turnId: 't1', reason: 'answer' })

  const after = await svgSource(band)
  expect(after, 'the band draws the same rings').toBe(before)
  expect(writes, 'writes at the turn end').toEqual(['turns'])
  expect(isSettled(await svgSource(reply)), 'the card keeps entering').toBe(false)
})

test('a measure moving the 5h limit inside the drawn percent writes nothing', async ($, on) => {
  let fiveHour = 18.1
  const writes = writesOf(on, ['settle', 'usage'])
  on('session.usage', () => ({ value: usageOf(42, fiveHour) }))
  on('session.measure', () => ({ changed: [] }) as never)
  const clock = stubEngine(on, { usage: true })
  await startDesktop($, on)

  const reply = await $.ui.mount(tableReply('desktop'))
  await clock.advance(300)
  writes.length = 0
  fiveHour = 18.4
  await $.session.measure(usageOf(42, 18.4) as never)

  expect(writes, 'writes for a move the band cannot show').toEqual([])
  expect(isSettled(await svgSource(reply)), 'the card keeps entering').toBe(false)
})

test('skipped tenths still let a later move across the rounding show, and the band ends exact', async ($, on) => {
  let fiveHour = 18.1
  const writes = writesOf(on, ['settle', 'usage'])
  on('session.usage', () => ({ value: usageOf(42, fiveHour) }))
  on('session.measure', () => ({ changed: [] }) as never)
  const clock = stubEngine(on, { usage: true })
  await startDesktop($, on)

  const band = await $.ui.mount(BAND('desktop', false))
  await clock.advance(1200)
  writes.length = 0

  for (const next of [18.2, 18.3, 18.4, 18.49]) {
    fiveHour = next
    await $.session.measure(usageOf(42, next) as never)
  }

  expect(writes, 'no write while the drawn percent stays 18').toEqual([])
  expect(await svgSource(band)).toContain('18%')

  fiveHour = 18.5
  await $.session.measure(usageOf(42, 18.5) as never)
  expect(writes, 'the move to 19 writes').toEqual(['usage'])
  const moved = await svgSource(band)
  expect(moved).toContain('19%')
  expect(isSettled(moved), 'the new rings fill in once').toBe(false)

  fiveHour = 18.1
  await $.session.measure(usageOf(42, 18.1) as never)
  expect(await svgSource(band), 'back down to 18 is drawn').toContain('18%')
})

test('a limit appearing, leaving or clamping past 100 is still compared by what is drawn', async ($, on) => {
  let usage: object = { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [] }
  const writes = writesOf(on, ['settle', 'usage'])
  on('session.usage', () => ({ value: usage as never }))
  on('session.measure', () => ({ changed: [] }) as never)
  const clock = stubEngine(on, { usage: true })
  await startDesktop($, on)

  const band = await $.ui.mount(BAND('desktop', false))
  await clock.advance(1200)
  writes.length = 0

  usage = { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [{ kind: 'spend_limit', percentUsed: 101.2 }] }
  await $.session.measure(usage as never)
  expect(writes).toEqual(['usage'])
  expect(await svgSource(band)).toContain('100%')

  writes.length = 0
  usage = { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [{ kind: 'spend_limit', percentUsed: 104.7 }] }
  await $.session.measure(usage as never)
  expect(writes, 'past 100 draws 100 both times').toEqual([])
  expect(isSettled(await svgSource(band)), 'the 100% rings are still filling').toBe(false)

  await clock.advance(1200)
  writes.length = 0
  usage = { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [] }
  await $.session.measure(usage as never)
  expect(writes, 'the limit leaving writes').toEqual(['usage'])
  expect(await svgSource(band)).not.toContain('spend')
})

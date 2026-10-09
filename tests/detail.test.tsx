import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { bodyOf, chunksOf, inputFields, isOpen, unifiedDiff } from '../hooks/detail'

// Opened tool rows: the chevron, the call's input in full and its answer.

const SITE = { plugin: 'skins', viewport: { columns: 100, rows: 30 } } as const

const STOCK: RenderElement = { type: 'Text', props: {}, children: ['stock row'] }

// `seen` collects the props each row hands back to Claude Code.
function stubEngine(on: On, seen?: unknown[]) {
  mock.clock(on, { now: 10_000 })
  on('session.cwd', () => ({ value: '/work' }))
  on('env.get', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [] } }))
  on('ui.render', ($, e) => {
    seen?.push(e.props)
    return STOCK
  })
}

type Surface = 'terminal' | 'desktop'

const call = (id: string, tool: string, input: unknown, output?: unknown, state: object = {}) => ({
  tool_use_id: id,
  tool,
  input,
  isRunning: false,
  isErrored: false,
  isInterrupted: false,
  ...(output === undefined ? {} : { output }),
  ...state,
})

const toolUse = (props: ReturnType<typeof call>, surface: Surface = 'terminal') =>
  ({ ...SITE, surface, component: 'ToolUse', requestId: props.tool_use_id, props }) as const

const toolResult = (id: string, tool: string, output: unknown, isErrored = false, surface: Surface = 'terminal') =>
  ({ ...SITE, surface, component: 'ToolResult', requestId: id, props: { tool_use_id: id, tool, output, isErrored } }) as const

const readOutput = (lines: number, startLine = 1) => ({
  type: 'text',
  file: {
    filePath: '/work/src/a.ts',
    content: Array.from({ length: lines }, (_, i) => `const line${i + startLine} = ${i + startLine}`).join('\n'),
    numLines: lines,
    startLine,
    totalLines: 200,
  },
})

type CodeFound = { props: { source: string; startLine?: number; format?: string; path?: string } } | undefined

async function opened($: Engine, props: ReturnType<typeof call>, surface: Surface = 'terminal') {
  const ui = await $.ui.mount(toolUse(props, surface))
  await ui.press({ key: 'disclose' })

  return ui
}

test('a tool row is closed, with a chevron that opens it on both surfaces', async ($, on) => {
  stubEngine(on)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount(toolUse(call(`c-${surface}`, 'Read', { file_path: '/work/src/a.ts' }, readOutput(3)), surface))
    expect(((await ui.find({ key: 'disclose' })) as { props: { label: string } } | undefined)?.props.label).toBe('▸')
    expect(await ui.find({ type: 'Code' })).toBeUndefined()
    await ui.press({ key: 'disclose' })
    expect(((await ui.find({ key: 'disclose' })) as { props: { label: string } } | undefined)?.props.label).toBe('▾')
    await ui.unmount()
  }
})

test('an opened Read shows the path and range asked for and the text with line numbers', async ($, on) => {
  stubEngine(on)

  const ui = await opened($, call('r1', 'Read', { file_path: '/work/src/a.ts', offset: 41, limit: 3 }, readOutput(3, 41)))
  expect(await ui.find({ type: 'Text', text: /path {2}src\/a\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /lines {2}41–43/ })).toBeDefined()
  const code = (await ui.find({ type: 'Code' })) as CodeFound
  expect(code?.props.startLine).toBe(41)
  expect(code?.props.path).toBe('/work/src/a.ts')
  expect(code?.props.source).toContain('const line43 = 43')
})

test('a long Read folds past 20 lines behind show all, and show less folds it again', async ($, on) => {
  stubEngine(on)

  const ui = await opened($, call('r2', 'Read', { file_path: '/work/src/a.ts' }, readOutput(30)))
  const folded = (await ui.find({ type: 'Code' })) as CodeFound
  expect(folded?.props.source).toContain('line20 ')
  expect(folded?.props.source).not.toContain('line21 ')
  await ui.press({ key: 'show-all' })
  expect(((await ui.find({ type: 'Code' })) as CodeFound)?.props.source).toContain('line30 ')
  expect(((await ui.find({ key: 'show-all' })) as { props: { label: string } } | undefined)?.props.label).toBe('show less')
})

test('an opened Grep shows its pattern, glob and the matching lines or files', async ($, on) => {
  stubEngine(on)

  const content = await opened($, call('g1', 'Grep', { pattern: 'TODO', glob: '*.ts', output_mode: 'content' }, { mode: 'content', numFiles: 1, filenames: [], content: '/work/src/a.ts:3:// TODO tidy\n/work/src/a.ts:9:// TODO test', numLines: 2 }))
  expect(await content.find({ type: 'Text', text: /pattern {2}TODO/ })).toBeDefined()
  expect(await content.find({ type: 'Text', text: /glob {2}\*\.ts/ })).toBeDefined()
  expect(await content.find({ type: 'Text', text: 'src/a.ts:9:// TODO test' })).toBeDefined()
  expect(await content.find({ type: 'Text', text: '2 lines' })).toBeDefined()
  await content.unmount()

  const files = await opened($, call('g2', 'Glob', { pattern: '**/*.md' }, { filenames: ['/work/README.md', '/work/docs/compat.md'], numFiles: 2, truncated: false }))
  expect(await files.find({ type: 'Text', text: 'docs/compat.md' })).toBeDefined()
  expect(await files.find({ type: 'Text', text: '2 files' })).toBeDefined()
})

test('an opened PowerShell call shows its command and output as the shell card', async ($, on) => {
  stubEngine(on)

  const ui = await opened($, call('p1', 'PowerShell', { command: 'Get-ChildItem src' }, { stdout: 'a.ts\nb.ts', stderr: '', interrupted: false }))
  expect(await ui.find({ type: 'Text', text: /command {2}Get-ChildItem src/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: '$ Get-ChildItem src' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: 'b.ts' })).toBeDefined()
  await ui.unmount()

  const desktop = await opened($, call('p2', 'PowerShell', { command: 'Get-ChildItem src' }, { stdout: 'a.ts', stderr: '', interrupted: false }), 'desktop')
  expect(JSON.stringify(await desktop.findAll({ type: 'Svg' }))).toContain('a.ts')
})

test('PowerShell gets the shell card and the clip as Bash does', async ($, on) => {
  const seen: unknown[] = []
  stubEngine(on, seen)
  const ids: string[] = []
  on('tool.call', ($, e) => {
    ids.push(e.tool_use_id)
    return { result: { stdout: '', stderr: '', interrupted: false } }
  })
  await $.tool.call({ tool: 'PowerShell' as 'Bash', command: 'Get-Date' })
  const [id = ''] = ids

  const card = await $.ui.mount(toolResult(id, 'PowerShell', { stdout: 'Friday', stderr: '', interrupted: false }))
  expect(await card.find({ type: 'Text', text: '$ Get-Date' })).toBeDefined()
  await card.unmount()

  const desktop = await $.ui.mount(toolResult(id, 'PowerShell', { stdout: 'Friday', stderr: '', interrupted: false }, false, 'desktop'))
  expect(JSON.stringify(await desktop.find({ type: 'Svg' }))).toContain('Friday')
  await desktop.unmount()

  // With the card off, long output is still clipped to its head and tail.
  await $.command.run({ command: 'skin', args: 'shell off', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  await $.command.run({ command: 'skin', args: 'clip on', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })
  const stdout = Array.from({ length: 40 }, (_, i) => `row ${i}`).join('\n')
  await $.ui.mount(toolResult(id, 'PowerShell', { stdout, stderr: '', interrupted: false }))
  expect(JSON.stringify(seen.at(-1))).toContain('lines hidden')
})

test('an opened Edit shows the diff: the engine’s diff on the terminal, the diff card on the desktop', async ($, on) => {
  stubEngine(on)
  const output = { filePath: '/work/a.ts', structuredPatch: [{ oldStart: 4, oldLines: 1, newStart: 4, newLines: 1, lines: ['-old()', '+fresh()'] }] }

  const terminal = await opened($, call('e1', 'Edit', { file_path: '/work/a.ts', old_string: 'old()', new_string: 'fresh()' }, output))
  const diff = (await terminal.find({ type: 'Code' })) as CodeFound
  expect(diff?.props.format).toBe('diff')
  expect(diff?.props.source).toBe('@@ -4,1 +4,1 @@\n-old()\n+fresh()')
  // The strings are in the diff; the input lists what is not.
  expect(await terminal.find({ type: 'Text', text: /old_string/ })).toBeUndefined()
  await terminal.unmount()

  const desktop = await opened($, call('e2', 'Edit', { file_path: '/work/a.ts' }, output), 'desktop')
  expect(JSON.stringify(await desktop.findAll({ type: 'Svg' }))).toContain('fresh()')
})

test('an opened image Read is Claude Code’s own drawing, and its result stays Claude Code’s', async ($, on) => {
  stubEngine(on)
  const output = { type: 'image', file: { base64: 'iVBORw0KGgo=', type: 'image/png', originalSize: 8 } }

  const ui = await opened($, call('i1', 'Read', { file_path: '/work/shot.png' }, output))
  expect(await ui.find({ type: 'Text', text: 'stock row' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /path {2}shot\.png/ })).toBeDefined()

  const result = await $.ui.mount(toolResult('i1', 'Read', output))
  expect(await result.find({ type: 'Text', text: 'stock row' })).toBeDefined()
})

test('a failed call opens by itself and draws its error there, not twice', async ($, on) => {
  stubEngine(on)
  const error = '<tool_use_error>File does not exist.</tool_use_error>'

  const ui = await $.ui.mount(toolUse(call('f1', 'Read', { file_path: '/work/gone.ts' }, error, { isErrored: true })))
  expect(((await ui.find({ key: 'disclose' })) as { props: { label: string } } | undefined)?.props.label).toBe('▾')
  expect(await ui.find({ type: 'Text', text: 'File does not exist.' })).toBeDefined()

  const result = await $.ui.mount(toolResult('f1', 'Read', error, true))
  expect(await result.find({ type: 'Text', text: 'stock row' })).toBeUndefined()
  await result.unmount()

  // Closed, the result is Claude Code's again.
  await ui.press({ key: 'disclose' })
  expect(await ui.find({ type: 'Text', text: 'File does not exist.' })).toBeUndefined()
  const again = await $.ui.mount(toolResult('f1', 'Read', error, true))
  expect(await again.find({ type: 'Text', text: 'stock row' })).toBeDefined()
})

test('each call keeps its own open state', async ($, on) => {
  stubEngine(on)

  const first = await opened($, call('s1', 'Read', { file_path: '/work/a.ts' }, readOutput(2)))
  const second = await $.ui.mount(toolUse(call('s2', 'Read', { file_path: '/work/a.ts' }, readOutput(2))))
  expect(await first.find({ type: 'Code' })).toBeDefined()
  expect(await second.find({ type: 'Code' })).toBeUndefined()
  await first.unmount()

  const back = await $.ui.mount(toolUse(call('s1', 'Read', { file_path: '/work/a.ts' }, readOutput(2))))
  expect(await back.find({ type: 'Code' })).toBeDefined()
})

test('the detail logic reads each answer the way its row draws it', () => {
  expect(isOpen('auto', true)).toBe(true)
  expect(isOpen('auto', false)).toBe(false)
  expect(isOpen('closed', true)).toBe(false)
  expect(inputFields('Bash', { command: 'ls', description: 'list', timeout: 5000 }, '/work').map(field => field.label)).toEqual(['command', 'description', 'timeout'])
  expect(bodyOf('Bash', { stdout: '', stderr: '', interrupted: false, backgroundTaskId: 'b1' }, false, false, '/work').kind).toBe('stock')
  expect(bodyOf('Read', readOutput(1), false, true, '/work').kind).toBe('none')
  expect(bodyOf('mcp__gh__search', { content: [{ type: 'text', text: 'two hits' }] }, false, false, '/work')).toEqual({ kind: 'text', text: 'two hits', isError: false })
  expect(bodyOf('mcp__gh__shot', [{ type: 'image', data: '' }], false, false, '/work').kind).toBe('stock')
  expect(bodyOf('Read', { type: 'text', file: { filePath: '/a', content: 'a\u001b[31mred\r\nb', startLine: 1 } }, false, false, '/').kind).toBe('file')
  expect(unifiedDiff({ path: '/a', isNewFile: true, hunks: [{ oldStart: 0, newStart: 1, lines: ['+x', '+y'] }] })).toBe('@@ -0,0 +1,2 @@\n+x\n+y')
  expect(chunksOf(['aaaa', 'bbbb', 'cccc'], 10, 9)).toEqual([
    { text: 'aaaa', startLine: 10 },
    { text: 'bbbb', startLine: 11 },
    { text: 'cccc', startLine: 12 },
  ])
})

import type { On, RenderElement } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

import { highlight, languageOf, outputTokens } from '../hooks/highlight'
import type { Role } from '../hooks/highlight'
import noir from '../hooks/themes/noir'
import dracula from '../hooks/themes/dracula'

// The terminal's highlighting: each language family, shell output, and the toggle.

// The role of the first token whose text is `text`, on any line.
function roleOf(code: string, lang: string, text: string): Role | undefined {
  return highlight(code, lang)
    .flat()
    .find(token => token.text === text)?.role
}

test('every fence tag in the list maps to a family', () => {
  const tags = ['ts', 'js', 'tsx', 'json', 'bash', 'sh', 'powershell', 'python', 'rust', 'go', 'c', 'cpp', 'c#', 'java', 'yaml', 'toml', 'html', 'xml', 'css', 'sql', 'diff', 'markdown', 'lua']

  expect(tags.filter(tag => languageOf(tag) === undefined)).toEqual([])
  expect(languageOf('brainfuck')).toBeUndefined()
})

test('C-like families: keywords, types, strings, numbers, comments, calls', () => {
  const ts = 'const n: number = 42 // answer\nexport async function load() { return `x${n}` }'
  expect(roleOf(ts, 'ts', 'const')).toBe('keyword')
  expect(roleOf(ts, 'ts', 'number')).toBe('type')
  expect(roleOf(ts, 'ts', '42')).toBe('number')
  expect(roleOf(ts, 'ts', '// answer')).toBe('comment')
  expect(roleOf(ts, 'ts', 'load')).toBe('func')
  expect(roleOf(ts, 'ts', '`x${n}`')).toBe('string')

  expect(roleOf('/* a\nstill */ let x = null', 'js', 'still */')).toBe('comment')
  expect(roleOf('/* a\nstill */ let x = null', 'js', 'null')).toBe('literal')
  expect(roleOf('fn main() -> Result<(), String> { let mut v: Vec<u8> = Vec::new(); }', 'rust', 'mut')).toBe('keyword')
  expect(roleOf('fn f<\'a>(s: &\'a str) {}', 'rust', 'str')).toBe('type')
  expect(roleOf('func main() { x := []int{1}; return nil }', 'go', 'nil')).toBe('literal')
  expect(roleOf('#include <stdio.h>\nint main(void) { return 0; }', 'c', '#include')).toBe('keyword')
  expect(roleOf('#include <stdio.h>\nint main(void) { return 0; }', 'cpp', 'int')).toBe('type')
  expect(roleOf('public sealed record Point(int X);', 'c#', 'sealed')).toBe('keyword')
  expect(roleOf('@Override\npublic String toString() { return "p"; }', 'java', '@Override')).toBe('meta')
})

test('scripting families: Python, shells, PowerShell, Lua, SQL', () => {
  const py = 'def f(x):\n    """doc\n    more"""\n    return None  # nothing'
  expect(roleOf(py, 'python', 'def')).toBe('keyword')
  expect(roleOf(py, 'python', '    more"""')).toBe('string')
  expect(roleOf(py, 'python', 'None')).toBe('literal')
  expect(roleOf(py, 'python', '# nothing')).toBe('comment')

  const sh = 'npm run build && echo "$HOME" # done\nfor f in *.ts; do cat $f; done'
  expect(roleOf(sh, 'bash', 'npm')).toBe('func')
  expect(roleOf(sh, 'bash', '"$HOME"')).toBe('string')
  expect(roleOf(sh, 'sh', '$f')).toBe('variable')
  expect(roleOf(sh, 'bash', '# done')).toBe('comment')
  expect(roleOf(sh, 'bash', 'for')).toBe('keyword')

  const ps = 'Get-ChildItem -Path $env:USERPROFILE | Where-Object { $_.Length -gt 1KB } # big\nif ($true) { exit 1 }'
  expect(roleOf(ps, 'powershell', 'Get-ChildItem')).toBe('func')
  expect(roleOf(ps, 'pwsh', '$env:USERPROFILE')).toBe('variable')
  expect(roleOf(ps, 'powershell', '$true')).toBe('literal')
  expect(roleOf(ps, 'powershell', '1KB')).toBe('number')
  expect(roleOf(ps, 'powershell', 'if')).toBe('keyword')

  expect(roleOf('local t = {} -- a table\n--[[ long\ncomment ]] return nil', 'lua', 'comment ]]')).toBe('comment')
  expect(roleOf('local t = {} -- a table', 'lua', 'local')).toBe('keyword')
  expect(roleOf('SELECT id FROM users WHERE name = \'x\' -- pick', 'sql', 'SELECT')).toBe('keyword')
  expect(roleOf('select id from users', 'sql', 'from')).toBe('keyword')
  expect(roleOf("SELECT id FROM users WHERE name = 'x'", 'sql', "'x'")).toBe('string')
})

test('data families: JSON, YAML, TOML', () => {
  const json = '{\n  "name": "skins",\n  "private": true,\n  "size": 12.5\n}'
  expect(roleOf(json, 'json', '"name"')).toBe('property')
  expect(roleOf(json, 'json', '"skins"')).toBe('string')
  expect(roleOf(json, 'json', 'true')).toBe('literal')
  expect(roleOf(json, 'json', '12.5')).toBe('number')

  const yaml = '# ci\non:\n  push:\n    branches: [main]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    timeout: 10\n    fail-fast: false\n    name: "a test"'
  expect(roleOf(yaml, 'yaml', '# ci')).toBe('comment')
  expect(roleOf(yaml, 'yml', 'runs-on')).toBe('property')
  expect(roleOf(yaml, 'yaml', '10')).toBe('number')
  expect(roleOf(yaml, 'yaml', 'false')).toBe('literal')
  expect(roleOf(yaml, 'yaml', '"a test"')).toBe('string')

  const toml = '[package]\nname = "skins" # the name\nversion = 5\n[dependencies]\nserde = { version = "1" }'
  expect(roleOf(toml, 'toml', '[package]')).toBe('tag')
  expect(roleOf(toml, 'toml', 'name')).toBe('property')
  expect(roleOf(toml, 'toml', '"skins"')).toBe('string')
  expect(roleOf(toml, 'toml', '# the name')).toBe('comment')
  expect(roleOf(toml, 'toml', '5')).toBe('number')
})

test('markup families: HTML/XML, CSS, diff, markdown', () => {
  const html = '<!-- top -->\n<a href="/x" class=\'b\'>go &amp; see</a>'
  expect(roleOf(html, 'html', '<!-- top -->')).toBe('comment')
  expect(roleOf(html, 'html', '<a')).toBe('tag')
  expect(roleOf(html, 'xml', 'href')).toBe('attr')
  expect(roleOf(html, 'html', '"/x"')).toBe('string')
  expect(roleOf(html, 'html', '&amp;')).toBe('literal')

  const css = '.card {\n  font-size: 12px; /* small */\n  color: red;\n}'
  expect(roleOf(css, 'css', 'font-size')).toBe('property')
  expect(roleOf(css, 'css', '12px')).toBe('number')
  expect(roleOf(css, 'css', '/* small */')).toBe('comment')

  const diff = 'diff --git a/x b/x\n@@ -1,2 +1,2 @@\n-old\n+new\n same'
  expect(highlight(diff, 'diff').map(line => line[0]?.role)).toEqual(['meta', 'heading', 'del', 'add', 'plain'])

  const md = '# Title\n- [x] done with `code` and **bold**\n```ts'
  expect(roleOf(md, 'md', '# Title')).toBe('heading')
  expect(roleOf(md, 'markdown', '`code`')).toBe('string')
  expect(roleOf(md, 'markdown', '**bold**')).toBe('keyword')
  expect(roleOf(md, 'markdown', '```ts')).toBe('meta')
})

test('a language it does not know is one plain token a line, its text whole', () => {
  expect(highlight('a\nb', 'cobol')).toEqual([[{ text: 'a', role: 'plain' }], [{ text: 'b', role: 'plain' }]])
  // Tokens always join back into the line they came from.
  const code = 'const s = "a\\"b" /* c */ + 1e3\nfn x<\'a>() {}'

  for (const lang of ['ts', 'rust', 'python', 'bash', 'powershell', 'json', 'yaml', 'toml', 'html', 'css', 'sql', 'lua', 'markdown', 'diff']) {
    expect(highlight(code, lang).map(line => line.map(token => token.text).join(''))).toEqual(code.split('\n'))
  }
})

test('shell output picks out failures, warnings, passes, paths and numbers', () => {
  const roles = (line: string) => Object.fromEntries(outputTokens(line).filter(token => token.role !== 'plain').map(token => [token.text, token.role]))

  expect(roles('src/server.ts:12:5 error TS2322 in 120ms')).toEqual({ 'src/server.ts:12:5': 'property', error: 'del', '120ms': 'number' })
  expect(roles('warning: deprecated flag')).toEqual({ warning: 'warn', deprecated: 'warn' })
  expect(roles('✓ 148 passed')).toEqual({ '✓': 'add', '148': 'number', passed: 'add' })
  expect(roles('C:\\Users\\me\\a.ps1')).toEqual({ 'C:\\Users\\me\\a.ps1': 'property' })
})

const SITE = { plugin: 'skins', viewport: { columns: 100, rows: 30 } } as const
const STOCK: RenderElement = { type: 'Text', props: {}, children: ['stock row'] }

function stub(on: On) {
  mock.clock(on, { now: 10_000 })
  on('session.cwd', () => ({ value: '/work' }))
  on('env.get', () => ({ value: undefined }))
  on('store.get', () => ({ value: undefined }))
  on('store.set', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 42 }, rateLimits: [] } }))
  on('ui.render', () => STOCK)
}

const skin = ($: Engine, args: string) =>
  $.command.run({ command: 'skin', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 100 } })

type Span = { props: { color?: string }; children?: readonly unknown[] }

// The colour of the span showing exactly `text`, anywhere under `node`.
function colorOf(node: unknown, text: string): string | undefined {
  const element = node as Span | undefined

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

test('a fence on the terminal is drawn in the skin\u2019s colours, its language on the frame', async ($, on) => {
  stub(on)
  await skin($, 'dracula')
  const text = 'Try:\n\n```python\ndef go():\n    return 1  # one\n```'
  const ui = await $.ui.mount({ ...SITE, surface: 'terminal', component: 'AssistantMessage', requestId: 'h1', props: { text, isFirstOfReply: true } })

  expect(await ui.find({ type: 'Text', text: ' python ' })).toBeDefined()
  const line = await ui.find({ type: 'Text', text: '    return 1  # one' })
  expect(colorOf(line, 'return')).toBe(dracula.palette.web)
  expect(colorOf(line, '1')).toBe(dracula.palette.search)
  expect(colorOf(line, '# one')).toBe(dracula.palette.muted)
  expect(await ui.find({ key: 'copy-1' })).toBeDefined()
})

test('a fence in a language it does not know keeps Claude Code\u2019s markdown', async ($, on) => {
  stub(on)
  const ui = await $.ui.mount({ ...SITE, surface: 'terminal', component: 'AssistantMessage', requestId: 'h2', props: { text: '```cobol\nDISPLAY "HI".\n```', isFirstOfReply: true } })

  expect(await ui.find({ type: 'Markdown' })).toBeDefined()
})

test('shell output is coloured in both cards, and plain with highlight off', async ($, on) => {
  stub(on)
  const output = { stdout: 'src/a.ts:3 error in 12ms', stderr: '', interrupted: false }
  const result = (surface: 'terminal' | 'desktop', id: string) =>
    ({ ...SITE, surface, component: 'ToolResult', requestId: id, props: { tool_use_id: id, tool: 'Bash', output, isErrored: false } }) as const

  const terminal = await $.ui.mount(result('terminal', 'o1'))
  const line = await terminal.find({ type: 'Text', text: 'src/a.ts:3 error in 12ms' })
  expect(colorOf(line, 'error')).toBe(noir.palette.err)
  await terminal.unmount()

  const desktop = await $.ui.mount(result('desktop', 'o2'))
  const source = ((await desktop.find({ type: 'Svg' })) as { props: { source: string } } | undefined)?.props.source ?? ''
  expect(source).toContain(`<tspan style="fill:${noir.palette.err}">error</tspan>`)
  await desktop.unmount()

  await skin($, 'highlight off')
  const plain = await $.ui.mount(result('terminal', 'o3'))
  expect(colorOf(await plain.find({ type: 'Text', text: 'src/a.ts:3 error in 12ms' }), 'src/a.ts:3 error in 12ms')).toBe(noir.palette.fg)
  const flat = await $.ui.mount(result('desktop', 'o4'))
  expect(((await flat.find({ type: 'Svg' })) as { props: { source: string } } | undefined)?.props.source).not.toContain('<tspan')
})

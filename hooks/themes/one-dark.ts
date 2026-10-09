import type { Skin } from '../skin'

const skin: Skin = {
  name: 'one-dark',
  label: 'One Dark',
  palette: {
    read: '#56b6c2',
    write: '#d19a66',
    run: '#e5c07b',
    search: '#c678dd',
    web: '#61afef',
    mcp: '#56b6c2',
    other: '#abb2bf',
    user: '#61afef',
    fg: '#abb2bf',
    muted: '#5c6370',
    surface: '#2c313a',
    zebra: '#262a31',
    ok: '#98c379',
    err: '#e06c75',
    warn: '#e5c07b',
  },
  light: {
    read: '#0184bc',
    write: '#986801',
    run: '#c18401',
    search: '#a626a4',
    web: '#4078f2',
    mcp: '#0184bc',
    other: '#696c77',
    user: '#4078f2',
    fg: '#383a42',
    muted: '#a0a1a7',
    surface: '#f0f0f1',
    zebra: '#f5f5f6',
    ok: '#50a14f',
    err: '#e45649',
    warn: '#c18401',
  },
  spinner: ['Compiling', 'Linting', 'Atomizing', 'Bundling', 'Indexing', 'Parsing'],
  done: ['Built', 'Linted', 'Bundled', 'Indexed'],
}

export default skin

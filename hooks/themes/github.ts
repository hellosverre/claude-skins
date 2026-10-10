import type { Skin } from '../skin'

const skin: Skin = {
  name: 'github',
  label: 'GitHub',
  palette: {
    read: '#79c0ff',
    write: '#ffa657',
    run: '#d29922',
    search: '#d2a8ff',
    web: '#58a6ff',
    mcp: '#56d4dd',
    other: '#c9d1d9',
    user: '#58a6ff',
    fg: '#e6edf3',
    muted: '#7d8590',
    surface: '#161b22',
    zebra: '#11161d',
    ok: '#3fb950',
    err: '#f85149',
    warn: '#d29922',
  },
  light: {
    read: '#0969da',
    write: '#bc4c00',
    run: '#9a6700',
    search: '#8250df',
    web: '#0550ae',
    mcp: '#1b7c83',
    other: '#57606a',
    user: '#0969da',
    fg: '#1f2328',
    muted: '#656d76',
    surface: '#f6f8fa',
    zebra: '#fafbfc',
    ok: '#1a7f37',
    err: '#cf222e',
    warn: '#9a6700',
  },
  spinner: ['Committing', 'Rebasing', 'Forking', 'Pushing', 'Cherry-picking', 'Stashing'],
  done: ['Merged', 'Pushed', 'Committed', 'Tagged'],
}

export default skin

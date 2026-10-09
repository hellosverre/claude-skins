import type { Skin } from '../skin'

const skin: Skin = {
  name: 'solarized',
  label: 'Solarized',
  palette: {
    read: '#2aa198',
    write: '#cb4b16',
    run: '#b58900',
    search: '#6c71c4',
    web: '#268bd2',
    mcp: '#2aa198',
    other: '#93a1a1',
    user: '#268bd2',
    fg: '#93a1a1',
    muted: '#586e75',
    surface: '#073642',
    zebra: '#04313c',
    ok: '#859900',
    err: '#dc322f',
    warn: '#b58900',
  },
  light: {
    read: '#2aa198',
    write: '#cb4b16',
    run: '#b58900',
    search: '#6c71c4',
    web: '#268bd2',
    mcp: '#2aa198',
    other: '#657b83',
    user: '#268bd2',
    fg: '#586e75',
    muted: '#93a1a1',
    surface: '#eee8d5',
    zebra: '#f5efdc',
    ok: '#859900',
    err: '#dc322f',
    warn: '#b58900',
  },
  spinner: ['Orbiting', 'Basking', 'Flaring', 'Eclipsing', 'Rising', 'Setting'],
  done: ['Risen', 'Set', 'Orbited', 'Eclipsed'],
}

export default skin

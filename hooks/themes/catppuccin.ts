import type { Skin } from '../skin'

const skin: Skin = {
  name: 'catppuccin',
  label: 'Catppuccin Mocha',
  palette: {
    read: '#89dceb',
    write: '#fab387',
    run: '#f9e2af',
    search: '#cba6f7',
    web: '#74c7ec',
    mcp: '#94e2d5',
    other: '#bac2de',
    user: '#cba6f7',
    fg: '#cdd6f4',
    muted: '#7f849c',
    surface: '#252536',
    zebra: '#232334',
    ok: '#a6e3a1',
    err: '#f38ba8',
    warn: '#f9e2af',
  },
  light: {
    read: '#04a5e5',
    write: '#fe640b',
    run: '#df8e1d',
    search: '#8839ef',
    web: '#209fb5',
    mcp: '#179299',
    other: '#5c5f77',
    user: '#8839ef',
    fg: '#4c4f69',
    muted: '#8c8fa1',
    surface: '#e6e9ef',
    zebra: '#eceef3',
    ok: '#40a02b',
    err: '#d20f39',
    warn: '#df8e1d',
  },
  spinner: ['Purring', 'Napping', 'Pouncing', 'Kneading', 'Stretching', 'Nuzzling'],
  done: ['Pounced', 'Purred', 'Napped', 'Curled up'],
}

export default skin

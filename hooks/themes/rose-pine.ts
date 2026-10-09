import type { Skin } from '../skin'

const skin: Skin = {
  name: 'rose-pine',
  label: 'Rosé Pine',
  palette: {
    read: '#9ccfd8',
    write: '#ebbcba',
    run: '#f6c177',
    search: '#c4a7e7',
    web: '#3e8fb0',
    mcp: '#31748f',
    other: '#908caa',
    user: '#c4a7e7',
    fg: '#e0def4',
    muted: '#6e6a86',
    surface: '#26233a',
    zebra: '#1f1d2e',
    ok: '#9ccfd8',
    err: '#eb6f92',
    warn: '#f6c177',
  },
  light: {
    read: '#56949f',
    write: '#d7827e',
    run: '#ea9d34',
    search: '#907aa9',
    web: '#286983',
    mcp: '#286983',
    other: '#797593',
    user: '#907aa9',
    fg: '#575279',
    muted: '#9893a5',
    surface: '#f2e9e1',
    zebra: '#fffaf3',
    ok: '#56949f',
    err: '#b4637a',
    warn: '#ea9d34',
  },
  spinner: ['Blooming', 'Pruning', 'Steeping', 'Petaling', 'Wilting', 'Climbing'],
  done: ['Bloomed', 'Pruned', 'Steeped', 'Planted'],
}

export default skin

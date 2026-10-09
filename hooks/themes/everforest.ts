import type { Skin } from '../skin'

const skin: Skin = {
  name: 'everforest',
  label: 'Everforest',
  palette: {
    read: '#7fbbb3',
    write: '#e69875',
    run: '#dbbc7f',
    search: '#d699b6',
    web: '#83c092',
    mcp: '#83c092',
    other: '#9da9a0',
    user: '#a7c080',
    fg: '#d3c6aa',
    muted: '#859289',
    surface: '#3d484d',
    zebra: '#343f44',
    ok: '#a7c080',
    err: '#e67e80',
    warn: '#dbbc7f',
  },
  light: {
    read: '#3a94c5',
    write: '#f57d26',
    run: '#dfa000',
    search: '#df69ba',
    web: '#35a77c',
    mcp: '#35a77c',
    other: '#829181',
    user: '#8da101',
    fg: '#5c6a72',
    muted: '#939f91',
    surface: '#efebd4',
    zebra: '#f4f0d9',
    ok: '#8da101',
    err: '#f85552',
    warn: '#dfa000',
  },
  spinner: ['Foraging', 'Rooting', 'Sprouting', 'Hiking', 'Mossing', 'Branching'],
  done: ['Grown', 'Rooted', 'Foraged', 'Camped'],
}

export default skin

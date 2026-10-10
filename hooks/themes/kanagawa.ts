import type { Skin } from '../skin'

const skin: Skin = {
  name: 'kanagawa',
  label: 'Kanagawa',
  palette: {
    read: '#7fb4ca',
    write: '#ffa066',
    run: '#e6c384',
    search: '#957fb8',
    web: '#7e9cd8',
    mcp: '#7aa89f',
    other: '#c8c093',
    user: '#7e9cd8',
    fg: '#dcd7ba',
    muted: '#727169',
    surface: '#2a2a37',
    zebra: '#232330',
    ok: '#98bb6c',
    err: '#e46876',
    warn: '#e6c384',
  },
  light: {
    read: '#4e8ca2',
    write: '#cc6d00',
    run: '#836f4a',
    search: '#624c83',
    web: '#4d699b',
    mcp: '#597b75',
    other: '#716e61',
    user: '#4d699b',
    fg: '#545464',
    muted: '#8a8980',
    surface: '#e7dba0',
    zebra: '#ede5b4',
    ok: '#6f894e',
    err: '#c84053',
    warn: '#836f4a',
  },
  spinner: ['Cresting', 'Inking', 'Brushing', 'Swelling', 'Breaking', 'Ebbing'],
  done: ['Crested', 'Inked', 'Brushed', 'Broken'],
}

export default skin

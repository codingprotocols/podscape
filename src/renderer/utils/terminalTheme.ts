import type { ITheme } from '@xterm/xterm'

export const TERM_FONT = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace"

export function getTerminalTheme(dark: boolean): ITheme {
  return dark ? {
    // GitHub Dark Dimmed palette — high contrast, easy on the eyes
    background: '#0d1117',
    foreground: '#e6edf3',
    cursor: '#58a6ff',
    cursorAccent: '#0d1117',
    selectionBackground: 'rgba(56, 139, 253, 0.25)',
    selectionForeground: '#e6edf3',
    // black must be a visible mid-gray — not near-black (the most common visibility bug)
    black: '#484f58',        brightBlack: '#8b949e',
    red: '#ff7b72',          brightRed: '#ffa198',
    green: '#3fb950',        brightGreen: '#56d364',
    yellow: '#e3b341',       brightYellow: '#f0c63f',
    blue: '#58a6ff',         brightBlue: '#79c0ff',
    magenta: '#d2a8ff',      brightMagenta: '#f0abfc',
    cyan: '#39c5cf',         brightCyan: '#56d4dd',
    white: '#b1bac4',        brightWhite: '#ffffff',
  } : {
    // Light theme — keep background pure white, darken all text colors for contrast
    background: '#ffffff',
    foreground: '#24292f',
    cursor: '#0969da',
    cursorAccent: '#ffffff',
    selectionBackground: 'rgba(9, 105, 218, 0.15)',
    selectionForeground: '#24292f',
    // white must be dark on a white background
    black: '#24292f',        brightBlack: '#57606a',
    red: '#cf222e',          brightRed: '#a40e26',
    green: '#116329',        brightGreen: '#1a7f37',
    yellow: '#633c01',       brightYellow: '#4d2d00',
    blue: '#0550ae',         brightBlue: '#0969da',
    magenta: '#6639ba',      brightMagenta: '#8250df',
    cyan: '#1b7c83',         brightCyan: '#0969da',
    white: '#57606a',        brightWhite: '#24292f',
  }
}

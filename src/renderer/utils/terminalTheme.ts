import type { ITheme } from '@xterm/xterm'

export const TERM_FONT = "'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace"

export function getTerminalTheme(dark: boolean): ITheme {
  return dark ? {
    background: '#020617',
    foreground: '#f8fafc',
    cursor: '#3b82f6',
    selectionBackground: 'rgba(59, 130, 246, 0.3)',
    black: '#0f172a', brightBlack: '#334155',
    red: '#ef4444', brightRed: '#f87171',
    green: '#10b981', brightGreen: '#34d399',
    yellow: '#f59e0b', brightYellow: '#fbbf24',
    blue: '#3b82f6', brightBlue: '#60a5fa',
    magenta: '#8b5cf6', brightMagenta: '#a78bfa',
    cyan: '#06b6d4', brightCyan: '#22d3ee',
    white: '#f1f5f9', brightWhite: '#ffffff'
  } : {
    background: '#ffffff',
    foreground: '#0f172a',
    cursor: '#3b82f6',
    selectionBackground: 'rgba(59, 130, 246, 0.1)',
    black: '#000000', brightBlack: '#475569',
    red: '#dc2626', brightRed: '#ef4444',
    green: '#16a34a', brightGreen: '#22c55e',
    yellow: '#d97706', brightYellow: '#f59e0b',
    blue: '#2563eb', brightBlue: '#3b82f6',
    magenta: '#7c3aed', brightMagenta: '#8b5cf6',
    cyan: '#0891b2', brightCyan: '#06b6d4',
    white: '#f1f5f9', brightWhite: '#ffffff'
  }
}

import type { Config } from 'tailwindcss';

const v = (name: string) => `rgb(var(${name}) / <alpha-value>)`;

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base:    v('--c-bg'),
        card:    v('--c-surface'),
        hover:   v('--c-surface2'),
        border:  v('--c-border'),
        accent:  v('--c-accent'),
        danger:  v('--c-danger'),
        dim:     v('--c-dim'),
        fg:      v('--c-fg'),
        'fg-dim': v('--c-dim'),
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;

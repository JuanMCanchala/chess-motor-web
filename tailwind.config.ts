import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base:    '#0f172a',
        card:    '#1e293b',
        hover:   '#334155',
        border:  '#334155',
        accent:  '#22c55e',
        danger:  '#ef4444',
        dim:     '#94a3b8',
      },
      fontFamily: {
        mono: ['ui-monospace', 'SFMono-Regular', 'monospace'],
      },
    },
  },
  plugins: [],
};

export default config;

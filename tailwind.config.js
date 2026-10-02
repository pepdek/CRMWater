module.exports = {
  content: ['./app/**/*.{ts,tsx}'],
  theme: { extend: {
    colors: { aqua: 'var(--aqua)', navy: 'var(--navy)', ripple: 'var(--ripple)', ice: 'var(--ice)', coral: 'var(--coral)' },
    fontFamily: { serif: ['var(--font-serif)', 'Georgia', 'serif'], sans: ['var(--font-sans)', 'system-ui', 'sans-serif'] },
  } },
};

// Colour themes. The colours themselves live in src/index.css (:root[data-theme='...']).
// The super admin picks one for each society; 'default' is the original look.
export const THEMES = [
  { id: 'default', name: 'WGate Blue', note: 'Original look', preview: 'linear-gradient(135deg, #F3F4F8 0%, #3E50F4 100%)', color: '#3E50F4', dark: false },
  { id: 'aurora', name: 'Aurora Indigo', note: 'Soft lavender and indigo', preview: 'linear-gradient(135deg, #E9ECFF 0%, #4F46E5 100%)', color: '#4F46E5', dark: false },
  { id: 'lagoon', name: 'Lagoon Teal', note: 'Fresh mint and teal', preview: 'linear-gradient(135deg, #E1F6F1 0%, #0B7A6E 100%)', color: '#0B7A6E', dark: false },
  { id: 'coral', name: 'Sunset Coral', note: 'Warm peach and coral', preview: 'linear-gradient(135deg, #FFEEE2 0%, #D9441B 100%)', color: '#D9441B', dark: false },
  { id: 'midnight', name: 'Midnight Neon', note: 'Dark navy, easy at night', preview: 'linear-gradient(135deg, #0B1020 0%, #5B5FEF 100%)', color: '#5B5FEF', dark: true },
];

export const THEME_IDS = THEMES.map((t) => t.id);
const KEY = 'wgate_theme';

export function applyTheme(id) {
  const theme = THEMES.find((t) => t.id === id) || THEMES[0];
  const root = document.documentElement;
  if (theme.id === 'default') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme.id);
  root.classList.toggle('dark', theme.dark);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', theme.color);
  try { window.localStorage.setItem(KEY, theme.id); } catch { /* storage unavailable */ }
}

// Use the last theme straight away, so the app does not flash the old colours while it starts.
export function applySavedTheme() {
  let id = 'default';
  try { id = window.localStorage.getItem(KEY) || 'default'; } catch { /* storage unavailable */ }
  applyTheme(id);
}
// Looks for the festival / welcome banner. `key` is what the super admin saves.
// (Full class names are written out so Tailwind keeps them.)
export const THEMES = {
  general: {
    label: 'Welcome', emoji: '👋', gradient: 'from-emerald-500 to-teal-600',
    title: 'Welcome to WGate!', message: 'Glad to have you here. Stay connected with your society, all in one place.',
  },
  diwali: {
    label: 'Diwali', emoji: '🪔', gradient: 'from-orange-500 via-amber-500 to-yellow-400',
    title: 'Happy Diwali!', message: 'Wishing you and your family a festival of lights filled with joy, health and prosperity.',
  },
  dussehra: {
    label: 'Dussehra', emoji: '🏹', gradient: 'from-red-600 to-orange-500',
    title: 'Happy Dussehra!', message: 'May good always win over evil in your life. Warm wishes to you and your family.',
  },
  newyear: {
    label: 'New Year', emoji: '🎉', gradient: 'from-indigo-700 to-purple-600',
    title: 'Happy New Year!', message: 'Wishing you a year full of happiness, good health and new beginnings.',
  },
  holi: {
    label: 'Holi', emoji: '🎨', gradient: 'from-pink-500 via-purple-500 to-sky-500',
    title: 'Happy Holi!', message: 'May your life be as colourful as the festival. Enjoy the day safely with family and friends.',
  },
  eid: {
    label: 'Eid', emoji: '🌙', gradient: 'from-emerald-600 to-teal-500',
    title: 'Eid Mubarak!', message: 'Wishing you peace, happiness and blessings on this special day.',
  },
  christmas: {
    label: 'Christmas', emoji: '🎄', gradient: 'from-red-600 to-green-700',
    title: 'Merry Christmas!', message: 'Wishing you a season of warmth, love and joy with your loved ones.',
  },
  national: {
    label: 'National Day', emoji: '🇮🇳', gradient: 'from-orange-500 to-green-600',
    title: 'Happy Republic Day!', message: 'Proud to be together as one community. Warm wishes from all of us.',
  },
};

export const THEME_KEYS = Object.keys(THEMES);
export const themeOf = (key) => THEMES[key] || THEMES.general;
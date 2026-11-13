import { useCallback, useEffect, useState } from 'react';

// Two looks for the home screen and the bottom bar:
//   'tabs'    - four tabs with big tiles and a 5-button bar (the default)
//   'classic' - the earlier home page with count cards and the full bar
// Each person's choice is kept on their own phone or browser.
const KEY = 'wgate_home_style';
const EVENT = 'wgate:home-style';

const read = () => {
  try { return window.localStorage.getItem(KEY) === 'classic' ? 'classic' : 'tabs'; } catch { return 'tabs'; }
};

let current = read();

export function useHomeStyle() {
  const [style, setStyle] = useState(current);

  useEffect(() => {
    const sync = () => setStyle(current);
    window.addEventListener(EVENT, sync);
    return () => window.removeEventListener(EVENT, sync);
  }, []);

  const choose = useCallback((next) => {
    current = next === 'classic' ? 'classic' : 'tabs';
    try { window.localStorage.setItem(KEY, current); } catch { /* storage unavailable */ }
    window.dispatchEvent(new Event(EVENT));
  }, []);

  return [style, choose];
}
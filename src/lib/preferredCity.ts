import { useEffect, useState } from 'react';

/**
 * The city you chose last (in the search bar or the Browse filter), kept on this device so the rest of the
 * site can start from where you are: the swipe deck puts cars from that city first.
 */
const KEY = 'cx-last-city';

export function getPreferredCity(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setPreferredCity(city: string): void {
  const clean = city.trim();
  if (!clean) return;
  try {
    window.localStorage.setItem(KEY, clean);
    window.dispatchEvent(new Event('cx-city'));
  } catch {
    /* storage unavailable */
  }
}

export function usePreferredCity(): string | null {
  const [city, setCity] = useState<string | null>(() => (typeof window === 'undefined' ? null : getPreferredCity()));
  useEffect(() => {
    const read = () => setCity(getPreferredCity());
    window.addEventListener('cx-city', read);
    window.addEventListener('storage', read);
    return () => {
      window.removeEventListener('cx-city', read);
      window.removeEventListener('storage', read);
    };
  }, []);
  return city;
}

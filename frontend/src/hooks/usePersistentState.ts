/*
 * State mirrored to localStorage under a key so it survives reloads and the route remounts on
 * navigation. The stored value is read once on mount and falls back to initial when absent or
 * unreadable, every change is written back. Parse and write failures are swallowed so unavailable or
 * stale storage degrades to the in-memory value rather than throwing.
 */

import { useEffect, useState, type Dispatch, type SetStateAction } from 'react';

export function usePersistentState<T>(key: string, initial: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw == null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Storage unavailable, the value still lives in memory for the session.
    }
  }, [key, value]);

  return [value, setValue];
}

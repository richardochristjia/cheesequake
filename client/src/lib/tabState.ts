import { useCallback, useRef, useState, type Dispatch, type SetStateAction } from 'react';

export interface PersistedStateOptions<T> {
  validate?: (value: unknown) => value is T;
  serialize?: (value: T) => unknown;
  deserialize?: (raw: unknown) => T | undefined;
}

export function isString(value: unknown): value is string {
  return typeof value === 'string';
}

export function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

export function isBoolean(value: unknown): value is boolean {
  return typeof value === 'boolean';
}

export function isBooleanRecord(value: unknown): value is Record<string, boolean> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }
  return Object.values(value).every((v) => typeof v === 'boolean');
}

export const stringSetPersistence: PersistedStateOptions<Set<string>> = {
  serialize: (set) => Array.from(set),
  deserialize: (raw) => {
    if (!Array.isArray(raw)) return undefined;
    return new Set(raw.filter((item): item is string => typeof item === 'string'));
  },
};

export function readPersistedValue<T>(
  key: string,
  fallback: T,
  options?: PersistedStateOptions<T>,
): T {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return fallback;
    }
    const raw = window.localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed: unknown = JSON.parse(raw);

    if (options?.deserialize) {
      const hydrated = options.deserialize(parsed);
      return hydrated === undefined ? fallback : hydrated;
    }

    if (options?.validate) {
      return options.validate(parsed) ? parsed : fallback;
    }

    return parsed as T;
  } catch {
    return fallback;
  }
}

export function writePersistedValue<T>(
  key: string,
  value: T,
  options?: PersistedStateOptions<T>,
): void {
  try {
    if (typeof window === 'undefined' || !window.localStorage) {
      return;
    }
    const payload = options?.serialize ? options.serialize(value) : value;
    window.localStorage.setItem(key, JSON.stringify(payload));
  } catch {
    // Ignore storage quota or private-mode errors.
  }
}

export function usePersistedState<T>(
  key: string,
  defaultValue: T | (() => T),
  options?: PersistedStateOptions<T>,
): [T, Dispatch<SetStateAction<T>>] {
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [state, setState] = useState<T>(() => {
    const fallback =
      typeof defaultValue === 'function'
        ? (defaultValue as () => T)()
        : defaultValue;
    return readPersistedValue(key, fallback, optionsRef.current);
  });

  const setPersistedState: Dispatch<SetStateAction<T>> = useCallback(
    (action) => {
      setState((prev) => {
        const next =
          typeof action === 'function'
            ? (action as (prevState: T) => T)(prev)
            : action;
        writePersistedValue(key, next, optionsRef.current);
        return next;
      });
    },
    [key],
  );

  return [state, setPersistedState];
}

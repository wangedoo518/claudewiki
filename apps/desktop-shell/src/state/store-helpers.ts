import { createJSONStorage, type StateStorage } from "zustand/middleware";

export const appStorageKey = "open-claude-code";

export function namespacedStorage(name: string) {
  const storageKey = namespacedKey(name);

  return createJSONStorage(
    () =>
      ({
        getItem: (key: string) => localStorage.getItem(`${storageKey}:${key}`),
        setItem: (key: string, value: string) =>
          localStorage.setItem(`${storageKey}:${key}`, value),
        removeItem: (key: string) =>
          localStorage.removeItem(`${storageKey}:${key}`),
      }) as StateStorage,
    {
      replacer: (_key, value) => value,
      reviver: (_key, value) => value,
    },
  );
}

export function namespacedKey(name: string) {
  return `${appStorageKey}:${name}`;
}

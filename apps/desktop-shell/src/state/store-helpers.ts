import { createJSONStorage, type StateStorage } from "zustand/middleware";

export const appStorageKey = "open-claude-code";

export function namespacedStorage(name: string) {
  void name;
  return createJSONStorage(() => localStorage as StateStorage, {
    replacer: (_key, value) => value,
    reviver: (_key, value) => value,
  });
}

export function namespacedKey(name: string) {
  return `${appStorageKey}:${name}`;
}

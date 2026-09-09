const memory = new Map<string, string>();

const hasChromeStorage = (): boolean =>
  typeof chrome !== "undefined" && Boolean(chrome.storage?.local);

const hasLocalStorage = (): boolean => {
  try {
    return typeof localStorage !== "undefined";
  } catch {
    return false;
  }
};

const readChrome = async (area: chrome.storage.StorageArea, key: string): Promise<string | null> => {
  const result = await area.get(key);
  const value = result[key];

  if (typeof value === "string") {
    return value;
  }

  if (value && typeof value === "object") {
    return JSON.stringify(value);
  }

  return null;
};

export const authStorage = {
  getItem: async (key: string): Promise<string | null> => {
    if (hasChromeStorage()) {
      const localValue = await readChrome(chrome.storage.local, key);
      if (localValue) {
        return localValue;
      }

      try {
        const syncedValue = await readChrome(chrome.storage.sync, key);
        if (syncedValue) {
          await chrome.storage.local.set({ [key]: syncedValue });
          return syncedValue;
        }
      } catch {
        // sync can be unavailable on some profiles
      }

      if (hasLocalStorage()) {
        const legacy = localStorage.getItem(key);
        if (legacy) {
          await chrome.storage.local.set({ [key]: legacy });
          return legacy;
        }
      }

      return null;
    }

    if (hasLocalStorage()) {
      return localStorage.getItem(key);
    }

    return memory.get(key) ?? null;
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (hasChromeStorage()) {
      await chrome.storage.local.set({ [key]: value });

      try {
        await chrome.storage.sync.set({ [key]: value });
      } catch {
        // ignore quota / sync-disabled errors
      }

      return;
    }

    if (hasLocalStorage()) {
      localStorage.setItem(key, value);
      return;
    }

    memory.set(key, value);
  },

  removeItem: async (key: string): Promise<void> => {
    if (hasChromeStorage()) {
      await chrome.storage.local.remove(key);

      try {
        await chrome.storage.sync.remove(key);
      } catch {
        // ignore
      }

      return;
    }

    if (hasLocalStorage()) {
      localStorage.removeItem(key);
      return;
    }

    memory.delete(key);
  }
};

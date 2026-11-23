/**
 * The one file that knows which shell the game is running in.
 *
 *   web  — a browser tab (bible.lucasacademy.org, itch, dev server).
 *   ios  — the Capacitor App Store build (WKWebView).
 *
 * Components never branch on the platform; they call `saveFile`,
 * `openExternalLink` and `storage` and the right thing happens. Detection
 * looks at the `window.Capacitor` bridge the native shell injects, so the web
 * bundle never imports Capacitor code; the plugins are `import()`ed lazily
 * inside the iOS branch only. See docs/DISTRIBUTION.md.
 */

export type Platform = 'web' | 'ios';

interface CapacitorBridge {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
}

type PlatformWindow = {
  Capacitor?: CapacitorBridge;
  localStorage?: Storage;
  open?: Window['open'];
  document?: Document;
};

function currentWindow(): PlatformWindow | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as PlatformWindow);
}

/** Read the platform from a window-like object (injectable for tests). */
export function detectPlatform(win: PlatformWindow | undefined = currentWindow()): Platform {
  try {
    const bridge = win?.Capacitor;
    if (bridge?.isNativePlatform?.() && bridge.getPlatform?.() === 'ios') return 'ios';
  } catch {
    /* a hostile or partial bridge object is treated as the web */
  }
  return 'web';
}

export const PLATFORM: Platform = detectPlatform();

// ---------------------------------------------------------------------------
// Files

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

function saveFileWeb(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function saveFileIos(blob: Blob, filename: string): Promise<void> {
  const [{ Filesystem, Directory }, { Share }] = await Promise.all([
    import('@capacitor/filesystem'),
    import('@capacitor/share'),
  ]);
  const written = await Filesystem.writeFile({
    path: filename,
    data: await blobToBase64(blob),
    directory: Directory.Cache,
  });
  // The share sheet is how an iOS app hands a file to Photos / Files / AirDrop.
  await Share.share({ title: filename, files: [written.uri] });
}

/**
 * Hand a generated file to the user. On the web this is a download; on iOS
 * it is the system share sheet (`<a download>` does nothing in WKWebView).
 * Never throws — a dismissed share sheet is not an error.
 */
export async function saveFile(
  blob: Blob,
  filename: string,
  platform: Platform = PLATFORM,
): Promise<void> {
  try {
    if (platform === 'ios') await saveFileIos(blob, filename);
    else saveFileWeb(blob, filename);
  } catch {
    /* download blocked / share sheet cancelled — the on-screen content remains */
  }
}

// ---------------------------------------------------------------------------
// External links

/**
 * Click handler for `<a target="_blank">`. On the web it does nothing and the
 * anchor opens a tab as usual. On iOS it opens the URL in the system browser
 * view instead of navigating the game's own WebView away.
 */
export function openExternalLink(
  event: { currentTarget: { href?: string } | null; preventDefault: () => void },
  platform: Platform = PLATFORM,
): void {
  if (platform !== 'ios') return;
  const url = event.currentTarget?.href;
  if (!url) return;
  event.preventDefault();
  import('@capacitor/browser')
    .then(({ Browser }) => Browser.open({ url }))
    .catch(() => {
      /* plugin missing — stay in the game rather than navigate away */
    });
}

// ---------------------------------------------------------------------------
// Storage

export type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Keys the game persists; only these are mirrored to native preferences. */
const MIRRORED_PREFIX = 'lucas-bible-sequence:';

function localStore(win: PlatformWindow | undefined = currentWindow()): Storage | null {
  try {
    return win?.localStorage ?? null;
  } catch {
    return null; // access can throw in sandboxed contexts
  }
}

const memory = new Map<string, string>();

const memoryStorage: StorageLike = {
  getItem: (key) => memory.get(key) ?? null,
  setItem: (key, value) => {
    memory.set(key, String(value));
  },
  removeItem: (key) => {
    memory.delete(key);
  },
};

function mirrorToPreferences(key: string, value: string | null): void {
  if (!key.startsWith(MIRRORED_PREFIX)) return;
  import('@capacitor/preferences')
    .then(({ Preferences }) =>
      value === null ? Preferences.remove({ key }) : Preferences.set({ key, value }),
    )
    .catch(() => {
      /* preferences unavailable — localStorage still holds the value */
    });
}

/**
 * Build the storage object for a platform. Web: `localStorage` (or an
 * in-memory fallback when it is inaccessible). iOS: `localStorage` for
 * synchronous reads, every write mirrored to `@capacitor/preferences`, which
 * WKWebView never evicts.
 */
export function createStorage(
  platform: Platform = PLATFORM,
  local: StorageLike | null = localStore(),
): StorageLike {
  const base = local ?? memoryStorage;
  if (platform !== 'ios') return base;
  return {
    getItem: (key) => base.getItem(key),
    setItem: (key, value) => {
      base.setItem(key, value);
      mirrorToPreferences(key, String(value));
    },
    removeItem: (key) => {
      base.removeItem(key);
      mirrorToPreferences(key, null);
    },
  };
}

export const storage: StorageLike = createStorage();

/**
 * Restore mirrored keys into `localStorage` when the WebView has evicted
 * them. Await once before the first render. Resolves immediately on the web.
 */
export async function hydrateStorage(
  platform: Platform = PLATFORM,
  local: StorageLike | null = localStore(),
): Promise<void> {
  if (platform !== 'ios' || !local) return;
  try {
    const { Preferences } = await import('@capacitor/preferences');
    const { keys } = await Preferences.keys();
    for (const key of keys) {
      if (!key.startsWith(MIRRORED_PREFIX) || local.getItem(key) !== null) continue;
      const { value } = await Preferences.get({ key });
      if (value !== null) local.setItem(key, value);
    }
  } catch {
    /* nothing mirrored yet, or plugin unavailable — start from localStorage */
  }
}

import type { CapacitorConfig } from '@capacitor/cli';

/**
 * The iOS App Store build: the `npm run build:native` bundle inside a native
 * shell (WKWebView). Fully offline — no server URL, no cleartext, no
 * navigation allow-list. See docs/DISTRIBUTION.md.
 */
const config: CapacitorConfig = {
  appId: 'org.lucasacademy.biblesequence',
  appName: 'Bible Sequence',
  webDir: 'dist-native',
  ios: {
    // Edge to edge: the page already pads for the notch and home bar with
    // env(safe-area-inset-*) (viewport-fit=cover), so an inset WebView would
    // leave a strip of native background below the page.
    contentInset: 'never',
    // The parchment page background, shown behind the WebView while it loads.
    backgroundColor: '#f6efe0',
    scheme: 'Bible Sequence',
  },
};

export default config;

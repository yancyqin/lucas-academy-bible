# Distribution — Bible Sequence as a native app

Status: plan written 2026-09-28. P1 (build targets + platform layer + bundled
WEB/CUV for offline Pick a Verse) and P2 (iOS project, verified in the
iPhone 17 Pro and iPad Pro 13" simulators: Pick a Verse EN/中文, Challenge,
certificate share sheet, footer link in the in-app Safari view) done
2026-09-29, all uncommitted. Not yet checked on a device: narration and
sound (simulator audio is not observable here). Next: owner's P0 (§4) →
first manual TestFlight upload → P3 CI.

Re-checked 2026-11-05:

- **The iOS code is not in this repository yet.** It exists only as
  uncommitted changes in the owner's local checkout, which sits 14 commits
  behind main (PRs #3–#8 since: Guess Letters + Next Word games, Fangfang
  CUV and Louise WEB recorded narration, the 默写 Practice option). Before
  the first TestFlight build the P1/P2 changes described below must be
  ported onto current main as their own PR. This document lands first so the
  plan is not lost.
- **Recorded narration is off in the iOS build** on origin/main
  (`offlineNarration()` returns true for `ios`), so the app reads verses with
  the device voice. Bundling the recordings would add about 22 MB
  (12 MB Fangfang + 9.7 MB Louise); a v1.1 decision, not a blocker.

Bible Sequence ships from **one codebase** as:

| Target | `VITE_DIST_TARGET` | Output | Channel | Status |
| --- | --- | --- | --- | --- |
| web | `web` (default) | `dist/` | Cloudflare Worker at bible.lucasacademy.org | live, unchanged |
| itch | `itch` | `dist-itch/` → `lucas-academy-bible-itch.zip` | itch.io HTML5 | live, unchanged |
| ios | `ios` | `dist-native/` → Capacitor 8 → Xcode → App Store | Apple App Store | this plan |

Windows / Steam / Electron are **parked** (decision 2026-09-28: App Store only,
free app; see §1). Nothing in the code refers to them.

---

## 1. Decisions (locked, do not reopen)

1. **Apple App Store only, free.** No Steam, no Windows build, no Electron. No
   paid tier, no in-app purchase, and **no money or donation UI anywhere in the
   app**. Donations, when they come, are collected outside the app (website),
   and only once the nonprofit's own accounts and registrations allow it. This
   keeps the app eligible for Apple's nonprofit fee waiver later.
2. **App v1 is fully offline.** The complete public-domain **WEB** and
   **CUV** Bibles ship inside the app as per-book files (`public/web/`,
   `public/cuv/`, ~7.6 MB), so **Challenge and Pick a Verse both work with no
   network**, in English and 中文. Daily Verse, Daily Scrabble, Word Search and
   every licensed translation (NIV, NIrV, NASB 2020, CCB, CCBT, KLB) are off
   because they need `/api/*` on the Worker and YouVersion's terms for native
   apps are unverified. Revisit licensed text in v2 only after checking
   YouVersion Platform terms.
3. **A wrapper, not a rewrite.** Capacitor 8 puts the same web build inside a
   native iOS shell (WKWebView); Xcode signs and uploads it. Not Tauri.
4. **Published by the organization**, not a personal account. Apple seller
   name: "Lucas Academy". Account Holder = the President.
5. **Manual first:** build locally, upload one TestFlight build by hand, then
   automate with GitHub Actions.
6. **Version number** has one source: `package.json` `version`. The web bundle
   reads it at build time; the Xcode project is synced from it (P2).

---

## 2. Code phases

### P1 — build targets + platform layer (this branch)

- `src/build-config.ts`: `VITE_DIST_TARGET=web|itch|ios` replaces the boolean
  `VITE_ITCH_BUILD` (still honoured as an alias so nothing external breaks).
  Feature flags per target:

  | flag | web | itch | ios |
  | --- | --- | --- | --- |
  | `dailyVerse` (Daily Verse / Scrabble / Word Search tabs) | on | off | off |
  | `pickVerse` (Pick a Verse tab, `?passage=` links) | on | off | on |
  | `localTranslations` (English / 中文 between bundled WEB and CUV) | on | off | on |
  | `licensedTranslations` (NIV… via the Worker) | on | off | off |
  | `translationFooter` (public-domain attribution line) | on | off | on |
  | `offline` (never call `/api/*`) | no | yes | yes |

- Bundled editions: `scripts/build_bible_assets.py` writes `public/web/` and
  `public/cuv/` (one JSON per book + `index.json` catalogue) from eBible.org.
  `src/local-bible.ts` reads them; `books.ts` and `youversion.ts` route WEB
  and CUV there and licensed editions to the Worker. The web site uses the
  same path, so those two editions never hit the API anywhere.

- `npm run build:native` → `tsc -b && VITE_DIST_TARGET=ios vite build --base=./ --outDir dist-native`.
  Relative base because Capacitor serves the bundle from its own scheme.
  `build:itch` / `package:itch` behave exactly as before (they strip both
  bundled editions; itch stays the WEB Challenge only).
- `src/platform.ts`: the only file that knows which shell it runs in.
  Detection is by the `window.Capacitor` bridge object that the native shell
  injects, so the web bundle never imports Capacitor code. It exposes:
  - `saveFile(blob, filename)` — web: `<a download>`; iOS: write to the app
    cache via `@capacitor/filesystem`, then hand it to the system share sheet
    via `@capacitor/share` (Save Image / AirDrop / Files). `a.download` is a
    no-op inside WKWebView.
  - `openExternalLink(event)` — web: the anchor's own `target="_blank"`;
    iOS: `@capacitor/browser`, which slides an in-app Safari sheet over the
    game (Done returns to it). Without this a `_blank` link would replace the
    game inside the WebView with no way back.
  - `storage` — a `Storage`-shaped object. Web: `localStorage`. iOS: writes
    go to `localStorage` **and** `@capacitor/preferences`; `hydrateStorage()`
    (awaited once in `main.tsx` before render) restores `localStorage` from
    Preferences if WKWebView evicted it.
- Adapted call sites: `src/game/certificate.ts` (`saveFile`),
  `src/components/BibleAttribution.tsx` (`openExternalLink`),
  `src/game/progress.ts` (default store = `platform.storage`),
  `src/main.tsx` (`hydrateStorage()`).
- Dependencies added: `@capacitor/core`, `@capacitor/filesystem`,
  `@capacitor/share`, `@capacitor/preferences`, `@capacitor/browser`; dev
  `@capacitor/cli`. Plugins are loaded with dynamic `import()` inside the iOS
  branch only, so the web/itch bundles do not grow.
- Acceptance (met 2026-09-29): 219 tests green, `tsc -b` clean, all three
  builds succeed; the `dist-native` bundle served locally plays a CUV verse
  and a WEB Psalm range with zero `/api` requests.

### P2 — iOS project (generated 2026-09-29)

- `capacitor.config.ts`: `appId` `org.lucasacademy.biblesequence`, `appName`
  "Bible Sequence", `webDir: 'dist-native'`. No `server.url`, no cleartext,
  no allowNavigation.
- `npx cap add ios --packagemanager SPM` — Swift Package Manager, so the Mac
  needs no CocoaPods/Ruby. `ios/` is committed (Xcode project, Info.plist,
  Package.swift, asset catalog); `ios/App/App/public` (the copied web bundle)
  and the generated config files are ignored. Never commit signing: no
  `.p12`, `.mobileprovision`, `.p8`, `ExportOptions.plist` with team ids, or
  `xcuserdata`.
- **The Capacitor CLI needs Node 22** (`nvm use 22`); the app itself still
  builds on Node 20.
- Icon + launch screen: the master is `assets/logo.svg` (1024×1024, full
  bleed, the in-app BookMark logo redrawn: navy book, gold spine, verse
  lines, ribbon on parchment). `npm run ios:icon` renders it to an opaque
  `assets/logo.png` (qlmanage + ffmpeg, no alpha) and regenerates the Xcode
  icon and splash set with `@capacitor/assets`. Background colours are
  parchment `#f6efe0` (light) / navy `#16233b` (dark).
- `capacitor.config.ts` uses `contentInset: 'never'`: the WebView runs edge
  to edge and the page pads itself with `env(safe-area-inset-*)`. The
  default inset left a strip of native background under the page.
- `Info.plist`: iPhone portrait only, iPad all orientations, no
  `NSAppTransportSecurity` exceptions (the app makes no network calls),
  `ITSAppUsesNonExemptEncryption = false` (no export-compliance prompt per
  upload).
- Version: `scripts/sync_ios_version.mjs` copies `package.json` `version`
  into `MARKETING_VERSION`; `IOS_BUILD_NUMBER` (CI run number) sets
  `CURRENT_PROJECT_VERSION`. `npm run ios:sync` = build:native + version sync +
  `cap sync ios`; `npm run ios:open` opens Xcode.
- Verify in the iPhone 17 Pro and iPad Pro simulators: a full Journey run,
  Pick a Verse in English and 中文 with Wi-Fi off, certificate save through
  the share sheet, narration, correct-cue audio, Chinese toggle, progress
  surviving relaunch.

### P3 — CI (GitHub Actions; repo is public)

- `ci.yml` on every push/PR: `npm ci`, `tsc -b`, `vitest run`,
  `npm run build`, `npm run build:native`.
- `ios.yml` on tag `v*`: macOS runner, `npm run build:native`, `npx cap sync
  ios`, `xcodebuild archive` + export, upload to TestFlight with an
  **App Store Connect API key** (issuer id, key id, `.p8`) held only in
  GitHub Secrets. Signing certificate + provisioning profile also only in
  Secrets (base64). Nothing signing-related in the tree.
- Only after a manual TestFlight upload has succeeded (decision 5).

### Parked (not planned)

Windows/Electron/Steam, macOS, Android. If ever revived: Electron needs
`electron-serve` (`app://`) because Vite output over `file://` fails module
CORS; `speechSynthesis` on Windows uses SAPI voices and `speech.ts` voice
scoring would need checking. Steam partner enrollment needs the corporate bank
account and EIN tax interview.

---

## 3. Publishing as Lucas Academy (facts + boundaries)

Entity: **Lucas Academy**, California Nonprofit Public Benefit Corporation,
incorporated 2026-09-09, Active / good standing, EIN issued, SI-100 filed
2026-09-28. Corporate bank account open and funded (2026-10-13). Donations are live on the website (PayPal and Zelle on
lucasacademy.org/support, `payments@lucasacademy.org` forwarding, 2026-10-15).
**Not yet:** federal 501(c)(3) (not filed), California FTB exemption, AG
charity registration (CT-1 is la-org U7 now that gifts arrive). Board:
Yanxiang Qin, Xiaoping Wang. President: Yanxiang Qin. Secretary +
Treasurer/CFO: Qiongyan Yue. Source: la-org PRIORITIES.md and
docs/legal/README.md as of 2026-10-16; no D-U-N-S or Apple enrollment is
recorded there yet.

Apple Developer Program, **Organization** enrollment:

- Needs a **D-U-N-S number** (free). Check first with Apple's D-U-N-S lookup
  whether D&B already generated one for the corporation; request one if not.
- Account Holder Apple Account: the existing **admin@lucasacademy.org**
  (owner decision 2026-10-16; no new account). Held by the President.
- A website with real content (lucasacademy.org qualifies).
- Legal-entity verification may ask for the incorporation document and a
  phone verification call.
- **$99/year is paid now**, preferably from the corporate account (now open)
  so no reimbursement is needed. If a director pays personally, treat it as
  an advance under la-org I2/I3 (the other director approves in writing,
  Treasurer/CFO records it). The nonprofit fee waiver needs the IRS
  determination letter and an account with no paid apps or IAP; apply before
  the first renewal after 501(c)(3) arrives.
- A free app needs **no** banking or tax forms in App Store Connect, so iOS
  can proceed before the corporate bank account exists.

Donations: live on the website since 2026-10-15; the app stays free of any
donation UI. Apple only allows in-app charitable donations through Apple Pay
by an approved nonprofit; a free app may otherwise only send people to
Safari. v1 does neither. If a "Support" link is ever added, it must open
lucasacademy.org/support in Safari, never a form inside the app.

**Privacy boundary.** EIN, D-U-N-S, certificates, private keys, API keys,
Apple credentials, and any legal-entity identifier never enter this
repository, its docs, issues, or commits. They live only in GitHub Secrets or
in la-org `private/`.

**Pending: IP ownership and licence.** The app is published by Lucas Academy
while the code stays in the personal GitHub account `yancyqin`. Decide and
document in the 501(c)(3) application (la-org I4) and the IP/open-publication
policy (la-org I9): assignment or licence to the corporation, and the
repository's public licence. Until then the App Store listing states Lucas
Academy as seller and the copyright line as decided there.

---

## 4. Owner checklist — P0 (things only you can do)

Status as of 2026-10-16 (owner's P0 session). Open: the $99 enrollment,
the App Store Connect record, iPhone screenshots, Xcode signing.

Free, start now

- [x] **D-U-N-S** — found via Apple's lookup 2026-10-16 (D&B already had one for Lucas Academy; number kept out of Git, store it in la-org `private/`).
- [x] **Signed in to Apple as admin@lucasacademy.org** (2026-10-16, account name Yanxiang Qin) (existing address, no
      new account). Two-factor on your phone. Claude cannot type the
      password, so the D-U-N-S lookup and enrollment start from your sign-in.
      Apple requires the account's first and last name to be the Account
      Holder's **legal name** (Yanxiang Qin), not "Lucas Academy" or "Admin";
      check account.apple.com › Personal Information before enrolling, or
      approval is delayed. The address used in the D-U-N-S and enrollment
      forms must be the corporation's street address (no P.O. box) and must
      match D&B's record.
- [x] **Privacy policy.** Section "Bible Sequence app (iPhone and iPad)"
      added to lucasacademy.org/privacy, EN + ZH, anchor
      `#bible-sequence-app`, last-reviewed date updated
      (yancyqin/Lucas-Academy PR #49, **merge to publish**). It says the
      app has no account or sign-in, and separately that the website's
      email sign-in is a website feature, so "no accounts" is never claimed
      for lucasacademy.org itself.
- [x] **Support URL.** Use lucasacademy.org/contact (hello@lucasacademy.org).
      Not /support, which is the donation page.

Costs money

- [ ] **Apple Developer Program, Organization, $99.** Needs the D-U-N-S,
      admin@lucasacademy.org, and lucasacademy.org. Expect a verification
      call. Pay from the corporate account if it has a card; otherwise
      record it as an advance (see §3).
- [ ] After approval: in App Store Connect create the app record (bundle id
      `org.lucasacademy.biblesequence`). The CI API key can wait for P3.

Assets

- [x] **1024×1024 app icon** (2026-10-16): `assets/logo.svg` → `npm run
      ios:icon`. Replace the SVG if you want different artwork.
- [x] **13" iPad screenshots** (2064×2752, 5 shots) in
      `build/app-store/ipad-13/` (gitignored; regenerate from the simulator).
- [ ] **6.9" iPhone screenshots** (1320×2868): blocked until the simulator
      tool is allowed to drive the iPhone 17 Pro Max simulator. Approve it
      once in the simulator panel and Claude captures the same five shots.
- [ ] Optional 15–30 s app preview video.

Signing (first TestFlight, after enrollment)

- [ ] Sign Xcode into the org account; automatic signing picks the team and
      registers the bundle id on the first archive.

Not P0, keep on the list

- [ ] IP ownership and licence (§3) in the 501(c)(3) application (I4) and
      the IP/open-publication policy (I9).

Code side, not yours (blocks the first TestFlight)

- Bring the uncommitted P1/P2 work onto current origin/main and open a PR.

---

## 5. App Store Connect listing

| Field | Value |
| --- | --- |
| Name | Bible Sequence |
| Subtitle | Remember the Word. Restore the Verse. |
| Seller | Lucas Academy |
| Price | Free, no IAP |
| Primary category | Education (secondary: Games › Word or Reference) |
| Age rating | 4+ (no objectionable content; answer "No" to every questionnaire item) |
| Privacy nutrition label | **Data Not Collected** |
| Privacy policy URL | https://lucasacademy.org/privacy.html#bible-sequence-app (live once PR #49 merges) |
| Support URL | https://lucasacademy.org/contact |
| Copyright | per §3 IP decision |
| Review notes | "Fully offline scripture-memory game. No account, no sign-in, no network calls, no purchases. Scripture text is public domain (World English Bible, Chinese Union Version). Tap Play on the Pick a Verse tab, or Begin challenge." |
| Export compliance | uses no encryption beyond OS HTTPS (none at all) → "No" |
| Content rights | public-domain text only |

Timing: Apple review is usually 1–3 days; a first submission can take longer.
TestFlight external testing needs its own (lighter) review.

---

## 6. Runbook (once P2 exists)

```bash
nvm use 22                    # Capacitor CLI
npm run ios:sync              # build:native → version sync → cap sync ios
npm run ios:open              # Xcode → Product › Archive → Distribute → TestFlight
```

Simulator without Xcode UI (no signing needed):

```bash
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination 'platform=iOS Simulator,name=iPhone 17 Pro' \
  -derivedDataPath build/ios CODE_SIGNING_ALLOWED=NO build
```

Bump `version` in `package.json` before each release build; the sync script
pushes it into the Xcode project.

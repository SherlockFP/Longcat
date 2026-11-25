# Long Cat Out! - web release steps (owner)

Web only. No Android/iOS, no accounts, no money. Nothing here has been published.

## 1. Build and check

```
npm install
npm run check          # core + economy + web sanity (manifest, icons, privacy, ads off)
npm run build          # -> dist/ (relative base './', service worker dist/sw.js generated)
```

Test it: `npm run preview`, open the shown URL on a phone-sized window. Offline play: load once, go offline (DevTools > Network > Offline), reload; the game still starts. The Settings screen shows "Install app" in browsers that offer it (Chrome/Edge/Android).

`dist/` works on any static host and in a subfolder (all paths are relative).

## 2. Host it (needed for the privacy URL and for itch.io-style sharing)

- Cloudflare Pages: connect the repo, build command `npm run build`, output directory `dist`, root directory `studio/long-cat-out`. Or drag-drop the `dist` folder in the dashboard.
- GitHub Pages: publish the `dist` folder (e.g. the `gh-pages` branch or an Actions deploy). It serves from `https://USER.github.io/REPO/`; the relative base handles that.
- Privacy page ends up at `<your-url>/privacy.html`.

## 3. Placeholders to fill

| Where | Placeholder | What to put |
|---|---|---|
| `public/privacy.html` | `[DATE]`, `[TARİH]`, `[CONTACT EMAIL]`, `[İLETİŞİM E-POSTASI]` | date and your contact email |
| `store/listing.md` | `[BRACKETS]` if any appear | store-specific fields |
| `.env.production` (create) | `VITE_H5_CLIENT_ID` | your AdSense publisher id, `ca-pub-...` |
| `.env.production` (create) | `VITE_PUBLIC_URL` | the public https address with a trailing slash (e.g. `https://USER.github.io/REPO/`): the share link, the code burned into the clip and its QR all start with it (one address everywhere). Empty: the page's own address, and the build prints a warning |
| portal forms | contact email, developer name | yours |

## 4. Portal submission (pick one or several)

Use `store/listing.md` for texts and tags, `store/shots/` for screenshots (1080x1920, `en-*` and `tr-*`), `store/shots/cover.png` (1280x720) for the cover, `public/icons/icon-512.png` for the icon.

- itch.io: create a project, kind "HTML", upload `dist` as a zip, tick "This file will be played in the browser", viewport 540x960, enable fullscreen. Add the privacy URL in the description.
- CrazyGames: use the dedicated build (section 9), not `dist`.
- Poki: apply through their developer site. They require their SDK for ads and events; not integrated here yet.

## 5. Google H5 Games Ads (optional, later)

The game ships with the provider code but it is OFF. Steps:

1. Create a Google AdSense account and add your game site. Apply for "AdSense for Games" / H5 Games Ads and wait for approval. This needs a live public URL with the privacy page.
2. After approval, copy your publisher id (`ca-pub-XXXXXXXXXXXXXXXX`).
3. Create `.env.production` next to `package.json`:

```
VITE_ADS_PROVIDER=h5
VITE_H5_CLIENT_ID=ca-pub-XXXXXXXXXXXXXXXX
VITE_H5_TEST=1
```

4. `npm run build`, deploy, and check that Google test ads appear (rewarded ad on the continue offer, interstitial after a win from level 8).
5. When happy, set `VITE_H5_TEST=0` and rebuild/deploy for real ads.

Notes: `?noads=1` on the game URL loads no ad network at all (for portals that supply their own ads; rewarded buttons then give nothing). Players with the "No Ads" flag see no interstitials. Show a consent banner where required (EU/UK) before enabling ads; the privacy page already mentions Google ads.

Where the id goes: only `.env.production` (`VITE_H5_CLIENT_ID`). It is read in `src/kit/ads.js`.

## 6. In-app purchases

Stay a documented stub. `src/kit/iap.js` has a fail-closed backend in production builds (nothing can be bought). The shop UI still exists; hide or keep it per portal rules. A future payment backend plugs in with `setBackend()` behind the same interface.

## 7. Refresh screenshots after art changes

```
PORT=5193 node scripts/store-shots.mjs
```

## 8. Updating the live game

Each build gets a new cache name in `dist/sw.js` (content hash), so returning players get the new version on their next visit. Just redeploy `dist/`.

## 9. CrazyGames

The game has a CrazyGames build with the CrazyGames SDK v3 (`src/kit/portal.js`, ads in `src/kit/ads.js`).

```
npm run build:crazygames-basic   # Basic Launch: SDK events only, no ad buttons at all
npm run build:crazygames         # Full Launch: CrazyGames midgame + rewarded ads
```

Both write `dist-crazygames/` and `dist-crazygames.zip` (index.html at the zip root). The script sets
`VITE_PORTAL=crazygames` and `VITE_ADS_PROVIDER=crazygames` (Basic: `off`) itself; nothing goes in `.env.production`.

1. Test locally first: `npx vite preview --outDir dist-crazygames --port 5203`, open it on `localhost` (the SDK runs in
   its "local" mode there and shows a stand-in for ads), and play: L1 starts at once, a lost board with few cats left
   offers "+1 seat" for an ad, a first clear shows "Watch ad: +N more coins" under Next.
2. Upload: CrazyGames developer portal, new game, HTML5, upload `dist-crazygames.zip`. Orientation: portrait.
   Covers: `store/shots/cover.png` and the screenshots in `store/shots/`.
3. Submit **Basic Launch** first with the `build:crazygames-basic` zip (CrazyGames shows no ads in Basic Launch and pays
   nothing; this build has no ad buttons, so nothing promises a reward). After CrazyGames moves the game to **Full
   Launch**, upload the `build:crazygames` zip.
4. Leave "Progress save" off for now: progress stays in the browser (localStorage), see weak spots below.

What the CrazyGames build does differently (their rules: docs.crazygames.com/requirements/):
- No service worker, no "Install app", no automatic fullscreen (CrazyGames gives its own fullscreen button).
- Only CrazyGames ads: midgame on Next after a campaign win (from L8, not in the first 5 minutes, 3 minutes apart,
  never right after a rewarded ad; the SDK paces too), rewarded only on a player's tap, reward only on `adFinished`.
  Game sound is muted from `adStarted` to the end and follows the portal's mute setting.
- Ad buttons hide when CrazyGames refuses ads for the session (Basic Launch, kids mode, ad blocker).
- Dare / share links use the CrazyGames invite link (`?c=` rides on it as an invite param), never our own address.
- No real-money items (no Coins tab, no premium looks): there is no store backend.
- SDK events: `loadingStart/Stop` around boot, `gameplayStart/Stop` whenever a board is in play / covered by a card or
  menu, `happytime` on a boss clear or a super-hard (3-star) clear.

Weak spots to know: the game reads its language from the browser, not from the SDK's `locale`; progress is not synced
with the CrazyGames Data module (a player who changes device starts over).

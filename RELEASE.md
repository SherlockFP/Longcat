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
- CrazyGames: developer portal, upload the zip of `dist`. They use their own ad SDK; their rules apply. Until an SDK integration exists, build as-is (the H5 provider stays off) and read their ads/monetization section.
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

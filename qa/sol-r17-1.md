## 1. Launch verdict

**Yes to a soft launch. Hold the monetized rollout.** Presentation **8.5**, appeal **9**, juice **8.5**, fun **8.5**, retention **8**, virality **8**, monetization readiness **2**, overall **8.5**. These are QA scores out of 10. Retention and virality still need live data. [R16 review](/C:/Users/Admin/Documents/Msjelly/studio/long-cat-out/qa/sol-r16-1.md)

**Launch blockers:** Smoke-test real iOS and low-end Android, including the portal iframe and dare handoff. Profile the six-send hitch, last measured at 50 ms p95 under throttling. Fill the privacy placeholders and set `VITE_PUBLIC_URL`. For monetization, prove one live ad integration and get remote funnel data. Today’s revenue is **$0**. Ads are off, purchases fail closed, and analytics stay local.

## 2. Web revenue, ranked by expected return on effort

1. **CrazyGames.** Submit Basic Launch first for traffic and retention data. It pays $0. Full Launch requires direct entry into gameplay and the SDK. Wire `gameplayStart/Stop` in `main.js` and `requestAd("midgame"|"rewarded")` in `ads.js`. Hide ad buttons during Basic. [Launch requirements](https://docs.crazygames.com/requirements/intro/) · [Ad SDK](https://docs.crazygames.com/sdk/video-ads/)
2. **Poki.** Apply in parallel. Compare the deal before committing other web rights. Poki offers web-exclusive revenue share or a non-exclusive flat license. Wire `gameLoadingFinished`, `gameplayStart/Stop`, `commercialBreak()` and `rewardedBreak()`. Use Poki ads exclusively and hide cash SKUs. [Deal types](https://developers.poki.com/guide/revenue-deal-types) · [SDK](https://developers.poki.com/guide/sdk-overview)
3. **GameDistribution.** Syndicate if rights permit. Initialize with the game ID, wrap `gdsdk.showAd()` in `ads.js`, pause/resume on SDK events and pay rewards only on confirmed completion. [Distribution](https://gamedistribution.com/developers/partnership/) · [SDK](https://github.com/GameDistribution/GD-HTML5)
4. **AdSense H5 on Cloudflare Pages.** Apply now. After approval, set the real publisher ID, use Google’s certified consent flow where required, prewarm the existing adapter after consent, fix its cached-load timeout, and smoke-test before switching off test mode. Start interstitials on **Next after a campaign win**, from L8, after five minutes, at least three minutes apart. Skip after a recent reward. Let portal SDKs control their own pacing. [H5 approval](https://developers.google.com/ad-placement/docs/signup) · [Consent](https://support.google.com/adsense/answer/13554020) · [Portal pacing](https://docs.crazygames.com/requirements/ads/)
5. **itch.io and supporter sales.** Upload the HTML5 ZIP for donations or sell a separate ad-free download. A hosted payment link on the standalone site can take tips. Keep `iap.js` fail-closed until a provider can verify and restore entitlements. CrazyGames’ Xsolla route is invite-only. [itch.io](https://itch.io/docs/creators/html5) · [Stripe](https://docs.stripe.com/payment-links) · [CrazyGames IAP](https://docs.crazygames.com/sdk/in-game-purchases/)

**Shared wiring.** Select one provider per build. `?noads=1` disables all ads. A portal build selects its SDK directly. A future paid No Ads entitlement suppresses forced ads and preserves opt-in rewards. Serialize requests, pause and mute during playback, and grant once on confirmed completion. Send offer, opt-in, impression, completion, no-fill, grant and next-level events by placement through `analytics.js` to a hosted collector where allowed. Track L1/L3/L10 and D1/D7. **Session RPM ≈ filled impressions per session × net eCPM**, summed by format. Portal traffic, geography, device, blockers and session length matter. Rewarded often pays more per impression, while interstitials reach more players. [Web ad economics](https://docs.crazygames.com/resources/ad-monetization-guide/)

## 3. Six client-side changes

1. Keep the free first Take Back. Then offer **+1 bench seat** once per board after a close loss, with coin and retry alternatives.
2. Test **double base coins** on selected first clears, capped daily. Pay the base reward immediately.
3. Keep the **30-minute basket boost** for rare baskets. Surface it in the café beside the next resident goal.
4. Offer **+1 life** only at zero lives. Move rewarded Hint into an explicit paused offer.
5. Tune the **120/200/300** seat curve and **25-minute** life timer against retry abandonment. Keep Daily and Show retries free.
6. Put an affordable coin-priced booster bundle in the shop after the first resident moves in. Keep one rotating deal.

## 4. Remove

Hide dead cash SKUs and “Coming soon” rows. Cut empty basket slots, the pinned postcard and routine board chatter. Keep one share button on standout wins, with replay and QR inside it.
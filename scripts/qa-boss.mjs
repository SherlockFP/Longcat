// R11 boss lane QA (run from the end of scripts/qa.mjs): L19 -> L20 boss intro, the HP bar mid-level, the defeat
// ceremony and the boss chest opening, the L5 milestone chest, the streak chest, the map with castle / chest nodes, TR,
// reduced motion and the 1600x900 column. Frames: qa/r11x-boss-*.png. h = the qa.mjs harness helpers.
export async function bossQA(h) {
  const { send, ev, qa, shot, boot, sleep, waitFor } = h;
  const cfg = (lg) => `settings: { lang: '${lg}', sound: false, music: false, haptics: false }`;
  const put = (lv, lg = 'en', extra = '') => ev(`localStorage.setItem("lco_save", JSON.stringify({ v: 9, level: ${lv}, coins: 400, meta: { sessions: 4 }, cafe: { stars: 0, built: {} }, ${cfg(lg)}${extra ? ', ' + extra : ''} }))`);
  const inView = (sel) => ev(`(() => { const e = document.querySelector(${JSON.stringify(sel)}); if (!e) return false; const r = e.getBoundingClientRect(); return r.width > 0 && r.top >= -1 && r.bottom <= innerHeight + 1 && r.left >= -1 && r.right <= document.body.getBoundingClientRect().right + 1; })()`);
  const winCard = async () => { await waitFor('window.__qa.state().screen === "win"', 40000); await waitFor('!!document.querySelector("#modal .card.win")', 15000); await sleep(1200); };
  const openChest = async (tag) => {
    await waitFor('!!document.querySelector("#modal .bxchest")', 8000);
    if (!(await inView('#modal .bxchest'))) throw new Error(`boss ${tag}: the chest on the win card should be on screen`);
    await ev('document.querySelector("#modal .bxchest").click()');
    await waitFor('!!document.getElementById("chestfx")', 4000);
  };
  const sizes = [[375, 667, 2, true], [1600, 900, 1, false]];
  for (const [w, hh, dpr, mobile] of sizes) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: hh, deviceScaleFactor: dpr, mobile });
    const sz = w > 1000 ? '-desk' : '';
    // 1. L19 won -> Next -> L20: the boss intro card, the nameplate over the plaque, the frame
    await put(19);
    await boot();
    await qa('level(19)'); await sleep(600); await qa('winNow()');
    await winCard();
    if (!(await ev('!!document.querySelector("#modal .bxflame")'))) throw new Error('boss: the win card should carry the flame meter');
    await ev('document.querySelector("#modal [data-act=next]").click()');
    await waitFor('!!document.getElementById("bossintro")', 8000); await sleep(900);
    const bar = await ev('(() => { const b = document.getElementById("bossbar"); return b && !b.hidden ? { txt: b.textContent, vis: getComputedStyle(document.querySelector("#hud .lvl-pill")).visibility } : null; })()');
    if (!bar || !/Duke Fluffington/.test(bar.txt) || bar.vis !== 'hidden') throw new Error('boss: L20 should show the Duke nameplate over the plaque ' + JSON.stringify(bar));
    if (!(await inView('#bossintro')) || !(await inView('#bossbar'))) throw new Error('boss: intro / nameplate off screen');
    if (!/wants \d+ cats!/.test(await ev('document.getElementById("bossintro").textContent'))) throw new Error('boss: the intro should name the order');
    if (await ev('document.getElementById("bossframe").hidden')) throw new Error('boss: the board frame should show');
    await shot('r11x-boss-intro' + sz);
    // 2. half the line played: the HP bar has dropped and the boss reacted
    const order = await qa('order()');
    for (const id of order.slice(0, Math.ceil(order.length * 0.55))) { await qa(`tap(${id})`); await sleep(260); }
    await sleep(1500);
    const hp = await qa('state()').then(() => ev('window.__boss.cur()'));
    if (!hp || !(hp.shown > 0 && hp.shown < hp.total)) throw new Error('boss: the HP should drop as cats land ' + JSON.stringify(hp));
    if (await ev('!!document.getElementById("bossintro")')) throw new Error('boss: the intro should leave on the first cat');
    await shot('r11x-boss-hp' + sz);
    // 3. the rest: the defeat ceremony, then the win card with the gold chest; the chest opening (first boss: rare)
    await qa('winNow()');
    await waitFor('!!document.getElementById("bossdefeat")', 30000); await sleep(1600);
    if (!/gives up!/.test(await ev('document.getElementById("bossdefeat").textContent'))) throw new Error('boss: the defeat card should say the boss gives up');
    await shot('r11x-boss-defeat' + sz);
    await winCard();
    if (!(await ev('!!document.querySelector("#modal .bxchest.gold")'))) throw new Error('boss: the win card should hold the gold boss chest');
    await shot('r11x-boss-wincard' + sz);
    await openChest('boss');
    await sleep(900);
    await shot('r11x-boss-chest-wobble' + sz);
    await waitFor('!!document.getElementById("cxreveal")', 15000); await sleep(900);
    if (!/RARE!/.test(await ev('document.getElementById("cxreveal").textContent'))) throw new Error('boss: the first boss chest should be rare');
    await shot('r11x-boss-chest-reveal' + sz);
    await ev('document.querySelector("#cxreveal .cxwear").click()'); await sleep(200);
    await ev('document.querySelector("#cxreveal .cxok").click()'); await sleep(400);
    if (!(await inView('#chestfx .cxgo'))) throw new Error('boss: Collect should be on screen');
    await shot('r11x-boss-chest-loot' + sz);
    const sv = await ev('JSON.parse(localStorage.getItem("lco_save"))');
    if (!sv.boss || sv.boss.q.length !== 0 || sv.boss.beat !== 1 || !Object.keys(sv.shop.own || {}).length) throw new Error('boss: the chest should be paid and saved ' + JSON.stringify(sv.boss));
    await ev('document.querySelector("#chestfx .cxgo").click()'); await sleep(600);
    if (await ev('!!document.getElementById("chestfx") || !!document.querySelector("#modal .bxchest")')) throw new Error('boss: Collect should close the chest and clear the win card button');
    if (w > 1000) break;
    // 4. the L5 milestone chest (wooden)
    await put(5);
    await boot(); await qa('level(5)'); await sleep(600); await qa('winNow()');
    await winCard();
    await openChest('wood');
    await waitFor('!document.querySelector("#chestfx .cxgo").hidden', 15000); await sleep(500);
    await shot('r11x-boss-wood');
    await ev('document.querySelector("#chestfx .cxgo").click()'); await sleep(500);
    // 5. the streak chest: two wins banked, the third fills the flame
    await put(23, 'en', 'boss: { last: 22, fl: { n: 2, fail: 0, k: 0 }, q: [] }');
    await boot(); await qa('level(23)'); await sleep(600); await qa('winNow()');
    await winCard();
    if (!(await ev('!!document.querySelector("#modal .bxflame.full")'))) throw new Error('boss: the 3rd win should fill the flame');
    await shot('r11x-boss-streak-card');
    await openChest('streak');
    await waitFor('!document.querySelector("#chestfx .cxgo").hidden', 15000); await sleep(400);
    if (!/Streak chest/.test(await ev('document.getElementById("chestfx").textContent'))) throw new Error('boss: a streak chest');
    await shot('r11x-boss-streak-open');
    await ev('document.querySelector("#chestfx .cxgo").click()'); await sleep(400);
    // 6. a lost bench given up puts the flame out (toast on the retry)
    await put(24, 'en', 'boss: { last: 23, fl: { n: 2, fail: 0, k: 1 }, q: [] }');
    await boot(); await qa('level(24)'); await sleep(600); await qa('failNow()');
    await waitFor('window.__qa.state().screen === "fail"', 30000); await sleep(600);
    await qa('level(24)'); await sleep(600);
    if ((await ev('window.__boss.st().fl.n')) !== 0) throw new Error('boss: a given-up loss should put the flame out');
  }
  // 7. the map: castle node with the boss, chest markers, the pill (EN + TR), a chest waiting to be opened, 1600x900
  for (const [w, hh, dpr, mobile, lg] of [[375, 667, 2, true, 'en'], [375, 667, 2, true, 'tr'], [1600, 900, 1, false, 'en']]) {
    await send('Emulation.setDeviceMetricsOverride', { width: w, height: hh, deviceScaleFactor: dpr, mobile });
    await put(38, lg, 'boss: { last: 37, fl: { n: 1, fail: 0, k: 3 }, q: [] }');
    await boot(); await qa('home()'); await sleep(1000);
    const m = await ev('({ castle: !!document.querySelector(".hmn.boss[data-lv=\'40\'] .bmcastle"), face: !!document.querySelector(".hmn.boss .bmface"), chests: document.querySelectorAll(".bmchest").length, pill: document.querySelector(".bmpill")?.textContent || "" })');
    if (!m.castle || !m.face || m.chests < 1) throw new Error('boss map: castle / chests ' + JSON.stringify(m));
    if (!(lg === 'en' ? /3 levels to the boss chest/ : /Boss sandığına 3 seviye/).test(m.pill)) throw new Error('boss map: the pill ' + m.pill);
    if (!(await inView('.bmpill'))) throw new Error('boss map: the pill should be on screen');
    await shot(`r11x-boss-map-${lg}${w > 1000 ? '-desk' : ''}`);
  }
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 2, mobile: true });
  // a chest still in the queue: the pill turns into a button that opens it; past L120 a generated chapter name
  await put(122, 'en', 'boss: { last: 120, fl: { n: 0, fail: 0, k: 0 }, q: [{ t: "boss", n: 120, i: 5 }] }');
  await boot(); await qa('home()'); await sleep(1000);
  if (!(await ev('!!document.querySelector(".bmpill .bmopen")'))) throw new Error('boss map: a waiting chest should show Open');
  if (!(await ev('[...document.querySelectorAll(".hmsign b")].some((b) => b.textContent === "Misty Meadow")'))) throw new Error('boss map: chapter 13 should have a generated name');
  await shot('r11x-boss-map-pending');
  await ev('document.querySelector(".bmpill .bmopen").click()');
  await waitFor('!!document.getElementById("chestfx")', 4000); await sleep(4200);
  await shot('r11x-boss-map-chest');
  // reduced motion: the chest is open at once (a plain fade), the intro card holds still
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'reduce' }] });
  await put(5);
  await boot(); await qa('level(5)'); await sleep(600); await qa('winNow()');
  await winCard();
  await ev('document.querySelector("#modal .bxchest").click()'); await sleep(500);
  if (await ev('document.querySelector("#chestfx .cxgo").hidden')) throw new Error('boss: reduced motion opens the chest at once');
  await shot('r11x-boss-calm');
  await send('Emulation.setEmulatedMedia', { features: [] });
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 812, deviceScaleFactor: +(process.env.QA_DPR || 2), mobile: true });
  await ev('localStorage.removeItem("lco_save")');
}

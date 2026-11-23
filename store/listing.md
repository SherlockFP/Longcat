# Long Cat Out! - web portal listing (CrazyGames / Poki / itch.io)

Assets: `store/shots/en-1..6.png`, `store/shots/tr-1..6.png` (1080x1920 portrait), `store/shots/cover.png` (1280x720), app icon `public/icons/icon-512.png`.
Regenerate shots: `PORT=5193 node scripts/store-shots.mjs`.

Fields in [BRACKETS] are placeholders the owner fills in.

## English

**Title:** Long Cat Out!

**Short description (under 80 chars):** Tap the long cats out of the room and fill the carriers.

**Long description:**
Long Cat Out! is a relaxing but clever puzzle. Every long, wiggly cat is stuck in the room, and your job is to tap each one out the right way. Clear a cat's path, send it running to a carrier, and fill every carrier with three cats of the same color. If a cat cannot move yet, it just bonks and you try again, so nothing is lost.

- Tap-away puzzles: free a cat only when its way out is clear.
- Carrier Jam twist: three cats of one color fill a carrier, then it drives away. Wrong colors wait on the bench, so plan your seats.
- Hundreds of handmade levels with new surprises: sleeping dogs, rolling yarn balls, mystery cats and frozen cats.
- Boosters when you need them: Hint, Undo and Scoop.
- Build your Cat Cafe: earn stars, decorate, and meet residents who bring perks.
- Daily tasks, a login calendar and weekly cat shows.
- Cute art, short sessions, plays great on phone and desktop. Works offline once loaded. English and Turkish.

**Controls:** tap or click a cat to send it out. Tap the booster buttons to use them.

**Tags:** puzzle, cat, cats, casual, brain, tap, logic, relaxing, cute, hypercasual, mobile, jam, arrow, kitten, cafe

**Category:** Puzzle

**Orientation:** Portrait (mobile first)

## Türkçe

**Başlık:** Uzun Kedi Kaçış!

**Kısa açıklama:** Uzun kedileri odadan çıkar ve taşıyıcıları doldur.

**Uzun açıklama:**
Uzun Kedi Kaçış! rahatlatıcı ama zekice bir bulmaca. Odadaki her uzun, kıvrak kedi sıkışmış durumda; senin işin her birine doğru yolu açıp dokunarak dışarı çıkarmak. Kedinin önünü aç, taşıyıcıya koşsun, her taşıyıcıyı aynı renkten üç kediyle doldur. Yolu kapalı kedi sadece "pat" diye çarpar, tekrar denersin; hiçbir şey kaybetmezsin.

- Dokun-çıkar bulmacaları: kedi ancak yolu boşken dışarı çıkar.
- Taşıyıcı Jam'i: aynı renkten üç kedi bir taşıyıcıyı doldurur ve taşıyıcı yola çıkar. Farklı renkler bankta bekler, koltuklarını iyi planla.
- Yüzlerce özenle hazırlanmış seviye ve yeni sürprizler: uyuyan köpekler, yuvarlanan yün yumakları, gizemli ve buzlu kediler.
- İhtiyacın olunca destekler: İpucu, Geri Al ve Kaldır.
- Kedi Kafesi'ni kur: yıldız kazan, süsle, yeni sakinlerle tanış ve özel avantajlar kazan.
- Günlük görevler, giriş takvimi ve haftalık kedi gösterileri.
- Sevimli çizimler, kısa oyunlar, telefonda ve bilgisayarda rahat oynanır. Bir kez yüklenince çevrimdışı çalışır. Türkçe ve İngilizce.

**Kontroller:** Kediyi dışarı göndermek için ona dokun veya tıkla. Destekleri kullanmak için düğmelere dokun.

**Etiketler:** bulmaca, kedi, kediler, rahat oyun, zeka, dokun, mantık, sevimli, hiper-casual, mobil, jam, ok, yavru kedi, kafe

**Kategori:** Bulmaca

## Notes per portal

- CrazyGames: submit the built `dist` folder as a zip (index.html at the root). They run their own ads through their SDK, so load the game with `?noads=1` or use their requirements instead of the H5 provider. Check their current guide.
- Poki: needs the Poki SDK for ads and gameplay events (not included). Submit via their developer portal; they will request SDK integration.
- itch.io: upload the `dist` zip as "HTML5", set viewport to 540x960 (portrait) or enable fullscreen button. No ad SDK needed.

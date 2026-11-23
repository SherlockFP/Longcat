// DISABLED stub: a global rank list on Cloudflare Workers + KV (see qa/r10-iq.md for the owner's setup steps).
// Nothing imports this yet; the Records sheet ships local + friends + BOT rivals. To switch on: deploy the Worker,
// set ENDPOINT to its URL, set ENABLED to true, then call submit() after a win and top() from the Rank tab.
// No accounts: an entry is keyed by a random per-browser id; names are the optional dare nickname (max 12 chars).

export const ENABLED = false;
export const ENDPOINT = ''; // e.g. 'https://lco-rank.<your-subdomain>.workers.dev'

// entry: { id: string (random, per browser), nm: string (<= 12), lv: levels cleared, iq: Cat IQ 80-160, run: best Record Run ms (0 = none) }
// -> { ok: true, rank: number, of: number } | null (disabled / offline)
export async function submit(entry) {
  if (!ENABLED || !ENDPOINT) return null;
  try {
    const r = await fetch(ENDPOINT + '/submit', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(entry) });
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

// board: 'lv' | 'iq' | 'run'; around: the player's own value, so the list comes back centred on them
// -> { rows: [{ nm, lv, iq, run }], of: number } | null
export async function top(board = 'lv', around = 0) {
  if (!ENABLED || !ENDPOINT) return null;
  try {
    const r = await fetch(`${ENDPOINT}/top?b=${encodeURIComponent(board)}&v=${encodeURIComponent(around)}`);
    return r.ok ? await r.json() : null;
  } catch { return null; }
}

'use strict';
/* =====================================================================
   Titi-Sti — recettes & bar, appli locale (PWA). Données 100 % dans le téléphone.
   ===================================================================== */

const APP_ID = 'recettes-bar';
const RECIPE_CATS = {
  entree:  { label: 'Entrée',   color: '#6a9f3c' },
  plat:    { label: 'Plat',     color: '#c4572e' },
  dessert: { label: 'Dessert',  color: '#d2557f' },
  boisson: { label: 'Boisson',  color: '#2f7fb5' },
  autre:   { label: 'Autre',    color: '#7d8590' },
};
const BAR_CATS = {
  gin:     { label: 'Gin',     color: '#2f8f6b', extra: [['botanicals', 'Botaniques'], ['tonic', 'Tonic conseillé'], ['garnish', 'Garniture']] },
  rhum:    { label: 'Rhum',    color: '#c7801f', extra: [['age', 'Âge'], ['origin', 'Origine (canne / mélasse)'], ['spiced', 'Épicé ?']] },
  whisky:  { label: 'Whisky',  color: '#7a4a24', extra: [['age', 'Âge'], ['peated', 'Tourbé ?'], ['cask', 'Type de fût']] },
  sirop:   { label: 'Sirop',   color: '#d2557f', extra: [['flavor', 'Parfum'], ['usage', 'Usage']] },
  liqueur: { label: 'Liqueur', color: '#7b52b8', extra: [['flavor', 'Parfum'], ['usage', 'Usage']] },
  autre:   { label: 'Autre',   color: '#7d8590', extra: [] },
};
const DIFFS = ['Facile', 'Moyen', 'Difficile'];
const QR_MAX = 1800; // caractères max d'un lien encodé en QR (lisible écran à écran)

/* ---------- petites aides ---------- */
const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => (crypto.randomUUID ? crypto.randomUUID() : 'id-' + Date.now().toString(36) + Math.random().toString(36).slice(2));
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const today = () => new Date().toISOString().slice(0, 10);
const clone = (o) => JSON.parse(JSON.stringify(o));
/* ---------- sécurité : tout ce qui vient d'une carte reçue ou d'un fichier est nettoyé ---------- */
const num = (v, min, max) => { if (v === null || v === undefined || v === '') return null; v = Number(v); return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : null; };
const note = (v) => { v = num(v, 0, 10); return v == null ? null : Math.round(v * 2) / 2; };
const str = (v, max = 5000) => (v == null ? '' : String(v)).slice(0, max);
const safeId = (v) => (typeof v === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(v)) ? v : uid();
const safeImg = (v) => (typeof v === 'string' && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(v)) ? v : null;
const safeUrl = (v) => (typeof v === 'string' && /^https?:\/\/[^\s"'<>]+$/i.test(v)) ? v.slice(0, 2000) : '';
const safeMine = (m) => ({ rating: note(m?.rating), comment: str(m?.comment), tastedAt: str(m?.tastedAt, 20) });
const safeOthers = (a) => (Array.isArray(a) ? a : []).slice(0, 20).map(o => ({ author: str(o?.author, 40), rating: note(o?.rating), comment: str(o?.comment), at: str(o?.at, 20) }));
function sanitizeItem(it) {
  if (!it || (it.kind !== 'recipe' && it.kind !== 'bottle')) return null;
  const base = { id: safeId(it.id), kind: it.kind, createdAt: num(it.createdAt, 0, 1e14) || Date.now(), updatedAt: num(it.updatedAt, 0, 1e14) || 0,
    photo: safeImg(it.photo), mine: safeMine(it.mine), others: safeOthers(it.others), demo: !!it.demo,
    origin: it.origin ? { author: str(it.origin.author, 40), fromId: str(it.origin.fromId, 64), title: str(it.origin.title, 200) } : null };
  if (it.kind === 'recipe') return { ...base, base: cleanRecipe(it.base || {}), current: it.current ? cleanRecipe(it.current) : null, favorite: !!it.favorite, sourceUrl: safeUrl(it.sourceUrl) };
  const b = cleanBottle(it.base || {}); b.price = num(it.base?.price, 0, 1e6);
  return { ...base, base: b };
}
function sanitizePayload(p) {
  if (!p || typeof p !== 'object' || !p.d || (p.k !== 'r' && p.k !== 'b')) return null;
  return { v: 1, k: p.k, id: safeId(p.id), by: str(p.by, 40) || 'Quelqu’un', d: p.d, src: safeUrl(p.src), mod: !!p.mod,
    av: p.av && note(p.av.r) != null ? { r: note(p.av.r), c: str(p.av.c) } : null };
}

const ICONS = {
  book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5z"/><path d="M4 19.5V21h16"/></svg>',
  glass: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 3h14l-7 9z"/><path d="M12 12v8"/><path d="M8 21h8"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>',
  edit: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z"/></svg>',
  share: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><path d="M8.6 13.5l6.8 4M15.4 6.5l-6.8 4"/></svg>',
  star: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>',
  starO: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"><path d="M12 2l3.1 6.3 6.9 1-5 4.9 1.2 6.8L12 17.8 5.8 21l1.2-6.8-5-4.9 6.9-1z"/></svg>',
  link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7"/><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7"/></svg>',
  text: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg>',
  pen: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21v-4L16 4l4 4L7 21z"/></svg>',
  file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>',
  chef: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 13.9A4 4 0 0 1 7.3 6a5 5 0 0 1 9.4 0A4 4 0 0 1 18 13.9V21H6z"/><path d="M6 17h12"/></svg>',
  trash: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/></svg>',
};

/* =====================================================================
   Stockage : IndexedDB (repli mémoire si indisponible)
   ===================================================================== */
const Store = {
  db: null, mem: new Map(),
  async open() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open(APP_ID, 1);
        r.onupgradeneeded = () => r.result.createObjectStore('items', { keyPath: 'id' });
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
    } catch (e) { console.warn('IndexedDB indisponible, stockage en mémoire', e); this.db = null; }
  },
  async all() {
    if (!this.db) return [...this.mem.values()];
    return new Promise((res, rej) => {
      const r = this.db.transaction('items').objectStore('items').getAll();
      r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error);
    });
  },
  async put(item) {
    item.updatedAt = Date.now();
    if (!this.db) { this.mem.set(item.id, item); return; }
    return new Promise((res, rej) => {
      const t = this.db.transaction('items', 'readwrite'); t.objectStore('items').put(item);
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
  },
  async del(id) {
    if (!this.db) { this.mem.delete(id); return; }
    return new Promise((res, rej) => {
      const t = this.db.transaction('items', 'readwrite'); t.objectStore('items').delete(id);
      t.oncomplete = () => res(); t.onerror = () => rej(t.error);
    });
  },
};
const Prefs = {
  defaults: { name: '', apiKey: '', model: 'claude-haiku-5-5', fs: 'n', theme: 'auto', lastBackup: 0, seeded: false },
  data: null,
  load() { try { this.data = { ...this.defaults, ...JSON.parse(localStorage.getItem(APP_ID + '-prefs') || '{}') }; } catch { this.data = { ...this.defaults }; } },
  get(k) { return this.data[k]; },
  set(k, v) { this.data[k] = v; try { localStorage.setItem(APP_ID + '-prefs', JSON.stringify(this.data)); } catch { } },
};

/* =====================================================================
   État
   ===================================================================== */
const S = { items: [], tab: 'recipes', q: '', rcat: 'all', bcat: 'all', favOnly: false };
const recipes = () => S.items.filter(i => i.kind === 'recipe');
const bottles = () => S.items.filter(i => i.kind === 'bottle');
const byId = (id) => S.items.find(i => i.id === id);
async function save(item) { await Store.put(item); const i = S.items.findIndex(x => x.id === item.id); if (i >= 0) S.items[i] = item; else S.items.push(item); }
async function remove(id) { await Store.del(id); S.items = S.items.filter(x => x.id !== id); }
const eff = (r) => r.current || r.base; // recette affichée : modifiée sinon originale

function rarity(rating) {
  if (rating == null) return null;
  if (rating < 5) return { k: 'commune', label: 'Commune', color: '#9aa0a6' };
  if (rating < 7) return { k: 'peu', label: 'Peu commune', color: '#4caf50' };
  if (rating < 8.5) return { k: 'rare', label: 'Rare', color: '#2f7fd8' };
  if (rating < 9.5) return { k: 'epique', label: 'Épique', color: '#8e44d1' };
  return { k: 'legendaire', label: 'Légendaire', color: '#d4a017' };
}
const fmtNote = (n) => n == null ? '–' : String(n).replace('.', ',');
function householdAvg(b) {
  const notes = [b.mine?.rating, ...(b.others || []).map(o => o.rating)].filter(n => n != null);
  if (!notes.length) return null;
  return Math.round(notes.reduce((a, c) => a + c, 0) / notes.length * 10) / 10;
}

/* =====================================================================
   Ingrédients : texte <-> structure, mise à l'échelle
   ===================================================================== */
const UNITS = ['cuillères à soupe', 'cuillère à soupe', 'cuillères à café', 'cuillère à café', 'c. à soupe', 'c. à café', 'c. à s.', 'c. à c.', 'càs', 'càc', 'cs', 'cc', 'kg', 'mg', 'g', 'dl', 'cl', 'ml', 'l', 'pincées', 'pincée', 'sachets', 'sachet', 'tranches', 'tranche', 'gousses', 'gousse', 'pots', 'pot', 'verres', 'verre', 'bottes', 'botte', 'brins', 'brin', 'feuilles', 'feuille', 'boîtes', 'boîte', 'tasses', 'tasse'];
const FRAC = { '½': .5, '¼': .25, '¾': .75, '⅓': 1 / 3, '⅔': 2 / 3 };
function parseIng(line) {
  line = line.trim().replace(/^[-•*]\s*/, '');
  if (!line) return null;
  const m = line.match(/^(\d+(?:[.,]\d+)?(?:\s*\/\s*\d+)?|\d*\s*[½¼¾⅓⅔])\s*(.*)$/);
  if (!m) return { qty: null, unit: '', name: line };
  let q = m[1].replace(',', '.').trim(), qty;
  if (/[½¼¾⅓⅔]/.test(q)) { const n = parseFloat(q) || 0; qty = n + FRAC[q.slice(-1)]; }
  else if (q.includes('/')) { const [a, b] = q.split('/').map(Number); qty = a / b; }
  else qty = parseFloat(q);
  let rest = m[2], unit = '';
  for (const u of UNITS) {
    const re = new RegExp('^' + u.replace(/[.]/g, '\\.') + '(?=\\s|$)', 'i');
    if (re.test(rest)) { unit = u; rest = rest.slice(u.length).trim(); break; }
  }
  rest = rest.replace(/^(de |d')/i, '');
  return { qty, unit, name: rest };
}
function fmtQty(v) {
  if (v == null || isNaN(v)) return '';
  const fr = [[.25, '¼'], [1 / 3, '⅓'], [.5, '½'], [2 / 3, '⅔'], [.75, '¾']];
  if (v < 10) {
    const w = Math.floor(v), f = v - w;
    for (const [x, s] of fr) if (Math.abs(f - x) < .04) return (w ? w + ' ' : '') + s;
    return String(Math.round(v * 10) / 10).replace('.', ',');
  }
  return String(Math.round(v));
}
const ingLine = (i, k = 1) => [fmtQty(i.qty == null ? null : i.qty * k), i.unit, i.name].filter(Boolean).join(' ');

/* =====================================================================
   Photos : compression ~200 Ko
   ===================================================================== */
function fileToDataURL(file) { return new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); }); }
async function compressImage(src, maxSide = 1200, target = 220_000) {
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  let w = img.naturalWidth, h = img.naturalHeight; const k = Math.min(1, maxSide / Math.max(w, h)); w = Math.round(w * k); h = Math.round(h * k);
  const c = document.createElement('canvas'); c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h);
  let q = .8, out = c.toDataURL('image/jpeg', q);
  while (out.length * .75 > target && q > .4) { q -= .1; out = c.toDataURL('image/jpeg', q); }
  return out;
}
function pickImage(capture) {
  return new Promise((res) => {
    const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; if (capture) inp.capture = 'environment';
    inp.onchange = async () => { const f = inp.files[0]; if (!f) return res(null); try { res(await compressImage(await fileToDataURL(f))); } catch { toast('Image illisible'); res(null); } };
    inp.click();
  });
}

/* =====================================================================
   Claude : import intelligent
   ===================================================================== */
const RECIPE_SCHEMA = `{
  "title": "string",
  "category": "entree | plat | dessert | boisson | autre",
  "servings": number | null,
  "prepMin": number | null,
  "cookMin": number | null,
  "difficulty": "Facile | Moyen | Difficile",
  "ingredients": [{"qty": number | null, "unit": "string (g, kg, ml, cl, l, c. à s., c. à c., pincée… ou vide)", "name": "string"}],
  "steps": ["string"],
  "tags": ["string"],
  "notes": "string"
}`;
const BOTTLE_SCHEMA = `{
  "name": "string",
  "category": "gin | rhum | whisky | sirop | liqueur | autre",
  "brand": "string (distillerie ou marque)",
  "country": "string",
  "abv": number | null,
  "description": "string (2-3 phrases de notes de dégustation, en français)",
  "extra": {"botanicals": "", "tonic": "", "garnish": "", "age": "", "origin": "", "spiced": "", "peated": "", "cask": "", "flavor": "", "usage": ""}
}`;
const SYS_RECIPE = `Tu extrais des recettes de cuisine. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, selon ce schéma :
${RECIPE_SCHEMA}
Règles : tout en français (traduis si besoin). Système métrique (convertis cups, oz, °F). Une étape = une action claire. Quantités numériques (0.5, pas "1/2"). N'invente rien : laisse null ou vide ce qui manque. Si le contenu n'est pas une recette, renvoie {"error": "explication courte"}.`;
const SYS_BOTTLE = `Tu identifies des boissons (gin, rhum, whisky, sirop, liqueur…) à partir d'une photo d'étiquette ou d'un texte. Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, selon ce schéma :
${BOTTLE_SCHEMA}
Dans "extra", ne remplis que les champs pertinents pour la catégorie. Ce que tu lis sur l'étiquette prime ; complète avec tes connaissances seulement si tu es sûr. Si ce n'est pas une boisson, renvoie {"error": "explication courte"}.`;

async function askClaude({ system, content, useFetch = false }) {
  const key = Prefs.get('apiKey');
  if (!key) throw new Error('NOKEY');
  const headers = {
    'content-type': 'application/json',
    'x-api-key': key,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  if (useFetch) headers['anthropic-beta'] = 'web-fetch-2025-09-10';
  const messages = [{ role: 'user', content }];
  const body = { model: Prefs.get('model') || 'claude-haiku-5-5', max_tokens: 4000, system, messages };
  if (useFetch) body.tools = [{ type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 3, max_content_tokens: 40000 }];
  let data;
  for (let turn = 0; turn < 4; turn++) {
    const r = await fetch('https://api.anthropic.com/v1/messages', { method: 'POST', headers, body: JSON.stringify(body) });
    data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data?.error?.message || ('Erreur ' + r.status));
    if (data.stop_reason === 'pause_turn') { messages.push({ role: 'assistant', content: data.content }); continue; }
    break;
  }
  const fetchErr = (data.content || []).find(b => b.type === 'web_fetch_tool_result' && b.content?.type === 'web_fetch_tool_error');
  const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
  const a = text.indexOf('{'), z = text.lastIndexOf('}');
  if (a < 0 || z < a) throw new Error(fetchErr ? 'Page inaccessible (' + fetchErr.content.error_code + '). Essayez « Coller le texte ».' : 'Réponse illisible, réessayez.');
  const json = JSON.parse(text.slice(a, z + 1));
  if (json.error) throw new Error(json.error);
  return json;
}
const imgBlock = (dataUrl) => ({ type: 'image', source: { type: 'base64', media_type: dataUrl.slice(5, dataUrl.indexOf(';')), data: dataUrl.split(',')[1] } });

function cleanRecipe(j) {
  return {
    title: str(j.title, 200) || 'Recette sans titre',
    category: Object.hasOwn(RECIPE_CATS, j.category) ? j.category : 'autre',
    servings: num(j.servings, 1, 1000), prepMin: num(j.prepMin, 0, 10000), cookMin: num(j.cookMin, 0, 10000),
    difficulty: DIFFS.includes(j.difficulty) ? j.difficulty : 'Facile',
    ingredients: (Array.isArray(j.ingredients) ? j.ingredients : []).filter(i => i && i.name).slice(0, 200).map(i => ({ qty: num(i.qty, 0, 1e6), unit: str(i.unit, 40), name: str(i.name, 300) })),
    steps: (Array.isArray(j.steps) ? j.steps : []).filter(Boolean).slice(0, 200).map(x => str(x, 3000)), tags: (Array.isArray(j.tags) ? j.tags : []).slice(0, 30).map(x => str(x, 40)), notes: str(j.notes),
  };
}
function cleanBottle(j) {
  const cat = Object.hasOwn(BAR_CATS, j.category) ? j.category : 'autre';
  const extra = {}; for (const [k] of BAR_CATS[cat].extra) extra[k] = str(j.extra?.[k], 300);
  return { name: str(j.name, 200), category: cat, brand: str(j.brand, 200), country: str(j.country, 100), abv: num(j.abv, 0, 100), description: str(j.description), price: null, extra };
}

/* =====================================================================
   Échange : carte -> lien compressé / QR / fichier
   ===================================================================== */
const b64u = {
  enc(bytes) { let s = ''; bytes.forEach(b => s += String.fromCharCode(b)); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); },
  dec(str) { str = str.replace(/-/g, '+').replace(/_/g, '/'); while (str.length % 4) str += '='; return Uint8Array.from(atob(str), c => c.charCodeAt(0)); },
};
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
async function packPayload(obj) {
  const raw = new TextEncoder().encode(JSON.stringify(obj));
  if (typeof CompressionStream !== 'undefined') return 'z' + b64u.enc(await pipe(raw, new CompressionStream('deflate-raw')));
  return 'j' + b64u.enc(raw);
}
async function unpackPayload(s) {
  const bytes = b64u.dec(s.slice(1));
  const raw = s[0] === 'z' ? await pipe(bytes, new DecompressionStream('deflate-raw')) : bytes;
  return JSON.parse(new TextDecoder().decode(raw));
}
const appBase = () => location.href.split('#')[0].split('?')[0];

function cardPayload(item, withAvis) {
  const by = Prefs.get('name') || 'Quelqu’un';
  if (item.kind === 'recipe') {
    const p = { v: 1, k: 'r', id: item.id, by, d: eff(item), src: item.sourceUrl || '' };
    if (item.current) p.mod = 1;
    if (withAvis && item.mine?.rating != null) p.av = { r: item.mine.rating, c: item.mine.comment || '' };
    return p;
  }
  const p = { v: 1, k: 'b', id: item.id, by, d: item.base };
  if (withAvis && item.mine?.rating != null) p.av = { r: item.mine.rating, c: item.mine.comment || '' };
  return p;
}

async function handleIncoming(p, photo) {
  p = sanitizePayload(p); photo = safeImg(photo);
  if (!p) { toast('Carte invalide'); return; }
  if (p.k === 'r') return incomingRecipe(p, photo);
  if (p.k === 'b') return incomingBottle(p, photo);
}
async function incomingRecipe(p, photo) {
  const d = cleanRecipe(p.d);
  const same = byId(p.id) || (p.src && recipes().find(r => r.sourceUrl && r.sourceUrl === p.src));
  const make = (id) => ({
    id, kind: 'recipe', createdAt: Date.now(), base: d, current: null, photo: photo || null, sourceUrl: p.src || '',
    favorite: false, origin: { author: p.by, fromId: p.id, title: d.title }, mine: { rating: null, comment: '', tastedAt: '' }, others: [],
  });
  const choice = await previewSheet({
    title: 'Recette reçue de ' + p.by,
    body: `<div class="draft-note"><b>${esc(d.title)}</b><br>${d.ingredients.length} ingrédients · ${d.steps.length} étapes${p.mod ? ' · version modifiée par ' + esc(p.by) : ''}${p.av ? `<br>Avis de ${esc(p.by)} : <b>${fmtNote(p.av.r)}/10</b>${p.av.c ? ' — « ' + esc(p.av.c) + ' »' : ''}` : ''}</div>`
      + (same ? `<p class="warn">Vous avez déjà « ${esc(eff(same).title)} ».</p>` : ''),
    actions: same ? [['replace', 'Remplacer la mienne'], ['both', 'Garder les deux'], ['ignore', 'Ignorer', 'sec']] : [['add', 'Ajouter à mes recettes'], ['ignore', 'Annuler', 'sec']],
  });
  if (choice === 'ignore' || !choice) return;
  let item;
  if (choice === 'replace') { item = { ...same, base: d, current: null, origin: { author: p.by, fromId: p.id, title: d.title } }; if (photo) item.photo = photo; }
  else item = make(choice === 'both' || byId(p.id) ? uid() : p.id);
  if (p.av) { item.others = (item.others || []).filter(o => o.author !== p.by); item.others.push({ author: p.by, rating: p.av.r, comment: p.av.c, at: today() }); }
  await save(item); toast('Recette ajoutée'); render(); openRecipe(item.id);
}
async function incomingBottle(p, photo) {
  const d = cleanBottle({ ...p.d, extra: p.d.extra });
  d.price = num(p.d.price, 0, 1e6);
  const same = byId(p.id) || bottles().find(b => norm(b.base.name) === norm(d.name) && norm(b.base.brand) === norm(d.brand));
  const avisTxt = p.av ? `<br>Avis de ${esc(p.by)} : <b>${fmtNote(p.av.r)}/10</b>${p.av.c ? ' — « ' + esc(p.av.c) + ' »' : ''}` : '';
  const choice = await previewSheet({
    title: 'Bouteille reçue de ' + p.by,
    body: `<div class="draft-note"><b>${esc(d.name)}</b> · ${esc(BAR_CATS[d.category].label)}${d.brand ? ' · ' + esc(d.brand) : ''}${avisTxt}</div>`
      + (same ? `<p class="warn">Vous avez déjà cette bouteille.${p.av ? ' L’avis de ' + esc(p.by) + ' sera ajouté à votre carte.' : ''}</p>` : ''),
    actions: same ? [['merge', p.av ? 'Ajouter son avis' : 'OK'], ['ignore', 'Ignorer', 'sec']] : [['add', 'Ajouter à mon bar'], ['ignore', 'Annuler', 'sec']],
  });
  if (choice === 'ignore' || !choice) return;
  let item;
  if (same) {
    item = same;
  } else {
    item = { id: p.id && !byId(p.id) ? p.id : uid(), kind: 'bottle', createdAt: Date.now(), base: d, photo: photo || null, mine: { rating: null, comment: '', tastedAt: '' }, others: [], origin: { author: p.by } };
  }
  if (p.av) {
    item.others = (item.others || []).filter(o => o.author !== p.by);
    item.others.push({ author: p.by, rating: p.av.r, comment: p.av.c, at: today() });
  }
  if (photo && !item.photo) item.photo = photo;
  await save(item); toast(same ? 'Avis ajouté' : 'Bouteille ajoutée'); render(); openBottle(item.id);
}

/* =====================================================================
   Navigation : écrans empilés + bouton retour Android
   ===================================================================== */
// Une seule entrée d'historique « sentinelle » : le bouton retour d'Android ferme l'écran du dessus.
// Quand aucun écran n'est ouvert, l'entrée reste en place (un retour de plus pour quitter l'appli).
const stack = [];
let armed = false, ignorePop = 0;
function arm() { if (!armed) { try { history.pushState({ rb: 1 }, ''); armed = true; } catch { } } }
function disarm() { /* on garde l'entrée sentinelle : pas de history.back() programmatique (fiable sur Android) */ }
function pushScreen(el, onClose) { document.body.appendChild(el); stack.push({ el, onClose }); arm(); }
function replaceTop(el, onClose) {
  const top = stack.at(-1); if (!top) return pushScreen(el, onClose);
  top.onClose && top.onClose(); top.el.replaceWith(el); top.el = el; top.onClose = onClose;
}
function closeTop(fromPop) {
  const s = stack.pop(); if (!s) return;
  s.el.remove(); s.onClose && s.onClose();
  if (fromPop) { armed = false; if (stack.length) arm(); }
  else if (!stack.length) disarm();
}
window.addEventListener('popstate', () => { if (ignorePop > 0) { ignorePop--; return; } if (stack.length) closeTop(true); else armed = false; });
function closeAll() { while (stack.length) { const s = stack.pop(); s.el.remove(); s.onClose && s.onClose(); } disarm(); }

function screen(title, inner, actions = '') {
  const el = document.createElement('div'); el.className = 'screen';
  el.innerHTML = `<div class="screen-bar"><button class="icon-btn" data-back aria-label="Retour">${ICONS.back}</button><h2>${esc(title)}</h2>${actions}</div>${inner}`;
  el.querySelector('[data-back]').onclick = () => closeTop();
  return el;
}
function sheet(inner, onClose) {
  const el = document.createElement('div'); el.className = 'backdrop';
  el.innerHTML = `<div class="sheet"><div class="grab"></div>${inner}</div>`;
  el.addEventListener('click', e => { if (e.target === el) closeTop(); });
  pushScreen(el, onClose); return el;
}
function previewSheet({ title, body, actions }) {
  return new Promise(res => {
    let done = false;
    const el = sheet(`<h2>${esc(title)}</h2>${body}<div style="display:flex;flex-direction:column;gap:10px;margin-top:14px">${actions.map(([k, l, c]) => `<button class="big-btn ${c || ''}" data-a="${k}">${esc(l)}</button>`).join('')}</div>`, () => { if (!done) res(null); });
    el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { done = true; res(b.dataset.a); closeTop(); });
  });
}
function confirmSheet(msg, okLabel = 'Confirmer', danger = true) {
  return previewSheet({ title: msg, body: '', actions: [['ok', okLabel, danger ? 'danger' : ''], ['no', 'Annuler', 'sec']] }).then(a => a === 'ok');
}
let toastT;
function toast(msg) {
  document.querySelectorAll('.toast').forEach(t => t.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  clearTimeout(toastT); toastT = setTimeout(() => t.remove(), 2600);
}

/* =====================================================================
   Rendu principal (onglets)
   ===================================================================== */
function render() {
  document.querySelectorAll('.tabbar button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  $('#fab').classList.toggle('hidden', S.tab === 'settings');
  const main = $('#main');
  if (S.tab === 'recipes') main.innerHTML = renderRecipes();
  else if (S.tab === 'bar') main.innerHTML = renderBar();
  else main.innerHTML = renderSettings();
  bindMain();
}

function recipeCard(r) {
  const d = eff(r), c = RECIPE_CATS[d.category] || RECIPE_CATS.autre;
  const t = (d.prepMin || 0) + (d.cookMin || 0);
  const rr = rarity(r.mine?.rating);
  return `<button class="card ${rr ? 'r-' + rr.k : ''}" style="--cat:${c.color}" data-open-r="${r.id}">
    <span class="card-tag">${esc(c.label)}</span>${r.mine?.rating != null ? `<span class="card-score">${fmtNote(r.mine.rating)}</span>` : ''}
    <div class="card-inner"><div class="card-photo">${r.photo ? `<img src="${r.photo}" alt="" loading="lazy">` : esc(d.title[0] || '?')}</div>
    <div class="card-body"><div class="card-title">${r.favorite ? '<span style="color:#e0a800">★</span> ' : ''}${esc(d.title)}</div>
    <div class="card-meta">${t ? `<span>⏱ ${t} min</span>` : ''}<span>${esc(d.difficulty)}</span>${r.current ? '<span class="badge-mod">Modifiée</span>' : ''}</div>
    ${rr ? `<div class="rarity" style="--r:${rr.color}">${rr.label}</div>` : ''}</div></div></button>`;
}
function podium(top, kind) {
  const pod = (it, n) => {
    if (!it) return `<div class="pod p${n}"></div>`;
    const isR = kind === 'r', name = isR ? eff(it).title : it.base.name;
    const col = isR ? (RECIPE_CATS[eff(it).category] || RECIPE_CATS.autre).color : BAR_CATS[it.base.category].color;
    return `<button class="pod p${n}" style="--cat:${col}" ${isR ? 'data-open-r' : 'data-open-b'}="${it.id}">
      <div class="pod-img">${it.photo ? `<img src="${it.photo}" alt="">` : esc(name[0] || '?')}</div>
      <div class="pod-name">${esc(name)}</div><div class="pod-step">${fmtNote(it.mine.rating)}</div></button>`;
  };
  return pod(top[1], 2) + pod(top[0], 1) + pod(top[2], 3);
}
function recipeResults() {
  const q = norm(S.q);
  let list = recipes().filter(r => {
    const d = eff(r);
    if (S.rcat !== 'all' && d.category !== S.rcat) return false;
    if (S.favOnly && !r.favorite) return false;
    if (!q) return true;
    return norm(d.title + ' ' + d.ingredients.map(i => i.name).join(' ') + ' ' + (d.tags || []).join(' ')).includes(q);
  }).sort((a, b) => (b.mine?.rating ?? -1) - (a.mine?.rating ?? -1) || (b.favorite - a.favorite) || eff(a).title.localeCompare(eff(b).title, 'fr'));
  const top = q ? [] : list.filter(r => r.mine?.rating != null).slice(0, 3);
  return `${top.length ? `<div class="section-label">Podium ${S.rcat === 'all' ? '' : '· ' + RECIPE_CATS[S.rcat].label}</div><div class="podium">${podium(top, 'r')}</div>` : ''}
    ${list.length ? `<div class="section-label">${list.length} recette${list.length > 1 ? 's' : ''}</div>` : ''}${list.length ? `<div class="grid">${list.map(recipeCard).join('')}</div>` :
      `<div class="empty"><b>${recipes().length ? 'Aucun résultat' : 'Aucune recette pour l’instant'}</b>${recipes().length ? 'Essayez un autre mot.' : 'Touchez + pour importer votre première recette.'}</div>`}`;
}
function renderRecipes() {
  const chips = [['all', 'Toutes'], ...Object.entries(RECIPE_CATS).map(([k, v]) => [k, v.label])];
  return `<header class="topbar"><h1>Mes recettes</h1>
    <input class="search" id="q" type="search" placeholder="Chercher un titre, un ingrédient…" value="${esc(S.q)}">
    <div class="chips"><button class="chip ${S.favOnly ? 'on' : ''}" data-fav>★ Favoris</button>${chips.map(([k, l]) => `<button class="chip ${S.rcat === k ? 'on' : ''}" data-rcat="${k}">${l}</button>`).join('')}</div></header>
    <div id="results">${recipeResults()}</div>`;
}

function bottleCard(b) {
  const c = BAR_CATS[b.base.category] || BAR_CATS.autre, r = rarity(b.mine?.rating);
  return `<button class="card ${r ? 'r-' + r.k : ''}" style="--cat:${c.color}" data-open-b="${b.id}">
    <span class="card-tag">${esc(c.label)}</span>${b.mine?.rating != null ? `<span class="card-score">${fmtNote(b.mine.rating)}</span>` : ''}
    <div class="card-inner"><div class="card-photo">${b.photo ? `<img src="${b.photo}" alt="" loading="lazy">` : esc(b.base.name[0] || '?')}</div>
    <div class="card-body"><div class="card-title">${esc(b.base.name)}</div>
    <div class="card-meta">${b.base.brand ? `<span>${esc(b.base.brand)}</span>` : ''}</div>
    ${r ? `<div class="rarity" style="--r:${r.color}">${r.label}</div>` : `<div class="card-meta">Pas encore noté</div>`}</div></div></button>`;
}
function barResults() {
  const q = norm(S.q);
  const inCat = bottles().filter(b => S.bcat === 'all' || b.base.category === S.bcat);
  const list = inCat.filter(b => !q || norm(b.base.name + ' ' + b.base.brand + ' ' + b.base.country + ' ' + Object.values(b.base.extra || {}).join(' ')).includes(q))
    .sort((a, b) => (b.mine?.rating ?? -1) - (a.mine?.rating ?? -1) || a.base.name.localeCompare(b.base.name, 'fr'));
  const top = inCat.filter(b => b.mine?.rating != null).sort((a, b) => b.mine.rating - a.mine.rating).slice(0, 3);
  return `${top.length && !q ? `<div class="section-label">Podium ${S.bcat === 'all' ? '' : '· ' + BAR_CATS[S.bcat].label}</div><div class="podium">${podium(top, 'b')}</div>` : ''}
    ${list.length ? `<div class="section-label">${list.length} bouteille${list.length > 1 ? 's' : ''}</div><div class="grid">${list.map(bottleCard).join('')}</div>` :
      `<div class="empty"><b>${bottles().length ? 'Aucun résultat' : 'Votre bar est vide'}</b>${bottles().length ? '' : 'Touchez + pour ajouter une bouteille.'}</div>`}`;
}
function renderBar() {
  const chips = [['all', 'Tout'], ...Object.entries(BAR_CATS).map(([k, v]) => [k, v.label])];
  return `<header class="topbar"><h1>Mon bar</h1>
    <input class="search" id="q" type="search" placeholder="Chercher une bouteille, une distillerie…" value="${esc(S.q)}">
    <div class="chips">${chips.map(([k, l]) => `<button class="chip ${S.bcat === k ? 'on' : ''}" data-bcat="${k}">${l}</button>`).join('')}</div></header>
    <div id="results">${barResults()}</div>`;
}

function renderSettings() {
  const lb = Prefs.get('lastBackup'), days = lb ? Math.floor((Date.now() - lb) / 864e5) : null;
  const seg = (k, opts) => `<div class="seg" data-seg="${k}">${opts.map(([v, l]) => `<button data-v="${v}" class="${Prefs.get(k) === v ? 'on' : ''}">${l}</button>`).join('')}</div>`;
  return `<header class="topbar"><h1>Réglages</h1></header><div class="set">
    <div class="box"><h3>Moi</h3>
      <div class="field"><label>Mon prénom</label><input id="p-name" value="${esc(Prefs.get('name'))}" placeholder="Affiché sur les cartes que j’envoie"></div></div>
    <div class="box"><h3>Affichage</h3>
      <div class="field"><label>Taille du texte</label>${seg('fs', [['n', 'Normal'], ['l', 'Grand'], ['xl', 'Très grand']])}</div>
      <div class="field"><label>Thème</label>${seg('theme', [['auto', 'Auto'], ['light', 'Clair'], ['dark', 'Sombre']])}</div></div>
    <div class="box"><h3>Sauvegarde</h3>
      ${days == null ? '<div class="warn">Aucune sauvegarde pour l’instant.</div>' : days > 30 ? `<div class="warn">Dernière sauvegarde il y a ${days} jours.</div>` : `<div>Dernière sauvegarde : il y a ${days} jour${days > 1 ? 's' : ''}.</div>`}
      <button class="big-btn" id="export">${ICONS.file} Exporter toutes mes données</button>
      <button class="big-btn sec" id="import-file">Importer une sauvegarde ou une carte</button>
      <div class="hint" style="font-size:.85rem;color:var(--muted)">${recipes().length} recettes · ${bottles().length} bouteilles. Le fichier contient aussi les photos. Rangez-le sur le NAS (appli Synology Drive) ou dans vos mails.</div></div>
    <div class="box"><h3>Import intelligent (Claude)</h3>
      <div class="field"><label>Clé API Anthropic</label><input id="p-key" type="password" value="${esc(Prefs.get('apiKey'))}" placeholder="sk-ant-…" autocomplete="off"><div class="hint">Reste uniquement dans ce téléphone. Plafond conseillé : 5 € dans la console Anthropic.</div></div>
      <div class="field"><label>Modèle</label><input id="p-model" value="${esc(Prefs.get('model'))}"><div class="hint">Par défaut : claude-haiku-5-5 (le moins cher). Si l’import par lien échoue, essayez claude-sonnet-5-5.</div></div></div>
    <div class="box"><h3>Exemples</h3><button class="big-btn danger" id="del-demo">Supprimer les cartes d’exemple</button></div>
    <p style="text-align:center;color:var(--muted);font-size:.8rem">Titi-Sti · v0.2 · données 100 % locales</p></div>`;
}

function bindMain() {
  const q = $('#q');
  if (q) q.oninput = () => { S.q = q.value; $('#results').innerHTML = S.tab === 'bar' ? barResults() : recipeResults(); bindOpen(); };
  document.querySelectorAll('[data-rcat]').forEach(b => b.onclick = () => { S.rcat = b.dataset.rcat; render(); });
  document.querySelectorAll('[data-bcat]').forEach(b => b.onclick = () => { S.bcat = b.dataset.bcat; render(); });
  const fav = $('[data-fav]'); if (fav) fav.onclick = () => { S.favOnly = !S.favOnly; render(); };
  bindOpen();
  if (S.tab === 'settings') bindSettings();
}
function bindOpen() {
  document.querySelectorAll('#main [data-open-r]').forEach(b => b.onclick = () => openRecipe(b.dataset.openR));
  document.querySelectorAll('#main [data-open-b]').forEach(b => b.onclick = () => openBottle(b.dataset.openB));
}
function bindSettings() {
  $('#p-name').onchange = e => Prefs.set('name', e.target.value.trim());
  $('#p-key').onchange = e => { Prefs.set('apiKey', e.target.value.trim()); toast('Clé enregistrée'); };
  $('#p-model').onchange = e => Prefs.set('model', e.target.value.trim() || 'claude-haiku-5-5');
  document.querySelectorAll('[data-seg]').forEach(seg => seg.querySelectorAll('button').forEach(b => b.onclick = () => { Prefs.set(seg.dataset.seg, b.dataset.v); applyLook(); render(); }));
  $('#export').onclick = exportAll;
  $('#import-file').onclick = importFile;
  $('#del-demo').onclick = async () => {
    const demo = S.items.filter(i => i.demo); if (!demo.length) return toast('Aucun exemple restant');
    if (!await confirmSheet(`Supprimer ${demo.length} carte(s) d’exemple ?`, 'Supprimer')) return;
    for (const d of demo) await remove(d.id); toast('Exemples supprimés'); render();
  };
}
function applyLook() {
  document.documentElement.dataset.fs = Prefs.get('fs');
  const t = Prefs.get('theme'), dark = t === 'dark' || (t === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.dataset.theme = dark ? 'dark' : 'light';
}

/* =====================================================================
   Fiche recette (style carnet)
   ===================================================================== */
function openRecipe(id, replace) {
  const r = byId(id); if (!r) return;
  const d = eff(r), c = RECIPE_CATS[d.category] || RECIPE_CATS.autre;
  let servings = d.servings || null;
  const el = screen(d.title, '', `<button class="icon-btn ${r.favorite ? 'on' : ''}" data-favb aria-label="Favori">${r.favorite ? ICONS.star : ICONS.starO}</button><button class="icon-btn" data-share aria-label="Partager">${ICONS.share}</button><button class="icon-btn" data-edit aria-label="Modifier">${ICONS.edit}</button>`);
  el.style.setProperty('--cat', c.color);
  const body = document.createElement('div'); body.className = 'paper'; el.appendChild(body);
  const draw = () => {
    const k = servings && d.servings ? servings / d.servings : 1;
    body.innerHTML = `${r.photo ? `<img class="hero" src="${r.photo}" alt="">` : `<div class="hero-ph">${esc(d.title[0] || '?')}</div>`}
    <div class="nb"><h1>${esc(d.title)}</h1>
      ${r.origin?.author ? `<div class="origin">Inspirée de « ${esc(r.origin.title || d.title)} » de ${esc(r.origin.author)}</div>` : ''}
      ${r.current ? `<div class="mod-banner"><span class="badge-mod">Modifiée</span> Vous avez modifié cette recette. <button data-orig>Voir l’original</button></div>` : ''}
      <div class="facts"><span class="fact">${esc(c.label)}</span>${d.prepMin ? `<span class="fact">Prépa ${d.prepMin} min</span>` : ''}${d.cookMin ? `<span class="fact">Cuisson ${d.cookMin} min</span>` : ''}<span class="fact">${esc(d.difficulty)}</span></div>
      ${scoreBox(r)}
      <button class="big-btn" data-cook style="margin-top:14px;background:var(--cat);color:#fff">${ICONS.chef} Mode cuisine</button>
      <h3>Ingrédients</h3>
      ${d.servings ? `<div class="serv"><button data-s="-1" aria-label="Moins">−</button><b>${servings} portion${servings > 1 ? 's' : ''}</b><button data-s="1" aria-label="Plus">+</button></div>` : ''}
      <ul class="ing">${d.ingredients.map(i => `<li><span class="q">${esc([fmtQty(i.qty == null ? null : i.qty * k), i.unit].filter(Boolean).join(' '))}</span><span>${esc(i.name)}</span></li>`).join('')}</ul>
      <h3>Préparation</h3><ol class="steps">${d.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>
      ${d.notes ? `<h3>Notes</h3><div class="notes">${esc(d.notes)}</div>` : ''}
      ${r.mine?.comment ? `<h3>Mon avis</h3><div class="notes">${esc(r.mine.comment)}</div>` : ''}
      ${r.others?.length ? `<h3>Avis reçus</h3>${r.others.map(o => `<div class="avis" style="border-color:var(--paper-line)"><b>${esc(o.author)}</b>${fmtNote(o.rating)}/10${o.comment ? `<div class="notes" style="opacity:.75">${esc(o.comment)}</div>` : ''}</div>`).join('')}` : ''}
      ${d.tags?.length ? `<p style="font-family:system-ui;opacity:.7">${d.tags.map(t => '#' + esc(t)).join(' ')}</p>` : ''}
      ${r.sourceUrl ? `<p style="font-family:system-ui;font-size:.85rem;opacity:.7">Source : <a class="link" href="${esc(r.sourceUrl)}" target="_blank" rel="noopener">${esc(r.sourceUrl)}</a></p>` : ''}
      <button class="big-btn danger" data-del style="margin-top:24px">${ICONS.trash} Supprimer la recette</button>
    </div>`;
    body.querySelectorAll('[data-s]').forEach(b => b.onclick = () => { servings = Math.max(1, servings + +b.dataset.s); draw(); });
    body.querySelector('[data-rate]').onclick = () => rateItem(r);
    body.querySelector('[data-cook]').onclick = () => cookMode(d, servings && d.servings ? servings / d.servings : 1, c.color);
    const o = body.querySelector('[data-orig]'); if (o) o.onclick = () => showOriginal(r);
    body.querySelector('[data-del]').onclick = async () => { if (await confirmSheet('Supprimer « ' + d.title + ' » ?', 'Supprimer')) { await remove(r.id); closeTop(); render(); toast('Recette supprimée'); } };
  };
  draw();
  el.querySelector('[data-favb]').onclick = async () => { r.favorite = !r.favorite; await save(r); render(); openRecipe(r.id, true); };
  el.querySelector('[data-edit]').onclick = () => editRecipe(r);
  el.querySelector('[data-share]').onclick = () => shareCard(r);
  replace ? replaceTop(el) : pushScreen(el);
}
function scoreBox(r) {
  const rr = rarity(r.mine?.rating), avg = householdAvg(r);
  return `<div class="box" style="display:flex;align-items:center;gap:16px;font-family:system-ui,sans-serif;background:color-mix(in srgb,var(--paper-text) 6%,transparent)">
    <div class="score-big">${fmtNote(r.mine?.rating)}<small>/10</small></div>
    <div style="flex:1">${rr ? `<div class="rarity" style="--r:${rr.color};font-size:.9rem">${rr.label}</div>` : '<div style="opacity:.7">Pas encore notée</div>'}
    ${avg != null && r.others?.length ? `<div style="opacity:.75;font-size:.9rem">Moyenne du foyer : <b>${fmtNote(avg)}</b></div>` : ''}</div>
    <button class="big-btn" data-rate style="width:auto;padding:12px 16px">Noter</button></div>`;
}
function showOriginal(r) {
  const d = r.base;
  const el = sheet(`<h2>Version originale</h2>
    <div class="paper" style="border-radius:14px;padding:4px 14px 14px"><div class="nb" style="padding:10px 0"><h1 style="font-size:1.3rem">${esc(d.title)}</h1>
    <h3>Ingrédients</h3><ul class="ing">${d.ingredients.map(i => `<li>${esc(ingLine(i))}</li>`).join('')}</ul>
    <h3>Préparation</h3><ol class="steps">${d.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div></div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px"><button class="big-btn danger" data-restore>Restaurer l’original (efface mes modifications)</button><button class="big-btn sec" data-close>Fermer</button></div>`);
  el.querySelector('[data-close]').onclick = () => closeTop();
  el.querySelector('[data-restore]').onclick = async () => {
    closeTop();
    if (!await confirmSheet('Effacer vos modifications ?', 'Restaurer')) return;
    r.current = null; await save(r); render(); openRecipe(r.id, true); toast('Original restauré');
  };
}

/* ---------- mode cuisine ---------- */
async function cookMode(d, k, color) {
  let i = -1, lock = null; // -1 = ingrédients
  try { lock = await navigator.wakeLock?.request('screen'); } catch { }
  const el = document.createElement('div'); el.className = 'cook'; el.style.setProperty('--cat', color);
  const n = d.steps.length;
  const draw = () => {
    el.innerHTML = `<div class="cook-top"><div class="prog"><i style="width:${(i + 1) / (n) * 100}%"></i></div><button data-x>Fermer</button></div>
      <div class="cook-body">${i < 0 ? `<div class="cook-n">Ingrédients</div><div class="cook-ing">${d.ingredients.map(x => '• ' + esc(ingLine(x, k))).join('<br>')}</div>`
        : `<div class="cook-n">Étape ${i + 1} / ${n}</div><div class="cook-step">${esc(d.steps[i])}</div>`}</div>
      <div class="cook-nav"><button data-p ${i < 0 ? 'disabled style="opacity:.3"' : ''}>‹ Retour</button><button class="next" data-n>${i >= n - 1 ? 'Terminé ✓' : i < 0 ? 'Commencer ›' : 'Suivant ›'}</button></div>`;
    el.querySelector('[data-x]').onclick = () => closeTop();
    el.querySelector('[data-p]').onclick = () => { if (i > -1) { i--; draw(); } };
    el.querySelector('[data-n]').onclick = () => { if (i >= n - 1) closeTop(); else { i++; draw(); } };
  };
  draw();
  pushScreen(el, () => { try { lock?.release(); } catch { } });
}

/* ---------- édition recette ---------- */
function editRecipe(r, draftNote) {
  const isNew = !r.id || !byId(r.id);
  const d = clone(eff(r));
  let photo = r.photo || null;
  const el = screen(isNew ? 'Nouvelle recette' : 'Modifier', `<div class="form">
    ${draftNote ? `<div class="draft-note">${draftNote}</div>` : ''}
    ${!isNew && !r.current ? `<div class="draft-note">L’original sera conservé : vous pourrez toujours y revenir.</div>` : ''}
    <div class="field"><label>Photo</label><div class="photo-pick"><div class="ph" id="ph">${photo ? `<img src="${photo}">` : 'Aucune'}</div>
      <div style="display:flex;flex-direction:column;gap:8px;flex:1"><button class="big-btn sec" data-pick style="padding:11px">Choisir / prendre</button>${photo ? '<button class="big-btn danger" data-nophoto style="padding:9px">Retirer</button>' : ''}</div></div></div>
    <div class="field"><label>Titre</label><input id="f-title" value="${esc(d.title)}"></div>
    <div class="row2"><div class="field"><label>Catégorie</label><select id="f-cat">${Object.entries(RECIPE_CATS).map(([k, v]) => `<option value="${k}" ${d.category === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div class="field"><label>Difficulté</label><select id="f-diff">${DIFFS.map(x => `<option ${d.difficulty === x ? 'selected' : ''}>${x}</option>`).join('')}</select></div></div>
    <div class="row3"><div class="field"><label>Portions</label><input id="f-serv" type="number" inputmode="numeric" min="1" value="${d.servings ?? ''}"></div>
      <div class="field"><label>Prépa (min)</label><input id="f-prep" type="number" inputmode="numeric" value="${d.prepMin ?? ''}"></div>
      <div class="field"><label>Cuisson (min)</label><input id="f-cook" type="number" inputmode="numeric" value="${d.cookMin ?? ''}"></div></div>
    <div class="field"><label>Ingrédients</label><textarea id="f-ing" rows="8">${esc(d.ingredients.map(i => ingLine(i)).join('\n'))}</textarea><div class="hint">Un par ligne, ex. « 200 g farine », « 3 œufs ».</div></div>
    <div class="field"><label>Étapes</label><textarea id="f-steps" rows="10">${esc(d.steps.join('\n\n'))}</textarea><div class="hint">Séparez les étapes par une ligne vide.</div></div>
    <div class="field"><label>Notes</label><textarea id="f-notes" rows="3">${esc(d.notes || '')}</textarea></div>
    <div class="field"><label>Étiquettes</label><input id="f-tags" value="${esc((d.tags || []).join(', '))}" placeholder="rapide, été, apéro"></div>
    <div class="field"><label>Lien d’origine</label><input id="f-src" value="${esc(r.sourceUrl || '')}" placeholder="https://…"></div>
    <button class="big-btn" data-save>Enregistrer</button></div>`);
  const setPhoto = (p) => { photo = p; el.querySelector('#ph').innerHTML = p ? `<img src="${p}">` : 'Aucune'; };
  el.querySelector('[data-pick]').onclick = async () => { const p = await pickImage(); if (p) setPhoto(p); };
  const np = el.querySelector('[data-nophoto]'); if (np) np.onclick = () => { setPhoto(null); np.remove(); };
  el.querySelector('[data-save]').onclick = async () => {
    const v = (id) => el.querySelector(id).value;
    const nd = {
      title: v('#f-title').trim() || 'Recette sans titre', category: v('#f-cat'), difficulty: v('#f-diff'),
      servings: +v('#f-serv') || null, prepMin: +v('#f-prep') || null, cookMin: +v('#f-cook') || null,
      ingredients: v('#f-ing').split('\n').map(parseIng).filter(Boolean),
      steps: v('#f-steps').split(/\n\s*\n/).map(s => s.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean),
      notes: v('#f-notes').trim(), tags: v('#f-tags').split(',').map(s => s.trim()).filter(Boolean),
    };
    // Une seule étape longue sans lignes vides ? on découpe par ligne.
    if (nd.steps.length === 1 && v('#f-steps').includes('\n')) nd.steps = v('#f-steps').split('\n').map(s => s.trim()).filter(Boolean);
    const item = isNew ? { id: r.id || uid(), kind: 'recipe', createdAt: Date.now(), base: nd, current: null, favorite: false, origin: r.origin || null, mine: { rating: null, comment: '', tastedAt: '' }, others: [] } : r;
    if (!isNew) {
      if (JSON.stringify(nd) !== JSON.stringify(r.base)) item.current = nd; else item.current = null;
    }
    item.photo = photo; item.sourceUrl = v('#f-src').trim();
    await save(item); closeTop(); render();
    if (isNew) { closeAll(); openRecipe(item.id); } else openRecipe(item.id, true);
    toast('Enregistré');
  };
  pushScreen(el);
}

/* =====================================================================
   Fiche bouteille
   ===================================================================== */
function openBottle(id, replace) {
  const b = byId(id); if (!b) return;
  const d = b.base, c = BAR_CATS[d.category] || BAR_CATS.autre, r = rarity(b.mine?.rating), avg = householdAvg(b);
  const kv = [['Catégorie', c.label], ['Distillerie / marque', d.brand], ['Pays', d.country], ['Degré', d.abv != null && d.abv !== '' ? String(d.abv).replace('.', ',') + ' %' : ''], ['Prix', d.price ? d.price + ' €' : ''],
    ...c.extra.map(([k, l]) => [l, d.extra?.[k]])].filter(([, v]) => v);
  const el = screen(d.name, `
    ${b.photo ? `<img class="hero" src="${b.photo}" alt="">` : `<div class="hero-ph" style="--cat:${c.color}">${esc(d.name[0] || '?')}</div>`}
    <div class="bt"><h1>${esc(d.name)}</h1><div class="sub">${esc([d.brand, d.country].filter(Boolean).join(' · '))}</div>
      <div class="box" style="display:flex;align-items:center;gap:16px">
        <div class="score-big">${fmtNote(b.mine?.rating)}<small>/10</small></div>
        <div style="flex:1">${r ? `<div class="rarity" style="--r:${r.color};font-size:.9rem">${r.label}</div>` : '<div style="color:var(--muted)">Pas encore noté</div>'}
        ${avg != null && b.others?.length ? `<div style="color:var(--muted);font-size:.9rem">Moyenne du foyer : <b style="color:var(--text)">${fmtNote(avg)}</b></div>` : ''}</div>
        <button class="big-btn" data-rate style="width:auto;padding:12px 16px">Noter</button></div>
      ${b.mine?.comment ? `<div class="box"><h3>Mon avis</h3><div class="notes">${esc(b.mine.comment)}</div>${b.mine.tastedAt ? `<div style="color:var(--muted);font-size:.85rem;margin-top:6px">Goûté le ${esc(b.mine.tastedAt)}</div>` : ''}</div>` : ''}
      ${b.others?.length ? `<div class="box"><h3>Avis reçus</h3>${b.others.map(o => `<div class="avis"><b>${esc(o.author)}</b>${fmtNote(o.rating)}/10${o.comment ? `<div class="notes" style="color:var(--muted)">${esc(o.comment)}</div>` : ''}</div>`).join('')}</div>` : ''}
      ${d.description ? `<div class="box"><h3>Description</h3><div class="notes">${esc(d.description)}</div></div>` : ''}
      ${kv.length ? `<dl class="kv">${kv.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v)}</dd>`).join('')}</dl>` : ''}
      <button class="big-btn danger" data-del style="margin-top:10px">${ICONS.trash} Supprimer la bouteille</button></div>`,
    `<button class="icon-btn" data-share aria-label="Partager">${ICONS.share}</button><button class="icon-btn" data-edit aria-label="Modifier">${ICONS.edit}</button>`);
  el.querySelector('[data-rate]').onclick = () => rateItem(b);
  el.querySelector('[data-edit]').onclick = () => editBottle(b);
  el.querySelector('[data-share]').onclick = () => shareCard(b);
  el.querySelector('[data-del]').onclick = async () => { if (await confirmSheet('Supprimer « ' + d.name + ' » ?', 'Supprimer')) { await remove(b.id); closeTop(); render(); toast('Bouteille supprimée'); } };
  replace ? replaceTop(el) : pushScreen(el);
}
function rateItem(b) {
  const reopen = () => b.kind === 'recipe' ? openRecipe(b.id, true) : openBottle(b.id, true);
  const m = b.mine || { rating: null, comment: '', tastedAt: '' };
  let val = m.rating ?? 7;
  const el = sheet(`<h2>Ma note</h2>
    <div class="rating-in"><input type="range" min="0" max="10" step="0.5" value="${val}" id="rg"><output id="ro">${fmtNote(val)}</output></div>
    <div id="rr" style="text-align:center;margin:6px 0 12px"></div>
    <div class="field"><label>Mon commentaire (reste privé sauf si je le partage)</label><textarea id="rc" rows="4">${esc(m.comment)}</textarea></div>
    <div class="field" style="margin-top:10px"><label>${b.kind === 'recipe' ? 'Date' : 'Date de dégustation'}</label><input id="rd" type="date" value="${esc(m.tastedAt || today())}"></div>
    <div style="display:flex;flex-direction:column;gap:10px;margin-top:14px"><button class="big-btn" data-ok>Enregistrer</button>${m.rating != null ? '<button class="big-btn sec" data-clear>Retirer ma note</button>' : ''}</div>`);
  const upd = () => { $('#ro').textContent = fmtNote(val); const r = rarity(val); $('#rr').innerHTML = `<span class="rarity" style="--r:${r.color};font-size:1rem">${r.label}</span>`; };
  upd(); $('#rg').oninput = e => { val = +e.target.value; upd(); };
  el.querySelector('[data-ok]').onclick = async () => { b.mine = { rating: val, comment: $('#rc').value.trim(), tastedAt: $('#rd').value }; await save(b); closeTop(); render(); reopen(); };
  const cl = el.querySelector('[data-clear]'); if (cl) cl.onclick = async () => { b.mine = { ...m, rating: null }; await save(b); closeTop(); render(); reopen(); };
}
function editBottle(b, draftNote) {
  const isNew = !b.id || !byId(b.id);
  const d = clone(b.base || { name: '', category: 'gin', brand: '', country: '', abv: null, description: '', price: null, extra: {} });
  let photo = b.photo || null;
  const el = screen(isNew ? 'Nouvelle bouteille' : 'Modifier', `<div class="form">
    ${draftNote ? `<div class="draft-note">${draftNote}</div>` : ''}
    <div class="field"><label>Photo</label><div class="photo-pick"><div class="ph" id="ph">${photo ? `<img src="${photo}">` : 'Aucune'}</div>
      <div style="display:flex;flex-direction:column;gap:8px;flex:1"><button class="big-btn sec" data-pick style="padding:11px">Choisir / prendre</button>
      <button class="big-btn sec" data-ai style="padding:11px">✨ Remplir depuis l’étiquette</button></div></div></div>
    <div class="field"><label>Nom</label><input id="b-name" value="${esc(d.name)}"></div>
    <div class="row2"><div class="field"><label>Catégorie</label><select id="b-cat">${Object.entries(BAR_CATS).map(([k, v]) => `<option value="${k}" ${d.category === k ? 'selected' : ''}>${v.label}</option>`).join('')}</select></div>
      <div class="field"><label>Degré (%)</label><input id="b-abv" type="number" step="0.1" inputmode="decimal" value="${d.abv ?? ''}"></div></div>
    <div class="row2"><div class="field"><label>Distillerie / marque</label><input id="b-brand" value="${esc(d.brand)}"></div>
      <div class="field"><label>Pays</label><input id="b-country" value="${esc(d.country)}"></div></div>
    <div id="b-extra"></div>
    <div class="field"><label>Prix (€)</label><input id="b-price" type="number" step="0.5" inputmode="decimal" value="${d.price ?? ''}"></div>
    <div class="field"><label>Description</label><textarea id="b-desc" rows="4">${esc(d.description)}</textarea></div>
    <button class="big-btn" data-save>Enregistrer</button></div>`);
  const drawExtra = () => {
    const cat = el.querySelector('#b-cat').value;
    el.querySelector('#b-extra').innerHTML = BAR_CATS[cat].extra.map(([k, l]) => `<div class="field" style="margin-bottom:14px"><label>${esc(l)}</label><input data-x="${k}" value="${esc(d.extra?.[k] || '')}"></div>`).join('');
    el.querySelectorAll('[data-x]').forEach(i => i.oninput = () => { d.extra = d.extra || {}; d.extra[i.dataset.x] = i.value; });
  };
  drawExtra(); el.querySelector('#b-cat').onchange = drawExtra;
  const setPhoto = (p) => { photo = p; el.querySelector('#ph').innerHTML = p ? `<img src="${p}">` : 'Aucune'; };
  el.querySelector('[data-pick]').onclick = async () => { const p = await pickImage(); if (p) setPhoto(p); };
  el.querySelector('[data-ai]').onclick = async () => {
    const p = photo || await pickImage(true); if (!p) return; setPhoto(p);
    const j = await withLoading('Lecture de l’étiquette…', () => askClaude({ system: SYS_BOTTLE, content: [imgBlock(p), { type: 'text', text: 'Identifie cette bouteille.' }] }));
    if (!j) return;
    const nb = cleanBottle(j);
    const set = (id, v) => { if (v != null && v !== '') el.querySelector(id).value = v; };
    set('#b-name', nb.name); el.querySelector('#b-cat').value = nb.category; set('#b-abv', nb.abv); set('#b-brand', nb.brand); set('#b-country', nb.country); set('#b-desc', nb.description);
    d.extra = { ...(d.extra || {}), ...nb.extra }; drawExtra(); toast('Vérifiez les champs avant d’enregistrer');
  };
  el.querySelector('[data-save]').onclick = async () => {
    const v = (id) => el.querySelector(id).value;
    const cat = v('#b-cat'), extra = {}; for (const [k] of BAR_CATS[cat].extra) extra[k] = (d.extra?.[k] || '').trim();
    const nd = { name: v('#b-name').trim() || 'Sans nom', category: cat, brand: v('#b-brand').trim(), country: v('#b-country').trim(), abv: v('#b-abv') === '' ? null : +v('#b-abv'), price: v('#b-price') === '' ? null : +v('#b-price'), description: v('#b-desc').trim(), extra };
    const item = isNew ? { id: uid(), kind: 'bottle', createdAt: Date.now(), mine: { rating: null, comment: '', tastedAt: '' }, others: [] } : b;
    item.base = nd; item.photo = photo;
    await save(item); closeTop(); render();
    if (isNew) { closeAll(); openBottle(item.id); if (item.mine.rating == null) rateItem(item); } else openBottle(item.id, true);
    toast('Enregistré');
  };
  pushScreen(el);
}

/* =====================================================================
   Partage : carte recto-verso + QR + lien + fichier
   ===================================================================== */
function cardFace(item) {
  if (item.kind === 'recipe') {
    const d = eff(item), c = RECIPE_CATS[d.category] || RECIPE_CATS.autre, t = (d.prepMin || 0) + (d.cookMin || 0), r = rarity(item.mine?.rating);
    return { color: c.color, rk: r ? 'r-' + r.k : '', photo: item.photo, letter: d.title[0], title: d.title, meta: [c.label, t ? t + ' min' : '', item.mine?.rating != null ? fmtNote(item.mine.rating) + '/10' : '', r?.label].filter(Boolean) };
  }
  const d = item.base, c = BAR_CATS[d.category] || BAR_CATS.autre, r = rarity(item.mine?.rating);
  return { color: c.color, rk: r ? 'r-' + r.k : '', photo: item.photo, letter: d.name[0], title: d.name, meta: [c.label, d.brand, item.mine?.rating != null ? fmtNote(item.mine.rating) + '/10' : '', r?.label].filter(Boolean) };
}
async function shareCard(item) {
  const f = cardFace(item);
  const el = sheet(`<h2>Partager la carte</h2>
    <div class="flip" id="flip" style="--cat:${f.color}"><div class="flip-in">
      <div class="face ${f.rk}"><div class="face-in"><div class="fp">${f.photo ? `<img src="${f.photo}">` : esc(f.letter || '?')}</div>
        <div class="ft"><h3>${esc(f.title)}</h3><div class="card-meta">${f.meta.map(esc).join(' · ')}</div></div></div></div>
      <div class="face backface ${f.rk}"><div class="face-in" id="qrzone"><div class="spinner"></div></div></div></div></div>
    <div class="flip-hint">Touchez la carte pour la retourner</div>
    ${item.mine?.rating != null ? `<label class="check"><input type="checkbox" id="withav" checked> Joindre mon avis (${fmtNote(item.mine.rating)}/10)</label>` : ''}
    <div style="display:flex;flex-direction:column;gap:10px">
      <button class="big-btn" data-link>${ICONS.share} Envoyer le lien (WhatsApp…)</button>
      <button class="big-btn sec" data-file>${ICONS.file} Envoyer en fichier (avec photo)</button></div>`);
  const flip = el.querySelector('#flip'); flip.onclick = () => flip.classList.toggle('back');
  let url = '';
  const build = async () => {
    const withAv = el.querySelector('#withav')?.checked;
    url = appBase() + '#c=' + await packPayload(cardPayload(item, withAv));
    const z = el.querySelector('#qrzone');
    if (url.length > QR_MAX || typeof qrcode === 'undefined') {
      z.innerHTML = `<b>Trop long pour un QR code</b><div class="card-meta" style="justify-content:center">Utilisez « Envoyer en fichier » ou le lien.</div>`;
      return;
    }
    try {
      const qr = qrcode(0, 'L'); qr.addData(url, 'Byte'); qr.make();
      z.innerHTML = `<div class="qr">${qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true })}</div><div class="card-meta" style="justify-content:center">Scannez avec l’appareil photo</div>`;
    } catch { z.innerHTML = '<b>Trop long pour un QR code</b>'; }
  };
  await build();
  const av = el.querySelector('#withav'); if (av) av.onchange = build;
  el.querySelector('[data-link]').onclick = async () => {
    const text = `${f.title} — carte partagée par ${Prefs.get('name') || 'moi'}`;
    try { if (navigator.share) { await navigator.share({ title: f.title, text, url }); return; } } catch (e) { if (e.name === 'AbortError') return; }
    try { await navigator.clipboard.writeText(url); toast('Lien copié'); } catch { prompt('Copiez ce lien :', url); }
  };
  el.querySelector('[data-file]').onclick = async () => {
    const withAv = el.querySelector('#withav')?.checked;
    const data = { app: APP_ID, type: 'carte', payload: cardPayload(item, withAv), photo: item.photo || null };
    const name = norm(f.title).replace(/ /g, '-').slice(0, 40) + '.carte.json';
    await shareOrDownload(new File([JSON.stringify(data)], name, { type: 'application/json' }), f.title);
  };
}
async function shareOrDownload(file, title) {
  try { if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title }); return true; } } catch (e) { if (e.name === 'AbortError') return false; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(file); a.download = file.name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 4000); toast('Fichier téléchargé'); return true;
}

/* =====================================================================
   Sauvegarde / import de fichiers
   ===================================================================== */
async function exportAll() {
  const data = { app: APP_ID, type: 'sauvegarde', v: 1, exportedAt: new Date().toISOString(), by: Prefs.get('name'), items: S.items };
  const ok = await shareOrDownload(new File([JSON.stringify(data)], `sauvegarde-titi-sti-${today()}.json`, { type: 'application/json' }), 'Sauvegarde Titi-Sti');
  if (ok) { Prefs.set('lastBackup', Date.now()); render(); }
}
function importFile() {
  const inp = document.createElement('input'); inp.type = 'file'; inp.accept = '.json,application/json';
  inp.onchange = async () => {
    const f = inp.files[0]; if (!f) return;
    let data; try { data = JSON.parse(await f.text()); } catch { return toast('Fichier illisible'); }
    if (data.app !== APP_ID) return toast('Ce fichier ne vient pas de l’appli');
    if (data.type === 'carte') return handleIncoming(data.payload, data.photo);
    if (data.type === 'sauvegarde') {
      const items = data.items || [];
      if (!await confirmSheet(`Importer ${items.length} cartes ? Les cartes existantes plus récentes sont conservées.`, 'Importer', false)) return;
      let n = 0;
      for (const raw of items) { const it = sanitizeItem(raw); if (!it) continue; const cur = byId(it.id); if (!cur || (it.updatedAt || 0) > (cur.updatedAt || 0)) { const keep = it.updatedAt; await Store.put(it); n++; } }
      S.items = await Store.all(); render(); toast(n + ' carte(s) importée(s)');
    }
  };
  inp.click();
}

/* =====================================================================
   Bouton + : ajouter / importer
   ===================================================================== */
function addMenu() {
  if (S.tab === 'bar') {
    const el = sheet(`<h2>Ajouter une bouteille</h2>
      <button class="menu-item" data-a="label">${ICONS.camera}<span>Photo de l’étiquette<small>Claude remplit la fiche pour vous</small></span></button>
      <button class="menu-item" data-a="manual">${ICONS.pen}<span>Saisie manuelle</span></button>
      <button class="menu-item" data-a="file">${ICONS.file}<span>Carte reçue en fichier</span></button>`);
    el.querySelector('[data-a=label]').onclick = async () => {
      closeTop(); const p = await pickImage(true); if (!p) return;
      const j = await withLoading('Lecture de l’étiquette…', () => askClaude({ system: SYS_BOTTLE, content: [imgBlock(p), { type: 'text', text: 'Identifie cette bouteille.' }] }));
      if (j) editBottle({ base: cleanBottle(j), photo: p }, '✨ Brouillon rempli par Claude : vérifiez avant d’enregistrer.');
    };
    el.querySelector('[data-a=manual]').onclick = () => { closeTop(); editBottle({}); };
    el.querySelector('[data-a=file]').onclick = () => { closeTop(); importFile(); };
    return;
  }
  const el = sheet(`<h2>Ajouter une recette</h2>
    <button class="menu-item" data-a="url">${ICONS.link}<span>Depuis un lien<small>Astuce : sur Marmiton, Partager → cette appli</small></span></button>
    <button class="menu-item" data-a="text">${ICONS.text}<span>Coller un texte<small>Message, note, page copiée</small></span></button>
    <button class="menu-item" data-a="photo">${ICONS.camera}<span>Photo<small>Fiche manuscrite, livre, capture</small></span></button>
    <button class="menu-item" data-a="manual">${ICONS.pen}<span>Saisie manuelle</span></button>
    <button class="menu-item" data-a="file">${ICONS.file}<span>Carte reçue en fichier</span></button>`);
  el.querySelector('[data-a=url]').onclick = () => { closeTop(); importUrl(); };
  el.querySelector('[data-a=text]').onclick = () => { closeTop(); importText(); };
  el.querySelector('[data-a=photo]').onclick = async () => {
    closeTop(); const p = await pickImage(true); if (!p) return;
    const j = await withLoading('Lecture de la photo…', () => askClaude({ system: SYS_RECIPE, content: [imgBlock(p), { type: 'text', text: 'Extrais la recette de cette image.' }] }));
    if (j) editRecipe({ base: cleanRecipe(j), current: null }, '✨ Brouillon rempli par Claude : vérifiez avant d’enregistrer.');
  };
  el.querySelector('[data-a=manual]').onclick = () => { closeTop(); editRecipe({ base: cleanRecipe({ title: '' }), current: null }); };
  el.querySelector('[data-a=file]').onclick = () => { closeTop(); importFile(); };
}
function importUrl(prefill = '') {
  const el = sheet(`<h2>Importer depuis un lien</h2>
    <div class="field"><input id="iu" type="url" inputmode="url" placeholder="https://www.marmiton.org/…" value="${esc(prefill)}" style="width:100%;border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:13px;font-size:1rem"></div>
    <button class="big-btn" data-go style="margin-top:12px">Importer</button>`);
  const go = async () => {
    const url = el.querySelector('#iu').value.trim(); if (!/^https?:\/\//.test(url)) return toast('Lien invalide');
    closeTop(); await runUrlImport(url);
  };
  el.querySelector('[data-go]').onclick = go;
  if (prefill) go();
}
async function runUrlImport(url) {
  const dup = recipes().find(r => r.sourceUrl === url);
  if (dup && !await confirmSheet('Vous avez déjà importé cette recette (« ' + eff(dup).title + ' »). Importer quand même ?', 'Importer', false)) return;
  const j = await withLoading('Claude lit la recette…', () => askClaude({ system: SYS_RECIPE, useFetch: true, content: `Récupère cette page avec l'outil web_fetch, puis extrais la recette : ${url}` }));
  if (j) { const r = { base: cleanRecipe(j), current: null, sourceUrl: url }; editRecipe(r, '✨ Brouillon rempli par Claude : vérifiez, ajoutez une photo, puis enregistrez.'); }
}
function importText(prefill = '') {
  const el = sheet(`<h2>Coller un texte</h2>
    <div class="field"><textarea id="it" rows="10" placeholder="Collez ici la recette (ingrédients, étapes…)" style="width:100%;border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:12px;font-size:1rem">${esc(prefill)}</textarea></div>
    <button class="big-btn" data-go style="margin-top:12px">Analyser</button>`);
  el.querySelector('[data-go]').onclick = async () => {
    const t = el.querySelector('#it').value.trim(); if (t.length < 20) return toast('Texte trop court');
    closeTop();
    const j = await withLoading('Claude lit la recette…', () => askClaude({ system: SYS_RECIPE, content: 'Voici une recette :\n\n' + t.slice(0, 30000) }));
    if (j) editRecipe({ base: cleanRecipe(j), current: null }, '✨ Brouillon rempli par Claude : vérifiez avant d’enregistrer.');
  };
}
async function withLoading(msg, fn) {
  const el = sheet(`<div class="loading"><div class="spinner"></div><b>${esc(msg)}</b><span style="color:var(--muted);font-size:.9rem">Quelques secondes…</span></div>`);
  try { const r = await fn(); if (stack.at(-1)?.el === el) closeTop(); return r; }
  catch (e) {
    if (stack.at(-1)?.el === el) closeTop();
    if (e.message === 'NOKEY') {
      if (await confirmSheet('Ajoutez d’abord votre clé API Claude dans Réglages.', 'Aller aux réglages', false)) { closeAll(); S.tab = 'settings'; render(); }
    } else previewSheet({ title: 'Import impossible', body: `<p>${esc(e.message)}</p>`, actions: [['ok', 'OK', 'sec']] });
    return null;
  }
}

/* =====================================================================
   Exemples (premier lancement)
   ===================================================================== */
function seed() {
  const mk = (o) => ({ createdAt: Date.now(), demo: true, ...o });
  return [
    mk({ id: uid(), kind: 'recipe', favorite: true, photo: null, sourceUrl: '', current: null, origin: null, mine: { rating: 9, comment: 'La meilleure, à refaire pour les anniversaires.', tastedAt: '' }, others: [], base: {
      title: 'Tarte au citron meringuée', category: 'dessert', servings: 6, prepMin: 40, cookMin: 25, difficulty: 'Moyen',
      ingredients: [{ qty: 1, unit: '', name: 'pâte sablée' }, { qty: 3, unit: '', name: 'citrons jaunes' }, { qty: 150, unit: 'g', name: 'sucre' }, { qty: 3, unit: '', name: 'œufs' }, { qty: 80, unit: 'g', name: 'beurre' }, { qty: 20, unit: 'g', name: 'maïzena' }],
      steps: ['Préchauffer le four à 180 °C et cuire la pâte à blanc 15 minutes.', 'Presser les citrons, mélanger le jus avec 100 g de sucre, les jaunes et la maïzena.', 'Cuire à feu doux en remuant jusqu’à épaississement, puis ajouter le beurre.', 'Verser la crème sur le fond de tarte.', 'Monter les blancs en neige ferme avec le reste du sucre, étaler sur la tarte.', 'Dorer 8 à 10 minutes au four.'],
      tags: ['classique'], notes: '' } }),
    mk({ id: uid(), kind: 'recipe', favorite: false, photo: null, sourceUrl: '', current: null, origin: null, mine: { rating: 7.5, comment: '', tastedAt: '' }, others: [], base: {
      title: 'Gin tonic concombre-poivre', category: 'boisson', servings: 1, prepMin: 3, cookMin: null, difficulty: 'Facile',
      ingredients: [{ qty: 5, unit: 'cl', name: 'gin' }, { qty: 15, unit: 'cl', name: 'tonic' }, { qty: 3, unit: 'tranches', name: 'concombre' }, { qty: 1, unit: 'pincée', name: 'poivre noir concassé' }],
      steps: ['Remplir un grand verre de glaçons.', 'Ajouter le gin et les tranches de concombre.', 'Compléter avec le tonic en le versant le long d’une cuillère.', 'Finir avec le poivre.'],
      tags: ['apéro'], notes: '' } }),
    mk({ id: uid(), kind: 'bottle', photo: null, others: [], mine: { rating: 9.5, comment: 'Très floral, parfait avec un tonic neutre.', tastedAt: '2026-06-14' },
      base: { name: 'Gin du Jardin (exemple)', category: 'gin', brand: 'Distillerie exemple', country: 'France', abv: 43, price: 39, description: 'Notes de genièvre, agrumes et fleur de sureau.', extra: { botanicals: 'Genièvre, citron, sureau', tonic: 'Tonic neutre', garnish: 'Zeste de citron' } } }),
    mk({ id: uid(), kind: 'bottle', photo: null, others: [{ author: 'Elle', rating: 8, comment: 'Plus sec que je pensais.', at: '2026-07-01' }], mine: { rating: 7.5, comment: '', tastedAt: '' },
      base: { name: 'London Dry (exemple)', category: 'gin', brand: 'Exemple & Fils', country: 'Royaume-Uni', abv: 47, price: 28, description: 'Classique, très genièvre.', extra: { botanicals: 'Genièvre, coriandre', tonic: 'Indian tonic', garnish: 'Citron vert' } } }),
    mk({ id: uid(), kind: 'bottle', photo: null, others: [], mine: { rating: 8.5, comment: '', tastedAt: '' },
      base: { name: 'Rhum ambré 8 ans (exemple)', category: 'rhum', brand: 'Exemple', country: 'Martinique', abv: 42, price: 45, description: 'Vanille, bois, fruits secs.', extra: { age: '8 ans', origin: 'Canne (agricole)', spiced: 'Non' } } }),
    mk({ id: uid(), kind: 'bottle', photo: null, others: [], mine: { rating: 6, comment: '', tastedAt: '' },
      base: { name: 'Sirop de sureau maison', category: 'sirop', brand: 'Fait maison', country: 'France', abv: 0, price: null, description: '', extra: { flavor: 'Sureau', usage: 'Gin tonic, limonade' } } }),
  ];
}

/* =====================================================================
   Démarrage
   ===================================================================== */
async function checkIncoming() {
  const h = location.hash;
  if (h.startsWith('#c=')) {
    try { history.replaceState(null, '', appBase()); } catch { }
    try { await handleIncoming(await unpackPayload(h.slice(3))); } catch (e) { console.error(e); toast('Carte illisible'); }
    return;
  }
  // Partage Android (share_target) : ?url=…&text=…
  const sp = new URLSearchParams(location.search);
  if (sp.has('url') || sp.has('text')) {
    const blob = (sp.get('url') || '') + ' ' + (sp.get('text') || '');
    try { history.replaceState(null, '', appBase()); } catch { }
    const m = blob.match(/https?:\/\/\S+/);
    if (m) { S.tab = 'recipes'; render(); importUrl(m[0]); }
    else if (blob.trim()) { S.tab = 'recipes'; render(); importText(blob.trim()); }
  }
}
function askName() {
  const el = sheet(`<h2>Bienvenue dans Titi-Sti 👋</h2><p style="margin-top:0">Votre prénom apparaîtra sur les cartes que vous partagez.</p>
    <div class="field"><input id="nm" placeholder="Votre prénom" style="width:100%;border:1px solid var(--line);background:var(--surface);border-radius:12px;padding:13px;font-size:1.05rem"></div>
    <button class="big-btn" data-ok style="margin-top:12px">C’est parti</button>`);
  el.querySelector('[data-ok]').onclick = () => { const v = el.querySelector('#nm').value.trim(); if (!v) return toast('Indiquez un prénom'); Prefs.set('name', v); closeTop(); };
}
async function start() {
  Prefs.load(); applyLook();
  matchMedia('(prefers-color-scheme: dark)').addEventListener?.('change', applyLook);
  await Store.open();
  S.items = await Store.all();
  if (!Prefs.get('seeded') && !S.items.length) { for (const it of seed()) await save(it); Prefs.set('seeded', true); }
  document.querySelectorAll('.tabbar button').forEach(b => b.onclick = () => { closeAll(); S.tab = b.dataset.tab; S.q = ''; render(); scrollTo(0, 0); });
  $('#fab').onclick = addMenu;
  let framed = false; try { framed = window.self !== window.top; } catch { framed = true; }
  if (framed) { const d = document.createElement('div'); d.className = 'preview-banner'; d.textContent = 'Aperçu : l’import Claude, le partage et la sauvegarde ne marchent qu’une fois l’appli installée sur le téléphone.'; document.body.prepend(d); }
  render();
  if (!Prefs.get('name') && !location.hash.startsWith('#c=')) askName();
  await checkIncoming();
  window.addEventListener('hashchange', checkIncoming);
  if ('serviceWorker' in navigator && location.protocol === 'https:') { try { navigator.serviceWorker.register('sw.js').catch(() => { }); } catch { } }
}
start();

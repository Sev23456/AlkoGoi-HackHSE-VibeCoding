// Сервер игры «Первые деньги».
// Раздаёт файлы игры из папки public и отвечает за персонажей через GigaChat.
// Запуск: node server.js, потом открыть http://localhost:3000
// Нужен Node.js 18 или новее. Сторонние пакеты не нужны.

const http = require('http');
const https = require('https');
const tls = require('tls');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = __dirname;
loadEnv(path.join(ROOT, '.env'));

const PORT = Number(process.env.PORT) || 3000;
const AUTH_KEY = (process.env.GIGACHAT_AUTH_KEY || '').trim();
const SCOPE = process.env.GIGACHAT_SCOPE || 'GIGACHAT_API_PERS';
const MODEL = process.env.GIGACHAT_MODEL || 'GigaChat-2-Pro';
const MOCK = process.env.GIGACHAT_MOCK === '1' || process.argv.includes('--mock');
const OAUTH_URL = process.env.GIGACHAT_OAUTH_URL || 'https://ngw.devices.sberbank.ru:9443/api/v2/oauth';
const API_URLS = process.env.GIGACHAT_BASE_URL
  ? [process.env.GIGACHAT_BASE_URL.replace(/\/$/, '')]
  : ['https://gigachat.devices.sberbank.ru/api/v1', 'https://api.giga.chat/v1'];

/* ---------- .env ---------- */
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

/* ---------- TLS: certificates of the Russian Ministry of Digital Development ---------- */
const CERT_DIR = path.join(ROOT, 'certs');
const extraCA = fs.existsSync(CERT_DIR)
  ? fs.readdirSync(CERT_DIR).filter(f => /\.(crt|cer|pem)$/i.test(f)).map(f => fs.readFileSync(path.join(CERT_DIR, f), 'utf8'))
  : [];
const agent = new https.Agent({ ca: [...tls.rootCertificates, ...extraCA], keepAlive: true });

function request(url, { method = 'POST', headers = {}, body = '' } = {}, timeoutMs = 25000) {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method, headers: { ...headers, 'Content-Length': Buffer.byteLength(body) }, agent }, res => {
      let data = '';
      res.setEncoding('utf8');
      res.on('data', c => { data += c; });
      res.on('end', () => resolve({ status: res.statusCode, text: data }));
    });
    req.setTimeout(timeoutMs, () => req.destroy(new Error('timeout')));
    req.on('error', err => {
      if (/certificate|self.signed|UNABLE_TO|CERT_/i.test(err.code || err.message)) {
        err.hint = 'Не удалось проверить сертификат GigaChat. Скачайте сертификат Минцифры в папку certs (см. README.md).';
      }
      reject(err);
    });
    req.end(body);
  });
}

/* ---------- GigaChat ---------- */
let token = null, tokenExp = 0, apiUrl = null;

async function getToken() {
  if (token && Date.now() < tokenExp - 60000) return token;
  const r = await request(OAUTH_URL, {
    headers: { Authorization: 'Basic ' + AUTH_KEY, RqUID: crypto.randomUUID(), 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: 'scope=' + encodeURIComponent(SCOPE),
  });
  if (r.status !== 200) throw new Error(`OAuth ${r.status}: ${r.text.slice(0, 200)}`);
  const j = JSON.parse(r.text);
  token = j.access_token;
  const exp = Number(j.expires_at) || 0;
  tokenExp = exp ? (exp < 1e12 ? exp * 1000 : exp) : Date.now() + 25 * 60000;
  return token;
}

async function complete(messages, temperature) {
  if (MOCK) return mockReply(messages);
  const t = await getToken();
  const body = JSON.stringify({ model: MODEL, messages, temperature, max_tokens: 500 });
  const urls = apiUrl ? [apiUrl] : API_URLS;
  let lastErr;
  for (const base of urls) {
    try {
      const r = await request(base + '/chat/completions', { headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json', Accept: 'application/json' }, body });
      if (r.status === 401) { token = null; throw new Error('401: токен устарел'); }
      if (r.status !== 200) throw new Error(`GigaChat ${r.status}: ${r.text.slice(0, 300)}`);
      apiUrl = base;
      return JSON.parse(r.text).choices[0].message.content;
    } catch (e) { lastErr = e; }
  }
  throw lastErr;
}

/* Test mode without a key: GIGACHAT_MOCK=1 */
function mockReply(messages) {
  const sys = messages[0].content;
  const keys = (sys.match(/Ключи персонажей: ([^.]+)\./) || [])[1].split(', ');
  return JSON.stringify({ messages: [{ who: keys[0], text: 'Понял тебя 🙂 (тестовый ответ сервера)' }], revealed: [] });
}

/* ---------- prompts ---------- */
const txt = v => (Array.isArray(v) ? v.join('\n') : String(v == null ? '' : v));
function readJson(name) {
  const file = path.join(ROOT, 'prompts', name);
  if (!fs.existsSync(file)) return null;
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (e) { throw Object.assign(new Error(`Ошибка в prompts/${name}: ${e.message}`), { status: 500 }); }
}
function loadPrompts(level) { return readJson(`level${level}.json`); }

function factText(f) { return typeof f === 'string' || Array.isArray(f) ? txt(f) : txt(f.text); }
const norm = t => String(t).toLowerCase().replace(/ё/g, 'е').replace(/(\d)[\s\u00a0\u202f](?=\d)/g, '$1');
function factPasses(f, text) {
  if (typeof f === 'string' || !Array.isArray(f.need)) return true;
  const t = norm(text);
  return f.need.every(group => group.some(w => t.includes(norm(w))));
}

function buildPrompt(level, chat, body) {
  const mod = loadPrompts(level);
  if (!mod || !mod[chat] || typeof mod[chat] !== 'object' || chat.startsWith('_') || chat === 'stateNotes') throw Object.assign(new Error('Нет промпта для этого чата'), { status: 404 });
  const common = readJson('common.json') || { rules: '' };
  let cfg = mod[chat];
  const st = body.state || {};
  if (cfg.variants) cfg = cfg.variants[st.variant] || Object.values(cfg.variants)[0];
  const group = !!cfg.group;
  const whoKeys = group ? Object.keys(cfg.members) : [chat];
  const names = group ? Object.fromEntries(Object.entries(cfg.members).map(([k, v]) => [k, v.name])) : { [chat]: cfg.name };
  const facts = cfg.facts || {};
  const known = Array.isArray(st.known) ? st.known : [];
  const notes = cfg.stateNotes || mod.stateNotes || {};
  const maxMsgs = cfg.maxMessages || 2;

  const parts = [txt(common.rules)];
  if (group) {
    parts.push(`Ты ведёшь сразу нескольких участников группового чата «${cfg.title}». Игрок — тоже участник, ты за него не пишешь.\nУчастники:\n` +
      Object.entries(cfg.members).map(([k, v]) => `- ${v.name} (ключ ${k}): ${txt(v.persona)}`).join('\n'));
  } else {
    parts.push(`Твоя роль: ${cfg.name}. ${txt(cfg.persona)}`);
  }
  parts.push('Ситуация:\n' + txt(cfg.situation));
  if (Object.keys(facts).length) {
    parts.push(`Скрытые факты (чекпоинты). Правила:
- Раскрывай факт, только когда выполнено его условие.
- Раскрывая факт, прямо называй его суть и все числа из него, не отделывайся намёком. Слова выбирай свои.
- Если игрок спрашивает о том же снова, повтори тот же смысл другими словами и снова укажи ключ в revealed.
- Помни всю переписку выше: не противоречь тому, что персонаж уже сказал, и не задавай вопросов, на которые игрок уже ответил.
Факты:\n` + Object.entries(facts).map(([k, v]) => `- [${k}] ${factText(v)}${known.includes(k) ? ' (игрок это уже слышал)' : ''}`).join('\n'));
  }
  if (cfg.positions && cfg.positions.length) parts.push('Позиция и поведение:\n' + cfg.positions.map(p => '- ' + txt(p)).join('\n'));
  const stText = Object.entries(notes).filter(([k]) => st[k]).map(([, t]) => txt(t).replace(/\{(\w+)\}/g, (m, v) => (st[v] != null ? st[v] : m))).join(' ');
  if (stText) parts.push('Что уже произошло в игре: ' + stText);
  parts.push(`Ответь только JSON, без пояснений и без markdown:
{"messages":[{"who":"<ключ персонажа>","text":"<сообщение>"}],"revealed":["<ключи фактов, которые раскрыты именно в этом ответе>"]}
Ключи персонажей: ${whoKeys.join(', ')}. Ключи фактов: ${Object.keys(facts).join(', ') || 'нет'}. Сообщений: от 1 до ${maxMsgs}. Если факты не раскрыты, "revealed": [].`);

  const history = (Array.isArray(body.history) ? body.history : []).slice(-40)
    .filter(m => m && typeof m.text === 'string' && m.from !== 'sys')
    .map(m => ({ role: m.from === 'me' ? 'user' : 'assistant', content: (group && m.from !== 'me' ? (names[m.who] || 'Кто-то') + ': ' : '') + m.text.slice(0, 600) }));
  const merged = [];
  for (const m of history) {
    const last = merged[merged.length - 1];
    if (last && last.role === m.role) last.content += '\n' + m.content; else merged.push({ ...m });
  }
  if (!merged.length || merged[0].role !== 'user') merged.unshift({ role: 'user', content: '(начало переписки)' });
  if (merged[merged.length - 1].role !== 'user') merged.push({ role: 'user', content: '(игрок ждёт ответа)' });

  const allowed = new Set(cfg.numbers || []);
  for (const m of history) for (const n of numbersIn(m.content)) allowed.add(n);
  return { messages: [{ role: 'system', content: parts.join('\n\n') }, ...merged], whoKeys, names, facts, allowed, maxMsgs, allowLink: cfg.allowLink, lastUser: norm((history.filter(m => m.role === 'user').pop() || {}).content || '') };
}

/* ---------- validation ---------- */
const BRANDS = /(сбер|тинько|т-банк|втб|альфа-?банк|газпромб|озон|ozon|wildberries|вайлдбер|киви|qiwi|юмани|yoomoney|kaspi|каспи|paypal|visa|mastercard|госуслуг|гигачат|gigachat|openai|chatgpt)/i;
const AI_TALK = /(нейросет|языков\w* модел|искусственн\w* интеллект|я\s*[-—]?\s*(ии|бот)\b|as an ai)/i;
function numbersIn(s) {
  return (String(s).replace(/(\d)[\s  ](?=\d{3}\b)/g, '$1').match(/\d+/g) || []).map(Number);
}
function parseModel(raw) {
  const clean = String(raw).replace(/```(?:json)?/gi, '').trim();
  const a = clean.indexOf('{'), b = clean.lastIndexOf('}');
  if (a >= 0 && b > a) {
    const body = clean.slice(a, b + 1);
    // GigaChat sometimes breaks JSON: stray "{}", missing commas between objects, trailing commas
    const repaired = body.replace(/,?\s*\{\s*\}/g, '').replace(/\}\s*\{/g, '},{').replace(/,\s*([\]}])/g, '$1');
    for (const t of [body, repaired]) { try { return JSON.parse(t); } catch { /* try next */ } }
    // last resort: pull the fields out one by one
    const unq = v => { try { return JSON.parse('"' + v + '"'); } catch { return v; } };
    const texts = [...body.matchAll(/"text"\s*:\s*"((?:[^"\\]|\\.)*)"/g)].map(m => unq(m[1]));
    const whos = [...body.matchAll(/"who"\s*:\s*"([^"]*)"/g)].map(m => m[1]);
    const rev = (((body.match(/"revealed"\s*:\s*\[([^\]]*)\]/) || [])[1] || '').match(/"([^"]+)"/g) || []).map(x => x.slice(1, -1));
    if (texts.length) return { messages: texts.map((t, k) => ({ who: whos[k], text: t })), revealed: rev };
    throw new Error('сломанный JSON без текста');
  }
  if (/"(messages|revealed|text|who)"\s*:/.test(clean)) throw new Error('сломанный JSON');
  // The model ignored the JSON format: use its text as one message
  return { messages: [{ text: clean }], revealed: [], plain: true };
}
function validate(raw, p) {
  const j = parseModel(raw);
  const out = [], why = [];
  const list = Array.isArray(j.messages) ? j.messages : typeof j.text === 'string' ? [j] : [];
  for (const m of list.slice(0, p.maxMsgs)) {
    let text = String(typeof m === 'string' ? m : (m && m.text) || '').trim().replace(/^["«]|["»]$/g, '');
    let who = p.whoKeys.length === 1 ? p.whoKeys[0] : String((m && m.who) || '');
    // drop a leading "Имя: " that the model sometimes adds, and use it to find the speaker in group chats
    for (const [k, n] of Object.entries(p.names)) {
      const first = n.split(/[ ,]/)[0];
      if (text.startsWith(first + ':')) { text = text.slice(first.length + 1).trim(); if (!p.whoKeys.includes(who)) who = k; break; }
    }
    if (!p.whoKeys.includes(who)) {
      const byName = Object.entries(p.names).find(([, n]) => n.toLowerCase() === who.toLowerCase());
      who = byName ? byName[0] : p.whoKeys[0];
    }
    if (!text) { why.push('пустое сообщение'); continue; }
    if (/[{}]|"(who|text|revealed)"/.test(text)) { why.push('куски JSON в тексте'); continue; }
    if (text.length > 500) { why.push('слишком длинное'); continue; }
    if (BRANDS.test(text)) { why.push('реальный бренд'); continue; }
    if (AI_TALK.test(text)) { why.push('говорит, что он ИИ'); continue; }
    const links = text.match(/(https?:\/\/\S+|www\.\S+|\b[\w-]+\.(ru|com|top|net|org|рф)\b\S*)/gi) || [];
    if (links.some(l => !p.allowLink || !l.includes(p.allowLink))) { why.push('ссылка'); continue; }
    const bad = numbersIn(text).filter(n => n > 31 && !p.allowed.has(n));
    if (bad.length) { why.push('чужая сумма ' + bad.join(', ')); continue; }
    out.push({ who, text });
  }
  if (!out.length) {
    console.log('[отклонено]', why.join('; ') || 'нет сообщений', '| ответ модели:', String(raw).slice(0, 200).replace(/\s+/g, ' '));
    throw new Error('ответ не прошёл проверку: ' + (why.join('; ') || 'нет сообщений'));
  }
  const said = out.map(m => m.text).join(' ');
  const flagged = (Array.isArray(j.revealed) ? j.revealed : []).map(String).filter(k => k in p.facts);
  const asked = k => { const f = p.facts[k]; return !!(f && f.ask && p.lastUser && new RegExp(f.ask, 'i').test(p.lastUser)); };
  const revealed = Object.keys(p.facts).filter(k => factPasses(p.facts[k], said) && (flagged.includes(k) || asked(k) || (p.facts[k].auto && p.facts[k].need)));
  const skipped = flagged.filter(k => !revealed.includes(k));
  if (skipped.length) console.log('[чекпоинт не засчитан] нет нужного смысла в ответе:', skipped.join(', '));
  return { messages: out, revealed };
}

async function chatReply(body) {
  const level = Number(body.level);
  const chat = String(body.chat || '');
  if (![2, 3, 4, 5, 6, 7, 8, 9].includes(level) || !/^[a-zA-Z]+$/.test(chat)) throw Object.assign(new Error('bad request'), { status: 400 });
  const p = buildPrompt(level, chat, body);
  let lastErr;
  for (const temp of [0.7, 0.4]) {
    try { return validate(await complete(p.messages, temp), p); }
    catch (e) { lastErr = e; console.log('[попытка не удалась]', e.hint || e.message); if (e.hint || /OAuth|ECONN|ENOTFOUND|timeout|429/i.test(e.message)) break; }
  }
  throw lastErr;
}

/* ---------- HTTP ---------- */
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.png': 'image/png', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.json': 'application/json' };
const PUBLIC = path.join(ROOT, 'public');

function send(res, status, obj) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(obj));
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  try {
    if (url.pathname === '/api/health') return send(res, 200, { ai: !!AUTH_KEY || MOCK, model: MOCK ? 'mock' : MODEL });
    if (url.pathname === '/api/check') {
      if (!AUTH_KEY && !MOCK) return send(res, 200, { ok: false, error: 'В файле .env нет GIGACHAT_AUTH_KEY' });
      const t0 = Date.now();
      const txt = await complete([{ role: 'system', content: 'Отвечай одним словом.' }, { role: 'user', content: 'Скажи «работает».' }], 0.2);
      return send(res, 200, { ok: true, model: MODEL, reply: txt.slice(0, 100), ms: Date.now() - t0, api: apiUrl });
    }
    if (url.pathname === '/api/chat' && req.method === 'POST') {
      if (!AUTH_KEY && !MOCK) return send(res, 503, { error: 'ИИ не настроен' });
      let raw = '';
      for await (const c of req) { raw += c; if (raw.length > 200000) throw Object.assign(new Error('too large'), { status: 413 }); }
      const t0 = Date.now();
      const out = await chatReply(JSON.parse(raw || '{}'));
      console.log(`[chat] ok ${Date.now() - t0} мс`);
      return send(res, 200, out);
    }
    // static files
    let file = path.normalize(path.join(PUBLIC, decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)));
    if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  } catch (e) {
    console.error('[ошибка]', e.hint || e.message);
    send(res, e.status || 502, { error: e.hint || e.message });
  }
});
module.exports = { buildPrompt, validate };
if (require.main === module) server.listen(PORT, () => {
  console.log(`Игра запущена: http://localhost:${PORT}`);
  if (MOCK) console.log('Тестовый режим: персонажи отвечают заглушкой.');
  else if (!AUTH_KEY) console.log('Ключ GigaChat не найден в .env — персонажи будут отвечать по сценарию.');
  else console.log(`ИИ-персонажи: GigaChat, модель ${MODEL}. Проверка связи: http://localhost:${PORT}/api/check`);
  if (!extraCA.length && !MOCK) console.log('Внимание: в папке certs нет сертификата Минцифры. Без него GigaChat может не подключиться (см. README.md).');
});

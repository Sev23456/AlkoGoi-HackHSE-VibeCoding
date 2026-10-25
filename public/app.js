/* ===================== state & helpers ===================== */
const $ = s => document.querySelector(s);
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = n => new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
const sfmt = n => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(Math.abs(n));
const parseAmt = v => { const n = Number(String(v).replace(/[\s ₽]/g, '').replace(',', '.')); return Number.isFinite(n) ? Math.round(n) : NaN; };
const STATUS = { ok: 'Устойчиво', edge: 'На грани', bad: 'Сорвалось' };

const store = {
  get() { try { return JSON.parse(localStorage.getItem('pd-progress') || '{}'); } catch { return {}; } },
  set(v) { try { localStorage.setItem('pd-progress', JSON.stringify(v)); } catch {} },
};
const progress = Object.assign({ done: {}, attempts: {} }, store.get());
const LOG = [];
function track(ev, p = {}) {
  const e = { t: new Date().toISOString().slice(11, 19), ev, ...p };
  LOG.push(e); console.debug('[analytics]', e);
}

const ICONS = {
  bank: '<svg viewBox="0 0 24 24"><path d="M3 9l9-5 9 5v1H3zM5 11h2.5v7H5zm5.75 0h2.5v7h-2.5zM16.5 11H19v7h-2.5zM3 19h18v2H3z"/></svg>',
  chat: '<svg viewBox="0 0 24 24"><path d="M4 4h16a1 1 0 011 1v10a1 1 0 01-1 1H9l-5 4v-4a1 1 0 01-1-1V5a1 1 0 011-1z"/></svg>',
  shop: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M7 7V6a5 5 0 0110 0v1h3l-1.2 14H5.2L4 7zm2 0h6V6a3 3 0 00-6 0z"/></svg>',
  calc: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M5 2h14v20H5zm2 2v4h10V4zm0 6v2h2v-2zm4 0v2h2v-2zm4 0v2h2v-2zm-8 4v2h2v-2zm4 0v2h2v-2zm4 0v6h2v-6zm-8 4v2h2v-2zm4 0v2h2v-2z"/></svg>',
  notes: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M5 3h14v18H5zm3 4v2h8V7zm0 4v2h8v-2zm0 4v2h5v-2z"/></svg>',
  trip: '<svg viewBox="0 0 24 24"><path d="M12 3l9 8h-3v9h-5v-6h-2v6H6v-9H3z"/></svg>',
  plan: '<svg viewBox="0 0 24 24"><path fill-rule="evenodd" d="M7 2h2v2h6V2h2v2h3v18H4V4h3zM6 9v11h12V9zm2 2h3v3H8z"/></svg>',
  sms: '<svg viewBox="0 0 24 24"><path d="M3 5h18v12H8l-5 4zm4 5v2h2v-2zm4 0v2h2v-2zm4 0v2h2v-2z"/></svg>',
  uni: '<svg viewBox="0 0 24 24"><path d="M12 3L1 9l11 6 9-4.9V17h2V9zM5 13.2V17c0 1.7 3.1 3 7 3s7-1.3 7-3v-3.8l-7 3.8z"/></svg>',
};
const APPNAME = { bank: 'Пятак', chat: 'Чаты', shop: 'Техносад', calc: 'Калькулятор', notes: 'Заметки', trip: 'Поездка', plan: 'План', sms: 'Сообщения', uni: 'Сайт вуза' };
const CONTACTS = {
  dima: { name: 'Дима', color: '#7A4FD0' }, mom: { name: 'Мама', color: '#C9488A' },
  artem: { name: 'Артём', color: '#2E6FD8' }, lena: { name: 'Лена', color: '#C4562A' },
  max: { name: 'Макс', color: '#C9971A' }, lesha: { name: 'Лёша', color: '#4A8F3C' }, anya: { name: 'Аня', color: '#D04F7A' },
  trip: { name: 'Друзья 🌲', color: '#1D8A4D' }, pixel: { name: 'Студия «Пиксель»', color: '#4A5553' },
  galina: { name: 'Галина Петровна', color: '#8A6A3A' }, zerno: { name: 'Кафе «Зерно»', color: '#C4562A' },
  srazu: { name: 'Деньги Сразу', color: '#B23A3A' },
  elena: { name: 'Елена Викторовна, деканат', color: '#5B6BB5' }, katya: { name: 'Катя, староста', color: '#C9488A' },
  dekanat: { name: 'Деканат (официальный чат)', color: '#0E7C66' }, mama: { name: 'Мама', color: '#C9488A' },
  support: { name: 'Пятак: поддержка', color: '#0E7C66' }, sb: { name: 'Служба безопасности', color: '#4A5553' },
  safe: { name: 'Защищённый счёт', color: '#4A5553' },
};
const CATS = ['Еда', 'Транспорт', 'Покупки', 'Развлечения', 'Переводы', 'Пополнения'];

/* Fixed Artyom variant for demos: ?artem=reliable|uncertain|reserve, or the selector in the analytics panel */
let DEMO_ARTEM = (() => { try { const v = new URLSearchParams(location.search).get('artem'); return v && L2.variants[v] ? v : ''; } catch { return ''; } })();
let lastRouteKey = '';
let S = null;          // current level state
/* Live characters: the game asks its own server (/api/chat), which talks to GigaChat */
const AIC = { on: false, enabled: true, model: '', fails: 0 };
function aiOn() { return AIC.on && AIC.enabled; }
async function checkAI() {
  try {
    if (location.protocol === 'file:') throw 0;
    const r = await fetch('/api/health', { cache: 'no-store' });
    const j = await r.json();
    AIC.on = !!j.ai; AIC.model = j.model || '';
  } catch { AIC.on = false; }
  track('ai_status', { on: AIC.on, model: AIC.model });
  if (S) render();
}
let hintTimer = null, lastAction = Date.now(), toastTimer = null, panelOpen = false;

/* ===================== level setup ===================== */
const LEVELS = {
  1: { title: 'Первое знакомство', short: 'Интерфейс' },
  2: { title: 'Друг просит в долг', short: 'Долг другу' },
  3: { title: 'Ноутбук для работы', short: 'Рассрочка' },
  4: { title: 'Деньги общие, представления разные', short: 'Поездка' },
  5: { title: 'Всё пошло не по плану', short: 'Задержка' },
  6: { title: 'Делегация', short: 'Деканат' },
};
const L1_TASKS = [
  { text: 'Найди поступившие деньги от мамы', hint: 'Открой «Пятак» и нажми на перевод +5 000 ₽ в последних операциях.' },
  { text: 'Переведи Диме свою часть за обед', hint: 'Дима написал в «Чатах», сколько ты должен. Потом: Пятак → Перевести → Дима → 650.' },
  { text: 'Найди в истории покупку канцтоваров', hint: 'Пятак → История. Начни вводить «канц» в поиске или выбери категорию «Покупки».' },
  { text: 'Создай копилку и положи туда от 100 ₽', hint: 'Пятак → Копилки → «Новая копилка». Потом нажми «Пополнить».' },
];

function op(id, title, amount, cat, date, extra = {}) { return { id, title, amount, cat, date, ...extra }; }

function baseState(level) {
  return {
    level, route: { app: 'home' }, balance: 0, ops: [], piggies: [], chats: {}, notes: '', calc: { expr: '', out: '0' },
    hist: { q: '', cat: '', period: 'all' }, transfer: null, pform: null, toast: null, hint: false, hintText: false,
    decision: null, facts: new Set(), started: Date.now(), result: null, typing: false,
  };
}

function startLevel(n) {
  if (S && !S.result && !S.finished) track('level_quit', { level: S.level, sec: Math.round((Date.now() - S.started) / 1000) });
  progress.attempts[n] = (progress.attempts[n] || 0) + 1; store.set(progress);
  S = baseState(n);
  S.attempt = progress.attempts[n];
  closeModal();
  if (n === 1) {
    S.today = '2026-10-25'; S.clock = '10:24'; S.balance = 3500;
    S.apps = ['bank', 'chat'];
    S.ops = [
      op('o1', 'Кофейня «Зерно»', -180, 'Еда', '2026-10-24'), op('o2', 'Метро', -62, 'Транспорт', '2026-10-24'),
      op('o3', 'Метро', -62, 'Транспорт', '2026-10-23'), op('o4', 'Столовая', -290, 'Еда', '2026-10-22'),
      op('stationery', 'Канцтовары', -340, 'Покупки', '2026-10-21', { note: 'Тетради и ручки' }), op('o5', 'Метро', -62, 'Транспорт', '2026-10-21'),
      op('o6', 'Книжный «Полка»', -560, 'Покупки', '2026-10-18'), op('o7', 'Кино «Луч»', -450, 'Развлечения', '2026-10-17'),
      op('o8', 'Продукты «Корзинка»', -830, 'Еда', '2026-10-15'), op('o9', 'Перевод от Мамы', 3000, 'Пополнения', '2026-10-14', { who: 'Мама' }),
      op('o10', 'Аптека', -210, 'Покупки', '2026-10-12'), op('o11', 'Столовая', -270, 'Еда', '2026-10-10'),
      op('o12', 'Перевод Лене', -300, 'Переводы', '2026-10-08', { who: 'Лена' }), op('o13', 'Метро', -62, 'Транспорт', '2026-10-07'),
    ];
    S.contacts = ['dima', 'mom', 'lena'];
    S.chats = {
      dima: { msgs: [{ from: 'them', text: 'Привет! Я платил за двоих в столовой 🙂' }, { from: 'them', text: 'Скинь мне свою часть, 650 ₽' }], unread: 2, quick: [{ id: 'ok', text: 'Сейчас скину!' }] },
      mom: { msgs: [{ from: 'them', text: 'Перевела тебе на обед и проезд. Не трать всё сразу 😉' }], unread: 1, quick: [] },
    };
    S.l1 = { done: [false, false, false, false], hints: 0, tStart: Date.now() };
    const st1 = S; setTimeout(() => { if (S !== st1) return; S.balance += 5000; S.ops.unshift(op('mom', 'Перевод от Мамы', 5000, 'Пополнения', '2026-10-25', { who: 'Мама', note: 'на обед и проезд' })); showToast('Пятак', 'Мама: +5 000 ₽ · «на обед и проезд»', 'open-op', 'mom'); render(); }, 900);
  }
  if (n === 2) {
    const keys = Object.keys(L2.variants);
    S.variant = DEMO_ARTEM || keys[Math.floor(Math.random() * keys.length)];
    S.day = 1; S.clock = '10:15'; S.balance = L2.start;
    S.apps = ['bank', 'chat', 'calc', 'notes'];
    S.ops = [
      op('a1', 'Продукты «Корзинка»', -640, 'Еда', 'd0'), op('a2', 'Метро', -62, 'Транспорт', 'd0'),
      op('a3', 'Зарплата: кофейня', 24000, 'Пополнения', 'd-3'), op('a4', 'Стипендия', 4200, 'Пополнения', 'd-5'),
      op('a5', 'Связь', -450, 'Покупки', 'd-6'),
    ];
    S.contacts = ['artem', 'mom'];
    S.chats = { artem: { msgs: [{ from: 'them', text: 'Привет! Слушай, выручишь?' }, { from: 'them', text: 'Нужно 15 000, верну скоро 🙏' }], unread: 2 } };
    S.l2 = { msgs: 0, aiFails: 0, aiOff: false, offered: false, postponed: false, mood: 'ok', history: [] };
    S.factKeys = Object.keys(L2.facts);
    setTimeout(() => { if (S.level === 2 && !S.decision && S.route.app !== 'chat') { showToast('Чаты', 'Артём: Нужно 15 000, верну скоро 🙏', 'open-chat', 'artem'); render(); } }, 700);
  }
  if (n === 3) {
    S.month = 0; S.clock = '12:00'; S.balance = L3.start;
    S.apps = ['bank', 'shop', 'calc', 'notes'];
    S.ops = [
      op('b1', 'Зарплата: заказы', 52000, 'Пополнения', 'd-2'), op('b2', 'Аренда комнаты', -22000, 'Переводы', 'd-3'),
      op('b3', 'Продукты «Корзинка»', -1840, 'Еда', 'd-4'), op('b4', 'Связь и интернет', -900, 'Покупки', 'd-6'),
    ];
    S.contacts = ['mom'];
    S.factKeys = ['conds', 'lowmonth'];
    S.shop = { open: null, protection: true, checkout: null };
    setTimeout(() => { if (S.level === 3) { showToast('Техносад', 'Ноутбук «Модель Про» — 0%, всего 10 000 ₽ в месяц!', 'open-app', 'shop'); render(); } }, 700);
  }
  if (n === 4) {
    S.dayName = 'Пятница'; S.clock = '18:40'; S.balance = 9400;
    S.apps = ['bank', 'chat', 'trip', 'calc', 'notes'];
    S.ops = [
      op('c4', 'Метро', -62, 'Транспорт', 'd0'), op('c3', 'Продукты «Корзинка»', -920, 'Еда', 'd-1'),
      op('c1', 'Перевод от Макса', 6000, 'Пополнения', 'd-14', { who: 'Макс', note: 'за дом' }),
      op('c2', 'Бронирование: дом у озера', -24000, 'Покупки', 'd-21'),
    ];
    S.contacts = ['max', 'lesha', 'anya', 'dima'];
    S.chats = { trip: { group: true, msgs: L4_HISTORY.map(m => ({ ...m })), unread: 3 } };
    S.factKeys = Object.keys(L4.facts);
    S.l4 = { cancelled: false, proposals: 0, sent: false, waiting: false, req: new Set(), hurt: new Set(), disputes: {}, form: { anya: '', lesha: '' } };
    const st = S; setTimeout(() => { if (S === st && S.route.app !== 'chat') { showToast('Чаты', 'Аня: Ребят, простите 😔 я не еду', 'open-chat', 'trip'); render(); } }, 700);
  }
  if (n === 5) {
    S.day = 8; S.clock = '09:30'; S.balance = L5.start;
    S.apps = ['bank', 'chat', 'plan', 'calc', 'notes'];
    S.piggies = [{ id: 'pg5', name: 'На отпуск', amount: L5.piggy }];
    S.ops = [
      op('e1', 'Продукты «Корзинка»', -1100, 'Еда', 'd-1'), op('e2', 'Метро', -62, 'Транспорт', 'd-1'),
      op('e3', 'Рассрочка: Техносад', -4500, 'Покупки', 'd-24'), op('e4', 'Аренда комнаты', -25000, 'Переводы', 'd-27'),
    ];
    S.contacts = ['mom'];
    S.chats = {
      pixel: { msgs: [{ from: 'them', text: 'Добрый день! Оплата 40 000 ₽ за проект будет 10-го' }, { from: 'sys', text: 'Сегодня' }, { from: 'them', text: 'Бухгалтерия задерживает оплату, на следующей неделе, наверное. Извините!' }], unread: 1, quick: [{ id: 'when', text: 'А можно точнее, какого числа?' }] },
      srazu: { msgs: [{ from: 'them', text: 'Деньги до зарплаты за 5 минут! Без проверок 💸 Вам одобрено 30 000 ₽' }, { from: 'them', text: 'Оформить:', link: true }], unread: 2, quick: [{ id: 'block', text: 'Заблокировать' }] },
      zerno: { msgs: [{ from: 'them', text: 'Привет! Это Лена из «Зерна». Нужны люди на выходные, 13-го и 14-го. 3 000 за смену, выплата в понедельник, 15-го. Выйдешь?' }], unread: 1, quick: [{ id: 'yes', text: 'Да, выйду на обе смены' }, { id: 'no', text: 'Нет, не смогу' }] },
      galina: { msgs: [{ from: 'them', text: 'Напоминаю: оплата за комнату 12-го, 25 000 ₽' }], unread: 0, quick: [{ id: 'part', text: 'Можно 12 000 заплатить 12-го, а 13 000 — 22-го? Задерживают оплату за проект' }, { id: 'all', text: 'Можно перенести всю оплату на две недели?' }] },
      artem: { msgs: [{ from: 'me', text: 'Держи 15 000, удачи с комнатой!' }, { from: 'them', text: 'Спасибо огромное! Верну, как только смогу 🙏' }], unread: 0, quick: [{ id: 'debt', text: 'Слушай, помнишь про долг? Сможешь вернуть?' }] },
    };
    S.factKeys = Object.keys(L5.facts);
    S.l5 = { landlord: false, job: false, loan: false, scamPaid: false, scammed: 0, plan: { piggy: false, subs: false, eco: false, rent: false, job: false, client: false, artem: false } };
    const st = S; setTimeout(() => { if (S === st) { showToast('Чаты', 'Студия «Пиксель»: Бухгалтерия задерживает оплату…', 'open-chat', 'pixel'); render(); } }, 700);
  }
  if (n === 6) {
    S.clock = '14:05'; S.balance = 34000;
    S.apps = ['bank', 'chat', 'sms', 'uni', 'notes'];
    S.piggies = [{ id: 'pg6', name: 'На ноутбук', amount: 12000 }];
    S.ops = [
      op('f1', 'Стипендия', 4200, 'Пополнения', 'd-2'), op('f2', 'Столовая', -290, 'Еда', 'd-1'),
      op('f3', 'Метро', -62, 'Транспорт', 'd0'), op('f4', 'Зарплата: подработка', 18000, 'Пополнения', 'd-9'),
    ];
    S.contacts = ['mama', 'katya'];
    S.chats = {
      elena: { msgs: [
        { from: 'them', text: 'Добрый день, Василий! Это Елена Викторовна, деканат. Мой рабочий номер +7 912 345-44-17' },
        { from: 'them', text: 'К нам приезжает известный депутат из Омска. Вы его земляк, и декан включил вас в делегацию, которая будет его встречать 🎉' },
        { from: 'them', text: 'Нужно подать заявку на регистрацию: пришлите фото паспорта и код из SMS для системы пропусков. Список подаём сегодня до 18:00' },
      ], unread: 3 },
      katya: { msgs: [{ from: 'them', text: 'Вась, ты завтра на первую пару идёшь?' }], unread: 0 },
      mama: { msgs: [{ from: 'them', text: 'Сынок, как дела? Покушал?' }], unread: 0 },
      support: { msgs: [{ from: 'them', text: 'Здравствуйте! Это поддержка «Пятака». Чем можем помочь?' }], unread: 0 },
    };
    S.sms = [];
    S.factKeys = Object.keys(L6.facts).filter(k => k !== 'bank');
    S.l6 = { code: '4827', passportSent: false, codeSent: false, wave: false, lost: 0, siteSeen: false };
    const st = S;
    setTimeout(() => { if (S === st) { showToast('Чаты', 'Елена Викторовна: К нам приезжает известный депутат…', 'open-chat', 'elena'); render(); } }, 700);
    setTimeout(() => { if (S === st) { addSms('Госпортал', `Код ${S.l6.code} для входа на Госпортал. Никому не сообщайте этот код, даже сотрудникам.`); } }, 3500);
  }
  track('level_start', { level: n, attempt: S.attempt, variant: S.variant });
  render();
}

const FACTS3 = { conds: 'Открыл полные условия рассрочки', lowmonth: 'Посмотрел доход по месяцам' };
function reveal(f) {
  if (S.facts.has(f) || S.decision) return;
  S.facts.add(f);
  track('fact_revealed', { level: S.level, fact: f });
}

/* ===================== toasts & hints ===================== */
function showToast(app, text, act, arg) {
  S.toast = { app, text, act, arg };
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { if (S) { S.toast = null; render(); } }, 5000);
}

function l1Current() { return S.l1.done.findIndex(d => !d); }
function l1Target() {
  const i = l1Current(), r = S.route;
  if (i < 0) return null;
  if (r.app === 'home') return i === 1 && !S.chats.dima.read ? '[data-arg="chat"]' : '[data-arg="bank"]';
  if (r.app === 'chat') {
    if (i !== 1) return '.homebar button';
    if (!r.id) return '[data-arg="dima"]';
    return S.chats.dima.read ? '.homebar button' : '.quick button';
  }
  if (r.app !== 'bank') return '.homebar button';
  const v = r.view || 'main';
  if (i === 0) return v === 'main' || v === 'history' ? '[data-op="mom"]' : '.back';
  if (i === 1) {
    if (v === 'main') return '[data-act="bank-go"][data-arg="transfer"]';
    if (v === 'transfer') return !S.transfer?.to ? '[data-arg="dima"]' : '#tr-amount';
    if (v === 'confirm') return '[data-act="tr-send"]';
    if (v === 'done' && S.l1.wrong) return '[data-act="tr-cancel"]';
    return '.back';
  }
  if (i === 2) {
    if (v === 'main') return '[data-act="bank-go"][data-arg="history"]';
    if (v === 'history') return S.hist.q || S.hist.cat ? '[data-op="stationery"]' : '#hist-q';
    return '.back';
  }
  if (i === 3) {
    if (v === 'main') return '[data-act="bank-go"][data-arg="piggies"]';
    if (v === 'piggies') return S.piggies.length ? '[data-act="pig-form"][data-arg2="add"]' : '[data-act="pig-new"]';
    return '.back';
  }
}
function l1Done(i) {
  if (S.level !== 1 || S.l1.done[i]) return;
  S.l1.done[i] = true;
  track('task_complete', { task: i + 1, sec: Math.round((Date.now() - S.l1.tStart) / 1000), hints: S.l1.hints });
  S.l1.tStart = Date.now(); S.l1.hints = 0; S.hint = false;
  if (S.l1.done.every(Boolean)) setTimeout(finishL1, 900);
}

/* ===================== rendering ===================== */
function render() {
  if (!S) return;
  renderPanel();
  renderPhone();
}

const PANEL = {
  6: {
    brief: `Ты Вася, студент из Омска. На счету <b class="num">34 000 ₽</b>, в копилке <b class="num">12 000 ₽</b> на ноутбук. Сегодня тебе написала «Елена Викторовна из деканата»: тебя включили в делегацию для встречи депутата-земляка.`,
    options: 'Пиши кому считаешь нужным: «деканату», старосте, маме, поддержке банка. На сайте вуза есть официальные контакты. Промотать неделю можно в любой момент.',
    hint: 'Сравни номер «Елены Викторовны» с номером деканата на сайте вуза и напиши в официальный чат деканата. Спроси старосту, слышала ли она о делегации. И прочитай, что написано в SMS с кодом.',
  },
  4: {
    brief: `Ты нашёл дом у озера на две ночи за <b class="num">24 000 ₽</b> и оплатил его сам. Договорились делить на четверых, Макс уже вернул <b class="num">6 000 ₽</b>. Сегодня Аня написала, что не едет, а Лёша считает, что платить должен меньше.`,
    options: 'Перечитай общий чат: нажми на сообщение, чтобы отметить важное. Загляни в приложение «Поездка» и предложи расчёт друзьям. Уровень пройден, когда все согласятся.',
    hint: 'Что ты сам ответил Лёше три недели назад? Отметь это сообщение. В «Поездке» открой условия отмены: там есть срок. И посмотри, кто ещё хотел поехать.',
  },
  5: {
    brief: `Сегодня 8-е. Заказчик задерживает оплату <b class="num">40 000 ₽</b>. На счету <b class="num">20 000 ₽</b>, в копилке <b class="num">5 000 ₽</b>. Платежи до 21-го — в «Пятаке», раздел «Платежи». Артём всё ещё должен тебе <b class="num">15 000 ₽</b>.`,
    options: 'Напиши тем, от кого что-то зависит, проверь предложения и собери план до 21-го в приложении «План». Потом игра проверит, выдержит ли план ещё одну задержку.',
    hint: 'Обещанное поступление — ещё не деньги. Попробуй собрать план, где не учтены ни заказчик, ни Артём. Кому можно написать, чтобы сдвинуть платёж или заработать? И проверь, кто прислал предложение «за 5 минут».',
  },
};
function renderPanel() {
  const lvl = S.level, L = LEVELS[lvl];
  const lv = [1, 2, 3, 4, 5, 6].map(n => `<button class="lv" data-act="level" data-arg="${n}" aria-current="${n === lvl}" title="${LEVELS[n].title}"><b>Ур. ${n}${progress.done[n] ? ' <span class="ok">✓</span>' : ''}</b><span>${LEVELS[n].short}</span></button>`).join('');
  let meta = '', body = '', action = '';
  if (lvl === 1) {
    const cur = l1Current(), cnt = S.l1.done.filter(Boolean).length;
    meta = `Задачи ${cnt} из 4`;
    body = `<div class="card"><span class="eyebrow">Вводная</span><p class="brief">На счету 3 500 ₽. Освойся в банковском приложении: ошибки здесь ничего не стоят, неверный перевод можно отменить.</p></div>
      <div class="card"><span class="eyebrow">Задачи</span><ul class="tasks">${L1_TASKS.map((t, i) => `<li class="${S.l1.done[i] ? 'done' : i === cur ? 'now' : ''}"><i class="tick">${S.l1.done[i] ? '✓' : ''}</i><span>${t.text}</span></li>`).join('')}</ul>
      ${cur >= 0 ? `<div class="note">Подсветка показывает, куда нажать. Если замешкаешься, через 10 секунд появится подсказка.</div>` : ''}</div>`;
  } else {
    const total = S.factKeys.length, got = S.facts.size;
    meta = `Выяснено ${got} из ${total}`;
    const brief = lvl > 3 ? PANEL[lvl].brief : lvl === 2
      ? `На счету <b class="num">48 000 ₽</b>. На 3-й день платить за аренду <b class="num">25 000 ₽</b>. На еду и проезд до поступления на 14-й день нужно около <b class="num">12 000 ₽</b>. Артём пишет в «Чатах» и просит <b class="num">15 000 ₽</b>.`
      : `Накоплено <b class="num">30 000 ₽</b>, обязательные расходы <b class="num">40 000 ₽</b> в месяц. Для заказов нужен ноутбук, без него доход падает. Подушка безопасности — не меньше <b class="num">10 000 ₽</b> на счету. Доход по месяцам — в «Пятаке», в разделе «Платежи».`;
    const options = lvl > 3 ? PANEL[lvl].options : lvl === 2
      ? 'Напиши Артёму сам: расспроси его, предложи меньше или откажи. Деньги переводятся в «Пятаке», и отменить перевод с этого уровня нельзя.'
      : 'Можно купить «Модель Про» сразу или в рассрочку, взять «Модель Базовую» или отложить покупку. Всё — в приложении «Техносад».';
    const hint = lvl > 3 ? PANEL[lvl].hint : lvl === 2
      ? 'Сначала посчитай, сколько денег у тебя свободно после аренды и еды. Всё, что сверх этого, вернётся к тебе только если Артём отдаст долг вовремя. Спроси, когда и из каких денег он вернёт.'
      : 'Открой «Полные условия» у рассрочки: там может быть что-то, чего нет в рекламе. Потом посмотри доход по месяцам и посчитай, что останется в самый бедный месяц.';
    body = `<div class="card"><span class="eyebrow">Вводная</span><p class="brief">${brief}</p><p class="brief note">${options}</p>${aiOn() ? '<p class="brief note">💬 В чатах можно писать своими словами: персонажи отвечают сами.</p>' : ''}</div>
      <div class="card"><div class="p-head"><span class="eyebrow">Осведомлённость</span><span class="num note">${got} из ${total}</span></div>
      <div class="meter">${S.factKeys.map(k => `<i class="${S.facts.has(k) ? 'on' : ''}"></i>`).join('')}</div>
      <div class="note">Сколько важных условий ты выяснил до решения. Какие именно — покажем в разборе.</div>
      ${S.hintText ? `<div class="hintbox">${hint}</div>` : `<button class="btn ghost sm" data-act="hint">Нужна подсказка</button>`}</div>`;
    const decided = S.decision || lvl === 6;
    const skipT = { 2: 'Промотать 14 дней →', 3: 'Промотать 6 месяцев →', 4: 'Промотать до поездки →', 5: 'Проверить план: промотать 2 недели →', 6: 'Промотать неделю →' }[lvl];
    const waitT = { 4: 'Сначала договоритесь в общем чате', 5: 'Сначала утверди план в «Плане»' }[lvl] || 'Сначала прими решение';
    if (decided) action = `<button class="btn coin wide" data-act="skip">${skipT}</button>`;
    else action = `<button class="btn wide" disabled>${waitT}</button>`;
  }
  const log = LOG.slice(-60).reverse().map(e => esc(`${e.t} ${e.ev} ${JSON.stringify(Object.fromEntries(Object.entries(e).filter(([k]) => k !== 't' && k !== 'ev')))}`)).map(s => `<div>${s}</div>`).join('');
  $('#panel').className = 'panel' + (panelOpen ? ' open' : '');
  $('#panel').innerHTML = `
    <div class="brand"><h1>Первые <i>деньги</i></h1><small>игра о решениях с деньгами</small></div>
    <div class="levels">${lv}</div>
    <div class="p-head"><h2>${L.title}</h2><span class="note num">${meta}</span>
      <button class="btn ghost sm rs" data-act="restart" title="Начать уровень заново">${S.restartArm ? 'Точно?' : '↺ Заново'}</button>
      <button class="btn ghost sm toggle" data-act="panel" aria-expanded="${panelOpen}">${panelOpen ? 'Скрыть' : 'Задание'}</button></div>
    <div class="p-scroll">${body}
      <details class="dev"><summary>Журнал аналитики (${LOG.length})</summary><label class="note" style="display:flex;gap:6px;align-items:center;margin:6px 0"><input type="checkbox" id="dev-ai" ${AIC.enabled ? 'checked' : ''} ${AIC.on ? '' : 'disabled'}> Живые персонажи: ${AIC.on ? 'GigaChat, ' + esc(AIC.model) : 'сервер ИИ не подключён'}</label><label class="note" style="display:flex;gap:6px;align-items:center;margin:6px 0">Артём для демо <select id="dev-artem" class="inp" style="padding:4px 8px;width:auto">${[['', 'случайный'], ['reliable', 'надёжный'], ['uncertain', 'неопределённый'], ['reserve', 'с запасом']].map(([k, t]) => `<option value="${k}" ${DEMO_ARTEM === k ? 'selected' : ''}>${t}</option>`).join('')}</select></label><div class="log">${log || '<div>пусто</div>'}</div></details>
    </div>
    ${action ? `<div class="p-act">${action}</div>` : ''}`;
}

function renderPhone() {
  const r = S.route;
  const status = S.level === 1 ? S.clock : S.level === 2 ? `День ${S.day} · ${S.clock}` : S.level === 3 ? `Месяц ${S.month}` : S.level === 4 ? `${S.dayName} · ${S.clock}` : S.level === 6 ? `Вторник · ${S.clock}` : `${S.day}-е · ${S.clock}`;
  let html = `<div class="sbar"><span class="num">${status}</span><span class="island"></span><span>5G ▮▮▮</span></div>`;
  let view = '';
  if (r.app === 'home') view = homeView();
  else if (r.app === 'bank') view = bankView();
  else if (r.app === 'chat') view = chatView();
  else if (r.app === 'shop') view = shopView();
  else if (r.app === 'calc') view = calcView();
  else if (r.app === 'notes') view = notesView();
  else if (r.app === 'trip') view = tripView();
  else if (r.app === 'plan') view = planView();
  else if (r.app === 'web') view = webView();
  else if (r.app === 'sms') view = smsView();
  else if (r.app === 'uni') view = uniView();
  html += `<div class="view" id="view">${view}</div>`;
  if (S.toast) html += `<button class="toast" data-act="${S.toast.act}" data-arg="${S.toast.arg}"><span class="ava" style="background:#0E7C66;width:34px;height:34px;font-size:12px">${esc(S.toast.app[0])}</span><span><b>${esc(S.toast.app)}</b><small>${esc(S.toast.text)}</small></span></button>`;
  if (S.level === 1 && S.hint && l1Current() >= 0) html += `<div class="hintbubble"><b>Подсказка.</b> ${L1_TASKS[l1Current()].hint}</div>`;
  html += `<div class="homebar"><button data-act="home" aria-label="На главный экран"><i></i></button></div>`;
  const sc = $('#screen'); const routeKey = JSON.stringify(r); const prevView = routeKey === lastRouteKey ? sc.querySelector('#view')?.scrollTop : 0;
  sc.innerHTML = html; lastRouteKey = routeKey;
  if (prevView) sc.querySelector('#view').scrollTop = prevView;
  const msgs = sc.querySelector('.msgs'); if (msgs) msgs.scrollTop = msgs.scrollHeight;
  if (S.level === 1) { const t = l1Target(); const el = t && sc.querySelector(t); if (el) el.classList.add('spot'); }
}

function homeView() {
  const unread = Object.values(S.chats).reduce((a, c) => a + (c.unread || 0), 0);
  const date = { 1: 'суббота, 25 октября', 2: `День ${S.day} из 14`, 3: 'Выбор ноутбука', 4: `${S.dayName}, до поездки неделя`, 5: '8-е число, до аренды 4 дня', 6: 'вторник' }[S.level];
  return `<div class="home"><div><div class="clock num">${S.clock}</div><div class="date">${date}</div></div>
    <div class="apps">${S.apps.map(a => `<button class="app" data-act="open-app" data-arg="${a}"><span class="ic ${a}">${ICONS[a]}</span>${APPNAME[a]}${a === 'chat' && unread ? `<span class="badge">${unread}</span>` : ''}</button>`).join('')}</div></div>`;
}

/* ---------- bank ---------- */
function dayLabel(d) {
  if (S.level === 1) {
    if (d === S.today) return 'Сегодня';
    if (d === '2026-10-24') return 'Вчера';
    const [, m, dd] = d.split('-'); return `${+dd} октября`;
  }
  if (d === 'd0' || d === 'today') return 'Сегодня';
  const n = -parseInt(d.slice(1)); return n === 1 ? 'Вчера' : `${n} дн. назад`;
}
function opRow(o) {
  const ch = o.amount > 0 ? '+' : (o.title.match(/[А-ЯA-Z]/) || ['•'])[0];
  return `<button class="op" data-act="open-op" data-arg="${o.id}" data-op="${o.id}"><span class="dot">${ch}</span><span class="t"><div>${esc(o.title)}</div><small>${o.cat}${o.note ? ' · ' + esc(o.note) : ''}</small></span><span class="a num ${o.amount > 0 ? 'pos' : ''}">${sfmt(o.amount)}</span></button>`;
}
function bankTop(title, back = 'main') { return `<div class="topbar"><button class="back" data-act="bank-go" data-arg="${back}">‹ Назад</button><h3>${title}</h3></div>`; }
function piggyTotal() { return S.piggies.reduce((a, p) => a + p.amount, 0); }

function bankView() {
  const v = S.route.view || 'main';
  if (v === 'main') {
    const pigs = S.piggies.length ? S.piggies.map(p => `<div class="kv"><div><b>${esc(p.name)}</b><span class="num">${fmt(p.amount)}</span></div></div>`).join('') : '<div class="note">Копилок пока нет</div>';
    const qa = [['transfer', '→', 'Перевести'], ['request', '←', 'Запросить'], ['history', '≡', 'История'], ['piggies', '◎', 'Копилки']];
    if (S.level > 1 && S.level !== 4 && S.level !== 6) qa.splice(1, 1, ['upcoming', '◷', 'Платежи']);
    return `<div class="topbar"><h3>Пятак</h3></div><div class="pad">
      <div class="balcard"><small>Основной счёт · •• 4417</small><b class="num">${fmt(S.balance)}</b>${S.piggies.length ? `<small class="num">В копилках ещё ${fmt(piggyTotal())}</small>` : ''}</div>
      <div class="qa">${qa.map(([a, s, t]) => `<button data-act="bank-go" data-arg="${a}"><span>${s}</span>${t}</button>`).join('')}</div>
      ${S.level > 1 ? upcomingTeaser() : ''}
      <div class="sec"><div class="sec-h"><b>Копилки</b></div>${pigs}</div>
      <div class="sec"><div class="sec-h"><b>Последние операции</b><button class="link" data-act="bank-go" data-arg="history">Вся история</button></div><div class="ops">${S.ops.slice(0, 5).map(opRow).join('')}</div></div>
    </div>`;
  }
  if (v === 'op') {
    const o = S.ops.find(x => x.id === S.route.id);
    return bankTop('Операция', S.route.from || 'main') + `<div class="confirm"><div class="big num ${o.amount > 0 ? 'pos' : ''}">${sfmt(o.amount)}</div><div>${esc(o.title)}</div></div>
      <div class="pad"><div class="kv"><div><span>Дата</span><b>${dayLabel(o.date)}</b></div><div><span>Категория</span><b>${o.cat}</b></div>${o.who ? `<div><span>${o.amount > 0 ? 'Отправитель' : 'Получатель'}</span><b>${esc(o.who)}</b></div>` : ''}${o.note ? `<div><span>Комментарий</span><b>${esc(o.note)}</b></div>` : ''}<div><span>Статус</span><b>${o.cancelled ? 'Отменена' : 'Выполнена'}</b></div></div></div>`;
  }
  if (v === 'history') {
    const periods = S.level === 1 ? [['all', 'Все даты'], ['today', 'Сегодня'], ['week', '7 дней'], ['month', 'Октябрь']] : [['all', 'Все даты']];
    return bankTop('История') + `<div class="pad" style="padding-bottom:0">
      <input id="hist-q" class="inp" type="search" placeholder="Поиск по названию" value="${esc(S.hist.q)}" autocomplete="off">
      <div class="chips">${['', ...CATS].map(c => `<button class="chip" data-act="hist-cat" data-arg="${c}" aria-pressed="${S.hist.cat === c}">${c || 'Все'}</button>`).join('')}</div>
      ${periods.length > 1 ? `<select id="hist-period" class="inp">${periods.map(([k, t]) => `<option value="${k}" ${S.hist.period === k ? 'selected' : ''}>${t}</option>`).join('')}</select>` : ''}
      </div><div class="pad" style="padding-top:4px"><div class="ops" id="hist-list">${histList()}</div></div>`;
  }
  if (v === 'transfer') {
    const t = S.transfer || (S.transfer = { to: '', amount: '', comment: '' });
    return bankTop('Перевод') + `<form class="pad" id="tr-form" autocomplete="off">
      <div class="field"><label>Кому</label><div class="chips">${S.contacts.map(c => `<button type="button" class="chip" data-act="tr-to" data-arg="${c}" aria-pressed="${t.to === c}">${CONTACTS[c].name}</button>`).join('')}</div></div>
      <div class="field"><label for="tr-amount">Сумма, ₽</label><input id="tr-amount" class="inp big num" inputmode="numeric" placeholder="0" value="${esc(t.amount)}"></div>
      <div class="field"><label for="tr-comment">Комментарий</label><input id="tr-comment" class="inp" maxlength="60" placeholder="Необязательно" value="${esc(t.comment)}"></div>
      <div class="note num">Доступно: ${fmt(S.balance)}</div>
      ${t.err ? `<div class="err">${t.err}</div>` : ''}
      <button class="btn wide" type="button" data-submit>Продолжить</button></form>`;
  }
  if (v === 'confirm') {
    const t = S.transfer;
    return bankTop('Подтверждение', 'transfer') + `<div class="confirm"><div class="note">Перевод</div><div class="big num">${fmt(t.amount)}</div><div>Получатель: <b>${CONTACTS[t.to].name}</b></div>${t.comment ? `<div class="note">«${esc(t.comment)}»</div>` : ''}</div>
      <div class="pad">${S.level > 1 ? '<div class="warnline">Проверь сумму и получателя. Отменить отправленный перевод нельзя.</div>' : ''}
      <div class="kv"><div><span>Комиссия</span><b>0 ₽</b></div><div><span>Останется на счёте</span><b class="num">${fmt(S.balance - t.amount)}</b></div></div>
      <button class="btn wide" data-act="tr-send">Перевести ${fmt(t.amount)}</button><button class="btn ghost wide" data-act="bank-go" data-arg="transfer">Изменить</button></div>`;
  }
  if (v === 'done') {
    const o = S.ops.find(x => x.id === S.route.id);
    return bankTop('Готово') + `<div class="confirm"><div class="okmark">${o.cancelled ? '↺' : '✓'}</div><div class="big num">${fmt(-o.amount)}</div><div>${o.cancelled ? 'Перевод отменён, деньги вернулись' : 'Перевод выполнен'} · ${esc(o.who)}</div></div>
      <div class="pad">${S.level === 1 && S.l1.wrong === o.id && !o.cancelled ? '<div class="warnline">Не та сумма или не тот получатель. Отмени перевод и попробуй ещё раз.</div>' : ''}${S.level === 1 && !o.cancelled ? `<button class="btn ghost wide" data-act="tr-cancel" data-arg="${o.id}">Отменить перевод</button><div class="note">На первом уровне перевод можно отменить. В реальности так не получится.</div>` : ''}
      <button class="btn wide" data-act="bank-go" data-arg="main">На главную</button></div>`;
  }
  if (v === 'request') {
    const t = S.req || (S.req = { to: '', sent: false });
    if (t.sent) return bankTop('Запрос денег') + `<div class="confirm"><div class="okmark">✓</div><div>Запрос на ${fmt(t.amount)} отправлен: ${CONTACTS[t.to].name}</div><div class="note">Деньги придут, только когда человек сам подтвердит запрос.</div></div><div class="pad"><button class="btn wide" data-act="req-reset">Новый запрос</button></div>`;
    return bankTop('Запрос денег') + `<form class="pad" id="req-form" autocomplete="off"><div class="note">Попроси перевести тебе деньги. Получатель увидит запрос и решит сам.</div>
      <div class="field"><label>У кого</label><div class="chips">${S.contacts.map(c => `<button type="button" class="chip" data-act="req-to" data-arg="${c}" aria-pressed="${t.to === c}">${CONTACTS[c].name}</button>`).join('')}</div></div>
      <div class="field"><label for="req-amount">Сумма, ₽</label><input id="req-amount" class="inp big num" inputmode="numeric" placeholder="0" value="${esc(t.amountDraft || '')}"></div>
      ${t.err ? `<div class="err">${t.err}</div>` : ''}<button class="btn wide" type="button" data-submit>Отправить запрос</button></form>`;
  }
  if (v === 'piggies') {
    const f = S.pform;
    const list = S.piggies.map(p => {
      const open = f && f.id === p.id;
      return `<div class="piggy"><div class="row"><span>${esc(p.name)}</span><b class="num">${fmt(p.amount)}</b></div>
        ${open ? `<form class="inline" id="pig-form"><input id="pig-val" class="inp ${f.mode === 'rename' ? '' : 'num'}" ${f.mode === 'rename' ? `value="${esc(p.name)}" maxlength="24"` : 'inputmode="numeric" placeholder="Сумма"'} aria-label="${f.mode === 'rename' ? 'Новое название' : 'Сумма'}"><button class="btn sm" type="button" data-submit>${f.mode === 'add' ? 'Внести' : f.mode === 'take' ? 'Снять' : 'Сохранить'}</button></form>${f.err ? `<div class="err">${f.err}</div>` : ''}`
          : `<div class="row-btns"><button class="btn sm" data-act="pig-form" data-arg="${p.id}" data-arg2="add">Пополнить</button><button class="btn sm ghost" data-act="pig-form" data-arg="${p.id}" data-arg2="take">Снять</button><button class="btn sm ghost" data-act="pig-form" data-arg="${p.id}" data-arg2="rename">Переименовать</button></div>`}</div>`;
    }).join('');
    const nf = f && f.id === 'new';
    return bankTop('Копилки') + `<div class="pad"><div class="note">Деньги в копилке не тратятся случайно: их видно отдельно от основного счёта.</div>${list}
      ${nf ? `<form class="piggy" id="pig-form"><label class="note" for="pig-val">Название копилки</label><input id="pig-val" class="inp" maxlength="24" placeholder="Например, «На наушники»"><button class="btn" type="button" data-submit>Создать</button>${f.err ? `<div class="err">${f.err}</div>` : ''}</form>`
        : `<button class="btn ghost wide" data-act="pig-new">+ Новая копилка</button>`}</div>`;
  }
  if (v === 'upcoming') {
    if (S.level === 2) { return bankTop('Платежи') + `<div class="pad"><div class="sec-h"><b>Обязательные платежи</b></div>
      <div class="kv"><div><span>День 3 · Аренда</span><b class="num">${fmt(-L2.rent.amount)}</b></div><div><span>Дни 3–13 · Еда и проезд, ≈1 100 ₽/день</span><b class="num">${fmt(-L2.living.total)}</b></div></div>
      <div class="sec-h"><b>Ожидаемые поступления</b></div><div class="kv"><div><span>День 14 · Стипендия и подработка</span><b class="num pos">${sfmt(L2.salary.amount)}</b></div></div>
      <div class="note">Поступление на 14-й день подтверждено. Обещания других людей сюда не попадают.</div></div>`; }
    if (S.level === 5) return bankTop('Платежи') + `<div class="pad"><div class="sec-h"><b>Обязательные платежи до 21-го</b></div>
      <div class="kv">${L5.pays.map(x => `<div><span>${x.day}-е · ${x.title}</span><b class="num">${fmt(-x.amount)}</b></div>`).join('')}<div><span>Каждый день · еда и проезд</span><b class="num">${fmt(-L5.food)}</b></div></div>
      <div class="sec-h"><b>Ожидаемые поступления</b></div>
      <div class="kv"><div><span>Заказчик · «на следующей неделе, наверное»</span><b class="num pos">${sfmt(L5.incomes.client.amount)}</b></div><div><span>Артём · долг, срока нет</span><b class="num pos">${sfmt(L5.incomes.artem.amount)}</b></div></div>
      <div class="warnline">Оба поступления только обещаны. Банк не знает, когда они придут.</div></div>`;
    return bankTop('Платежи и доход') + `<div class="pad"><div class="note">Доход от заказов на ближайшие полгода, по договорам с клиентами. Обязательные расходы — аренда, еда, связь.</div>
      <div class="tablewrap"><table class="mini num"><thead><tr><th>Месяц</th><th>Доход</th><th>Расходы</th></tr></thead><tbody>${L3.income.map((x, i) => `<tr><td>${i + 1}-й</td><td>${fmt(x)}</td><td>${fmt(L3.expenses)}</td></tr>`).join('')}</tbody></table></div>
      <div class="note">Без ноутбука часть заказов взять нельзя: около ${fmt(L3.lossWithoutLaptop)} дохода в месяц.</div></div>`;
  }
  if (v === 'loan') {
    const L = L5.loan;
    return bankTop('Займ до зарплаты') + `<div class="pad"><div class="note">Предложение твоего банка. Деньги приходят сразу на основной счёт.</div>
      <div class="kv"><div><span>Сумма</span><b class="num">${fmt(L.amount)}</b></div><div><span>Вернуть через ${L.days} дней</span><b class="num">${fmt(L.back)}</b></div><div><span>Переплата</span><b class="num">${fmt(L.back - L.amount)}</b></div></div>
      ${S.l5.loan ? '<div class="okline">Займ оформлен, деньги на счёте.</div>' : S.decision ? '' : '<button class="btn wide" data-act="loan-take">Оформить займ</button>'}</div>`;
  }
  return '';
}
function upcomingTeaser() {
  if (S.level === 4) return '';
  if (S.level === 6) return `<button class="kv" style="text-align:left;background:transparent" data-act="open-chat" data-arg="support"><div><span>💬 Чат с поддержкой банка</span><b>›</b></div></button>`;
  if (S.level === 5) return `<button class="kv" style="text-align:left;background:transparent" data-act="bank-go" data-arg="upcoming"><div><span>12-е · аренда</span><b class="num">${fmt(25000)}</b></div></button>
    <button class="kv" style="text-align:left;background:var(--coin-soft);border-color:transparent" data-act="bank-go" data-arg="loan"><div><span>Займ до зарплаты: ${fmt(L5.loan.amount)} сразу на счёт</span><b>›</b></div></button>`;
  if (S.level === 2) return `<button class="kv" style="text-align:left;background:transparent" data-act="bank-go" data-arg="upcoming"><div><span>Ближайший платёж: день 3, аренда</span><b class="num">${fmt(25000)}</b></div></button>`;
  return `<button class="kv" style="text-align:left;background:transparent" data-act="bank-go" data-arg="upcoming"><div><span>Обязательные расходы в месяц</span><b class="num">${fmt(L3.expenses)}</b></div></button>`;
}
function histList() {
  const q = S.hist.q.trim().toLowerCase();
  const inPeriod = d => {
    const p = S.hist.period; if (p === 'all' || S.level !== 1) return true;
    const day = +d.slice(8);
    return p === 'today' ? day === 25 : p === 'week' ? day >= 19 : true;
  };
  const list = S.ops.filter(o => (!q || o.title.toLowerCase().includes(q)) && (!S.hist.cat || o.cat === S.hist.cat) && inPeriod(o.date));
  if (!list.length) return '<div class="note" style="padding:12px 6px">Ничего не нашлось. Попробуй другое слово или сбрось фильтр.</div>';
  let out = '', last = '';
  for (const o of list) { const l = dayLabel(o.date); if (l !== last) { out += `<div class="daylabel">${l}</div>`; last = l; } out += opRow(o); }
  return out;
}

/* ---------- chat ---------- */
function chatView() {
  const id = S.route.id;
  if (!id) {
    const ids = Object.keys(S.chats);
    return `<div class="topbar"><h3>Чаты</h3></div><div class="chats">${ids.map(c => {
      const ch = S.chats[c], last = [...ch.msgs].reverse().find(m => m.from !== 'sys') || { text: '' };
      const pre = last.from === 'me' ? 'Ты: ' : last.who ? CONTACTS[last.who].name + ': ' : '';
      return `<button class="c" data-act="open-chat" data-arg="${c}"><span class="ava" style="background:${CONTACTS[c].color}">${CONTACTS[c].name[0]}</span><span class="t"><b>${CONTACTS[c].name}</b><small>${esc(pre + last.text)}</small></span>${ch.unread ? '<span class="unread"></span>' : ''}</button>`;
    }).join('')}</div>`;
  }
  const ch = S.chats[id];
  const pinnable = S.level === 4 && id === 'trip';
  const msgs = ch.msgs.map((m, i) => {
    if (m.from === 'sys') return `<div class="b sys">${esc(m.text)}</div>`;
    const who = ch.group && m.from === 'them' ? `<span class="who">${CONTACTS[m.who].name}</span>` : '';
    if (pinnable) return `<button class="b ${m.from} pinb ${m.pinned ? 'pinned' : ''}" data-act="pin" data-arg="${i}">${who}${esc(m.text)}${m.pinned ? '<span class="pinmark">📌</span>' : ''}</button>`;
    const link = m.link ? '<button class="linkbtn" data-act="open-web">dengi-srazu.top/zaym</button>' : '';
    return `<div class="b ${m.from}">${who}${esc(m.text)}${link}</div>`;
  }).join('') + (S.typing === id ? `<div class="typing">${ch.group ? 'Кто-то' : CONTACTS[id].name} печатает…</div>` : '');
  let quick = '', compose = '';
  if (id === 'artem' && S.level === 2) {
    if (!S.decision && S.l2.msgs < 30) compose = `<form class="compose" id="chat-form" autocomplete="off"><input id="chat-in" class="inp" maxlength="200" placeholder="Напиши Артёму…" ${S.typing ? 'disabled' : ''}><button class="btn" type="button" data-submit ${S.typing ? 'disabled' : ''} aria-label="Отправить">↑</button></form>`;
    else if (!S.decision && S.l2.msgs >= 30) compose = '<div class="note" style="padding:4px 14px">Лимит сообщений исчерпан. Прими решение.</div>';
  } else if (S.level === 1 && ch.quick && ch.quick.length) {
    quick = `<div class="quick">${ch.quick.map(x => `<button data-act="say1" data-arg="${id}:${x.id}" ${S.typing ? 'disabled' : ''}>${esc(x.text)}</button>`).join('')}</div>`;
  }
  if ((S.level === 5 || S.level === 6) && !ch.blocked) {
    const clip = S.level === 6 && id === 'elena' && !S.l6.passportSent ? `<button class="btn ghost" type="button" data-act="send-passport" title="Отправить фото паспорта" aria-label="Отправить фото паспорта" ${S.typing ? 'disabled' : ''}>📎</button>` : '';
    compose = `<form class="compose" id="chat-form" autocomplete="off">${clip}<input id="chat-in" class="inp" maxlength="300" placeholder="${ch.group ? 'Напиши в общий чат…' : 'Напиши сообщение…'}" ${S.typing ? 'disabled' : ''}><button class="btn" type="button" data-submit ${S.typing ? 'disabled' : ''} aria-label="Отправить">↑</button></form>`;
  }
  const tip = pinnable && !S.decision ? '<div class="note" style="padding:6px 14px 0">Нажми на сообщение, чтобы отметить его как важное. Отмеченное попадает в «Заметки».</div>' : '';
  return `<div class="topbar"><button class="back" data-act="open-app" data-arg="chat">‹</button><span class="ava" style="background:${CONTACTS[id].color};width:32px;height:32px;font-size:13px">${CONTACTS[id].name[0]}</span><h3>${CONTACTS[id].name}</h3></div>
    ${tip}<div class="msgs">${msgs}</div>${quick}${compose}`;
}

const L2Q = {
  purpose: 'А на что тебе?', real: 'Сколько точно нужно?', deadline: 'Когда сможешь вернуть?', source: 'Из каких денег вернёшь?',
  offer: 'Столько у меня свободно нет. Могу дать меньше', postpone: 'Давай я вечером отвечу', refuse: 'Извини, сейчас не могу одолжить',
};
function l2Quick() {
  if (S.decision) return [];
  const asked = S.l2.asked || (S.l2.asked = new Set());
  const qs = ['purpose', 'real', 'deadline', 'source'].filter(f => !asked.has(f)).slice(0, 2);
  const extra = [];
  if (!S.l2.offered) extra.push('offer');
  if (!S.l2.postponed && qs.length + extra.length < 3) extra.push('postpone');
  const ids = [...qs, ...extra].slice(0, 3).concat('refuse');
  return S.l2.msgs >= 30 ? [{ id: 'refuse', text: L2Q.refuse }] : ids.map(id => ({ id, text: L2Q[id] }));
}

/* ---------- shop ---------- */
function shopView() {
  const sh = S.shop, o = L3.offers, inst = o.inst;
  const instTotal = inst.n * (inst.pay + (sh.protection ? inst.protection : 0));
  if (sh.checkout) {
    const c = sh.checkout;
    const title = c === 'inst' ? '«Модель Про» в рассрочку' : c === 'base' ? '«Модель Базовая»' : '«Модель Про»';
    const pay = c === 'inst' ? `<div class="kv"><div><span>Срок</span><b>6 месяцев</b></div><div><span>Платёж по рассрочке</span><b class="num">${fmt(inst.pay)}/мес</b></div>${sh.protection ? `<div><span>Защита покупки</span><b class="num">${fmt(inst.protection)}/мес</b></div>` : ''}<div><span>Ежемесячно</span><b class="num">${fmt(inst.pay + (sh.protection ? inst.protection : 0))}</b></div></div>
      <label class="check"><input type="checkbox" id="prot" ${sh.protection ? 'checked' : ''}> <span>Подключить «Защиту покупки» — ${inst.protection.toLocaleString('ru-RU')} ₽ в месяц на весь срок рассрочки</span></label>`
      : `<div class="kv"><div><span>К оплате сейчас</span><b class="num">${fmt(c === 'base' ? o.base : o.pro)}</b></div><div><span>Останется на счёте</span><b class="num">${fmt(S.balance - (c === 'base' ? o.base : o.pro))}</b></div></div>`;
    return `<div class="topbar"><button class="back" data-act="shop-back">‹ Назад</button><h3>Оформление</h3></div><div class="pad"><h4 style="margin:0">${title}</h4>${pay}
      ${sh.err ? `<div class="err">${sh.err}</div>` : ''}<button class="btn wide" data-act="shop-buy">${c === 'inst' ? 'Оформить рассрочку' : 'Оплатить'}</button></div>`;
  }
  return `<div class="topbar"><h3>Техносад</h3></div><div class="pad">
    <div class="prod"><div class="pic"><i></i></div><h4>Ноутбук «Модель Про»</h4><div class="note">16 ГБ, 14 дюймов. Тянет всё, что нужно для заказов, и с запасом.</div>
      <div class="promo">0%, всего 10 000 ₽ в месяц</div>
      ${sh.open === 'inst' ? `<div class="terms"><b>Полные условия рассрочки</b><span>6 платежей по 10 000 ₽, первый — через месяц.</span><span>«Защита покупки» — 1 490 ₽ в месяц, подключена по умолчанию, её можно отключить при оформлении.</span><span class="num">Итого с защитой: ${fmt(inst.n * (inst.pay + inst.protection))}. Без защиты: ${fmt(inst.n * inst.pay)}.</span></div>` : `<button class="link" style="align-self:flex-start" data-act="shop-terms">Полные условия</button>`}
      <div class="row-btns"><button class="btn" data-act="shop-check" data-arg="inst">Оформить рассрочку</button></div></div>
    <div class="prod"><div class="pic"><i></i></div><h4>Ноутбук «Модель Про»</h4><div class="price num">${fmt(o.pro)}</div><div class="note">Оплата полностью при покупке.</div>
      <div class="row-btns"><button class="btn ghost" data-act="shop-check" data-arg="pro_cash">Купить сразу</button></div></div>
    <div class="prod"><div class="pic"><i style="width:84px;height:50px"></i></div><h4>Ноутбук «Модель Базовая»</h4><div class="price num">${fmt(o.base)}</div><div class="note">8 ГБ, 15 дюймов. Для рабочих задач хватает. Оплата полностью.</div>
      <div class="row-btns"><button class="btn ghost" data-act="shop-check" data-arg="base">Купить сразу</button></div></div>
    <button class="btn ghost wide" data-act="shop-postpone">Отложить покупку на полгода</button>
    ${sh.msg ? `<div class="err">${sh.msg}</div>` : ''}</div>`;
}

/* ---------- calc & notes ---------- */
function calcView() {
  const k = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '0', '000', '⌫', '='];
  return `<div class="topbar"><h3>Калькулятор</h3></div><div class="calc"><div class="expr">${esc(S.calc.expr) || '&nbsp;'}</div><div class="disp num">${esc(S.calc.out)}</div>
    <div class="keys">${k.map(x => `<button data-act="calc" data-arg="${x}" class="${'÷×−+()'.includes(x) ? 'op' : x === '=' ? 'eq' : ''}">${x}</button>`).join('')}</div></div>`;
}
function notesView() {
  return `<div class="topbar"><h3>Заметки</h3></div><div class="pad" style="flex:1"><label class="note" for="notes">Записывай, что выяснил и что посчитал. Заметки видишь только ты.</label><textarea id="notes" class="inp" style="flex:1;min-height:300px;resize:none">${esc(S.notes)}</textarea></div>`;
}
function calcEval(s) {
  const t = s.replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  let i = 0;
  const peek = () => t[i], num = () => { let st = i; while (/[\d.]/.test(t[i] || '')) i++; if (st === i) throw 0; return parseFloat(t.slice(st, i)); };
  const factor = () => { if (peek() === '(') { i++; const v = expr(); if (t[i++] !== ')') throw 0; return v; } if (peek() === '-') { i++; return -factor(); } return num(); };
  const term = () => { let v = factor(); while (peek() === '*' || peek() === '/') { const o = t[i++]; const r = factor(); v = o === '*' ? v * r : v / r; } return v; };
  const expr = () => { let v = term(); while (peek() === '+' || peek() === '-') { const o = t[i++]; const r = term(); v = o === '+' ? v + r : v - r; } return v; };
  const v = expr(); if (i !== t.length || !Number.isFinite(v)) throw 0; return Math.round(v * 100) / 100;
}

/* ===================== level 2: Artyom ===================== */
function addMsg(chat, from, text) { S.chats[chat].msgs.push({ from, text }); }
/* lines: 'text' or [whoKey, 'text'] for group chats */
function botSays(chat, lines, after) {
  const st = S;
  S.typing = chat; render();
  setTimeout(() => {
    if (S !== st) return;
    S.typing = false;
    for (const l of lines) {
      if (Array.isArray(l)) S.chats[chat].msgs.push({ from: 'them', who: l[0], text: l[1] });
      else addMsg(chat, 'them', l);
    }
    if (S.route.app !== 'chat' || S.route.id !== chat) {
      S.chats[chat].unread = (S.chats[chat].unread || 0) + lines.length;
      const last = lines[lines.length - 1];
      showToast('Чаты', (Array.isArray(last) ? CONTACTS[last[0]].name + ': ' + last[1] : CONTACTS[chat].name + ': ' + last), 'open-chat', chat);
    }
    after && after(); render();
  }, 650 + Math.random() * 600);
}
function botChain(chat, lines, after) {
  if (!lines.length) { after && after(); render(); return; }
  botSays(chat, [lines[0]], () => botChain(chat, lines.slice(1), after));
}
function artemSays(lines, after) { botSays('artem', lines, after); }

function sayL2(id) {
  if (S.decision || S.typing) return;
  const V = L2.variants[S.variant];
  S.l2.msgs++;
  addMsg('artem', 'me', L2Q[id]);
  if (L2.facts[id]) {
    S.l2.asked.add(id);
    return artemSays([V.answers[id]], () => reveal(id));
  }
  if (id === 'offer') {
    S.l2.offered = true;
    const r = { reliable: ['Понимаю. Давай сколько сможешь, остальное попрошу у брата'], uncertain: ['Ну… давай сколько есть'], reserve: [(S.facts.has('real') || (S.l2.asked && S.l2.asked.has('real'))) ? 'Да, давай 10 000, мне этого хватит' : 'Если честно, 10 000 хватит. 15 я просил с запасом'] }[S.variant];
    return artemSays(r, () => { if (S.variant === 'reserve') reveal('real'); });
  }
  if (id === 'postpone') {
    S.l2.postponed = true;
    const st = S;
    return artemSays(['Ок, жду'], () => setTimeout(() => {
      if (S !== st || S.decision) return;
      S.clock = '21:00';
      const ping = { reliable: 'Ну что, получится? Хозяйка ждёт до пятницы', uncertain: 'Ау 🙂 Ну так что?', reserve: 'Слушай, если 15 много — скажи, может, и меньше хватит' }[S.variant];
      artemSays([ping]);
    }, 900));
  }
  if (id === 'refuse') {
    decideRefuse();
    const r = { reliable: ['Понял… Ладно, поищу ещё у кого-нибудь'], uncertain: ['Ну ок. Понятно'], reserve: ['Эх. Ладно, понял'] }[S.variant];
    return artemSays(r);
  }
}

function decideRefuse() {
  if (S.decision) return;
  S.decision = { type: 'refuse' };
  S.l2.mood = S.variant === 'uncertain' ? 'ok' : 'hurt';
  track('decision_made', { level: 2, decision: 'refuse', amount: 0, variant: S.variant });
}
function onLend(amount) {
  const lessThanAsk = amount < L2.ask;
  S.decision = { type: 'lend', amount };
  S.l2.mood = 'happy';
  track('decision_made', { level: 2, decision: 'lend', amount, variant: S.variant });
  let r;
  if (!lessThanAsk) r = ['Спасибо огромное! Ты меня спас 🙏'];
  else r = { reliable: ['Спасибо! Остальное займу у брата'], uncertain: ['Ну… ладно, спасибо'], reserve: [amount >= 10000 ? 'О, этого как раз хватит! Спасибо!' : 'Спасибо! Остальное поищу'] }[S.variant];
  if (amount < 10000 && S.variant !== 'reserve' && lessThanAsk) S.l2.mood = 'ok';
  const st = S; setTimeout(() => { if (S === st) artemSays(r); }, 400);
}

const BAD_WORDS = /(бля|хуй|хуе|пизд|ёб|еба|ебл|сука|мудак|дебил|идиот|урод)/i;
const BRANDS = /(сбер|тинько|т-банк|втб|альфа|газпромб|озон|ozon|wildberries|вайлдбер|киви|qiwi|юмани|yoomoney|kaspi|каспи|paypal|visa|mastercard|мир\b)/i;

function classify(text) {
  const t = text.toLowerCase();
  if (/(зачем|на что|для чего|что случилось|что за)/.test(t)) return 'purpose';
  if (/(когда|срок|к какому|до какого)/.test(t)) return 'deadline';
  if (/(откуда|из каких|с чего|как вернёшь|как вернешь|зарплат|чем отдашь)/.test(t)) return 'source';
  if (/(сколько|точно|меньше|хватит ли|а если)/.test(t)) return 'real';
  return null;
}

async function freeSay(text) {
  if (S.decision || S.typing || !text.trim()) return;
  S.l2.msgs++;
  return freeChat('artem', text);
}

/* Free-text chat for levels 2-5: the server answers in character; if it fails, scripted replies take over */
function chatState(chat) {
  const known = [...S.facts];
  if (S.level === 2) return { variant: S.variant, known };
  if (S.level === 4) { const l = S.l4; return { known, cancelled: l.cancelled, proposals: l.proposals, agreed: !!S.decision }; }
  if (S.level === 5) { const l = S.l5; return { known, landlord: l.landlord, job: l.job, scamPaid: l.scamPaid, scammed: l.scammed }; }
  if (S.level === 6) { const l = S.l6; return { known, passportSent: l.passportSent, codeSent: l.codeSent, wave: l.wave, lost: l.lost }; }
  return { known };
}
async function freeChat(chat, text) {
  text = String(text || '').trim().slice(0, 300);
  if (!text || S.typing) return;
  const ch = S.chats[chat];
  addMsg(chat, 'me', text); ch.read = true;
  track('chat_free', { level: S.level, chat, ai: aiOn() });
  if (S.level === 6) checkCode(chat, text);
  if (BAD_WORDS.test(text)) return botSays(chat, [ch.group ? ['max', 'Эй, давайте без этого 🙃'] : 'Давай без этого, ладно?']);
  if (!aiOn()) return scriptedChat(chat, text);
  const st = S;
  S.typing = chat; render();
  try {
    const ctrl = new AbortController(); const timer = setTimeout(() => ctrl.abort(), 25000);
    const res = await fetch('/api/chat', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
      body: JSON.stringify({ level: S.level, chat, history: ch.msgs.slice(-40).map(m => ({ from: m.from, who: m.who, text: m.text })), state: chatState(chat) }),
    });
    clearTimeout(timer);
    const data = await res.json().catch(() => ({}));
    if (res.status === 503) { AIC.on = false; throw new Error('ИИ не настроен на сервере'); }
    if (!res.ok || !Array.isArray(data.messages) || !data.messages.length) throw new Error(data.error || 'HTTP ' + res.status);
    if (S !== st) return;
    S.typing = false; AIC.fails = 0;
    for (const m of data.messages) {
      if (ch.group) ch.msgs.push({ from: 'them', who: m.who, text: m.text }); else addMsg(chat, 'them', m.text);
    }
    for (const k of data.revealed || []) onReveal(chat, k);
    if (S.route.app !== 'chat' || S.route.id !== chat) {
      ch.unread = (ch.unread || 0) + data.messages.length;
      const last = data.messages[data.messages.length - 1];
      showToast('Чаты', (ch.group ? CONTACTS[last.who].name : CONTACTS[chat].name) + ': ' + last.text, 'open-chat', chat);
    }
    render();
  } catch (e) {
    if (S !== st) return;
    S.typing = false; AIC.fails++;
    track('ai_fallback', { level: S.level, chat, reason: String(e && e.message || e).slice(0, 80) });
    scriptedChat(chat, text);
  }
}
function onReveal(chat, k) {
  if (S.level === 2) { if (k === 'refused') return decideRefuse(); if (!L2.facts[k]) return; (S.l2.asked || (S.l2.asked = new Set())).add(k); reveal(k); return; }
  if (S.level === 4) { if (['lesha', 'anya', 'dima'].includes(k)) reveal(k); return; }
  if (S.level === 5) {
    const l = S.l5, ch = S.chats[chat];
    if (k === 'landlord' && chat === 'galina' && !l.landlord) { l.landlord = true; l.plan.rent = true; ch.quick = []; reveal(k); }
    if (k === 'job' && chat === 'zerno' && !l.job) { l.job = true; l.plan.job = true; ch.quick = []; reveal(k); }
    if (k === 'scam' && chat === 'srazu') reveal(k);
  }
  if (S.level === 6) {
    if ((k === 'starosta' && chat === 'katya') || (k === 'official' && chat === 'dekanat') || (k === 'bank' && chat === 'support')) reveal(k);
  }
}
/* Scripted replies when the AI is unavailable: rotate lines so the same text is not repeated */
const FALLBACK = {
  4: [['max', 'Давайте посчитаем в «Поездке» и скинь вариант сюда, чтобы все подтвердили 🙂'], ['lesha', 'Я так и не понял, сколько с меня в итоге'], ['anya', 'Ребят, простите ещё раз 😔'], ['max', 'Не понял, ты о чём? 😅']],
  pixel: ['Пока не могу сказать точно. Как только бухгалтерия оплатит — сразу переведу', 'Понимаю, что вам неудобно. Я ещё раз напомню бухгалтерии', 'Точной даты у меня, к сожалению, нет', 'Не совсем поняла вас. Можете уточнить?'],
  galina: ['Слушаю вас. Что вы хотели?', 'Не совсем поняла. Вы про оплату за комнату?', 'Напоминаю: оплата 12-го'],
  zerno: ['Так что, выйдешь 13-го и 14-го?', 'Не поняла 🙂 Ты про смены?', 'Мне нужен ответ до пятницы, ок?'],
  artem: ['Слушай, сейчас никак 😔 Может, в конце месяца', 'Я помню про долг, честно', 'Не понял, ты о чём? 🙂'],
  srazu: ['Одобрение действует 15 минут! Оплатите оформление по ссылке выше 👆', 'У нас всё официально, не переживайте!', 'Осталось совсем немного времени, успейте оформить 💸'],
  elena: ['Василий, время идёт! Пришлите, пожалуйста, код из SMS', 'Это обычная процедура, остальные студенты делегации уже всё прислали', 'Декан лично просил вас включить, не подводите нас 🙏'],
  katya: ['Впервые слышу про делегацию 🤔 Нам ничего не присылали', 'Странно это. Напиши в официальный чат деканата, они ответят', 'Не знаю, Вась, у меня таких сообщений не было'],
  dekanat: ['Деканат никакой делегации не собирает. Мы не просим фото паспорта и коды из SMS в мессенджерах', 'Похожие сообщения уже приходили другим студентам, это мошенники. Никому не сообщайте коды'],
  mama: ['Ой, Вась, странно это. Позвони в деканат сам, по номеру с сайта', 'Только никому никакие коды не говори, сынок!', 'Береги себя, покушай обязательно'],
  support: ['Банк никогда не просит переводить деньги на «защищённый счёт». Если вам так говорят, это мошенники', 'По вашим счетам всё в порядке, кредитов на вас не оформлялось', 'Никому не сообщайте коды из SMS и не переводите деньги по просьбе звонящих'],
  sb: ['Время идёт, кредит вот-вот одобрят! Срочно переведите средства на защищённый счёт', 'Не звоните никуда, линия банка может прослушиваться', 'Переведите все накопления, включая копилку. Это временно, деньги вернутся'],
};
const L6_ASK = {
  starosta: /(делегац|депутат|деканат|встреч|паспорт|слышал|знаешь)/,
  official: /(делегац|депутат|паспорт|код|встреч|елен|правда|пишут|сообщени)/,
  bank: /(безопас|защищ|кредит|сч[её]т|перев|звон|служб|мошен)/,
};
function pickLine(chat, list) {
  const said = S.chats[chat].msgs.filter(m => m.from === 'them').slice(-3).map(m => m.text);
  const fresh = list.filter(l => !said.includes(Array.isArray(l) ? l[1] : l));
  const pool = fresh.length ? fresh : list;
  return pool[Math.floor(Math.random() * pool.length)];
}
function scriptedChat(chat, text) {
  const t = text.toLowerCase();
  if (S.level === 2) return scriptedFree(text);
  if (S.level === 4) return botSays('trip', [pickLine('trip', FALLBACK[4])]);
  if (S.level === 6) {
    const key = { katya: 'starosta', dekanat: 'official', support: 'bank' }[chat];
    const lines = FALLBACK[chat] || ['Хорошо'];
    const line = chat === 'elena' && S.l6.codeSent ? 'Спасибо! Вы в списке делегации 🎉 Подробности пришлю завтра' : key && L6_ASK[key].test(t) ? lines[0] : pickLine(chat, lines);
    return botSays(chat, [line], () => { if (key && L6_ASK[key].test(t)) reveal(key); });
  }
  if (S.level === 5) {
    const l = S.l5, ch = S.chats[chat], has = id => (ch.quick || []).some(x => x.id === id);
    if (chat === 'galina' && !l.landlord && /(част|раздел|половин|перенес|перенест|подожд|отсроч|позже)/.test(t)) return onQuick5('galina', /(всю|целиком|полностью)/.test(t) ? 'all' : 'part');
    if (chat === 'zerno' && !l.job) {
      if (/(не смогу|нет|не могу|занят)/.test(t)) return onQuick5('zerno', 'no');
      if (/(^да|выйду|смогу|могу|ок|согла|давай|запиши)/.test(t)) return onQuick5('zerno', 'yes');
    }
    if (chat === 'artem' && has('debt')) return onQuick5('artem', 'debt');
    if (chat === 'pixel' && has('when')) return onQuick5('pixel', 'when');
    return botSays(chat, [pickLine(chat, FALLBACK[chat] || ['Хорошо, поняла вас.'])]);
  }
}
function scriptedFree(text) {
  const V = L2.variants[S.variant];
  if (/(не (могу|дам|получится|выйдет|одолжу|смогу)|нет денег|откаж|извини,? нет)/i.test(text)) {
    decideRefuse();
    return artemSays([{ reliable: 'Понял… Ладно, поищу ещё у кого-нибудь', uncertain: 'Ну ок. Понятно', reserve: 'Эх. Ладно, понял' }[S.variant]]);
  }
  S.l2.asked = S.l2.asked || new Set();
  const f = classify(text);
  if (f) { S.l2.asked.add(f); return artemSays([V.answers[f]], () => reveal(f)); }
  return artemSays([pickLine('artem', { reliable: ['Так что, сможешь помочь?', 'Не понял, если честно 🙂 Выручишь?', 'Мне правда очень нужно до пятницы'], uncertain: ['Да ладно тебе, ну так что?', 'Чего? 😅 Так выручишь или нет?', 'Ну очень надо, честно'], reserve: ['Ну что скажешь?', 'Не понял 🙂 Так поможешь?', 'Если что, могу объяснить, на что'] }[S.variant])]);
}

/* ===================== results ===================== */
function openModal(html) { const m = $('#modal'); m.innerHTML = `<div class="sheet">${html}</div>`; m.hidden = false; m.scrollTop = 0; }
function closeModal() { $('#modal').hidden = true; }

function finishL1() {
  S.finished = true; progress.done[1] = true; store.set(progress);
  track('level_complete', { level: 1, sec: Math.round((Date.now() - S.started) / 1000), attempt: S.attempt });
  openModal(`<span class="eyebrow">Уровень 1 пройден</span><h2>Ты умеешь</h2>
    <ul class="skills"><li><i class="tick" style="background:var(--good);border-color:var(--good);color:var(--paper)">✓</i>Находить поступления и смотреть, от кого и зачем пришли деньги</li>
    <li><i class="tick" style="background:var(--good);border-color:var(--good);color:var(--paper)">✓</i>Переводить по контакту и проверять сумму на экране подтверждения</li>
    <li><i class="tick" style="background:var(--good);border-color:var(--good);color:var(--paper)">✓</i>Искать покупки в истории по названию и категории</li>
    <li><i class="tick" style="background:var(--good);border-color:var(--good);color:var(--paper)">✓</i>Откладывать деньги в копилку</li></ul>
    <p>Дальше кнопки будут знакомые, а правильный ответ — нет. И отменить перевод уже не получится.</p>
    <div class="btns"><button class="btn" data-act="level" data-arg="2">Уровень 2: друг просит в долг →</button><button class="btn ghost" data-act="level" data-arg="1">Пройти ещё раз</button></div>`);
}

function feedHtml(items, unit) {
  return `<div class="feed">${items.map(e => `<div class="${e.kind || ''}"><span class="d">${unit(e)}</span><span class="x">${esc(e.text)}</span><span class="m num">${e.amount ? sfmt(e.amount) : ''}</span></div>`).join('')}</div>`;
}

function finishL2() {
  const V = L2.variants[S.variant];
  const lent = S.decision.type === 'lend' ? S.decision.amount : 0;
  const start = S.balance + lent + piggyTotal();
  const r = outcome2(S.variant, lent, start);
  const got = S.facts.size;
  S.result = r; S.finished = true; progress.done[2] = true; store.set(progress);
  track('outcome_shown', { level: 2, stability: r.status, awareness: `${got}/4` });
  track('level_complete', { level: 2, sec: Math.round((Date.now() - S.started) / 1000), attempt: S.attempt });
  const free = r.free;
  const forks = [];
  if (lent > free) {
    forks.push(`Главная развилка — сумма. Свободных денег после аренды и еды было <b class="num">${fmt(Math.max(free, 0))}</b>. Всё, что сверх этого, вернулось бы к тебе только если Артём отдаст вовремя: обещанные деньги — ещё не деньги на счёте.`);
    if (!S.facts.has('deadline')) forks.push(`Вопрос «Когда сможешь вернуть?» показал бы: «${esc(V.answers.deadline)}».`);
    if (S.variant === 'reserve' && !S.facts.has('real')) forks.push(`Вопрос «Сколько точно нужно?» показал бы, что хватило бы 10 000 ₽.`);
  } else if (lent > 0) forks.push(`Ты перевёл не больше, чем было свободно (<b class="num">${fmt(free)}</b>). Аренда и еда были защищены при любом поведении Артёма.`);
  else {
    forks.push('Отказ сохранил деньги на аренду и еду.');
    if (S.variant !== 'uncertain') forks.push(`При этом без риска можно было помочь суммой до <b class="num">${fmt(free)}</b>: это свободные деньги после всех обязательных трат.${S.variant === 'reliable' ? ' Вопросы о сроке и источнике показали бы, что Артём надёжен.' : ''}`);
  }
  if (r.later.length) forks.push(`После 14-го дня: ${r.later.map(x => `на ${x.day}-й день — ${x.text.toLowerCase()} (${fmt(x.amount)})`).join('; ')}.`);
  const mood = { hurt: 'Артём расстроился, но дружба на этом не закончилась. Помощь другим — не ошибка, а отказ — тоже нормальное решение.', ok: 'С Артёмом всё в порядке.', happy: 'Артём благодарен тебе.' }[S.l2.mood];
  openModal(`<span class="eyebrow">Уровень 2 · разбор через 14 дней</span><h2>${lent ? `Ты одолжил ${fmt(lent)}` : 'Ты отказал Артёму'}</h2>
    <div class="scales"><div class="scale ${r.status}"><span class="eyebrow">Устойчивость</span><b>${STATUS[r.status]}</b><span class="note">${r.status === 'ok' ? 'Все платежи прошли без расчёта на чужие обещания.' : r.status === 'edge' ? 'Платежи прошли, но только благодаря возврату долга. Задержи Артём деньги — план бы сломался.' : 'Как минимум один обязательный платёж не прошёл.'}</span></div>
    <div class="scale"><span class="eyebrow">Осведомлённость</span><b class="num">Выяснено ${got} из 4</b><span class="note">Ключевые условия, которые ты узнал до решения.</span></div></div>
    <div class="card"><span class="eyebrow">Что происходило со счётом</span>
      <div class="kv"><div><span>На счету в начале</span><b class="num">${fmt(start)}</b></div><div><span>Минимальный остаток</span><b class="num">${fmt(Math.max(r.min, 0))}</b></div><div><span>На счету на 14-й день</span><b class="num">${fmt(r.end)}</b></div></div>
      ${feedHtml(r.feed, e => e.to && e.to !== e.day ? `дни ${e.day}–${e.to}` : `день ${e.day}`)}</div>
    <div class="card"><span class="eyebrow">Развилка</span><div class="fork">${forks.map(f => `<p>${f}</p>`).join('')}</div></div>
    <div class="card"><span class="eyebrow">Что было на самом деле · вариант «${V.name}»</span><p style="margin:0">${V.truth}</p>
      <ul class="facts">${Object.entries(L2.facts).map(([k, n]) => `<li><i class="tick" style="${S.facts.has(k) ? 'background:var(--good);border-color:var(--good);color:var(--paper)' : ''}">${S.facts.has(k) ? '✓' : ''}</i><span>${n}<small>«${esc(V.answers[k])}»</small></span></li>`).join('')}</ul>
      <p class="note" style="margin:0">${mood}</p></div>
    <div class="btns"><button class="btn" data-act="level" data-arg="3">Уровень 3: ноутбук →</button><button class="btn ghost" data-act="level" data-arg="2">Переиграть (Артём может оказаться другим)</button></div>`);
}

function finishL3() {
  const d = S.decision;
  const r = run3(d);
  const got = S.facts.size;
  S.result = r; S.finished = true; progress.done[3] = true; store.set(progress);
  track('outcome_shown', { level: 3, stability: r.status, awareness: `${got}/2` });
  track('level_complete', { level: 3, sec: Math.round((Date.now() - S.started) / 1000), attempt: S.attempt });
  const names = { inst: d.protection ? 'Рассрочка с «Защитой покупки»' : 'Рассрочка без «Защиты покупки»', base: '«Модель Базовая» сразу', postpone: 'Отложить покупку' };
  const alts = [{ type: 'inst', protection: false }, { type: 'inst', protection: true }, { type: 'base' }, { type: 'postpone' }].map(x => ({ x, r: run3(x) }));
  const altName = x => x.type === 'inst' ? (x.protection ? 'Рассрочка с защитой' : 'Рассрочка без защиты') : x.type === 'base' ? '«Базовая» сразу' : 'Отложить';
  const minIdx = r.rows.reduce((mi, row, i) => row.bal < r.rows[mi].bal ? i : mi, 0);
  const forks = [];
  if (d.type === 'inst' && d.protection) forks.push(`«Защита покупки» была включена по умолчанию. Она стоит ${fmt(1490)} × 6 = <b class="num">${fmt(r.overpay)}</b>, и это видно только в полных условиях и на экране оформления. Реклама «0%» правдива, а итоговая сумма — ${fmt(68940)}.`);
  if (d.type === 'inst' && !d.protection) forks.push('Ты отключил «Защиту покупки» и заплатишь ровно цену ноутбука. Платёж 10 000 ₽ выдерживает даже 4-й месяц с доходом 39 000 ₽.');
  if (d.type === 'base') forks.push(`«Базовая» дешевле, но после покупки на счету осталось <b class="num">${fmt(r.min)}</b> — ниже подушки ${fmt(L3.cushion)}. Любая неожиданная трата в первый месяц сломала бы план. Дешевле — не всегда устойчивее.`);
  if (d.type === 'postpone') forks.push(`Без ноутбука ты терял около ${fmt(L3.lossWithoutLaptop)} в месяц: за полгода это <b class="num">${fmt(r.lost)}</b>. Это больше любой переплаты по рассрочке, а ноутбука так и нет.`);
  if (!S.facts.has('conds')) forks.push('Ты не открывал «Полные условия». Именно там написано про платную защиту и итоговую сумму.');
  if (!S.facts.has('lowmonth')) forks.push('Доход по месяцам лежал в «Пятаке» → «Платежи». Самый бедный месяц — 4-й, 39 000 ₽.');
  openModal(`<span class="eyebrow">Уровень 3 · разбор через 6 месяцев</span><h2>${names[d.type]}</h2>
    <div class="scales"><div class="scale ${r.status}"><span class="eyebrow">Устойчивость</span><b>${STATUS[r.status]}</b><span class="note">${r.status === 'ok' ? `Все платежи прошли, остаток не опускался ниже подушки ${fmt(L3.cushion)}.` : r.status === 'edge' ? (d.type === 'postpone' ? 'Платежи прошли, но потеря дохода больше любой переплаты.' : `Платежи прошли, но остаток падал ниже подушки ${fmt(L3.cushion)}.`) : 'Как минимум один обязательный платёж не прошёл.'}</span></div>
    <div class="scale"><span class="eyebrow">Осведомлённость</span><b class="num">Выяснено ${got} из 2</b><span class="note">${Object.entries(FACTS3).map(([k, n]) => `${S.facts.has(k) ? '✓' : '✗'} ${n}`).join('<br>')}</span></div></div>
    <div class="card"><span class="eyebrow">Счёт по месяцам</span><div class="tablewrap"><table class="mini num"><thead><tr><th>Месяц</th><th>Доход</th><th>Расходы</th><th>Платёж</th><th>Остаток</th></tr></thead>
      <tbody>${r.rows.map((x, i) => `<tr class="${i === minIdx ? 'minrow' : ''}"><td>${x.m === 0 ? 'Покупка' : x.m + '-й'}</td><td>${x.income ? fmt(x.income) : '—'}</td><td>${x.expenses ? fmt(x.expenses) : '—'}</td><td>${x.pay ? fmt(x.pay) : '—'}</td><td>${fmt(x.bal)}</td></tr>`).join('')}</tbody></table></div>
      <div class="note">Жирным — месяц с минимальным остатком.</div></div>
    <div class="card"><span class="eyebrow">Развилка</span><div class="fork">${forks.map(f => `<p>${f}</p>`).join('')}</div></div>
    <div class="card"><span class="eyebrow">Как было бы при других решениях</span><div class="tablewrap"><table class="mini num"><thead><tr><th>Решение</th><th>Мин. остаток</th><th>Итог</th></tr></thead><tbody>
      ${alts.map(a => `<tr><td>${altName(a.x)}</td><td>${fmt(a.r.min)}</td><td>${STATUS[a.r.status]}${a.r.overpay ? `, переплата ${fmt(a.r.overpay)}` : ''}${a.r.lost ? `, потеря дохода ${fmt(a.r.lost)}` : ''}</td></tr>`).join('')}
      <tr><td>«Про» сразу</td><td>—</td><td>Недоступно: не хватает ${fmt(L3.offers.pro - L3.start)}</td></tr></tbody></table></div></div>
    <div class="btns"><button class="btn" data-act="level" data-arg="4">Уровень 4: поездка с друзьями →</button><button class="btn ghost" data-act="level" data-arg="3">Переиграть</button></div>`);
}

/* ===================== level 4: shared trip ===================== */
const L4_HISTORY = [
  { from: 'sys', text: '3 недели назад' },
  { from: 'me', text: 'Нашёл дом у озера: 24 000 за две ночи, с пятницы до воскресенья. Делим на четверых?' },
  { from: 'them', who: 'max', text: 'Го!' },
  { from: 'them', who: 'anya', text: 'Я за!' },
  { from: 'them', who: 'lesha', text: 'Я смогу только на субботу, в пятницу работаю', key: 'lesha' },
  { from: 'me', text: 'Ок, потом посчитаем' },
  { from: 'me', text: 'Забронировал и оплатил 24 000 ✅ Скидывайтесь 🙂' },
  { from: 'them', who: 'anya', text: 'Ура! Я точно в деле 🔥', key: 'anya' },
  { from: 'them', who: 'dima', text: 'Блин, завидую. Если место освободится — зовите, я бы поехал', key: 'dima' },
  { from: 'them', who: 'max', text: 'Скинул 6 000 👍' },
  { from: 'sys', text: 'Сегодня' },
  { from: 'them', who: 'anya', text: 'Ребят, простите 😔 мне поставили смену на выходные, я не еду' },
  { from: 'them', who: 'lesha', text: 'Кстати, я плачу за одну ночь, я же говорил' },
  { from: 'them', who: 'max', text: 'А я уже скинул, со мной всё ок?' },
];

function tripView() {
  const l = S.l4, f = l.form, locked = !!S.decision || l.waiting;
  const sp = f.anya && f.lesha ? split4({ anya: f.anya, lesha: f.lesha, cancelled: l.cancelled }) : null;
  const conds = S.facts.has('conds')
    ? `<div class="terms"><b>Условия отмены</b><span>Можно отменить место одного гостя: вернём половину его доли, ${fmt(L4.refund)}.</span><span>Только до субботы, 12:00. После этого деньги не возвращаются.</span></div>
      ${l.cancelled ? `<div class="okline">Место Ани отменено, ${fmt(L4.refund)} вернулись на счёт.</div>`
        : l.sent ? '<div class="warnline">Срок отмены прошёл: уже суббота, 13:05.</div>'
        : S.decision ? '' : `<button class="btn ghost" data-act="trip-cancel" ${f.anya === 'dima' ? 'disabled' : ''}>Отменить место Ани и вернуть ${fmt(L4.refund)}</button>${f.anya === 'dima' ? '<div class="note">Место займёт Дима, отменять его не нужно.</div>' : ''}`}`
    : '<button class="link" style="align-self:flex-start" data-act="trip-conds">Условия отмены</button>';
  const chip = (grp, k, t, dis) => `<button class="chip" data-act="trip-${grp}" data-arg="${k}" aria-pressed="${f[grp] === k}" ${dis || locked ? 'disabled' : ''}>${t}</button>`;
  const dimaOk = S.facts.has('dima') && !l.cancelled;
  let table = '';
  if (sp) {
    const rows = [];
    if (f.anya === 'dima') rows.push(['Дима, вместо Ани', fmt(sp.dima)]); else rows.push(['Аня', fmt(sp.anya)]);
    rows.push(['Лёша', fmt(sp.lesha)]);
    rows.push(['Макс', `${fmt(sp.max)}<br><small class="note">${sp.maxDelta > 0 ? 'докинет ' + fmt(sp.maxDelta) : sp.maxDelta < 0 ? 'вернуть ему ' + fmt(-sp.maxDelta) : 'уже скинул'}</small>`]);
    rows.push(['Ты', fmt(sp.me)]);
    if (sp.refund) rows.push(['Возврат за отмену', fmt(sp.refund)]);
    table = `<div class="kv">${rows.map(([a, b]) => `<div><span>${a}</span><b class="num" style="text-align:right">${b}</b></div>`).join('')}</div>`;
  }
  return `<div class="topbar"><h3>Поездка</h3></div><div class="pad">
    <div class="prod"><div class="pic" style="font-size:40px">🏡</div><h4>Дом у озера</h4><div class="note">2 ночи, с пятницы до воскресенья · ${l.cancelled ? '3 гостя' : '4 гостя'}</div>
      <div class="kv"><div><span>Оплачено тобой</span><b class="num">${fmt(L4.house)}</b></div><div><span>Макс уже вернул</span><b class="num">${fmt(L4.maxPaid)}</b></div></div>${conds}</div>
    <div class="sec"><div class="sec-h"><b>Расчёт</b></div>
      <div class="field"><label>Аня не едет</label><div class="chips">${chip('anya', 'full', 'Платит полную долю')}${chip('anya', 'half', 'Платит половину')}${chip('anya', 'zero', 'Не платит')}${chip('anya', 'dima', 'Вместо неё едет Дима', !dimaOk)}</div></div>
      <div class="field"><label>Лёша приедет только в субботу</label><div class="chips">${chip('lesha', 'equal', 'Поровну, как все')}${chip('lesha', 'nights', 'За одну ночь')}${chip('lesha', 'comp', 'Компромисс')}</div></div>
      ${table}
      ${S.decision ? '<div class="okline">Все согласились ✅ Промотай время в панели задания.</div>' : `<button class="btn wide" data-act="trip-propose" ${sp && !l.waiting ? '' : 'disabled'}>${l.proposals ? 'Предложить новый вариант' : 'Предложить в общем чате'}</button>`}
    </div></div>`;
}

function react4(f, sp) {
  const l = S.l4, out = [], ok = {};
  if (f.anya === 'full') {
    if (l.cancelled) { out.push(['anya', 'Подождите, моё место же отменили и вам вернули 3 000. Почему с меня полную?']); ok.anya = false; }
    else if (S.facts.has('anya')) { out.push(['anya', 'Ну… да, я писала, что точно в деле. Ладно, переведу 6 000 😔']); ok.anya = true; l.hurt.add('anya'); }
    else { out.push(['anya', 'Я же предупредила за неделю! Почему я должна платить полную долю?']); ok.anya = false; }
  } else if (f.anya === 'half') { out.push(['anya', 'Честно. Переведу 3 000, простите ещё раз 🙏']); ok.anya = true; }
  else if (f.anya === 'zero') { out.push(['anya', 'Спасибо, ребят ❤️ В следующий раз точно с вами']); ok.anya = true; }
  else { out.push(['dima', 'Я в деле! Скину 6 000 🔥']); out.push(['anya', 'Дима, спасибо, что выручил!']); ok.anya = true; }
  if (f.lesha === 'equal') { out.push(['lesha', 'Я же писал, что только на субботу! А ты ответил «ок, потом посчитаем»']); ok.lesha = false; }
  else if (f.lesha === 'nights') { out.push(['lesha', 'Норм, спасибо, что учёл 👍']); ok.lesha = true; }
  else { out.push(['lesha', 'Ок, справедливо']); ok.lesha = true; }
  const allOk = ok.anya && ok.lesha;
  if (allOk) out.push(['max', sp.maxDelta > 0 ? `Ок, докину ${fmt(sp.maxDelta)}` : sp.maxDelta < 0 ? `Ок, тогда верни мне ${fmt(-sp.maxDelta)}` : 'Ок, я уже всё скинул 👍']);
  else out.push(['max', 'Давайте уже договоримся 🙃']);
  for (const k of ['anya', 'lesha']) if (!ok[k]) { l.disputes[k] = (l.disputes[k] || 0) + 1; if (l.disputes[k] >= 2) l.hurt.add(k); }
  return { out, allOk };
}

function propose4() {
  const l = S.l4, f = l.form;
  if (!f.anya || !f.lesha || l.waiting || S.decision) return;
  const sp = split4({ anya: f.anya, lesha: f.lesha, cancelled: l.cancelled });
  l.proposals++; l.sent = true; l.waiting = true;
  S.dayName = 'Суббота'; S.clock = '13:05';
  const why = { equal: '', nights: ' (он только на одну ночь)', comp: ' (чуть меньше, он только на субботу)' }[f.lesha];
  const anyaT = f.anya === 'dima' ? `Аня не едет, вместо неё Дима — ${fmt(sp.dima)}` : f.anya === 'zero' ? 'Аня ничего не платит' : `Аня — ${fmt(sp.anya)}`;
  addMsg('trip', 'me', `Предлагаю так: ${anyaT}. Лёша — ${fmt(sp.lesha)}${why}. Макс — ${fmt(sp.max)}, я — ${fmt(sp.me)}.${sp.refund ? ` Место Ани отменил, вернули ${fmt(sp.refund)}.` : ''} Ок?`);
  track('proposal_sent', { level: 4, n: l.proposals, anya: f.anya, lesha: f.lesha, cancelled: l.cancelled });
  go({ app: 'chat', id: 'trip' }); S.chats.trip.unread = 0;
  const { out, allOk } = react4(f, sp);
  botChain('trip', out, () => {
    l.waiting = false;
    if (!allOk) return;
    S.decision = { ...f, cancelled: l.cancelled, split: sp };
    S.balance += sp.anya + sp.dima + sp.lesha + sp.maxDelta;
    const add = (id, who, amt) => { if (amt) S.ops.unshift(op(id, amt > 0 ? 'Перевод от ' + who : 'Перевод: ' + who, amt, amt > 0 ? 'Пополнения' : 'Переводы', 'd0', { who, note: 'за дом' })); };
    add('p4a', 'Ани', sp.anya); add('p4d', 'Димы', sp.dima); add('p4l', 'Лёши', sp.lesha); add('p4m', sp.maxDelta > 0 ? 'Макса' : 'Макс', sp.maxDelta);
    S.chats.trip.msgs.push({ from: 'sys', text: 'Все согласились ✅' });
    track('decision_made', { level: 4, anya: f.anya, lesha: f.lesha, cancelled: l.cancelled, proposals: l.proposals });
  });
}

function l4Request(to, amt) {
  const l = S.l4;
  if (S.decision) return;
  l.req.add(to);
  if (to === 'lesha' || to === 'anya') l.hurt.add(to);
  track('request_before_agreement', { level: 4, to, amount: amt });
  const r = { lesha: 'Мне пришёл запрос на деньги 🤨 Мы же ещё не договорились, сколько я должен', anya: 'Мне пришёл запрос… Можно сначала обсудить? 😔', max: 'Я же уже скинул 6 000 🤨', dima: 'Эм, а за что запрос? 😅' }[to];
  botSays('trip', [[to, r]]);
}

function finishL4() {
  const d = S.decision, sp = d.split, l = S.l4, got = S.facts.size;
  const hurt = [...l.hurt];
  const rel = hurt.length === 0 ? 'ok' : hurt.length === 1 ? 'edge' : 'bad';
  const REL = { ok: 'Все довольны', edge: 'Остался осадок', bad: 'Отношения испорчены' };
  S.finished = true; progress.done[4] = true; store.set(progress);
  track('outcome_shown', { level: 4, relations: rel, awareness: `${got}/4` });
  track('level_complete', { level: 4, sec: Math.round((Date.now() - S.started) / 1000), attempt: S.attempt });
  const forks = [];
  if (d.anya === 'dima') forks.push('Лучший ход с Аней: Дима ещё три недели назад писал, что поедет, если освободится место. Аня ничего не должна, а дом заполнен.');
  else {
    if (!S.facts.has('dima')) forks.push('Дима писал в общем чате, что поехал бы, если освободится место. Он мог занять место Ани, и никто бы не потерял денег.');
    if (!d.cancelled) forks.push(S.facts.has('conds')
      ? `Ты видел условия отмены, но не отменил место Ани до субботы 12:00. Эти ${fmt(L4.refund)} можно было вернуть.`
      : `В условиях бронирования было сказано: если отменить место до субботы 12:00, вернут ${fmt(L4.refund)}. Срок прошёл, пока шло обсуждение.`);
  }
  if (l.disputes.lesha) forks.push('Лёша не согласился платить поровну: он предупреждал, что приедет только на субботу, а ты ответил «ок, потом посчитаем». Отложенная договорённость всё равно всплывает, только позже и с обидой.');
  if (l.disputes.anya) forks.push('Аня не приняла первый вариант. Требовать с неё больше можно, но опираться нужно на переписку, а не на память: она писала «я точно в деле» уже после оплаты.');
  if (d.anya === 'full' && l.hurt.has('anya')) forks.push('Аня заплатила полную долю. Требование честное, но осадок остался. Твёрдая позиция — нормальный выбор, если ты выбрал её сознательно.');
  if (l.req.size) forks.push('Запрос денег до обсуждения выглядит как счёт без объяснений. Сначала договорённость в общем чате, потом переводы.');
  if (!forks.length) forks.push('Ты нашёл в переписке всё важное и предложил расчёт, который все приняли без споров.');
  const who = d.anya === 'dima' ? [['Дима, вместо Ани', sp.dima], ['Аня', 0]] : [['Аня', sp.anya]];
  const rows = [...who, ['Лёша', sp.lesha], ['Макс', sp.max], ['Ты', sp.me]];
  openModal(`<span class="eyebrow">Уровень 4 · после поездки</span><h2>${l.proposals === 1 ? 'Договорились с первого раза' : `Договорились с ${l.proposals}-й попытки`}</h2>
    <div class="scales"><div class="scale ${rel}"><span class="eyebrow">Отношения</span><b>${REL[rel]}</b><span class="note">${hurt.length ? 'Обиделись: ' + hurt.map(k => CONTACTS[k].name).join(', ') + '.' : 'Никто не остался с обидой.'}</span></div>
    <div class="scale"><span class="eyebrow">Осведомлённость</span><b class="num">Выяснено ${got} из 4</b><span class="note">${Object.entries(L4.facts).map(([k, n]) => `${S.facts.has(k) ? '✓' : '✗'} ${n}`).join('<br>')}</span></div></div>
    <div class="card"><span class="eyebrow">Кто сколько заплатил за дом</span>
      <div class="kv">${rows.map(([n, a]) => `<div><span>${n}</span><b class="num">${fmt(a)}</b></div>`).join('')}${sp.refund ? `<div><span>Возврат за отмену</span><b class="num">${fmt(sp.refund)}</b></div>` : ''}</div>
      <div class="note">Если бы ехали все четверо и делили поровну, на каждого было бы по ${fmt(L4.share)}.</div></div>
    <div class="card"><span class="eyebrow">Развилка</span><div class="fork">${forks.map(f => `<p>${f}</p>`).join('')}</div></div>
    <div class="btns"><button class="btn" data-act="level" data-arg="5">Уровень 5: всё пошло не по плану →</button><button class="btn ghost" data-act="level" data-arg="4">Переиграть</button></div>`);
}

/* ===================== level 5: delayed income ===================== */
function plan5() {
  const l = S.l5, p = l.plan;
  return { start: S.balance, piggy: p.piggy ? piggyTotal() : 0, subs: p.subs, eco: p.eco, rent: p.rent && l.landlord, job: p.job && l.job, client: p.client, artem: p.artem, loan: l.loan };
}

function planView() {
  const l = S.l5, p = l.plan, locked = !!S.decision, r = run5(plan5()), pig = piggyTotal();
  const row = (key, label, sub, dis) => `<label class="tg ${dis ? 'dis' : ''}"><input type="checkbox" id="pl-${key}" ${p[key] && !dis ? 'checked' : ''} ${dis || locked ? 'disabled' : ''}><span>${label}<small>${sub}</small></span></label>`;
  const cal = r.rows.map(x => `<tr><td>${x.day}-е</td><td>${x.ev.map(e => esc(e.text) + (e.amount ? ' ' + sfmt(e.amount) : '')).join('<br>') || '—'}</td><td class="${x.bal < 0 ? 'neg' : ''}">${fmt(x.bal)}</td></tr>`).join('');
  return `<div class="topbar"><h3>План до 21-го</h3></div><div class="pad">
    <div class="note">Отметь, на что рассчитываешь и что меняешь. Календарь внизу пересчитывается сразу.</div>
    <div class="sec"><div class="sec-h"><b>Поступления</b></div>
      ${row('client', 'Оплата заказчика · 40 000 ₽', '15-е · обещано: «на следующей неделе, наверное»')}
      ${row('artem', 'Долг Артёма · 15 000 ₽', '16-е · обещано, срока нет')}
      ${row('job', 'Подработка в кафе · 6 000 ₽', l.job ? '15-е · договорились' : 'Сначала нужно договориться', !l.job)}</div>
    <div class="sec"><div class="sec-h"><b>Что можно изменить</b></div>
      ${row('subs', 'Поставить подписки на паузу', 'не спишется 1 200 ₽ 9-го')}
      ${row('eco', 'Экономный режим', 'еда и проезд 500 ₽ в день вместо 700')}
      ${row('rent', 'Разделить аренду', l.landlord ? '12 000 ₽ 12-го, 13 000 ₽ — 22-го' : 'Сначала нужно договориться с арендодателем', !l.landlord)}
      ${row('piggy', `Взять из копилки ${fmt(pig)}`, 'копилка «На отпуск»', !pig)}
      ${l.loan ? `<div class="note">Займ ${fmt(L5.loan.amount)} уже на счёте. Вернуть ${fmt(L5.loan.back)} через 30 дней.</div>` : ''}
      ${l.scammed ? `<div class="err">Потеряно на «Деньги Сразу»: ${fmt(l.scammed)}</div>` : ''}</div>
    ${r.failDay ? `<div class="warnline"><b>${r.failDay}-го баланс уходит в минус.</b> В этот день платёж не пройдёт.</div>` : `<div class="okline">План сходится. Минимальный остаток: <b class="num">${fmt(r.min)}</b></div>`}
    <div class="tablewrap"><table class="mini cal num"><thead><tr><th>День</th><th>События</th><th>Остаток</th></tr></thead><tbody>${cal}</tbody></table></div>
    <div class="note">Каждый день ещё уходит ${fmt(p.eco ? L5.foodEco : L5.food)} на еду и проезд. Остаток — на конец дня.</div>
    ${locked ? '<div class="okline">План утверждён. Проверь его в панели задания.</div>' : '<button class="btn wide" data-act="plan-ok">Утвердить план</button>'}
  </div>`;
}

function webView() {
  const l = S.l5;
  return `<div class="topbar"><button class="back" data-act="open-chat" data-arg="srazu">‹</button><h3 class="addr">dengi-srazu.top/zaym</h3></div><div class="pad">
    <div class="scam"><b style="font-size:20px">Займ до 30 000 ₽ за 5 минут</b><span>Без проверок и справок. Решение мгновенно.</span><div class="promo">Вам одобрено: 30 000 ₽</div>
      <span class="note">Чтобы получить деньги, оплатите оформление договора — ${fmt(L5.scam)}.</span></div>
    ${l.scamPaid ? `<div class="warnline">Оплата ${fmt(L5.scam)} прошла. «Ожидайте зачисления»…</div>${l.scam2Paid ? `<div class="warnline">Страховка ${fmt(L5.scam2)} оплачена. Займ так и не пришёл.</div>` : `<div class="scam"><b>Для ускорения выдачи нужна страховка займа</b><span class="note">Без неё заявка может быть отклонена.</span><button class="btn wide" data-act="scam-pay2">Оплатить страховку ${fmt(L5.scam2)}</button></div>`}` : `<button class="btn wide" data-act="scam-pay">Оплатить оформление ${fmt(L5.scam)}</button>`}
    ${S.facts.has('scam') ? `<div class="terms"><b>О компании</b><span>Сайт зарегистрирован 3 дня назад.</span><span>Нет ни названия организации, ни адреса, ни лицензии.</span><span>Настоящий кредитор не берёт деньги до выдачи займа.</span></div>`
      : '<button class="link" style="align-self:flex-start" data-act="scam-about">О компании</button>'}
  </div>`;
}

function onQuick5(chat, qid) {
  const ch = S.chats[chat], l = S.l5, drop = ids => { ch.quick = ch.quick.filter(x => !ids.includes(x.id)); };
  if (chat === 'pixel') { drop(['when']); return botSays('pixel', ['Пока не могу сказать точно. Как только бухгалтерия оплатит — сразу переведу']); }
  if (chat === 'zerno') {
    drop(['yes', 'no']);
    if (qid === 'yes') return botSays('zerno', ['Отлично, записала тебя на обе смены! 6 000 ₽ переведу 15-го'], () => { l.job = true; l.plan.job = true; reveal('job'); });
    return botSays('zerno', ['Жаль! Если передумаешь — пиши до пятницы'], () => { ch.quick = [{ id: 'yes', text: 'Передумал, выйду на обе смены' }]; });
  }
  if (chat === 'galina') {
    if (qid === 'part') { drop(['part', 'all']); return botSays('galina', ['Хорошо, что предупредили заранее. Давайте так: 12 000 ₽ двенадцатого и 13 000 ₽ двадцать второго'], () => { l.landlord = true; l.plan.rent = true; reveal('landlord'); }); }
    drop(['all']); return botSays('galina', ['Всю не могу, мне самой платить за квартиру. Частично — давайте обсудим']);
  }
  if (chat === 'artem') { drop(['debt']); return botSays('artem', ['Слушай, сейчас никак 😔 Может, в конце месяца. Но точно верну!']); }
  if (chat === 'srazu') {
    drop(['ins', 'block']);
    if (qid === 'ins') {
      if (S.balance < L5.scam2) return;
      S.balance -= L5.scam2; l.scammed += L5.scam2;
      S.ops.unshift(op('sc2', 'dengi-srazu.top: страховка', -L5.scam2, 'Переводы', 'd0'));
      track('scam_paid', { level: 5, amount: L5.scam2 });
      return botSays('srazu', ['Оплата принята ✅ Займ поступит в течение 24 часов']);
    }
    ch.msgs.push({ from: 'sys', text: 'Контакт заблокирован' }); ch.blocked = true;
    track('scam_blocked', { level: 5 });
  }
}

function finishL5() {
  const d = S.decision, l = S.l5, got = S.facts.size;
  const o = outcome5(d), st = o.stress;
  S.finished = true; progress.done[5] = true; store.set(progress);
  track('outcome_shown', { level: 5, stability: o.status, awareness: `${got}/4` });
  track('level_complete', { level: 5, sec: Math.round((Date.now() - S.started) / 1000), attempt: S.attempt });
  const items = [];
  let failed = false;
  for (const r of st.rows) {
    for (const e of r.ev) items.push({ day: r.day, text: e.text, amount: e.amount, kind: e.amount > 0 ? 'good' : '' });
    if (r.bal < 0 && !failed) { failed = true; items.push({ day: r.day, text: `Не хватило денег: остаток ${fmt(r.bal)}`, amount: 0, kind: 'bad' }); }
  }
  const forks = [];
  if (d.client || d.artem) forks.push(`Ты учёл в плане ${[d.client ? 'оплату заказчика' : '', d.artem ? 'долг Артёма' : ''].filter(Boolean).join(' и ')}. Это обещания, а не деньги на счёте. Заказчик снова перенёс оплату, Артём не вернул долг${st.failDay ? `, и ${st.failDay}-го план сломался` : ''}.`);
  if (!l.landlord) forks.push('Галина Петровна согласилась бы разделить аренду: 12 000 ₽ 12-го и 13 000 ₽ 22-го. Нужно было написать ей заранее.');
  if (!l.job) forks.push('Кафе «Зерно» предлагало две смены на выходных: 6 000 ₽ с выплатой 15-го.');
  if (l.scammed) forks.push(`«Деньги Сразу» забрали ${fmt(l.scammed)}. Плата «за оформление» до выдачи — главный признак мошенничества: настоящий кредитор не берёт денег вперёд.${l.scammed > L5.scam ? ' А после первой оплаты всегда появляется вторая: «страховка», «ускорение», «комиссия».' : ''}`);
  else if (S.facts.has('scam')) forks.push('Ты проверил «Деньги Сразу» и не заплатил. Плата до выдачи займа — главный признак мошенничества.');
  if (l.loan) forks.push(`Займ в банке помог, но вернуть нужно ${fmt(L5.loan.back)}: переплата ${fmt(L5.loan.back - L5.loan.amount)}. Это не ошибка, если ты посчитал и выбрал это сознательно.`);
  if (!d.piggy && piggyTotal() && st.failDay) forks.push(`В копилке лежало ${fmt(piggyTotal())}. Копилка для того и нужна, чтобы закрыть такую дыру.`);
  if (o.status === 'ok' && !d.client && !d.artem) forks.push('План построен только на подтверждённых деньгах, поэтому новая задержка его не сломала.');
  const TITLE = { ok: 'План выдержал', edge: 'План выдержал, но с потерями', bad: 'План не выдержал' };
  openModal(`<span class="eyebrow">Уровень 5 · проверка через 2 недели</span><h2>${TITLE[o.status]}</h2>
    <div class="warnline">Стресс-тест: заказчик снова перенёс оплату, теперь на конец месяца. Артём долг пока не вернул.</div>
    <div class="scales"><div class="scale ${o.status}"><span class="eyebrow">Устойчивость</span><b>${STATUS[o.status]}</b><span class="note">${o.status === 'ok' ? (d.client || d.artem ? 'Платежи прошли, хотя план рассчитывал на обещания: выручил запас.' : 'Все платежи прошли без расчёта на обещания.') : o.status === 'edge' ? (l.loan ? 'Платежи прошли, но за счёт займа с переплатой.' : 'Платежи прошли, но запаса почти не осталось.') : `${st.failDay}-го не хватило денег на обязательный платёж.`}</span></div>
    <div class="scale"><span class="eyebrow">Осведомлённость</span><b class="num">Выяснено ${got} из 4</b><span class="note">${Object.entries(L5.facts).map(([k, n]) => `${S.facts.has(k) ? '✓' : '✗'} ${n}`).join('<br>')}</span></div></div>
    <div class="card"><span class="eyebrow">Что происходило со счётом</span>
      <div class="kv"><div><span>Минимум в твоём плане</span><b class="num">${fmt(o.plan.min)}</b></div><div><span>Минимум после задержки</span><b class="num ${st.min < 0 ? 'neg' : ''}">${fmt(st.min)}</b></div><div><span>На счету 21-го</span><b class="num">${fmt(st.end)}</b></div></div>
      ${feedHtml(items, e => `${e.day}-е`)}<div class="note">Плюс каждый день еда и проезд: ${fmt(d.eco ? L5.foodEco : L5.food)}.</div></div>
    <div class="card"><span class="eyebrow">Развилка</span><div class="fork">${forks.map(f => `<p>${f}</p>`).join('')}</div></div>
    <div class="btns"><button class="btn" data-act="level" data-arg="6">Уровень 6: делегация →</button><button class="btn ghost" data-act="level" data-arg="5">Переиграть</button></div>`);
}

/* ===================== level 6: «delegation» ===================== */
function addSms(from, text) {
  S.sms.unshift({ from, text, time: S.clock });
  showToast('Сообщения', from + ': ' + text, 'open-app', 'sms');
  render();
}
function checkCode(chat, text) {
  const l = S.l6;
  if (l.codeSent || !text.replace(/\D/g, '').includes(l.code)) return;
  l.codeSent = true;
  track('code_sent', { level: 6, chat });
  if (chat !== 'elena') return;
  const st = S;
  setTimeout(() => { if (S === st) addSms('Госпортал', 'Выполнен вход в ваш аккаунт с нового устройства. Если это были не вы, срочно смените пароль.'); }, 4000);
  setTimeout(() => { if (S === st) startWave(); }, 9000);
}
function startWave() {
  const l = S.l6;
  if (l.wave) return;
  l.wave = true;
  S.factKeys = [...S.factKeys, 'bank'];
  addSms('900-ПЯТАК', 'На ваше имя оформляется кредит 150 000 ₽. Если это не вы, служба безопасности уже связывается с вами.');
  S.chats = { sb: { msgs: [
    { from: 'them', text: 'Здравствуйте, Василий. Служба безопасности банка, Пётр Андреевич. Мошенники получили доступ к вашим данным и оформляют на вас кредит 150 000 ₽' },
    { from: 'them', text: 'Чтобы сохранить ваши деньги, срочно переведите все накопления на защищённый счёт. Реквизиты уже добавлены в ваш банк: получатель «Защищённый счёт»' },
  ], unread: 2 }, ...S.chats };
  if (!S.contacts.includes('safe')) S.contacts = [...S.contacts, 'safe'];
  track('second_wave', { level: 6 });
  setTimeout(() => { if (S.l6 === l) { showToast('Чаты', 'Служба безопасности: Мошенники получили доступ к вашим данным…', 'open-chat', 'sb'); render(); } }, 2500);
}
function smsView() {
  return `<div class="topbar"><h3>Сообщения</h3></div><div class="pad">${S.sms.length ? S.sms.map(m => `<div class="prod" style="gap:6px"><div class="row" style="display:flex;justify-content:space-between;gap:8px"><b>${esc(m.from)}</b><span class="note">${esc(m.time)}</span></div><div>${esc(m.text)}</div></div>`).join('') : '<div class="note">Сообщений пока нет</div>'}</div>`;
}
function uniView() {
  return `<div class="topbar"><h3 class="addr" style="color:var(--ink)!important">omgu-student.ru</h3></div><div class="pad">
    <div class="prod"><div class="pic" style="font-size:40px">🎓</div><h4>Факультет экономики</h4><div class="note">Новости: открыт приём заявок на летнюю практику. Расписание сессии опубликовано.</div></div>
    <div class="sec"><div class="sec-h"><b>Контакты деканата</b></div>
      <div class="kv"><div><span>Телефон</span><b class="num">+7 (3812) 00-11-22</b></div><div><span>Почта</span><b>dekanat@omgu-student.ru</b></div><div><span>Часы работы</span><b>пн–пт, 9:00–17:00</b></div></div>
      <button class="btn wide" data-act="open-dekanat">Написать в официальный чат деканата</button>
      <div class="note">Деканат не запрашивает документы и коды через личные мессенджеры.</div></div></div>`;
}
function finishL6() {
  const l = S.l6, got = S.facts.size, total = S.factKeys.length;
  const status = l.lost ? 'bad' : (l.codeSent || l.passportSent) ? 'edge' : 'ok';
  S.finished = true; progress.done[6] = true; store.set(progress);
  track('outcome_shown', { level: 6, safety: status, awareness: `${got}/${total}`, lost: l.lost });
  track('level_complete', { level: 6, sec: Math.round((Date.now() - S.started) / 1000), attempt: S.attempt });
  const TITLE = { ok: 'Мошенники остались ни с чем', edge: 'Деньги целы, но данные утекли', bad: `Потеряно ${fmt(l.lost)}` };
  const what = [];
  if (l.passportSent) what.push('Через неделю на твой паспорт оформили микрозайм на 30 000 ₽ в сомнительной конторе. Чтобы доказать, что это не ты, нужны заявление и время.');
  if (l.codeSent) what.push('По коду из SMS мошенники зашли в твой аккаунт на Госпортале и увидели твои данные. Пришлось восстанавливать доступ и менять пароли.');
  if (l.lost) what.push(`Ты перевёл ${fmt(l.lost)} на «защищённый счёт». Такого счёта не существует: деньги ушли мошенникам, и вернуть их почти невозможно.`);
  if (!what.length) what.push('Ничего плохого не случилось: ни документы, ни коды, ни деньги не попали к мошенникам. А в общем чате группы потом выяснилось, что «Елена Викторовна» писала ещё троим.');
  const forks = [];
  if (l.codeSent) forks.push('Код из SMS — ключ от твоего аккаунта. В самом SMS написано: никому не сообщать, даже сотрудникам. Деканату для пропуска такой код не нужен.');
  if (l.passportSent) forks.push('Фото паспорта в чужих руках — это готовый набор для микрозайма и фальшивых договоров. Документы отправляют только через официальные каналы.');
  if (l.wave && !l.lost) forks.push('Ты не перевёл деньги на «защищённый счёт». Это главное: банки никогда не просят переводить деньги, чтобы их «спасти».');
  if (l.lost) forks.push('Звонок или сообщение «службы безопасности» сразу после утечки — вторая волна той же схемы. Поддержка в «Пятаке» сказала бы, что никакого кредита на тебя нет.');
  if (!S.facts.has('number')) forks.push('Номер «Елены Викторовны» (+7 912…) не совпадал с номером деканата на сайте вуза (+7 3812…).');
  if (!S.facts.has('starosta')) forks.push('Староста ничего не знала о делегации. Один вопрос однокурснику часто снимает все сомнения.');
  if (!S.facts.has('official')) forks.push('Официальный чат деканата на сайте вуза ответил бы, что никакой делегации нет.');
  if (status === 'ok' && S.facts.has('official')) forks.push('Ты проверил информацию через официальный канал. Именно так и работает защита от таких схем: не спорить с мошенником, а уточнить у настоящего источника.');
  const NAMES = { ...L6.facts };
  openModal(`<span class="eyebrow">Уровень 6 · через неделю</span><h2>${TITLE[status]}</h2>
    <div class="scales"><div class="scale ${status}"><span class="eyebrow">Безопасность</span><b>${{ ok: 'В безопасности', edge: 'Утечка данных', bad: 'Потеря денег' }[status]}</b><span class="note">${status === 'ok' ? 'Мошенники не получили ничего.' : status === 'edge' ? 'Деньги на месте, но документы или доступ к аккаунту у мошенников.' : 'Деньги ушли мошенникам.'}</span></div>
    <div class="scale"><span class="eyebrow">Осведомлённость</span><b class="num">Выяснено ${got} из ${total}</b><span class="note">${S.factKeys.map(k => `${S.facts.has(k) ? '✓' : '✗'} ${NAMES[k]}`).join('<br>')}</span></div></div>
    <div class="card"><span class="eyebrow">Что произошло за неделю</span><div class="fork">${what.map(f => `<p>${f}</p>`).join('')}</div></div>
    <div class="card"><span class="eyebrow">Развилка</span><div class="fork">${forks.map(f => `<p>${f}</p>`).join('')}</div></div>
    <div class="btns"><button class="btn" data-act="level" data-arg="6">Переиграть</button><button class="btn ghost" data-act="level" data-arg="1">С начала</button></div>`);
}

/* ===================== actions ===================== */
function go(route) { S.route = route; S.hint = false; }
const ACT = {
  level: n => { panelOpen = false; startLevel(+n); return false; },
  panel: () => { panelOpen = !panelOpen; },
  restart: () => {
    if (S.restartArm && Date.now() - S.restartArm < 3000) { track('level_restart', { level: S.level }); startLevel(S.level); return false; }
    S.restartArm = Date.now();
    const st = S; setTimeout(() => { if (S === st && S.restartArm) { S.restartArm = 0; render(); } }, 3000);
  },
  hint: () => { S.hintText = true; track('hint_shown', { level: S.level }); },
  home: () => go({ app: 'home' }),
  'open-app': a => {
    S.toast = null; go({ app: a });
    if (S.level === 6 && a === 'sms' && S.sms.length) reveal('sms');
    if (S.level === 6 && a === 'uni') { S.l6.siteSeen = true; reveal('number'); }
  },
  'open-dekanat': () => {
    if (!S.chats.dekanat) S.chats = { dekanat: { msgs: [{ from: 'them', text: 'Здравствуйте! Официальный чат деканата. Задайте ваш вопрос, мы ответим в рабочее время.' }], unread: 0 }, ...S.chats };
    go({ app: 'chat', id: 'dekanat' }); track('official_chat_opened', { level: 6 });
  },
  'send-passport': () => {
    const l = S.l6;
    if (l.passportSent || S.typing) return;
    l.passportSent = true;
    addMsg('elena', 'me', '📎 Фото паспорта.jpg');
    track('passport_sent', { level: 6 });
    botSays('elena', ['Получила, спасибо! 👍 Теперь продиктуйте, пожалуйста, код из SMS, он только что пришёл']);
  },
  'open-chat': id => {
    S.toast = null; go({ app: 'chat', id });
    const ch = S.chats[id]; ch.unread = 0; ch.read = true;
  },
  'open-op': id => {
    S.toast = null;
    const from = S.route.app === 'bank' && S.route.view === 'history' ? 'history' : 'main';
    go({ app: 'bank', view: 'op', id, from });
    if (S.level === 1) { if (id === 'mom') l1Done(0); if (id === 'stationery') l1Done(2); }
  },
  'bank-go': v => {
    if (v === 'transfer' && S.route.view !== 'confirm') S.transfer = null;
    if (v === 'request') S.req = null;
    if (v === 'piggies') S.pform = null;
    if (v === 'transfer' && S.level === 2 && S.decision) { S.transfer = { to: '', amount: '', comment: '', err: 'Решение по Артёму уже принято. Промотай время в панели задания.' }; }
    if (v === 'upcoming' && S.level === 3) reveal('lowmonth');
    if (v === 'loan') reveal('loan');
    go({ app: 'bank', view: v });
  },
  'hist-cat': c => { S.hist.cat = c; },
  'tr-to': c => { syncTransfer(); S.transfer.to = c; S.transfer.err = ''; },
  'tr-send': () => {
    const t = S.transfer;
    const id = 'tr' + Date.now();
    S.balance -= t.amount;
    S.ops.unshift(op(id, 'Перевод: ' + CONTACTS[t.to].name, -t.amount, 'Переводы', S.level === 1 ? S.today : 'd0', { who: CONTACTS[t.to].name, note: t.comment, to: t.to }));
    go({ app: 'bank', view: 'done', id });
    if (S.level === 1) {
      if (t.to === 'dima' && t.amount === 650) { l1Done(1); const st = S; setTimeout(() => { if (S !== st) return; addMsg('dima', 'them', 'Пришло, спасибо! 👍'); S.chats.dima.unread = 1; render(); }, 800); }
      else {
        S.l1.wrong = id;
        if (t.to === 'dima') {
          const st = S, msg = `Пришло ${fmt(t.amount)}, а нужно 650 ₽ 🙂 Отмени перевод в «Пятаке» и отправь заново`;
          setTimeout(() => { if (S !== st) return; addMsg('dima', 'them', msg); S.chats.dima.unread = 1; showToast('Чаты', 'Дима: ' + msg, 'open-chat', 'dima'); render(); }, 800);
        }
      }
    }
    if (S.level === 2 && t.to === 'artem') onLend(t.amount);
    if (S.level === 6 && t.to === 'safe') { S.l6.lost += t.amount; track('safe_account_transfer', { level: 6, amount: t.amount }); botSays('sb', ['Средства поступили на защищённый счёт ✅ Ничего не предпринимайте и никому не сообщайте о нашем разговоре']); }
    S.transfer = null;
  },
  'tr-cancel': id => {
    const o = S.ops.find(x => x.id === id);
    if (!o || o.cancelled) return;
    o.cancelled = true; S.balance += -o.amount;
    if (S.level === 1 && S.l1.wrong === id) S.l1.wrong = null;
    S.ops.unshift(op(id + 'c', 'Отмена перевода: ' + o.who, -o.amount, 'Переводы', S.today, { who: o.who }));
    go({ app: 'bank', view: 'done', id });
  },
  'req-to': c => { const amt = $('#req-amount')?.value; S.req.to = c; S.req.amountDraft = amt; },
  'req-reset': () => { S.req = null; },
  'pig-new': () => { S.pform = { id: 'new' }; },
  'pig-form': (id, el) => { S.pform = { id, mode: el.dataset.arg2 }; },
  say: id => sayL2(id),
  say1: arg => {
    const [chat, qid] = arg.split(':');
    const ch = S.chats[chat];
    if (S.typing) return;
    const q = (ch.quick || []).find(x => x.id === qid);
    if (!q) return;
    addMsg(chat, 'me', q.text); ch.read = true;
    if (S.level === 5) onQuick5(chat, qid); else ch.quick = [];
  },
  pin: i => {
    const m = S.chats.trip.msgs[+i];
    if (!m || m.from === 'sys') return;
    m.pinned = !m.pinned;
    if (m.pinned) {
      if (m.key) reveal(m.key);
      S.notes += (S.notes ? '\n' : '') + '📌 ' + (m.from === 'me' ? 'Я' : CONTACTS[m.who].name) + ': ' + m.text;
    }
  },
  'trip-anya': k => { if (k === 'dima' && S.l4.cancelled) return; S.l4.form.anya = k; },
  'trip-lesha': k => { S.l4.form.lesha = k; },
  'trip-conds': () => { reveal('conds'); track('conditions_opened', { level: 4 }); },
  'trip-cancel': () => {
    const l = S.l4;
    if (l.cancelled || l.sent || S.decision) return;
    l.cancelled = true; S.balance += L4.refund;
    S.ops.unshift(op('rf4', 'Возврат: отмена места', L4.refund, 'Пополнения', 'd0', { note: 'дом у озера' }));
    if (l.form.anya === 'dima') l.form.anya = '';
    track('booking_cancelled', { level: 4 });
  },
  'trip-propose': () => propose4(),
  'open-web': () => { S.toast = null; go({ app: 'web' }); track('scam_opened', { level: 5 }); },
  'scam-about': () => { reveal('scam'); },
  'scam-pay': () => {
    const l = S.l5;
    if (l.scamPaid || S.balance < L5.scam) return;
    S.balance -= L5.scam; l.scamPaid = true; l.scammed += L5.scam;
    S.ops.unshift(op('sc1', 'dengi-srazu.top: оформление', -L5.scam, 'Переводы', 'd0'));
    track('scam_paid', { level: 5, amount: L5.scam });
    botSays('srazu', ['Оплата получена ✅ Для ускорения выдачи нужна страховка займа — 2 900 ₽. Оплатите на сайте 👆']);
  },
  'scam-pay2': () => {
    const l = S.l5;
    if (!l.scamPaid || l.scam2Paid || S.balance < L5.scam2) return;
    S.balance -= L5.scam2; l.scam2Paid = true; l.scammed += L5.scam2;
    S.ops.unshift(op('sc2', 'dengi-srazu.top: страховка', -L5.scam2, 'Переводы', 'd0'));
    track('scam_paid', { level: 5, amount: L5.scam2 });
  },
  'loan-take': () => {
    const l = S.l5;
    if (l.loan || S.decision) return;
    l.loan = true; S.balance += L5.loan.amount;
    S.ops.unshift(op('ln5', 'Займ до зарплаты', L5.loan.amount, 'Пополнения', 'd0', { note: `вернуть ${fmt(L5.loan.back)}` }));
    track('loan_taken', { level: 5 });
  },
  'plan-ok': () => {
    if (S.decision) return;
    S.decision = plan5();
    track('decision_made', { level: 5, ...S.decision });
  },
  calc: k => {
    const c = S.calc;
    if (c.done && /[\d(]/.test(k)) { c.expr = ''; }
    c.done = false;
    if (k === 'C') { c.expr = ''; c.out = '0'; return; }
    if (k === '⌫') { c.expr = c.expr.slice(0, -1); c.out = c.expr || '0'; return; }
    if (k === '=') {
      try { const v = calcEval(c.expr); c.out = v.toLocaleString('ru-RU'); c.expr += ' ='; c.done = true; c.expr = c.expr.replace(/ =$/, ''); c.last = v;
        if (S.level === 2 && [11000, 23000, 12000].includes(v) && !S.l2.calcNoted) { S.l2.calcNoted = true; }
      } catch { c.out = 'Ошибка'; }
      return;
    }
    if (c.done) c.expr = String(c.last ?? '');
    c.expr += k; c.out = c.expr;
  },
  'shop-terms': () => { S.shop.open = 'inst'; reveal('conds'); track('conditions_opened', { offer: 'pro_installment' }); },
  'shop-check': k => {
    S.shop.msg = '';
    if (S.decision) { S.shop.msg = 'Покупка уже оформлена. Промотай время в панели задания.'; return; }
    if (k === 'pro_cash' && S.balance < L3.offers.pro) { S.shop.msg = `Недостаточно средств: на счёте ${fmt(S.balance)}, нужно ${fmt(L3.offers.pro)}.`; return; }
    S.shop.checkout = k; S.shop.err = '';
  },
  'shop-back': () => { S.shop.checkout = null; },
  'shop-buy': () => {
    const k = S.shop.checkout;
    if (k === 'inst') { S.decision = { type: 'inst', protection: S.shop.protection }; S.ops.unshift(op('inst', 'Техносад: рассрочка оформлена', 0, 'Покупки', 'd0', { note: `6 × ${fmt(10000 + (S.shop.protection ? 1490 : 0))}` })); }
    else { const price = k === 'base' ? L3.offers.base : L3.offers.pro; S.balance -= price; S.decision = { type: k }; S.ops.unshift(op('lap', 'Техносад: ноутбук', -price, 'Покупки', 'd0')); }
    track('decision_made', { level: 3, decision: k, protection: k === 'inst' ? S.shop.protection : undefined, amount: k === 'inst' ? 0 : (k === 'base' ? 28000 : 60000) });
    S.shop.checkout = null; S.shop.msg = 'Готово! Ноутбук оформлен. Промотай время в панели задания, чтобы увидеть, что будет дальше.';
  },
  'shop-postpone': () => {
    if (S.decision) return;
    S.decision = { type: 'postpone' };
    track('decision_made', { level: 3, decision: 'postpone', amount: 0 });
    S.shop.msg = 'Покупка отложена. Промотай время в панели задания.';
  },
  skip: () => { if ((!S.decision && S.level !== 6) || S.typing) return; ({ 2: finishL2, 3: finishL3, 4: finishL4, 5: finishL5, 6: finishL6 })[S.level](); },
};

function syncTransfer() {
  const t = S.transfer || (S.transfer = { to: '', amount: '', comment: '' });
  const a = $('#tr-amount'), c = $('#tr-comment');
  if (a) t.amount = a.value; if (c) t.comment = c.value;
}

document.addEventListener('click', e => {
  lastAction = Date.now();
  const sb = e.target.closest('[data-submit]');
  if (sb) { e.preventDefault(); if (!sb.disabled) handleForm(sb.closest('form')); return; }
  if (S && S.level === 1 && S.hint) { S.hint = false; }
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (!fn) return;
  e.preventDefault();
  const keep = fn(el.dataset.arg, el);
  if (keep !== false) render();
});
document.addEventListener('input', e => {
  lastAction = Date.now();
  if (e.target.id === 'hist-q') { S.hist.q = e.target.value; $('#hist-list').innerHTML = histList(); highlightAgain(); }
  if (e.target.id === 'notes') S.notes = e.target.value;
});
document.addEventListener('change', e => {
  if (e.target.id === 'hist-period') { S.hist.period = e.target.value; $('#hist-list').innerHTML = histList(); highlightAgain(); }
  if (e.target.id === 'prot') { S.shop.protection = e.target.checked; render(); }
  if (e.target.id && e.target.id.startsWith('pl-') && S.level === 5 && !S.decision) { S.l5.plan[e.target.id.slice(3)] = e.target.checked; render(); }
  if (e.target.id === 'dev-ai') { AIC.enabled = e.target.checked; track('ai_toggle', { on: AIC.enabled }); render(); }
  if (e.target.id === 'dev-artem') { DEMO_ARTEM = e.target.value; track('demo_artem', { variant: DEMO_ARTEM || 'random' }); }
});
function highlightAgain() { if (S.level !== 1) return; document.querySelectorAll('.spot').forEach(x => x.classList.remove('spot')); const t = l1Target(); const el = t && $('#screen').querySelector(t); if (el) el.classList.add('spot'); }

/* Forms are handled by hand: previews in sandboxed frames block real form submission */
document.addEventListener('submit', e => { e.preventDefault(); handleForm(e.target); });
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' || e.target.tagName !== 'INPUT') return;
  const f = e.target.closest('form');
  if (f) { e.preventDefault(); handleForm(f); }
});
function handleForm(form) {
  if (!form || !S) return;
  lastAction = Date.now();
  const id = form.id;
  if (id === 'tr-form') {
    syncTransfer();
    const t = S.transfer, amt = parseAmt(t.amount);
    t.err = !t.to ? 'Выбери получателя.' : !(amt > 0) ? 'Введи сумму больше нуля.' : amt > S.balance ? `На счёте только ${fmt(S.balance)}.` : '';
    if (S.level === 2 && S.decision && t.to === 'artem') t.err = 'Решение по Артёму уже принято.';
    if (!t.err) { t.amount = amt; go({ app: 'bank', view: 'confirm' }); }
  }
  if (id === 'req-form') {
    const amt = parseAmt($('#req-amount').value);
    S.req.err = !S.req.to ? 'Выбери, у кого попросить.' : !(amt > 0) ? 'Введи сумму больше нуля.' : '';
    if (!S.req.err) { S.req.amount = amt; S.req.sent = true; if (S.level === 4) l4Request(S.req.to, amt); }
  }
  if (id === 'pig-form') {
    const f = S.pform, val = $('#pig-val').value.trim();
    if (f.id === 'new') {
      if (!val) { f.err = 'Придумай название.'; }
      else { const p = { id: 'p' + Date.now(), name: val, amount: 0 }; S.piggies.push(p); S.pform = { id: p.id, mode: 'add' }; }
    } else {
      const p = S.piggies.find(x => x.id === f.id);
      if (f.mode === 'rename') { if (val) { p.name = val; S.pform = null; } else f.err = 'Название не может быть пустым.'; }
      else {
        const amt = parseAmt(val);
        if (!(amt > 0)) f.err = 'Введи сумму больше нуля.';
        else if (f.mode === 'add' && amt > S.balance) f.err = `На счёте только ${fmt(S.balance)}.`;
        else if (f.mode === 'take' && amt > p.amount) f.err = `В копилке только ${fmt(p.amount)}.`;
        else {
          const sign = f.mode === 'add' ? -1 : 1;
          S.balance += sign * amt; p.amount -= sign * amt;
          S.ops.unshift(op('pg' + Date.now(), (f.mode === 'add' ? 'В копилку «' : 'Из копилки «') + p.name + '»', sign * amt, 'Переводы', S.level === 1 ? S.today : 'd0'));
          S.pform = null;
          if (S.level === 1 && p.amount >= 100) l1Done(3);
        }
      }
    }
  }
  if (id === 'chat-form') { const v = $('#chat-in').value; if (S.level === 2 && S.route.id === 'artem') freeSay(v.slice(0, 200)); else freeChat(S.route.id, v); return; }
  render();
}

/* idle hint (level 1 only, after 10 s without actions) */
setInterval(() => {
  if (!S || S.level !== 1 || S.finished || S.hint || l1Current() < 0) return;
  if (Date.now() - lastAction > 10000) { S.hint = true; S.l1.hints++; track('hint_shown', { level: 1, task: l1Current() + 1 }); render(); }
}, 1000);

/* boot */
const tests = simSelfTest();
const failed = tests.filter(t => !t.ok);
if (failed.length) console.error('Simulator self-test failed', failed); else console.info(`Simulator self-test: ${tests.length} checks passed`);
startLevel(1);
checkAI();

/* Level configs and the deterministic outcome simulator (no UI, no AI) */
/* ===== Level configs and the deterministic outcome simulator (no UI, no AI) ===== */
const L2 = {
  start: 48000, ask: 15000, cushion: 0, horizon: 14,
  rent: { day: 3, amount: 25000 },
  living: { from: 3, to: 13, total: 12000 },
  salary: { day: 14, amount: 30000 },
  facts: { purpose: 'Зачем нужны деньги', real: 'Сколько нужно на самом деле', deadline: 'Срок возврата', source: 'Из каких денег вернёт' },
  variants: {
    reliable: {
      name: 'Надёжный', truth: 'Деньги нужны на залог за комнату. Артём вернул бы 15 000 ₽ на 10-й день с зарплаты.',
      card: 'спокойный, ему неловко просить, отвечает конкретно и по делу',
      answers: {
        purpose: 'Нашёл комнату ближе к учёбе, хозяйка просит залог до пятницы',
        real: 'Залог ровно 15 000, меньше она не берёт',
        deadline: 'Верну 10-го числа, это через 9 дней',
        source: '10-го у меня зарплата в кофейне, сразу переведу',
      },
      allowed: [15, 15000, 10, 9],
      repay: a => [{ day: 10, amount: a, text: 'Артём вернул долг с зарплаты' }],
    },
    uncertain: {
      name: 'Неопределённый', truth: 'Конкретного срока нет. Артём вернул бы деньги частями, после 20-го дня.',
      card: 'обаятельный, но уходит от конкретики, на давление обижается',
      answers: {
        purpose: 'Да надо закрыть кое-что… за телефон должен, за курсы',
        real: 'Ну 15. Может, меньше, пока не знаю',
        deadline: 'Скоро верну. Ты как банк, честное слово 😒',
        source: 'Ищу подработку, как появятся деньги — отдам частями',
      },
      allowed: [15, 15000],
      repay: a => [{ day: 21, amount: Math.round(a / 2), text: 'Артём вернул часть' }, { day: 28, amount: a - Math.round(a / 2), text: 'Артём вернул остаток' }],
    },
    reserve: {
      name: 'С запасом', truth: 'Реально нужно 10 000 ₽ на залог, 15 000 ₽ Артём просил «с запасом». Лишнее вернул бы сразу, остальное после 20-го.',
      card: 'дружелюбный и честный, если спросить прямо; немного перестраховывается',
      answers: {
        purpose: 'Залог за комнату, заезжаю на следующей неделе',
        real: 'Если честно, залог 10 000. 15 просил с запасом',
        deadline: 'Из 15 000 сразу верну 5 000, а остальные 10 000 — после 20-го',
        source: 'С зарплаты в конце месяца',
      },
      allowed: [15, 15000, 10, 10000, 20, 5000, 5],
      repay: a => a > 10000
        ? [{ day: 5, amount: a - 10000, text: 'Артём вернул лишнее' }, { day: 22, amount: 10000, text: 'Артём вернул остаток' }]
        : [{ day: 22, amount: a, text: 'Артём вернул долг' }],
    },
  },
};

const L3 = {
  start: 30000, expenses: 40000, cushion: 10000,
  income: [58000, 41000, 55000, 39000, 60000, 47000],
  lossWithoutLaptop: 12000,
  offers: { pro: 60000, base: 28000, inst: { n: 6, pay: 10000, protection: 1490 } },
};

function livingDays() {
  const { from, to, total } = L2.living, n = to - from + 1, base = Math.floor(total / n);
  const out = {}; let rest = total - base * n;
  for (let d = from; d <= to; d++) { out[d] = base + (rest > 0 ? 1 : 0); if (rest > 0) rest--; }
  return out;
}

/* Runs the 14 game days. withRepay=false answers "would the plan hold without Artyom's money?" */
function run2(variant, lent, start, withRepay) {
  const repays = lent > 0 ? L2.variants[variant].repay(lent) : [];
  const live = livingDays();
  let bal = start - lent, min = bal, failed = false;
  const feed = [];
  if (lent > 0) feed.push({ day: 1, text: 'Перевод Артёму', amount: -lent });
  let foodSum = 0, foodFrom = null;
  const flushFood = d => { if (foodSum) { feed.push({ day: foodFrom, to: d, text: 'Еда и проезд', amount: -foodSum }); foodSum = 0; foodFrom = null; } };
  for (let d = 1; d <= L2.horizon; d++) {
    if (withRepay) for (const r of repays) if (r.day === d) { flushFood(d - 1); bal += r.amount; feed.push({ day: d, text: r.text, amount: r.amount, kind: 'good' }); }
    if (d === L2.salary.day) { flushFood(d - 1); bal += L2.salary.amount; feed.push({ day: d, text: 'Поступление: стипендия и подработка', amount: L2.salary.amount, kind: 'good' }); }
    if (d === L2.rent.day) {
      flushFood(d - 1);
      if (bal >= L2.rent.amount) { bal -= L2.rent.amount; feed.push({ day: d, text: 'Аренда', amount: -L2.rent.amount }); }
      else { failed = true; feed.push({ day: d, text: 'Аренда не оплачена: не хватило ' + (L2.rent.amount - bal).toLocaleString('ru-RU') + ' ₽', amount: 0, kind: 'bad' }); }
    }
    if (live[d]) {
      if (bal >= live[d]) { bal -= live[d]; if (foodFrom == null) foodFrom = d; foodSum += live[d]; }
      else if (!failed) { flushFood(d - 1); failed = true; feed.push({ day: d, text: 'Не хватило денег на еду и проезд', amount: 0, kind: 'bad' }); }
    }
    min = Math.min(min, bal);
  }
  flushFood(L2.living.to);
  feed.sort((a, b) => a.day - b.day);
  return { failed, min, end: bal, feed, later: repays.filter(r => r.day > L2.horizon) };
}

function outcome2(variant, lent, start = L2.start) {
  const real = run2(variant, lent, start, true);
  const alone = run2(variant, lent, start, false);
  const status = real.failed ? 'bad' : (alone.failed || alone.min < L2.cushion) ? 'edge' : 'ok';
  return { status, ...real, free: start - L2.rent.amount - L2.living.total };
}

function run3(dec) {
  const o = L3.offers;
  if (dec.type === 'pro_cash' && L3.start < o.pro) return { unavailable: true, status: 'na' };
  let bal = L3.start, min = Infinity, failed = false, overpay = 0, lost = 0;
  const rows = [];
  const upfront = dec.type === 'base' ? o.base : dec.type === 'pro_cash' ? o.pro : 0;
  bal -= upfront;
  rows.push({ m: 0, income: 0, expenses: 0, pay: upfront, bal });
  min = bal;
  for (let i = 0; i < 6; i++) {
    let inc = L3.income[i];
    if (dec.type === 'postpone') { inc -= L3.lossWithoutLaptop; lost += L3.lossWithoutLaptop; }
    let pay = 0;
    if (dec.type === 'inst') { pay = o.inst.pay + (dec.protection ? o.inst.protection : 0); if (dec.protection) overpay += o.inst.protection; }
    bal += inc;
    if (bal < L3.expenses + pay) failed = true;
    bal -= L3.expenses + pay;
    rows.push({ m: i + 1, income: inc, expenses: L3.expenses, pay, bal });
    min = Math.min(min, bal);
  }
  let status = failed ? 'bad' : min < L3.cushion ? 'edge' : 'ok';
  if (!failed && dec.type === 'postpone' && lost > o.inst.n * o.inst.protection) status = 'edge';
  return { status, min, rows, overpay, lost, upfront };
}

/* ----- Level 4: shared trip ----- */
const L4 = {
  house: 24000, refund: 3000, share: 6000, maxPaid: 6000,
  facts: {
    lesha: 'Лёша предупреждал, что приедет только на субботу',
    anya: 'Аня писала «я точно в деле» уже после оплаты',
    dima: 'Дима хотел поехать, если освободится место',
    conds: 'Условия отмены: вернут 3 000 ₽ до субботы 12:00',
  },
  weights: { equal: 2, nights: 1, comp: 1.5 },
};
/* p = { anya: full|half|zero|dima, lesha: equal|nights|comp, cancelled } */
function split4(p) {
  const refund = p.cancelled ? L4.refund : 0;
  const anya = p.anya === 'full' ? L4.share : p.anya === 'half' ? L4.share / 2 : 0;
  const dima = p.anya === 'dima' ? L4.share : 0;
  const R = L4.house - refund - anya - dima;
  const w = L4.weights[p.lesha], sum = 4 + w;
  const r10 = x => Math.round(x / 10) * 10;
  const lesha = r10(R * w / sum), max = r10(R * 2 / sum);
  return { refund, anya, dima, lesha, max, me: R - lesha - max, maxDelta: max - L4.maxPaid };
}

/* ----- Level 5: delayed income ----- */
const L5 = {
  from: 8, to: 21, start: 20000, piggy: 5000,
  pays: [
    { day: 9, amount: 1200, title: 'Подписки', key: 'subs' }, { day: 10, amount: 600, title: 'Связь' },
    { day: 12, amount: 25000, title: 'Аренда', key: 'rent' }, { day: 15, amount: 4500, title: 'Рассрочка за ноутбук' },
  ],
  food: 700, foodEco: 500, rentNow: 12000, rentLater: 13000,
  incomes: {
    client: { day: 15, amount: 40000, title: 'Оплата заказчика' },
    artem: { day: 16, amount: 15000, title: 'Долг Артёма' },
    job: { day: 15, amount: 6000, title: 'Подработка в кафе' },
  },
  loan: { amount: 15000, back: 16500, days: 30 }, scam: 1500, scam2: 2900,
  facts: {
    landlord: 'Договорился с арендодателем о части аренды',
    job: 'Нашёл подработку на выходные',
    scam: 'Проверил предложение «займ за 5 минут»',
    loan: 'Открыл условия займа в банке',
  },
};
/* p = { start, piggy (amount), subs, eco, rent, job, client, artem } */
function run5(p) {
  let bal = p.start + (p.piggy || 0), min = bal, failDay = null;
  const rows = [];
  for (let d = L5.from; d <= L5.to; d++) {
    const ev = [];
    for (const k of ['client', 'artem', 'job']) {
      const inc = L5.incomes[k];
      if (p[k] && inc.day === d) { bal += inc.amount; ev.push({ text: inc.title, amount: inc.amount }); }
    }
    for (const x of L5.pays) {
      if (x.day !== d) continue;
      if (x.key === 'subs' && p.subs) { ev.push({ text: 'Подписки на паузе', amount: 0 }); continue; }
      const part = x.key === 'rent' && p.rent;
      const a = part ? L5.rentNow : x.amount;
      bal -= a; ev.push({ text: part ? 'Аренда, часть (ещё 13 000 ₽ — 22-го)' : x.title, amount: -a });
    }
    bal -= p.eco ? L5.foodEco : L5.food;
    if (bal < 0 && failDay == null) failDay = d;
    min = Math.min(min, bal);
    rows.push({ day: d, bal, ev });
  }
  return { min, failDay, end: bal, rows };
}
/* Stress test: the client delays again and Artyom does not pay back */
function outcome5(p) {
  const stress = run5({ ...p, client: false, artem: false });
  const status = stress.failDay ? 'bad' : (p.loan || stress.min < 1000) ? 'edge' : 'ok';
  return { status, stress, plan: run5(p) };
}

/* ----- Level 6: «delegation» scam ----- */
const L6 = {
  facts: {
    number: 'Сверил номер деканата на сайте вуза',
    sms: 'Прочитал SMS: код нельзя сообщать никому',
    starosta: 'Староста ничего не знает о делегации',
    official: 'Официальный деканат: делегации нет',
    bank: 'Поддержка банка: «защищённых счетов» не бывает',
  },
};

/* ----- Level 7: subscription through resellers ----- */
const L7 = {
  budget: 15000, months: 6, analog: 490,
  facts: {
    account: 'Выяснил, чей будет аккаунт и кто знает пароль',
    refund: 'Спросил, что будет, если доступ пропадёт',
    seller: 'Проверил профиль продавца и отзывы',
    teacher: 'Узнал у преподавателя, нужен ли именно PixelForge',
  },
  offers: {
    A: { title: '«Семейный слот» PixelForge Pro', price: 249, monthly: true, works: 3, seller: 'Макс | подписки', chat: 'sellerA', since: 'на «Объявлениях» с 2021 года', rating: '★ 4,6 · 312 отзывов', desc: 'Логин и пароль от готового аккаунта, вход сразу. Всё работает, не переживай!',
         lost: 'На 4-й месяц продавец сменил пароль от своего аккаунта. Доступ пропал, а вместе с ним и файлы курсовой: они лежали в чужом аккаунте.' },
    B: { title: 'Оплачу PixelForge Pro на ваш аккаунт', price: 1290, monthly: true, works: 4, seller: 'Ольга | оплата сервисов', chat: 'sellerB', since: 'на «Объявлениях» с 2019 года', rating: '★ 4,9 · 1 204 отзыва', desc: 'Оплачиваю подписку на ваш личный аккаунт. Нужны логин, пароль и код из почты.',
         lost: 'На 5-й месяц сервис заблокировал аккаунт за несоответствие региона оплаты. Файлы курсовой остались внутри, вернуть их не удалось.' },
    C: { title: 'KeyForever: ключ PixelForge Pro навсегда', price: 990, once: true, works: 0, seller: 'keyforever-shop.ru', chat: 'keyshop', since: 'реклама в поиске', rating: '★ 5,0 · 5 000+ отзывов', desc: 'Вечная лицензия за 990 ₽! Только сегодня скидка 50%. Оплата переводом на карту.',
         lost: 'Ключ не активировался. Чат сайта перестал отвечать, а через неделю сайт исчез.' },
    D: { title: 'Годовой код PixelForge Pro, безопасная сделка', price: 11900, once: true, works: 6, seller: 'Магазин «КодМаркет»', since: 'на «Объявлениях» с 2017 года', rating: '★ 4,8 · 8 930 отзывов', desc: 'Официальный код на 12 месяцев для вашего аккаунта. Деньги у площадки, пока код не активирован.' },
    E: { title: '«Холст» — графический редактор', price: 490, monthly: true, works: 6, seller: 'Официальный магазин «Холст»', since: 'российский сервис', rating: '★ 4,7 · 25 000 отзывов', desc: '90% функций PixelForge, экспорт в PDF и PNG. Студенческая подписка 490 ₽ в месяц.' },
  },
};
/* Six months of the course project for a chosen offer. After losing access the player switches to «Холст». */
function run7(type) {
  const o = L7.offers[type], rows = [];
  let total = 0, lostAt = null;
  for (let m = 1; m <= L7.months; m++) {
    let pay = 0, tool, note = '';
    if (m <= o.works) {
      tool = type === 'E' ? '«Холст»' : 'PixelForge Pro';
      pay = o.monthly ? o.price : (m === 1 ? o.price : 0);
    } else {
      if (lostAt == null) { lostAt = m; note = type === 'C' ? 'Ключ не сработал' : 'Доступ пропал'; }
      if (type === 'C' && m === 1) pay += o.price;
      tool = '«Холст»'; pay += L7.analog;
    }
    total += pay;
    rows.push({ m, tool, pay, note });
  }
  const scammed = type === 'C' ? o.price : 0;
  const lostFiles = type === 'A' || type === 'B';
  const status = type === 'C' ? 'bad' : lostFiles ? 'edge' : 'ok';
  return { rows, total, lostAt, scammed, lostFiles, status };
}

/* ----- Level 8: first car ----- */
const L8 = {
  savings: 420000, checkFee: 299,
  facts: {
    report: 'Пробил машины в «Автопроверке»',
    notowner: 'Выяснил, что Денис не собственник Весты',
    owner: 'Попросил связаться с собственником — Денис увильнул',
    fines: 'Андрей объяснил запрет и готов погасить штрафы',
  },
  cars: {
    A: { title: 'Lada Vesta, 2019', price: 360000, seller: 'Денис | авто', chat: 'deniz', km: '68 000 км', desc: 'Один хозяин, не бита, не крашена. Хозяин в командировке, договор уже подписал — оформим хоть сегодня. Цена ниже рынка, продать срочно.',
         owner: 'Смирнов Олег Петрович', ban: 'нет', leasing: 'нет', wanted: 'нет' },
    B: { title: 'Kia Rio, 2018', price: 415000, seller: 'Андрей | собственник', chat: 'andrey', km: '82 000 км', desc: 'Продаю свою машину, переезжаю в другой город. Нужно продать за две недели. Все вопросы по телефону или в чате.',
         owner: 'Козлов Андрей Викторович', ban: 'есть: запрет на регистрационные действия, судебные приставы, долг по штрафам ГИБДД 18 400 ₽', leasing: 'нет', wanted: 'нет' },
  },
};
/* Outcome of the car purchase: A, B_now, B_after or none */
function outcome8(choice) {
  if (choice === 'A') return { status: 'bad', spent: L8.cars.A.price, car: false };
  if (choice === 'B_now') return { status: 'edge', spent: L8.cars.B.price, car: true };
  if (choice === 'B_after') return { status: 'ok', spent: L8.cars.B.price, car: true };
  return { status: 'edge', spent: 0, car: false };
}

/* ----- Level 9: «secret investigation» ----- */
const L9 = {
  savings: 600000, flat: 8000000, weeks: 4,
  facts: {
    changed: 'Заметил, что с бабушкой что-то не так',
    calls: 'Узнал, что ей звонят «из органов»',
    secret: 'Узнал, что ей запретили кому-либо рассказывать',
    mama: 'Подключил маму',
    together: 'Уговорил бабушку вместе позвонить в банк по официальному номеру',
  },
};
/* together: week when grandma agreed to call the bank together (0 = never); harsh: rude messages */
function outcome9(p) {
  if (p.together && p.together <= 2 && p.harsh === 0) return { status: 'ok', lost: 0, flat: true };
  if (p.together && p.together <= 2) return { status: 'edge', lost: 0, flat: true, hurt: true };
  if (p.together) return { status: 'edge', lost: L9.savings, flat: true, hurt: p.harsh > 0 };
  return { status: 'bad', lost: L9.savings + L9.flat, flat: false, hurt: p.harsh > 0 };
}

/* Autotests for every row of the expected-outcome tables in the spec */
function simSelfTest() {
  const r = [];
  const t = (name, got, want) => r.push({ name, ok: got === want, got, want });
  t('L2 надёжный 15000', outcome2('reliable', 15000).status, 'edge');
  t('L2 надёжный 15000: после аренды 8000', L2.start - 15000 - L2.rent.amount, 8000);
  t('L2 неопределённый 15000', outcome2('uncertain', 15000).status, 'bad');
  t('L2 с запасом 15000', outcome2('reserve', 15000).status, 'edge');
  for (const v of ['reliable', 'uncertain', 'reserve']) {
    t('L2 ' + v + ' 11000', outcome2(v, 11000).status, 'ok');
    t('L2 ' + v + ' отказ', outcome2(v, 0).status, 'ok');
  }
  t('L3 рассрочка без защиты: мин', run3({ type: 'inst', protection: false }).min, 23000);
  t('L3 рассрочка без защиты', run3({ type: 'inst', protection: false }).status, 'ok');
  t('L3 рассрочка с защитой: мин', run3({ type: 'inst', protection: true }).min, 17040);
  t('L3 рассрочка с защитой: переплата', run3({ type: 'inst', protection: true }).overpay, 8940);
  t('L3 рассрочка с защитой', run3({ type: 'inst', protection: true }).status, 'ok');
  t('L3 базовая: мин', run3({ type: 'base' }).min, 2000);
  t('L3 базовая', run3({ type: 'base' }).status, 'edge');
  t('L3 про сразу', run3({ type: 'pro_cash' }).status, 'na');
  const s1 = split4({ anya: 'dima', lesha: 'nights', cancelled: false });
  t('L4 Дима + по ночам: Лёша', s1.lesha, 3600); t('L4 Дима + по ночам: Макс', s1.max, 7200); t('L4 Дима + по ночам: ты', s1.me, 7200);
  t('L4 поровну, без отмены', split4({ anya: 'full', lesha: 'equal', cancelled: false }).me, 6000);
  t('L4 отмена + половина: ты', split4({ anya: 'half', lesha: 'nights', cancelled: true }).me, 7200);
  t('L4 без отмены + половина: ты', split4({ anya: 'half', lesha: 'nights', cancelled: false }).me, 8400);
  t('L5 аренда частями + подработка + копилка', outcome5({ start: 20000, piggy: 5000, rent: true, job: true }).status, 'ok');
  t('L5 расчёт на заказчика: план сходится', run5({ start: 20000, rent: true, client: true }).failDay, null);
  t('L5 расчёт на заказчика: стресс', outcome5({ start: 20000, rent: true, client: true }).stress.failDay, 15);
  t('L5 ничего не менять', outcome5({ start: 20000, piggy: 5000 }).stress.failDay, 12);
  t('L7 семейный слот: итого', run7('A').total, 2217);
  t('L7 семейный слот', run7('A').status, 'edge');
  t('L7 на свой аккаунт: итого', run7('B').total, 6140);
  t('L7 ключ навсегда: итого', run7('C').total, 3930);
  t('L7 ключ навсегда', run7('C').status, 'bad');
  t('L7 годовой код: итого', run7('D').total, 11900);
  t('L7 аналог: итого', run7('E').total, 2940);
  t('L7 аналог', run7('E').status, 'ok');
  t('L8 перекуп', outcome8('A').status, 'bad');
  t('L8 после снятия запрета', outcome8('B_after').status, 'ok');
  t('L8 бюджет хватает на Kia', L8.savings >= L8.cars.B.price, true);
  t('L9 вовремя и мягко', outcome9({ together: 2, harsh: 0 }).status, 'ok');
  t('L9 поздно', outcome9({ together: 4, harsh: 0 }).lost, 600000);
  t('L9 не уговорил', outcome9({ together: 0, harsh: 1 }).status, 'bad');
  t('L5 займ + пауза + копилка', outcome5({ start: 35000, piggy: 5000, subs: true, loan: true }).status, 'edge');
  return r;
}

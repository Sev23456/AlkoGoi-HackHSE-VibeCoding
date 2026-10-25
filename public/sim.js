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
  t('L5 займ + пауза + копилка', outcome5({ start: 35000, piggy: 5000, subs: true, loan: true }).status, 'edge');
  return r;
}

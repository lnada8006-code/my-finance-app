require('dotenv').config();
const express = require('express');
const session = require('express-session');
const passport = require('passport');
const YandexStrategy = require('passport-yandex').Strategy;
const db = require('./db');

const app = express();
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: 'временный_секрет_поменяем_позже',
  resave: false,
  saveUninitialized: false
}));
app.use(passport.initialize());
app.use(passport.session());

passport.use(new YandexStrategy({
    clientID: process.env.YANDEX_CLIENT_ID,
    clientSecret: process.env.YANDEX_CLIENT_SECRET,
    callbackURL: process.env.YANDEX_CALLBACK_URL || 'http://localhost:3000/auth/callback'
  },
  function(accessToken, refreshToken, profile, done) {
    const yandexId = profile.id;
    const displayName = profile.displayName || profile.username || 'Друг';
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;

    let user = db.prepare('SELECT * FROM users WHERE yandex_id = ?').get(yandexId);
    if (user) {
      db.prepare('UPDATE users SET display_name = ?, email = ? WHERE yandex_id = ?')
        .run(displayName, email, yandexId);
      user = db.prepare('SELECT * FROM users WHERE yandex_id = ?').get(yandexId);
    } else {
      const info = db.prepare('INSERT INTO users (yandex_id, display_name, email) VALUES (?, ?, ?)')
        .run(yandexId, displayName, email);
      user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
    }
    return done(null, user);
  }
));

passport.serializeUser((user, done) => done(null, user.id));
passport.deserializeUser((id, done) => {
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(id);
  done(null, user);
});

function getAccountStats(account) {
  const paid = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE account_id = ? AND amount > 0").get(account.id).s;
  const expense = db.prepare("SELECT COALESCE(SUM(amount),0) as s FROM transactions WHERE account_id = ? AND amount < 0").get(account.id).s;
  const expenseAbs = Math.abs(expense);
  const contract = account.contract_amount || 0;
  const debt = contract - paid;
  const profit = paid - expenseAbs;
  const projectedProfit = contract - expenseAbs;
  return { contract, paid, expense: expenseAbs, debt, profit, projectedProfit };
}

// Иконка по типу объекта
function typeIcon(type) {
  const map = {
    'заказ': '🏗️',
    'недвижимость': '🏠',
    'транспорт': '🚗',
    'оборудование': '📦',
    'другое': '📁'
  };
  return map[type] || '📁';
}

// Общие CSS-стили для всех страниц
const COMMON_STYLES = `
  :root {
    --primary: #FC3F1D;
    --bg: #f5f7fa;
    --card: #ffffff;
    --text: #1f2937;
    --muted: #6b7280;
    --border: #e5e7eb;
    --success: #10b981;
    --danger: #ef4444;
  }
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background: var(--bg);
    color: var(--text);
    padding: 20px 16px 40px;
    max-width: 520px;
    margin-left: auto;
    margin-right: auto;
  }
  h2 { font-size: 22px; margin: 0; }
  h3 { font-size: 16px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; margin: 20px 0 10px; }
  a { color: var(--primary); text-decoration: none; }
  .card { background: var(--card); border-radius: 16px; padding: 16px; box-shadow: 0 2px 8px rgba(0,0,0,0.04); }
  .row { display: flex; justify-content: space-between; align-items: center; }
  .muted { color: var(--muted); font-size: 13px; }
  .money { font-weight: 700; }
  .positive { color: var(--success); }
  .negative { color: var(--danger); }
  input, select, button {
    font-family: inherit;
    font-size: 15px;
  }
  input, select {
    width: 100%;
    padding: 12px 14px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: #fff;
    outline: none;
    transition: border 0.15s;
  }
  input:focus, select:focus { border-color: var(--primary); }
  button {
    padding: 14px;
    background: var(--primary);
    color: white;
    border: none;
    border-radius: 12px;
    font-size: 16px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }
  button:hover { opacity: 0.9; }
  .form-col { display: flex; flex-direction: column; gap: 10px; }
  .card-link {
    display: block;
    background: var(--card);
    border-radius: 16px;
    padding: 16px;
    margin-bottom: 12px;
    text-decoration: none;
    color: inherit;
    box-shadow: 0 2px 8px rgba(0,0,0,0.04);
    transition: transform 0.1s, box-shadow 0.15s;
  }
  .card-link:hover { transform: translateY(-1px); box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
  .icon-circle {
    width: 44px;
    height: 44px;
    border-radius: 12px;
    background: #fff2ee;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 22px;
    flex-shrink: 0;
  }
  .badge {
    display: inline-block;
    font-size: 12px;
    padding: 3px 8px;
    border-radius: 8px;
    font-weight: 600;
  }
  .badge-danger { background: #fee2e2; color: #b91c1c; }
  .badge-success { background: #d1fae5; color: #065f46; }
`;

// ===== ГЛАВНАЯ =====
app.get('/', (req, res) => {
  if (!req.user) {
    return res.send(`
      <!DOCTYPE html><html><head><meta charset="utf-8"><title>Вход</title>
      <style>${COMMON_STYLES}</style></head>
      <body style="display:flex; flex-direction:column; justify-content:center; min-height:90vh; text-align:center;">
        <div style="font-size:48px; margin-bottom:16px;">💼</div>
        <h1 style="margin:0 0 8px;">Учёт объектов</h1>
        <p class="muted" style="margin:0 0 32px;">Войдите, чтобы видеть, кто сколько должен</p>
        <a href="/auth/yandex" style="display:inline-block; padding:14px 28px; background:var(--primary); color:white; text-decoration:none; border-radius:12px; font-weight:600; font-size:16px;">
          Войти через Яндекс
        </a>
      </body></html>
    `);
  }

  const accounts = db.prepare('SELECT * FROM accounts WHERE user_id = ? ORDER BY id DESC').all(req.user.id);
  let totalDebt = 0, totalPaid = 0, totalContract = 0;

  const accountsData = accounts.map(a => {
    const s = getAccountStats(a);
    totalDebt += s.debt > 0 ? s.debt : 0;
    totalPaid += s.paid;
    totalContract += s.contract;
    return {
      id: a.id,
      name: a.name,
      type: a.type || 'другое',
      contract: s.contract,
      paid: s.paid,
      expense: s.expense,
      debt: s.debt,
      icon: typeIcon(a.type)
    };
  });

  res.send(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Мои объекты</title></head>
    <body>
      <style>${COMMON_STYLES}</style>

      <div class="row" style="margin-bottom:20px;">
        <div class="row" style="gap:12px;">
          <div style="width:42px; height:42px; border-radius:50%; background:var(--primary); color:white; display:flex; align-items:center; justify-content:center; font-weight:700; font-size:18px;">
            ${(req.user.display_name || 'Д').charAt(0).toUpperCase()}
          </div>
          <div>
            <div style="font-weight:600;">${req.user.display_name}</div>
            <div class="muted" style="font-size:12px;">${req.user.email || ''}</div>
          </div>
        </div>
        <a href="/logout" class="muted" style="font-size:14px;">Выйти</a>
      </div>

      <div style="background:linear-gradient(135deg,#FC3F1D,#ff6b4a); color:white; border-radius:20px; padding:24px; margin-bottom:20px; box-shadow:0 8px 20px rgba(252,63,29,0.25);">
        <div style="font-size:14px; opacity:0.9;">Должны мне по всем объектам</div>
        <div style="font-size:34px; font-weight:800; margin:4px 0;">${totalDebt.toLocaleString('ru-RU')} ₽</div>
        <div style="font-size:13px; opacity:0.9;">
          По договорам: ${totalContract.toLocaleString('ru-RU')} ₽ • Оплачено: ${totalPaid.toLocaleString('ru-RU')} ₽
        </div>
      </div>

      <h3>Мои объекты</h3>

      <div class="card" style="margin-bottom:14px; display:flex; flex-direction:column; gap:8px;">
        <input id="searchInput" placeholder="🔍 Поиск по названию..." oninput="renderAccounts()">
        <div style="display:flex; gap:8px; align-items:center;">
          <select id="sortSelect" onchange="renderAccounts()" style="flex:1;">
            <option value="debt">По долгу (большие сверху)</option>
            <option value="date">По дате (новые сверху)</option>
            <option value="name">По названию (А–Я)</option>
          </select>
          <label style="display:flex; align-items:center; gap:6px; font-size:13px; color:var(--muted); white-space:nowrap;">
            <input type="checkbox" id="hidePaidCheck" onchange="renderAccounts()" style="width:auto;"> Скрыть оплаченные
          </label>
        </div>
      </div>

      <div id="accountsList"></div>

      <h3 style="margin-top:32px;">Создать объект</h3>
      <form method="POST" action="/accounts" class="form-col">
        <input name="name" placeholder="Название (например, Владимировка)" required>
        <select name="type">
          <option value="заказ">🏗️ Заказ / подряд</option>
          <option value="недвижимость">🏠 Недвижимость</option>
          <option value="транспорт">🚗 Транспорт</option>
          <option value="оборудование">📦 Оборудование</option>
          <option value="другое">📁 Другое</option>
        </select>
        <input name="contract_amount" type="number" step="0.01" min="0" placeholder="Сумма договора, ₽">
        <button type="submit">Создать</button>
      </form>

      <script>
        const accountsData = ${JSON.stringify(accountsData)};
        function formatMoney(n) { return n.toLocaleString('ru-RU') + ' ₽'; }

        function renderAccounts() {
          const search = document.getElementById('searchInput').value.toLowerCase().trim();
          const sort = document.getElementById('sortSelect').value;
          const hidePaid = document.getElementById('hidePaidCheck').checked;

          let list = accountsData.slice();
          if (search) list = list.filter(a => a.name.toLowerCase().includes(search));
          if (hidePaid) list = list.filter(a => a.debt > 0);
          if (sort === 'debt') list.sort((a, b) => b.debt - a.debt);
          else if (sort === 'name') list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));

          const container = document.getElementById('accountsList');
          if (list.length === 0) {
            container.innerHTML = '<div class="card" style="text-align:center; color:var(--muted);">Ничего не найдено</div>';
            return;
          }

          container.innerHTML = list.map(a => {
            const badge = a.debt > 0
              ? '<span class="badge badge-danger">Долг: ' + formatMoney(a.debt) + '</span>'
              : (a.debt < 0
                  ? '<span class="badge badge-success">Переплата: ' + formatMoney(Math.abs(a.debt)) + '</span>'
                  : '<span class="badge badge-success">Оплачено ✓</span>');

            return '<a href="/accounts/' + a.id + '" class="card-link">' +
              '<div class="row" style="gap:12px; align-items:flex-start;">' +
                '<div class="row" style="gap:12px; align-items:center; flex:1; min-width:0;">' +
                  '<div class="icon-circle">' + a.icon + '</div>' +
                  '<div style="min-width:0;">' +
                    '<div style="font-weight:600; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">' + a.name + '</div>' +
                    '<div class="muted" style="font-size:12px;">' + a.type + '</div>' +
                  '</div>' +
                '</div>' +
                '<div style="text-align:right; flex-shrink:0;">' + badge + '</div>' +
              '</div>' +
              '<div class="muted" style="font-size:12px; margin-top:10px; padding-top:10px; border-top:1px solid var(--border);">' +
                'Договор: ' + formatMoney(a.contract) + ' • Оплачено: ' + formatMoney(a.paid) + ' • Расходы: ' + formatMoney(a.expense) +
              '</div>' +
            '</a>';
          }).join('');
        }
        renderAccounts();
      </script>
    </body></html>
  `);
});

// ===== СТРАНИЦА ОБЪЕКТА =====
app.get('/accounts/:id', (req, res) => {
  if (!req.user) return res.redirect('/');

  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!account) return res.status(404).send('Объект не найден');

  const transactions = db.prepare('SELECT * FROM transactions WHERE account_id = ? ORDER BY date DESC, id DESC')
    .all(account.id);
  const s = getAccountStats(account);

  const txHtml = transactions.length
    ? transactions.map(x => {
        const c = x.amount >= 0 ? 'positive' : 'negative';
        const sign = x.amount > 0 ? '+' : '';
        return `
          <div class="row" style="padding:12px 0; border-bottom:1px solid var(--border);">
            <div>
              <div style="font-size:14px;">${x.description || 'Без описания'}</div>
              <div class="muted" style="font-size:12px;">${x.category || 'без категории'} • ${x.date}</div>
            </div>
            <div class="money ${c}">${sign}${x.amount.toLocaleString('ru-RU')} ₽</div>
          </div>
        `;
      }).join('')
    : '<div class="muted" style="text-align:center; padding:20px 0;">Операций пока нет</div>';

  const debtBadge = s.debt > 0
    ? `<span class="badge badge-danger">Долг: ${s.debt.toLocaleString('ru-RU')} ₽</span>`
    : (s.debt < 0
        ? `<span class="badge badge-success">Переплата: ${Math.abs(s.debt).toLocaleString('ru-RU')} ₽</span>`
        : `<span class="badge badge-success">Оплачено полностью ✓</span>`);

  res.send(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${account.name}</title></head>
    <body>
      <style>${COMMON_STYLES}</style>

      <div class="row" style="margin-bottom:16px;">
        <a href="/">← Назад</a>
        <a href="/accounts/${account.id}/edit" style="font-size:14px;">Редактировать</a>
      </div>

      <div class="row" style="gap:12px; align-items:center; margin-bottom:20px;">
        <div class="icon-circle" style="width:52px; height:52px; font-size:26px;">${typeIcon(account.type)}</div>
        <div>
          <h2>${account.name}</h2>
          <div class="muted">${account.type || 'без типа'}</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:14px;">
        <div class="muted" style="font-size:13px; margin-bottom:6px;">Долг заказчика</div>
        <div style="margin-bottom:14px;">${debtBadge}</div>
        <div class="row" style="padding-top:12px; border-top:1px solid var(--border); font-size:14px;">
          <span class="muted">Договор</span><span class="money">${s.contract.toLocaleString('ru-RU')} ₽</span>
        </div>
        <div class="row" style="margin-top:8px; font-size:14px;">
          <span class="muted">Оплачено</span><span class="money positive">${s.paid.toLocaleString('ru-RU')} ₽</span>
        </div>
      </div>

      <div class="card" style="margin-bottom:20px;">
        <div class="row" style="font-size:14px;">
          <span class="muted">Расходы</span><span class="money negative">${s.expense.toLocaleString('ru-RU')} ₽</span>
        </div>
        <div class="row" style="margin-top:8px; font-size:14px;">
          <span class="muted">Прибыль в кассе</span>
          <span class="money ${s.profit >= 0 ? 'positive' : 'negative'}">${s.profit.toLocaleString('ru-RU')} ₽</span>
        </div>
        <div class="row" style="margin-top:8px; font-size:14px;">
          <span class="muted">Если всё оплатят</span>
          <span class="money ${s.projectedProfit >= 0 ? 'positive' : 'negative'}">${s.projectedProfit.toLocaleString('ru-RU')} ₽</span>
        </div>
      </div>

      <h3>Операции</h3>
      <div class="card" style="margin-bottom:20px;">${txHtml}</div>

      <h3>Добавить операцию</h3>
      <form method="POST" action="/accounts/${account.id}/transactions" class="form-col">
        <select name="kind" onchange="updateCategories(this.value)">
          <option value="income">💰 Доход (поступление от заказчика)</option>
          <option value="expense">💸 Расход (трата)</option>
        </select>
        <select name="category" id="categorySelect">
          <option value="Задаток">Задаток</option>
          <option value="Оплата от заказчика">Оплата от заказчика</option>
          <option value="Прочее поступление">Прочее поступление</option>
        </select>
        <input name="amount" type="number" step="0.01" min="0" placeholder="Сумма, ₽" required>
        <input name="description" placeholder="Описание (необязательно)">
        <input name="date" type="date">
        <button type="submit">Добавить</button>
      </form>

      <script>
        const categories = {
          income: ['Задаток', 'Оплата от заказчика', 'Прочее поступление'],
          expense: ['Зарплата работникам', 'Закупка материалов', 'Закупка оборудования', 'Налоги', 'Прочие расходы']
        };
        function updateCategories(kind) {
          const sel = document.getElementById('categorySelect');
          sel.innerHTML = categories[kind].map(c => '<option value="' + c + '">' + c + '</option>').join('');
        }
      </script>
    </body></html>
  `);
});

// ===== РЕДАКТИРОВАНИЕ ОБЪЕКТА (форма) =====
app.get('/accounts/:id/edit', (req, res) => {
  if (!req.user) return res.redirect('/');

  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!account) return res.status(404).send('Объект не найден');

  const types = [
    ['заказ', '🏗️ Заказ / подряд'],
    ['недвижимость', '🏠 Недвижимость'],
    ['транспорт', '🚗 Транспорт'],
    ['оборудование', '📦 Оборудование'],
    ['другое', '📁 Другое']
  ];
  const typeOptions = types.map(([v, label]) =>
    `<option value="${v}" ${account.type === v ? 'selected' : ''}>${label}</option>`
  ).join('');

  res.send(`
    <!DOCTYPE html>
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Редактировать</title></head>
    <body>
      <style>${COMMON_STYLES}</style>

      <a href="/accounts/${account.id}">← Назад к объекту</a>
      <h2 style="margin-top:16px;">Редактировать объект</h2>

      <form method="POST" action="/accounts/${account.id}/edit" class="form-col" style="margin-top:16px;">
        <label class="muted" style="font-size:13px;">Название</label>
        <input name="name" value="${account.name.replace(/"/g, '&quot;')}" required>

        <label class="muted" style="font-size:13px;">Тип</label>
        <select name="type">${typeOptions}</select>

        <label class="muted" style="font-size:13px;">Сумма договора, ₽</label>
        <input name="contract_amount" type="number" step="0.01" min="0" value="${account.contract_amount || 0}">

        <button type="submit" style="margin-top:8px;">Сохранить</button>
      </form>
    </body></html>
  `);
});

// ===== РЕДАКТИРОВАНИЕ ОБЪЕКТА (сохранение) =====
app.post('/accounts/:id/edit', (req, res) => {
  if (!req.user) return res.redirect('/');

  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!account) return res.status(404).send('Объект не найден');

  const { name, type, contract_amount } = req.body;
  if (!name || !name.trim()) return res.redirect('/accounts/' + account.id + '/edit');

  const contract = parseFloat(contract_amount) || 0;

  db.prepare('UPDATE accounts SET name = ?, type = ?, contract_amount = ? WHERE id = ? AND user_id = ?')
    .run(name.trim(), type || null, contract, account.id, req.user.id);

  res.redirect('/accounts/' + account.id);
});

// ===== ДОБАВЛЕНИЕ ОПЕРАЦИИ =====
app.post('/accounts/:id/transactions', (req, res) => {
  if (!req.user) return res.redirect('/');

  const account = db.prepare('SELECT * FROM accounts WHERE id = ? AND user_id = ?')
    .get(req.params.id, req.user.id);
  if (!account) return res.status(404).send('Объект не найден');

  const kind = req.body.kind === 'expense' ? 'expense' : 'income';
  const rawAmount = parseFloat(req.body.amount);
  if (isNaN(rawAmount) || rawAmount <= 0) return res.redirect('/accounts/' + account.id);

  const amount = kind === 'expense' ? -rawAmount : rawAmount;
  const category = (req.body.category || '').trim() || null;
  const description = (req.body.description || '').trim() || null;
  const date = req.body.date || new Date().toISOString().slice(0, 10);

  db.prepare('INSERT INTO transactions (account_id, amount, category, description, date) VALUES (?, ?, ?, ?, ?)')
    .run(account.id, amount, category, description, date);

  res.redirect('/accounts/' + account.id);
});

// ===== СОЗДАНИЕ ОБЪЕКТА =====
app.post('/accounts', (req, res) => {
  if (!req.user) return res.redirect('/');
  const { name, type, contract_amount } = req.body;
  if (!name || !name.trim()) return res.redirect('/');
  const contract = parseFloat(contract_amount) || 0;
  db.prepare('INSERT INTO accounts (user_id, name, type, currency, contract_amount) VALUES (?, ?, ?, ?, ?)')
    .run(req.user.id, name.trim(), type || null, 'RUB', contract);
  res.redirect('/');
});

// ===== АВТОРИЗАЦИЯ =====
app.get('/auth/yandex', passport.authenticate('yandex'));
app.get('/auth/callback',
  passport.authenticate('yandex', { failureRedirect: '/' }),
  (req, res) => res.redirect('/')
);

app.get('/logout', (req, res) => {
  req.logout(() => res.redirect('/'));
});

const PORT = process.env.PORT || 3000;
app.get('/health', (req, res) => {
  res.status(200).send('OK');
});
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Сервер запущен на порту ${PORT}!`);
});
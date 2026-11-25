const { Pool } = require('pg');

// Строка подключения берётся из переменной окружения
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: false // для внутренней сети Timeweb SSL не нужен
});

// Функция для создания таблиц при старте
async function initDb() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        yandex_id TEXT UNIQUE NOT NULL,
        display_name TEXT,
        email TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS accounts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id),
        name TEXT NOT NULL,
        type TEXT,
        currency TEXT DEFAULT 'RUB',
        contract_amount REAL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS transactions (
        id SERIAL PRIMARY KEY,
        account_id INTEGER NOT NULL REFERENCES accounts(id),
        amount REAL NOT NULL,
        category TEXT,
        description TEXT,
        date TEXT DEFAULT to_char(CURRENT_DATE, 'YYYY-MM-DD'),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `);

    console.log('Таблицы PostgreSQL готовы');
  } catch (err) {
    console.error('Ошибка инициализации базы:', err);
  }
}

initDb();

module.exports = pool;
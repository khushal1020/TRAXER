import express from 'express';
import { randomBytes, randomUUID, createHash, argon2, timingSafeEqual } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const presetCategories = ['Food', 'Transport', 'Home', 'Health', 'Shopping', 'Bills', 'Entertainment', 'Other'];
const sessionDuration = 7 * 24 * 60 * 60;

function hashPassword(password) {
  return new Promise((resolveHash, reject) => {
    const salt = randomBytes(16);
    argon2('argon2id', {
      message: Buffer.from(password),
      nonce: salt,
      parallelism: 1,
      tagLength: 32,
      memory: 19456,
      passes: 2,
    }, (error, hash) => {
      if (error) return reject(error);
      resolveHash(`$argon2id$v=19$m=19456,t=2,p=1$${salt.toString('base64')}$${hash.toString('base64')}`);
    });
  });
}

function verifyPassword(password, encoded) {
  const parts = encoded.split('$');
  if (parts.length !== 6 || parts[1] !== 'argon2id') return Promise.resolve(false);
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  return new Promise((resolveVerify, reject) => {
    argon2('argon2id', {
      message: Buffer.from(password),
      nonce: salt,
      parallelism: 1,
      tagLength: expected.length,
      memory: 19456,
      passes: 2,
    }, (error, actual) => {
      if (error) return reject(error);
      resolveVerify(actual.length === expected.length && timingSafeEqual(actual, expected));
    });
  });
}

export function initializeDatabase(database) {
  database.exec(`
    PRAGMA foreign_keys = ON;
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      display_name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry_idx ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS expenses (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      description TEXT NOT NULL,
      amount_cents INTEGER NOT NULL CHECK (amount_cents BETWEEN 1 AND 10000000000),
      category TEXT NOT NULL,
      expense_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE INDEX IF NOT EXISTS expenses_owner_date_idx ON expenses(user_id, expense_date DESC, id DESC);
    CREATE INDEX IF NOT EXISTS expenses_owner_category_idx ON expenses(user_id, category);
    CREATE INDEX IF NOT EXISTS expenses_owner_amount_idx ON expenses(user_id, amount_cents);
  `);
}

function cookieValue(req, name) {
  const cookieHeader = req.headers.cookie ?? '';
  for (const piece of cookieHeader.split(';')) {
    const [key, ...valueParts] = piece.trim().split('=');
    if (key === name) return decodeURIComponent(valueParts.join('='));
  }
  return null;
}

function hashToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function fail(status, message, field) {
  const error = new Error(message);
  error.status = status;
  error.field = field;
  throw error;
}

function isCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === value;
}

function validateExpense(input, partial = false) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) fail(400, 'Enter valid expense details.');
  const result = {};
  const fields = ['description', 'amount', 'category', 'date'];
  for (const key of Object.keys(input)) {
    if (!fields.includes(key)) fail(400, 'One or more fields are not supported.');
  }
  if (!partial || Object.hasOwn(input, 'description')) {
    if (typeof input.description !== 'string') fail(400, 'Enter a description.', 'description');
    const description = input.description.trim();
    if (description.length < 1 || description.length > 120) fail(400, 'Description must be 1–120 characters.', 'description');
    result.description = description;
  }
  if (!partial || Object.hasOwn(input, 'amount')) {
    const amount = typeof input.amount === 'number' ? input.amount : Number(input.amount);
    if (!Number.isFinite(amount) || amount < 0.01 || amount > 100000000) fail(400, 'Amount must be between ₹0.01 and ₹10,00,00,000.', 'amount');
    result.amountCents = Math.round(amount * 100);
  }
  if (!partial || Object.hasOwn(input, 'category')) {
    if (typeof input.category !== 'string') fail(400, 'Choose a category.', 'category');
    const category = input.category.trim();
    if (category.length < 1 || category.length > 40) fail(400, 'Category must be 1–40 characters.', 'category');
    result.category = category;
  }
  if (!partial || Object.hasOwn(input, 'date')) {
    if (!isCalendarDate(input.date)) fail(400, 'Enter a valid expense date.', 'date');
    result.date = input.date;
  }
  return result;
}

function validateMonth(month) {
  if (typeof month !== 'string' || !/^\d{4}-\d{2}$/.test(month)) fail(400, 'Enter a valid calendar month.');
  const [year, monthNumber] = month.split('-').map(Number);
  if (year < 1 || monthNumber < 1 || monthNumber > 12) fail(400, 'Enter a valid calendar month.');
  const lastDay = new Date(Date.UTC(year, monthNumber, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` };
}

function expenseFromRow(row) {
  return {
    id: row.id,
    description: row.description,
    amount: row.amount_cents / 100,
    category: row.category,
    date: row.expense_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function createApp({ database } = {}) {
  const databasePath = process.env.DATABASE_PATH || resolve(here, '../data/expensetrack.sqlite');
  if (!database) mkdirSync(dirname(resolve(databasePath)), { recursive: true });
  const db = database ?? new DatabaseSync(databasePath);
  initializeDatabase(db);
  const app = express();
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    next();
  });
  app.use(express.json({ limit: '32kb', strict: true }));

  const setSessionCookie = (res, token) => {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `expensetrack_session=${encodeURIComponent(token)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionDuration}${secure}`);
  };
  const clearSessionCookie = (res) => {
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    res.setHeader('Set-Cookie', `expensetrack_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0${secure}`);
  };

  app.use('/api', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    const token = cookieValue(req, 'expensetrack_session');
    if (!token) return next();
    const session = db.prepare(`SELECT users.id, users.display_name, users.email
      FROM sessions JOIN users ON users.id = sessions.user_id
      WHERE sessions.token_hash = ? AND sessions.expires_at > ?`).get(hashToken(token), Math.floor(Date.now() / 1000));
    if (session) req.user = { id: session.id, displayName: session.display_name, email: session.email };
    next();
  });

  const authAttempts = new Map();
  const limitAuthAttempts = (limit, windowMs) => (req, res, next) => {
    const key = `${req.path}:${req.socket.remoteAddress || 'local'}`;
    const now = Date.now();
    const current = authAttempts.get(key);
    if (current && now - current.start < windowMs && current.count >= limit) {
      return res.status(429).json({ error: 'Too many attempts. Please wait a little and try again.' });
    }
    if (!current || now - current.start >= windowMs) authAttempts.set(key, { start: now, count: 1 });
    else current.count += 1;
    if (authAttempts.size > 1000) {
      for (const [entry, value] of authAttempts) if (now - value.start >= windowMs) authAttempts.delete(entry);
    }
    next();
  };

  const requireAuth = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Sign in to continue.' });

  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));

  app.post('/api/auth/register', limitAuthAttempts(5, 15 * 60 * 1000), async (req, res, next) => {
    try {
      const { displayName, email, password } = req.body ?? {};
      if (Object.keys(req.body ?? {}).some((key) => !['displayName', 'email', 'password'].includes(key))) fail(400, 'One or more fields are not supported.');
      if (typeof displayName !== 'string' || displayName.trim().length < 1 || displayName.trim().length > 60) fail(400, 'Name must be 1–60 characters.', 'displayName');
      if (typeof email !== 'string' || email.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) fail(400, 'Enter a valid email address.', 'email');
      if (typeof password !== 'string' || password.length < 8 || password.length > 128) fail(400, 'Password must be 8–128 characters.', 'password');
      const normalizedEmail = email.trim().toLowerCase();
      if (db.prepare('SELECT id FROM users WHERE email = ? COLLATE NOCASE').get(normalizedEmail)) fail(409, 'An account with this email already exists.', 'email');
      const userId = randomUUID();
      const passwordHash = await hashPassword(password);
      db.prepare('INSERT INTO users(id, display_name, email, password_hash) VALUES (?, ?, ?, ?)')
        .run(userId, displayName.trim(), normalizedEmail, passwordHash);
      const token = randomBytes(32).toString('base64url');
      db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)')
        .run(hashToken(token), userId, Math.floor(Date.now() / 1000) + sessionDuration);
      setSessionCookie(res, token);
      res.status(201).json({ user: { id: userId, displayName: displayName.trim(), email: normalizedEmail } });
    } catch (error) { next(error); }
  });

  app.post('/api/auth/login', limitAuthAttempts(10, 15 * 60 * 1000), async (req, res, next) => {
    try {
      if (Object.keys(req.body ?? {}).some((key) => !['email', 'password'].includes(key))) fail(400, 'One or more fields are not supported.');
      const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
      const password = typeof req.body?.password === 'string' ? req.body.password : '';
      if (!email || !password) fail(400, 'Enter your email and password.');
      const row = db.prepare('SELECT id, display_name, email, password_hash FROM users WHERE email = ? COLLATE NOCASE').get(email);
      if (!row || !(await verifyPassword(password, row.password_hash))) fail(401, 'Email or password is incorrect.');
      const token = randomBytes(32).toString('base64url');
      db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Math.floor(Date.now() / 1000));
      db.prepare('INSERT INTO sessions(token_hash, user_id, expires_at) VALUES (?, ?, ?)')
        .run(hashToken(token), row.id, Math.floor(Date.now() / 1000) + sessionDuration);
      setSessionCookie(res, token);
      res.json({ user: { id: row.id, displayName: row.display_name, email: row.email } });
    } catch (error) { next(error); }
  });

  app.post('/api/auth/logout', (req, res) => {
    const token = cookieValue(req, 'expensetrack_session');
    if (token) db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    clearSessionCookie(res);
    res.status(204).end();
  });

  app.get('/api/auth/me', requireAuth, (req, res) => res.json({ user: req.user }));

  app.get('/api/categories', requireAuth, (req, res) => {
    const existing = db.prepare('SELECT DISTINCT category FROM expenses WHERE user_id = ? ORDER BY category COLLATE NOCASE').all(req.user.id).map((item) => item.category);
    res.json({ categories: [...new Set([...presetCategories, ...existing])] });
  });

  app.get('/api/dashboard', requireAuth, (req, res, next) => {
    try {
      const { start, end } = validateMonth(req.query.month);
      const row = db.prepare('SELECT COALESCE(SUM(amount_cents), 0) AS total FROM expenses WHERE user_id = ? AND expense_date >= ? AND expense_date <= ?')
        .get(req.user.id, start, end);
      res.json({ month: req.query.month, thisMonthTotal: row.total / 100 });
    } catch (error) { next(error); }
  });

  app.get('/api/expenses', requireAuth, (req, res, next) => {
    try {
      const { q = '', category = '', min = '', max = '', from = '', to = '', sort = 'date', order = 'desc' } = req.query;
      if (typeof q !== 'string' || q.length > 120) fail(400, 'Search must be 120 characters or fewer.', 'q');
      if (typeof category !== 'string' || category.length > 40) fail(400, 'Choose a valid category.', 'category');
      if (!['date', 'amount'].includes(sort)) fail(400, 'Choose date or amount sorting.', 'sort');
      if (!['asc', 'desc'].includes(order)) fail(400, 'Choose ascending or descending order.', 'order');
      const page = Number(req.query.page ?? 1);
      const pageSize = Number(req.query.pageSize ?? 25);
      if (!Number.isInteger(page) || page < 1 || page > 1000000) fail(400, 'Enter a valid page number.', 'page');
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) fail(400, 'Page size must be between 1 and 100.', 'pageSize');
      const conditions = ['user_id = ?'];
      const params = [req.user.id];
      if (q.trim()) {
        conditions.push("description LIKE ? ESCAPE '\\'");
        params.push(`%${q.trim().replace(/[\\%_]/g, '\\$&')}%`);
      }
      if (category) { conditions.push('category = ?'); params.push(category); }
      if (min !== '') {
        const value = Number(min);
        if (!Number.isFinite(value) || value < 0 || value > 100000000) fail(400, 'Enter a valid minimum amount.', 'min');
        conditions.push('amount_cents >= ?'); params.push(Math.ceil(value * 100));
      }
      if (max !== '') {
        const value = Number(max);
        if (!Number.isFinite(value) || value < 0 || value > 100000000) fail(400, 'Enter a valid maximum amount.', 'max');
        conditions.push('amount_cents <= ?'); params.push(Math.floor(value * 100));
      }
      if (min !== '' && max !== '' && Number(min) > Number(max)) fail(400, 'Minimum amount cannot exceed maximum.', 'min');
      if (from) {
        if (!isCalendarDate(from)) fail(400, 'Enter a valid start date.', 'from');
        conditions.push('expense_date >= ?'); params.push(from);
      }
      if (to) {
        if (!isCalendarDate(to)) fail(400, 'Enter a valid end date.', 'to');
        conditions.push('expense_date <= ?'); params.push(to);
      }
      if (from && to && from > to) fail(400, 'Start date cannot be after end date.', 'from');
      const where = conditions.join(' AND ');
      const summary = db.prepare(`SELECT COUNT(*) AS count, COALESCE(SUM(amount_cents), 0) AS total FROM expenses WHERE ${where}`).get(...params);
      const categories = db.prepare(`SELECT category, SUM(amount_cents) AS total FROM expenses WHERE ${where} GROUP BY category ORDER BY total DESC, category COLLATE NOCASE ASC`).all(...params)
        .map((item) => ({ category: item.category, amount: item.total / 100 }));
      const sortColumn = sort === 'amount' ? 'amount_cents' : 'expense_date';
      const rows = db.prepare(`SELECT id, description, amount_cents, category, expense_date, created_at, updated_at
        FROM expenses WHERE ${where} ORDER BY ${sortColumn} ${order.toUpperCase()}, expense_date DESC, id DESC LIMIT ? OFFSET ?`)
        .all(...params, pageSize, (page - 1) * pageSize);
      res.json({
        expenses: rows.map(expenseFromRow),
        page,
        pageSize,
        totalCount: summary.count,
        totalAmount: summary.total / 100,
        categories,
        totalPages: Math.ceil(summary.count / pageSize),
      });
    } catch (error) { next(error); }
  });

  app.get('/api/expenses/:id', requireAuth, (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid expense ID.' });
    const row = db.prepare('SELECT id, description, amount_cents, category, expense_date, created_at, updated_at FROM expenses WHERE id = ? AND user_id = ?').get(req.params.id, req.user.id);
    if (!row) return res.status(404).json({ error: 'Expense not found.' });
    res.json({ expense: expenseFromRow(row) });
  });

  app.post('/api/expenses', requireAuth, (req, res, next) => {
    try {
      const expense = validateExpense(req.body);
      const id = randomUUID();
      db.prepare('INSERT INTO expenses(id, user_id, description, amount_cents, category, expense_date) VALUES (?, ?, ?, ?, ?, ?)')
        .run(id, req.user.id, expense.description, expense.amountCents, expense.category, expense.date);
      const row = db.prepare('SELECT id, description, amount_cents, category, expense_date, created_at, updated_at FROM expenses WHERE id = ? AND user_id = ?').get(id, req.user.id);
      res.status(201).json({ expense: expenseFromRow(row) });
    } catch (error) { next(error); }
  });

  app.patch('/api/expenses/:id', requireAuth, (req, res, next) => {
    try {
      const id = req.params.id;
      if (!/^[0-9a-f-]{36}$/i.test(id)) fail(400, 'Invalid expense ID.');
      const current = db.prepare('SELECT id FROM expenses WHERE id = ? AND user_id = ?').get(id, req.user.id);
      if (!current) fail(404, 'Expense not found.');
      const expense = validateExpense(req.body, true);
      const values = [];
      for (const [key, column] of [['description', 'description'], ['amountCents', 'amount_cents'], ['category', 'category'], ['date', 'expense_date']]) {
        if (Object.hasOwn(expense, key)) values.push(`${column} = ?`);
      }
      if (!values.length) fail(400, 'Update at least one expense field.');
      const args = [];
      for (const key of ['description', 'amountCents', 'category', 'date']) if (Object.hasOwn(expense, key)) args.push(expense[key]);
      args.push(id, req.user.id);
      db.prepare(`UPDATE expenses SET ${values.join(', ')}, updated_at = datetime('now') WHERE id = ? AND user_id = ?`).run(...args);
      const row = db.prepare('SELECT id, description, amount_cents, category, expense_date, created_at, updated_at FROM expenses WHERE id = ? AND user_id = ?').get(id, req.user.id);
      res.json({ expense: expenseFromRow(row) });
    } catch (error) { next(error); }
  });

  app.delete('/api/expenses/:id', requireAuth, (req, res) => {
    if (!/^[0-9a-f-]{36}$/i.test(req.params.id)) return res.status(400).json({ error: 'Invalid expense ID.' });
    const result = db.prepare('DELETE FROM expenses WHERE id = ? AND user_id = ?').run(req.params.id, req.user.id);
    if (!result.changes) return res.status(404).json({ error: 'Expense not found.' });
    res.status(204).end();
  });

  app.use((error, _req, res, _next) => {
    if (res.headersSent) return;
    if (error?.type === 'entity.parse.failed') return res.status(400).json({ error: 'Enter valid JSON.' });
    if (error?.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(409).json({ error: 'An account with this email already exists.', field: 'email' });
    const status = error.status ?? 500;
    if (status >= 500) console.error(error);
    res.status(status).json({ error: status >= 500 ? 'Something went wrong. Please try again.' : error.message, ...(error.field ? { field: error.field } : {}) });
  });

  return app;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const app = createApp();
  const port = Number(process.env.PORT || 4000);

  app.listen(port, '0.0.0.0', () => {
    console.log(`Traxer API ready on port ${port}`);
  });
}

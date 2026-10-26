import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { createApp } from '../src/index.js';

async function createHarness() {
  const database = new DatabaseSync(':memory:');
  const app = createApp({ database });
  const server = await new Promise((resolve) => {
    const instance = app.listen(0, '127.0.0.1', () => resolve(instance));
  });
  const base = `http://127.0.0.1:${server.address().port}`;
  return { database, server, base, close: () => new Promise((resolve) => server.close(resolve)) };
}

function client(base, cookie = '') {
  return async (path, { method = 'GET', body, ...options } = {}) => {
    const response = await fetch(`${base}/api${path}`, {
      method,
      headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(cookie ? { cookie } : {}), ...options.headers },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    const data = response.status === 204 ? null : await response.json();
    return { response, data };
  };
}

async function register(base, displayName, email) {
  const call = client(base);
  const { response, data } = await call('/auth/register', { method: 'POST', body: { displayName, email, password: 'secure-pass-123' } });
  assert.equal(response.status, 201);
  const cookie = response.headers.get('set-cookie').split(';')[0];
  return { call: client(base, cookie), cookie, user: data.user };
}

test('accounts authenticate, sessions restore, and expense ownership is enforced', async (t) => {
  const h = await createHarness();
  t.after(async () => { await h.close(); h.database.close(); });
  const first = await register(h.base, 'Alex Morgan', 'alex@example.com');
  const second = await register(h.base, 'Sam Taylor', 'sam@example.com');

  const created = await first.call('/expenses', { method: 'POST', body: { description: 'Coffee', amount: 4.5, category: 'Food', date: '2026-10-26', ownerId: second.user.id } });
  assert.equal(created.response.status, 400, 'unexpected owner fields are rejected');
  const ownExpense = await first.call('/expenses', { method: 'POST', body: { description: 'Coffee', amount: 4.5, category: 'Food', date: '2026-10-26' } });
  assert.equal(ownExpense.response.status, 201);
  assert.equal(ownExpense.data.expense.amount, 4.5);

  const otherList = await second.call('/expenses');
  assert.equal(otherList.data.totalCount, 0);
  assert.equal((await second.call(`/expenses/${ownExpense.data.expense.id}`)).response.status, 404);
  assert.equal((await second.call(`/expenses/${ownExpense.data.expense.id}`, { method: 'DELETE' })).response.status, 404);
  assert.equal((await second.call(`/expenses/${ownExpense.data.expense.id}`, { method: 'PATCH', body: { description: 'Changed' } })).response.status, 404);

  const restored = await client(h.base, first.cookie)('/auth/me');
  assert.equal(restored.data.user.displayName, 'Alex Morgan');
  const loggedOut = await first.call('/auth/logout', { method: 'POST' });
  assert.equal(loggedOut.response.status, 204);
  assert.equal((await first.call('/expenses')).response.status, 401, 'revoked sessions cannot continue reading protected data');
  const loginCall = client(h.base);
  assert.equal((await loginCall('/auth/login', { method: 'POST', body: { email: 'alex@example.com', password: 'incorrect-password' } })).response.status, 401);
  const successfulLogin = await loginCall('/auth/login', { method: 'POST', body: { email: 'alex@example.com', password: 'secure-pass-123' } });
  assert.equal(successfulLogin.response.status, 200);
  const newSession = client(h.base, successfulLogin.response.headers.get('set-cookie').split(';')[0]);
  assert.equal((await newSession('/auth/me')).data.user.email, 'alex@example.com');
});

test('filters are inclusive, pagination does not truncate aggregates, and categories reconcile', async (t) => {
  const h = await createHarness();
  t.after(async () => { await h.close(); h.database.close(); });
  const account = await register(h.base, 'Jamie Lee', 'jamie@example.com');
  const records = [
    ['Market', 10, 'Food', '2026-10-01'],
    ['Groceries', 20, 'Food', '2026-10-31'],
    ['Train ticket', 30, 'Transport', '2026-11-01'],
  ];
  for (const [description, amount, category, date] of records) {
    const result = await account.call('/expenses', { method: 'POST', body: { description, amount, category, date } });
    assert.equal(result.response.status, 201);
  }

  const filtered = await account.call('/expenses?category=Food&from=2026-10-01&to=2026-10-31&pageSize=1&page=2&sort=amount&order=asc');
  assert.equal(filtered.data.totalCount, 2);
  assert.equal(filtered.data.totalAmount, 30);
  assert.equal(filtered.data.expenses.length, 1);
  assert.equal(filtered.data.expenses[0].description, 'Groceries');
  assert.equal(filtered.data.totalPages, 2);
  assert.equal(filtered.data.categories.reduce((sum, row) => sum + row.amount, 0), filtered.data.totalAmount);

  const searched = await account.call('/expenses?q=groceries');
  assert.equal(searched.data.totalCount, 1);
  assert.equal(searched.data.expenses[0].description, 'Groceries');
  const amountRange = await account.call('/expenses?min=20&max=30&sort=amount&order=asc');
  assert.equal(amountRange.data.totalCount, 2);
  assert.deepEqual(amountRange.data.expenses.map((expense) => expense.amount), [20, 30]);
  const dateAscending = await account.call('/expenses?from=2026-10-01&to=2026-10-31&sort=date&order=asc');
  assert.deepEqual(dateAscending.data.expenses.map((expense) => expense.description), ['Market', 'Groceries']);
  const combined = await account.call('/expenses?q=market&category=Food&min=10&max=10&from=2026-10-01&to=2026-10-01');
  assert.equal(combined.data.totalCount, 1, 'search, category, amount, and inclusive date filters combine');

  const match = await account.call('/expenses?q=%25_%5C');
  assert.equal(match.data.totalCount, 0, 'search metacharacters are matched literally');
  const badRange = await account.call('/expenses?from=2026-11-02&to=2026-11-01');
  assert.equal(badRange.response.status, 400);
  const month = await account.call('/dashboard?month=2026-10');
  assert.equal(month.data.thisMonthTotal, 30);
});

test('registration and expense input validation return field errors', async (t) => {
  const h = await createHarness();
  t.after(async () => { await h.close(); h.database.close(); });
  const call = client(h.base);
  const invalid = await call('/auth/register', { method: 'POST', body: { displayName: ' ', email: 'bad', password: 'short' } });
  assert.equal(invalid.response.status, 400);
  assert.equal(invalid.data.field, 'displayName');
  const account = await register(h.base, 'Riley', 'riley@example.com');
  const badExpense = await account.call('/expenses', { method: 'POST', body: { description: 'x'.repeat(121), amount: Infinity, category: '', date: '2026-02-30' } });
  assert.equal(badExpense.response.status, 400);
  assert.ok(badExpense.data.field);
});

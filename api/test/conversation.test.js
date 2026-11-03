import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
// Las pruebas usan siempre el intérprete demo: deterministas y sin consumo de un proveedor real.
process.env.AI_PROVIDER = 'demo';
const { db } = await import('../src/db.js');
const { advance } = await import('../src/services/conversation.js');

const sessions = [], emails = [];
after(async () => {
  await db.query('DELETE FROM sessions WHERE id = ANY($1)', [sessions]);
  await db.query('DELETE FROM customers WHERE email = ANY($1)', [emails]);
  await db.end();
});
async function newSession() {
  const id = randomUUID();
  await db.query('INSERT INTO sessions(id) VALUES($1)', [id]);
  sessions.push(id);
  return id;
}
function newEmail() {
  const value = `test.${randomUUID()}@example.com`;
  emails.push(value);
  return value;
}
async function say(id, ...turns) {
  let state;
  for (const text of turns) state = await advance(id, { text });
  return state;
}
const customer = async email => (await db.query('SELECT * FROM customers WHERE email = $1', [email])).rows;

test('un conflicto de identidad no guarda, conserva nombre y apellidos y vuelve a pedir el correo', async () => {
  const owned = newEmail();
  await db.query("INSERT INTO customers(id, first_name, last_name, email) VALUES($1, 'Lucía', 'Gómez', $2)", [randomUUID(), owned]);
  const id = await newSession();
  const state = await say(id, 'Ana', 'Pérez', owned, 'Sí');
  assert.equal(state.status, 'collecting');
  assert.equal(state.step, 'email');
  assert.deepEqual(state.draft, { firstName: 'Ana', lastName: 'Pérez', email: '' });
  const [row] = await customer(owned);
  assert.equal(row.first_name, 'Lucía');
});

test('si el CRM falla al confirmar no se pierde el borrador ni quedan mensajes a medias', async () => {
  const email = newEmail();
  const id = await newSession();
  const before = await say(id, 'Ana', 'Pérez', email);
  await assert.rejects(advance(id, { text: 'Sí', fault: 'crm-unavailable' }), { status: 503 });
  const { rows: [{ count }] } = await db.query('SELECT count(*)::int FROM messages WHERE session_id = $1', [id]);
  assert.equal(count, before.messages.length);
  assert.equal((await customer(email)).length, 0);
  const retried = await say(id, 'Sí');
  assert.equal(retried.status, 'completed');
  assert.equal((await customer(email)).length, 1);
});

test('repetir la confirmación tras completar no duplica el contacto ni falla', async () => {
  const email = newEmail();
  const id = await newSession();
  const done = await say(id, 'Ana', 'Pérez', email, 'Sí');
  const repeated = await say(id, 'Sí');
  assert.equal(repeated.status, 'completed');
  assert.equal(repeated.customerId, done.customerId);
  assert.equal(repeated.messages.length, done.messages.length);
  assert.equal((await customer(email)).length, 1);
});

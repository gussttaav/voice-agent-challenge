import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/db.js';
import { saveCustomer } from '../src/services/crm.js';

after(() => db.end());
// Cada prueba trabaja dentro de una transacción que se deshace al terminar.
async function inRollback(fn) {
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await fn(client);
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
}
const email = () => `test.${randomUUID()}@example.com`;
const countByEmail = async (client, value) => (await client.query(
  'SELECT count(*)::int AS n FROM customers WHERE lower(email) = lower($1)', [value])).rows[0].n;

test('un correo existente con otro nombre es un conflicto y no modifica el contacto', () => inRollback(async client => {
  const owned = email();
  await saveCustomer({ firstName: 'José María', lastName: 'De la Torre', email: owned }, client);
  const saved = await saveCustomer({ firstName: 'Ana', lastName: 'Pérez', email: owned }, client);
  assert.deepEqual(saved, { outcome: 'conflict' });
  const { rows: [row] } = await client.query('SELECT first_name, last_name FROM customers WHERE email = $1', [owned]);
  assert.deepEqual(row, { first_name: 'José María', last_name: 'De la Torre' });
}));

test('mismo correo con mayúsculas y mismo nombre sin acentos es una coincidencia', () => inRollback(async client => {
  const owned = email();
  const first = await saveCustomer({ firstName: 'Xoán', lastName: "O'Connor", email: owned }, client);
  const again = await saveCustomer({ firstName: 'xoan', lastName: 'o’connor ', email: owned.toUpperCase() }, client);
  assert.equal(again.outcome, 'matched');
  assert.equal(again.customer.id, first.customer.id);
  assert.equal(await countByEmail(client, owned), 1);
}));

test('el correo se guarda normalizado en minúsculas', () => inRollback(async client => {
  const saved = await saveCustomer({ firstName: 'Ana', lastName: 'Pérez', email: `  ${email().toUpperCase()} ` }, client);
  assert.equal(saved.outcome, 'created');
  assert.equal(saved.customer.email, saved.customer.email.trim().toLowerCase());
}));

test('homónimos con distinto correo son contactos distintos', () => inRollback(async client => {
  const a = await saveCustomer({ firstName: 'Sergio', lastName: 'Alcedo García', email: email() }, client);
  const b = await saveCustomer({ firstName: 'Sergio', lastName: 'Alcedo García', email: email() }, client);
  assert.equal(b.outcome, 'created');
  assert.notEqual(a.customer.id, b.customer.id);
}));

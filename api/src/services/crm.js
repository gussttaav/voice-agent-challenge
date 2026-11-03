import { randomUUID } from 'node:crypto';
import { db, customerJson } from '../db.js';
export async function searchCustomers(query = '') {
  const { rows } = await db.query(`SELECT * FROM customers WHERE
    first_name ILIKE $1 OR last_name ILIKE $1 OR email ILIKE $1 ORDER BY created_at DESC LIMIT 50`, [`%${query}%`]);
  return rows.map(customerJson);
}
export const canonicalEmail = email => email.trim().toLowerCase();
// Compara nombres sin distinguir mayúsculas, acentos ni espacios repetidos.
const comparable = value => value.normalize('NFD').replace(/\p{Diacritic}/gu, '')
  .replace(/[’´`]/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
async function findByEmail(email, client) {
  const { rows: [row] } = await client.query(
    'SELECT * FROM customers WHERE lower(email) = $1 ORDER BY created_at LIMIT 1', [email]);
  return row;
}
// El correo identifica al contacto. Si ya existe con otro nombre es un conflicto de identidad:
// no se modifica y no se devuelven sus datos para no revelarlos a quien llama.
function resolveExisting(row, data) {
  const same = comparable(row.first_name) === comparable(data.firstName)
    && comparable(row.last_name) === comparable(data.lastName);
  return same ? { outcome: 'matched', customer: customerJson(row) } : { outcome: 'conflict' };
}
export async function saveCustomer(data, client = db) {
  const customer = { firstName: data.firstName.trim(), lastName: data.lastName.trim(), email: canonicalEmail(data.email) };
  const existing = await findByEmail(customer.email, client);
  if (existing) return resolveExisting(existing, customer);
  const { rows: [created] } = await client.query(`INSERT INTO customers(id, first_name, last_name, email)
    VALUES($1,$2,$3,$4) ON CONFLICT(email) DO NOTHING RETURNING *`,
    [randomUUID(), customer.firstName, customer.lastName, customer.email]);
  if (created) return { outcome: 'created', customer: customerJson(created) };
  // Otra petición lo ha insertado a la vez: se resuelve igual que un contacto existente.
  return resolveExisting(await findByEmail(customer.email, client), customer);
}

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyTurn } from '../src/services/dialog.js';
import { demoTurn } from '../src/providers/demo.js';
import { cleanEmail, cleanName } from '../src/services/validation.js';

const empty = () => ({ draft: { firstName: '', lastName: '', email: '' }, step: 'firstName' });
// Recorre una conversación en memoria con el intérprete demo y devuelve el último turno.
async function talk(...turns) {
  let state = empty(), result;
  for (const text of turns) {
    result = applyTurn(state, await demoTurn(state, text));
    state = { draft: result.draft, step: result.step };
  }
  return result;
}
const filled = ['Ana', 'Pérez', 'ana.perez@example.com'];

test('«No, no es correcto» no confirma y pregunta qué corregir', async () => {
  const result = await talk(...filled, 'No, no es correcto');
  assert.equal(result.confirmed, false);
  assert.equal(result.step, 'confirmation');
  assert.match(result.reply, /qué dato quieres corregir/i);
});

test('las negaciones nunca confirman aunque contengan «sí» o «correcto»', async () => {
  for (const answer of ['incorrecto', 'Así no', 'no son correctos', 'está mal']) {
    assert.equal((await talk(...filled, answer)).confirmed, false, answer);
  }
});

test('un sí explícito confirma', async () => {
  for (const answer of ['Sí', 'si', 'Sí, correcto', 'vale']) {
    assert.equal((await talk(...filled, answer)).confirmed, true, answer);
  }
});

test('una respuesta ambigua no confirma y repite el resumen', async () => {
  const result = await talk(...filled, 'bueno, más o menos');
  assert.equal(result.confirmed, false);
  assert.match(result.reply, /no te he entendido/);
});

test('una corrección en la confirmación se aplica y exige confirmar de nuevo', async () => {
  const result = await talk(...filled, 'Sí, pero el correo es ana punto ruiz arroba example punto com');
  assert.equal(result.confirmed, false);
  assert.equal(result.draft.email, 'ana.ruiz@example.com');
  assert.deepEqual([result.draft.firstName, result.draft.lastName], ['Ana', 'Pérez']);
  assert.match(result.reply, /^Corregido/);
});

test('rechazar un dato concreto lo vuelve a pedir sin perder los demás', async () => {
  const asked = await talk(...filled, 'No, el correo está mal');
  assert.equal(asked.step, 'email');
  const result = await talk(...filled, 'No, el correo está mal', 'ana.gil@example.com');
  assert.equal(result.step, 'confirmation');
  assert.equal(result.confirmed, false);
  assert.deepEqual(result.draft, { firstName: 'Ana', lastName: 'Pérez', email: 'ana.gil@example.com' });
});

test('tras preguntar qué corregir, basta con nombrar el dato', async () => {
  const result = await talk(...filled, 'No', 'el apellido', 'Pérez Gil');
  assert.equal(result.step, 'confirmation');
  assert.equal(result.confirmed, false);
  assert.equal(result.draft.lastName, 'Pérez Gil');
});

test('si una corrección no cambia el dato, se dice y se ofrece escribirlo', async () => {
  const result = await talk(...filled, 'No, el apellido', 'Pérez');
  assert.equal(result.step, 'confirmation');
  assert.match(result.reply, /sigo teniendo «Pérez»/);
});

test('se puede corregir un dato anterior mientras se pide otro', async () => {
  const result = await talk('José', 'De la Torre', 'Perdona, mi nombre es José María');
  assert.equal(result.step, 'email');
  assert.deepEqual(result.draft, { firstName: 'José María', lastName: 'De la Torre', email: '' });
  assert.match(result.reply, /^Anotado/);
});

test('se conservan nombres compuestos, partículas, apóstrofos y acentos', async () => {
  const result = await talk('Me llamo José María', "O'Connor de la Fuente");
  assert.deepEqual([result.draft.firstName, result.draft.lastName], ['José María', "O'Connor de la Fuente"]);
});

test('un correo inválido no entra en el borrador y se vuelve a pedir', async () => {
  const result = await talk('Ana', 'Pérez', 'hola');
  assert.equal(result.step, 'email');
  assert.equal(result.draft.email, '');
  assert.match(result.reply, /no parece un correo/);
});

test('los correos dictados se convierten a su forma escrita, sin tildes', async () => {
  const result = await talk('Ana', 'Pérez', 'Mi correo es Ana guion bajo Pérez arroba example punto com');
  assert.equal(result.draft.email, 'ana_perez@example.com');
});

test('el proveedor no puede borrar ni corromper datos ya recogidos', () => {
  const state = { draft: { firstName: 'Ana', lastName: 'Pérez', email: 'ana@example.com' }, step: 'confirmation' };
  const result = applyTurn(state, { updates: { firstName: '', email: 'no-es-un-correo' }, intent: 'confirm' });
  assert.equal(result.confirmed, false);
  assert.deepEqual(result.draft, state.draft);
});

test('validación de correo y nombre', () => {
  assert.equal(cleanEmail(' Ana.Perez@Example.COM. '), 'ana.perez@example.com');
  for (const value of ['hola', 'ana@', '@example.com', 'ana..perez@example.com', 'ana perez@example.com', 'ana@example']) {
    assert.equal(cleanEmail(value), null, value);
  }
  assert.equal(cleanName('  josé   maría. '), 'José María');
  assert.equal(cleanName('ortega bueno'), 'Ortega Bueno');
  assert.equal(cleanName('de la torre'), 'De la Torre');
  assert.equal(cleanName("O'Connor de la Fuente"), "O'Connor de la Fuente");
  assert.equal(cleanName('Ana2'), null);
  assert.equal(cleanName('ana@example.com'), null);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import Anthropic from '@anthropic-ai/sdk';
import { anthropicTurn } from '../src/providers/anthropic.js';

// Cliente real del SDK con un fetch falso: prueba la petición, el parseo y los errores sin red ni coste.
function fakeClient(status, body) {
  const requests = [];
  const client = new Anthropic({
    apiKey: 'test', maxRetries: 0,
    fetch: async (url, init) => {
      requests.push(JSON.parse(init.body));
      return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
    },
  });
  return { client, requests };
}
const message = (output, stopReason = 'end_turn') => ({
  id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5',
  content: [{ type: 'text', text: JSON.stringify(output) }],
  stop_reason: stopReason, stop_sequence: null, usage: { input_tokens: 120, output_tokens: 30 },
});
const session = {
  step: 'confirmation', draft: { firstName: 'Ana', lastName: 'Pérez', email: 'ana@example.com' },
  messages: [{ role: 'assistant', content: 'Hola' }, { role: 'user', content: 'Ana' }, { role: 'assistant', content: 'Tengo Ana Pérez…' }],
};

test('devuelve la extracción y el consumo; envía solo el contexto necesario con salida estructurada', async () => {
  const { client, requests } = fakeClient(200, message({
    updates: { firstName: '', lastName: 'Gil', email: '' }, intent: 'provide', field: 'none' }));
  const result = await anthropicTurn(session, 'sí pero el apellido es Gil', client);
  assert.deepEqual(result, { updates: { firstName: '', lastName: 'Gil', email: '' }, intent: 'provide', field: null,
    usage: { input_tokens: 120, output_tokens: 30 } });
  assert.equal(requests[0].system[0].cache_control.type, 'ephemeral');
  const [request] = requests;
  assert.equal(request.output_config.format.type, 'json_schema');
  const sent = JSON.parse(request.messages[0].content);
  assert.deepEqual(Object.keys(sent).sort(), ['draft', 'lastQuestion', 'step', 'transcript']);
  assert.equal(sent.lastQuestion, 'Tengo Ana Pérez…');
});

test('un 429 del proveedor se traduce en un error recuperable 429', async () => {
  const { client } = fakeClient(429, { type: 'error', error: { type: 'rate_limit_error', message: 'slow down' } });
  await assert.rejects(anthropicTurn(session, 'sí', client), { status: 429 });
});

test('una respuesta truncada o rechazada no se interpreta', async () => {
  for (const stopReason of ['max_tokens', 'refusal']) {
    const { client } = fakeClient(200, message({ updates: { firstName: '', lastName: '', email: '' }, intent: 'confirm', field: 'none' }, stopReason));
    await assert.rejects(anthropicTurn(session, 'sí', client), { status: 502 }, stopReason);
  }
});

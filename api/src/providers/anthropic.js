import Anthropic from '@anthropic-ai/sdk';
import { jsonSchemaOutputFormat } from '@anthropic-ai/sdk/helpers/json-schema';
import { readFile } from 'node:fs/promises';
const system = await readFile(new URL('./extraction-prompt.txt', import.meta.url), 'utf8');
const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5';
// La salida estructurada garantiza un JSON con esta forma; el contenido lo valida services/dialog.js.
// Todos los campos son obligatorios: un dato no mencionado llega como "" y el diálogo lo ignora.
const extraction = jsonSchemaOutputFormat({
  type: 'object',
  properties: {
    updates: {
      type: 'object',
      properties: { firstName: { type: 'string' }, lastName: { type: 'string' }, email: { type: 'string' } },
      required: ['firstName', 'lastName', 'email'],
      additionalProperties: false,
    },
    intent: { type: 'string', enum: ['provide', 'confirm', 'reject', 'unclear'] },
    field: { type: 'string', enum: ['firstName', 'lastName', 'email', 'none'] },
  },
  required: ['updates', 'intent', 'field'],
  additionalProperties: false,
});
// En una llamada no se puede esperar mucho: 8 s por intento y un reintento automático del SDK
// ante 429, 5xx o fallo de red. El peor caso (~17 s) queda por debajo del timeout del navegador (25 s).
let defaultClient;
const fail = (status, message) => Object.assign(new Error(message), { status });
function getClient() {
  if (!process.env.ANTHROPIC_API_KEY) throw fail(503, 'Falta ANTHROPIC_API_KEY en el backend.');
  return defaultClient ||= new Anthropic({ timeout: 8000, maxRetries: 1 });
}

export async function anthropicTurn(session, text, client = getClient()) {
  // Solo el contexto necesario: menos tokens, menos latencia y menos superficie para inyecciones.
  const lastQuestion = session.messages.findLast(message => message.role === 'assistant')?.content || '';
  let response;
  try {
    response = await client.messages.parse({
      model, max_tokens: 2048,
      // Se cachea solo el prompt de sistema, que es idéntico en todos los turnos; el mensaje cambia siempre.
      system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }],
      output_config: { effort: 'low', format: extraction },
      messages: [{ role: 'user', content: JSON.stringify({ step: session.step, draft: session.draft, lastQuestion, transcript: text }) }],
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'provider_failed', provider: 'anthropic', type: error.constructor.name, status: error.status }));
    if (error instanceof Anthropic.RateLimitError) throw fail(429, 'El servicio de IA está saturado. Espera unos segundos y reintenta.');
    if (error instanceof Anthropic.APIConnectionTimeoutError) throw fail(504, 'El servicio de IA ha tardado demasiado. Tus datos se conservan: reintenta.');
    throw fail(502, 'El servicio de IA no está disponible. Tus datos se conservan: reintenta o escribe tu respuesta más tarde.');
  }
  if (response.stop_reason !== 'end_turn' || !response.parsed_output) {
    console.error(JSON.stringify({ event: 'provider_unusable', provider: 'anthropic', stopReason: response.stop_reason }));
    throw fail(502, 'No he podido interpretar tu respuesta. ¿Puedes repetirla con otras palabras?');
  }
  const { updates, intent, field } = response.parsed_output;
  // input_tokens excluye lo escrito y leído de caché; las métricas cuentan toda la entrada procesada.
  const { input_tokens, cache_creation_input_tokens, cache_read_input_tokens, output_tokens } = response.usage;
  const usage = { input_tokens: input_tokens + (cache_creation_input_tokens || 0) + (cache_read_input_tokens || 0), output_tokens };
  return { updates, intent, field: field === 'none' ? null : field, usage };
}

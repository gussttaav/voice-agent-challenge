import express from 'express';
import { randomUUID } from 'node:crypto';
import { db, readSession } from './db.js';
import { greeting } from './providers/demo.js';
import { providerName } from './providers/index.js';
import { advance } from './services/conversation.js';
import { searchCustomers, saveCustomer } from './services/crm.js';
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '32kb' }));
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
app.param('id', (req, res, next, id) => uuid.test(id) ? next() : res.status(400).json({ error: 'Identificador inválido.' }));
app.get('/api/health', async (req, res) => {
  await db.query('SELECT 1');
  res.json({ status: 'ok', provider: providerName, faultsEnabled: process.env.ENABLE_FAULTS === 'true' });
});
app.post('/api/sessions', async (req, res) => {
  const id = randomUUID();
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    await client.query('INSERT INTO sessions(id) VALUES($1)', [id]);
    await client.query('INSERT INTO messages(session_id,role,content) VALUES($1,$2,$3)', [id, 'assistant', greeting]);
    await client.query('COMMIT');
  } catch (error) { await client.query('ROLLBACK'); throw error; }
  finally { client.release(); }
  res.status(201).json(await readSession(id));
});
app.get('/api/sessions/:id', async (req, res) => {
  const session = await readSession(req.params.id);
  res.status(session ? 200 : 404).json(session || { error: 'Conversación no encontrada.' });
});
app.post('/api/sessions/:id/turns', async (req, res) => {
  const { text, source = 'text', confidence = null, fault = 'none' } = req.body || {};
  if (typeof text !== 'string' || !text.trim() || text.length > 4000 || !['text', 'voice'].includes(source)
    || (confidence !== null && (typeof confidence !== 'number' || confidence < 0 || confidence > 1))) {
    return res.status(400).json({ error: 'Envía un texto de 1 a 4000 caracteres y un origen válido.' });
  }
  if (!['none', 'timeout', 'rate-limit', 'malformed', 'crm-unavailable'].includes(fault)) {
    return res.status(400).json({ error: 'Escenario desconocido.' });
  }
  if (fault !== 'none' && process.env.ENABLE_FAULTS !== 'true') return res.status(403).json({ error: 'Simulaciones desactivadas.' });
  res.json(await advance(req.params.id, { text: text.trim(), source, confidence, fault }));
});
app.get('/api/customers/search', async (req, res) => {
  res.json({ customers: await searchCustomers(String(req.query.q || '').slice(0, 200)) });
});
app.post('/api/customers', async (req, res) => {
  const { firstName, lastName, email } = req.body || {};
  if (![firstName, lastName, email].every(value => typeof value === 'string' && value.trim() && value.length <= 200)) {
    return res.status(400).json({ error: 'Nombre, apellidos y email son obligatorios.' });
  }
  const saved = await saveCustomer({ firstName, lastName, email });
  if (saved.outcome === 'conflict') return res.status(409).json({ error: 'El correo ya pertenece a otro contacto. No se ha modificado.' });
  res.status(saved.outcome === 'created' ? 201 : 200).json(saved.customer);
});
app.use((error, req, res, next) => {
  const status = error.status >= 400 && error.status <= 599 ? error.status : 500;
  console.error(JSON.stringify({ event: 'request_failed', method: req.method, status, type: error.name }));
  res.status(status).json({ error: status === 500 ? 'No se pudo completar la operación. Puedes reintentar.' : error.message });
});
const server = app.listen(Number(process.env.PORT || 3000), '0.0.0.0', () => console.log('API lista en puerto 3000'));
process.on('SIGTERM', () => server.close(() => db.end().then(() => process.exit(0))));

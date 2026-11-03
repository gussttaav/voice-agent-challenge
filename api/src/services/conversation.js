import { db, readSession } from '../db.js';
import { interpret, providerName } from '../providers/index.js';
import { saveCustomer } from './crm.js';
import { applyTurn } from './dialog.js';
const replies = {
  created: 'Listo. Tus datos se han guardado en el CRM. Gracias por tu tiempo.',
  matched: 'Ya tenías una ficha con estos mismos datos. La he vinculado sin modificarla. Gracias por tu tiempo.',
  conflict: 'Ese correo ya está registrado con otros datos, así que no he guardado nada. ¿Puedes confirmarme tu correo o darme otro?',
};
// Cada turno es una transacción con la sesión bloqueada: dos turnos simultáneos no se mezclan
// y un fallo (IA, CRM o base de datos) no deja mensajes, borradores ni contactos a medias.
export async function advance(id, { text, source = 'text', confidence = null, fault = 'none' }) {
  const start = performance.now();
  let usage;
  const client = await db.connect();
  try {
    await client.query('BEGIN');
    const { rows: [locked] } = await client.query('SELECT status FROM sessions WHERE id = $1 FOR UPDATE', [id]);
    if (!locked) throw Object.assign(new Error('Conversación no encontrada.'), { status: 404 });
    // Un reintento tras completar (p. ej. la respuesta se perdió por timeout) devuelve el resultado ya guardado.
    if (locked.status === 'completed') {
      await client.query('ROLLBACK');
      return readSession(id);
    }
    const session = await readSession(id, client);
    await client.query('INSERT INTO messages(session_id,role,content,source,confidence) VALUES($1,$2,$3,$4,$5)',
      [id, 'user', text, source, confidence]);
    const extraction = await interpret(session, text, fault);
    usage = extraction.usage;
    let { draft, step, reply, confirmed } = applyTurn(session, extraction);
    let status = 'collecting', customerId = null;
    if (confirmed) {
      if (fault === 'crm-unavailable') throw Object.assign(new Error('El CRM no está disponible. Tus datos se conservan: reintenta la confirmación.'), { status: 503 });
      const saved = await saveCustomer(draft, client);
      reply = replies[saved.outcome];
      if (saved.outcome === 'conflict') {
        draft = { ...draft, email: '' };
        step = 'email';
      } else {
        status = 'completed';
        customerId = saved.customer.id;
      }
    }
    await client.query(`UPDATE sessions SET draft=$2, step=$3, status=$4, customer_id=$5,
      updated_at=now() WHERE id=$1`, [id, draft, step, status, customerId]);
    await client.query('INSERT INTO messages(session_id,role,content) VALUES($1,$2,$3)', [id, 'assistant', reply]);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    await recordMetric(id, start, usage, 'error');
    throw error;
  } finally {
    client.release();
  }
  await recordMetric(id, start, usage, 'ok');
  return readSession(id);
}
// Las métricas se registran fuera de la transacción del turno: un fallo al guardarlas
// no debe ocultar el error original ni deshacer un turno ya confirmado.
async function recordMetric(id, start, usage, outcome) {
  await db.query(`INSERT INTO turn_metrics(session_id,provider,latency_ms,input_tokens,output_tokens,outcome)
    VALUES($1,$2,$3,$4,$5,$6)`, [id, providerName, Math.round(performance.now() - start),
    usage?.input_tokens || 0, usage?.output_tokens || 0, outcome])
    .catch(error => console.error(JSON.stringify({ event: 'metric_failed', type: error.name })));
}

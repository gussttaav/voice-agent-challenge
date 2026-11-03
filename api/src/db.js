import pg from 'pg';
export const db = new pg.Pool({ max: 10, connectionTimeoutMillis: 3000 });
export const customerJson = row => ({
  id: row.id, firstName: row.first_name, lastName: row.last_name,
  email: row.email, createdAt: row.created_at, updatedAt: row.updated_at,
});
export async function readSession(id, client = db) {
  const { rows: [session] } = await client.query('SELECT * FROM sessions WHERE id = $1', [id]);
  if (!session) return null;
  const { rows: messages } = await client.query(
    'SELECT id, role, content, source, confidence, created_at AS "createdAt" FROM messages WHERE session_id = $1 ORDER BY id', [id]);
  const { rows: [metrics] } = await client.query(
    `SELECT count(*)::int AS turns, COALESCE(sum(latency_ms),0)::int AS "totalLatencyMs",
    COALESCE(sum(input_tokens),0)::int AS "inputTokens", COALESCE(sum(output_tokens),0)::int AS "outputTokens",
    count(*) FILTER (WHERE outcome = 'error')::int AS errors FROM turn_metrics WHERE session_id = $1`, [id]);
  return { id: session.id, status: session.status, step: session.step, draft: session.draft,
    customerId: session.customer_id, messages, metrics };
}

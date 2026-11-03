export async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`/api${path}`, {
      ...options,
      headers: { 'Content-Type': 'application/json', ...options.headers },
      signal: options.signal
        ? AbortSignal.any([options.signal, AbortSignal.timeout(25000)])
        : AbortSignal.timeout(25000),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    const message = error.name === 'TimeoutError'
      ? 'El servidor está tardando demasiado. Tus datos se conservan: puedes reintentar.'
      : 'No hay conexión con el servidor. Tus datos se conservan: puedes reintentar.';
    throw Object.assign(new Error(message), { status: 0 });
  }
  const data = await response.json().catch(() => ({ error: 'Respuesta inesperada del servidor.' }));
  if (!response.ok) throw Object.assign(new Error(data.error || `Error HTTP ${response.status}`), { status: response.status });
  return data;
}
export const post = (path, body = {}) => request(path, { method: 'POST', body: JSON.stringify(body) });

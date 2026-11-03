// Transcripción en el servidor con cualquier API compatible con OpenAI (/audio/transcriptions):
// Groq por defecto, o Speaches/faster-whisper en local cambiando STT_BASE_URL. Sin clave se usa el navegador.
export const sttEnabled = process.env.STT_PROVIDER === 'openai-compatible' && Boolean(process.env.STT_API_KEY);
const baseUrl = (process.env.STT_BASE_URL || 'https://api.groq.com/openai/v1').replace(/\/$/, '');
const model = process.env.STT_MODEL || 'whisper-large-v3-turbo';
// Orienta a Whisper hacia el vocabulario esperado: nombres propios y correos dictados.
const prompt = 'Nombre, apellidos y correo electrónico. José María de la Torre, Xoán O\'Connor. ana punto pérez arroba example punto com, guion bajo.';
// Frases que Whisper inventa ante silencio o ruido en español.
const hallucination = /subt[ií]tulos|amara\.org|gracias por ver|suscr[ií]bete|^¡?gracias\.?$/i;
const fail = (status, message) => Object.assign(new Error(message), { status });
const extension = type => ({ 'audio/mp4': 'mp4', 'audio/ogg': 'ogg', 'audio/wav': 'wav', 'audio/mpeg': 'mp3' })[type.split(';')[0]] || 'webm';

// Convierte la respuesta verbose_json en { text, confidence } o null si no hay voz utilizable.
export function readTranscription({ text = '', segments = [] }) {
  const spoken = segments.filter(segment => segment.no_speech_prob < 0.6);
  const clean = text.trim();
  if (!clean || (segments.length && !spoken.length) || hallucination.test(clean)) return null;
  const logprob = spoken.reduce((sum, segment) => sum + segment.avg_logprob, 0) / (spoken.length || 1);
  return { text: clean, confidence: Math.round(Math.min(1, Math.max(0, Math.exp(logprob))) * 100) / 100 };
}

export async function transcribe(audio, type) {
  const form = new FormData();
  form.append('file', new Blob([audio], { type }), `audio.${extension(type)}`);
  form.append('model', model);
  form.append('language', 'es');
  form.append('response_format', 'verbose_json');
  form.append('temperature', '0');
  form.append('prompt', prompt);
  let response;
  try {
    response = await fetch(`${baseUrl}/audio/transcriptions`, {
      method: 'POST', headers: { authorization: `Bearer ${process.env.STT_API_KEY}` }, body: form,
      signal: AbortSignal.timeout(10000),
    });
  } catch (error) {
    console.error(JSON.stringify({ event: 'stt_failed', type: error.name }));
    throw fail(504, 'La transcripción ha tardado demasiado. Repite o escribe tu respuesta.');
  }
  if (!response.ok) {
    console.error(JSON.stringify({ event: 'stt_failed', status: response.status }));
    if (response.status === 429) throw fail(429, 'El servicio de transcripción está saturado. Espera unos segundos o escribe tu respuesta.');
    throw fail(502, 'El servicio de transcripción no está disponible. Escribe tu respuesta.');
  }
  const result = readTranscription(await response.json());
  if (!result) throw fail(422, 'No he entendido nada. Pulsa el micrófono y repite, o escribe tu respuesta.');
  return result;
}

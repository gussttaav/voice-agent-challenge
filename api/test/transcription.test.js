import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readTranscription } from '../src/services/transcription.js';

const segment = (avg_logprob, no_speech_prob = 0.01) => ({ avg_logprob, no_speech_prob });

test('una transcripción clara devuelve el texto y una confianza entre 0 y 1', () => {
  const result = readTranscription({ text: ' Sí. ', segments: [segment(-0.1)] });
  assert.equal(result.text, 'Sí.');
  assert.ok(result.confidence > 0.85 && result.confidence <= 1);
});

test('silencio o alucinaciones típicas de Whisper no se tratan como respuesta', () => {
  assert.equal(readTranscription({ text: '', segments: [] }), null);
  assert.equal(readTranscription({ text: 'Hola', segments: [segment(-0.2, 0.9)] }), null);
  for (const text of ['Subtítulos realizados por la comunidad de Amara.org', '¡Gracias por ver el vídeo!', 'Gracias.']) {
    assert.equal(readTranscription({ text, segments: [segment(-0.3)] }), null, text);
  }
});

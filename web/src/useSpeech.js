import { useEffect, useRef, useState } from 'react';
import { request } from './api.js';
// Al leer un correo en voz alta se pronuncian sus símbolos para que la persona pueda comprobarlo.
const symbols = { '.': ' punto ', '@': ' arroba ', '_': ' guion bajo ', '-': ' guion ' };
const spellEmails = text => text.replace(/[\w.+%-]+@[\w-]+(?:\.[\w-]+)+/g,
  email => email.replace(/[.@_-]/g, symbol => symbols[symbol]).replace(/\s+/g, ' ').trim());
// mode 'browser': reconocimiento del navegador, que decide cuándo termina la frase.
// mode 'server': pulsar para hablar con MediaRecorder; la persona decide cuándo termina y el audio
// se transcribe en el backend (Groq/Whisper). No se corta en respuestas muy cortas como «sí».
export function useSpeech(onTranscript, onError, mode = 'browser') {
  const [listening, setListening] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const recognition = useRef(null);
  const recorder = useRef(null);
  const transcriptHandler = useRef(onTranscript);
  const errorHandler = useRef(onError);
  transcriptHandler.current = onTranscript;
  errorHandler.current = onError;
  const server = mode === 'server';
  const supported = server
    ? Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder)
    : Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  useEffect(() => () => {
    recognition.current?.abort();
    if (recorder.current?.state === 'recording') recorder.current.stop();
    window.speechSynthesis?.cancel();
  }, []);
  function stop() {
    if (recorder.current?.state === 'recording') recorder.current.stop();
    recognition.current?.stop();
  }
  async function record() {
    let stream;
    try { stream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch { errorHandler.current('Permite el acceso al micrófono o utiliza la entrada de texto.'); return; }
    const chunks = [];
    const engine = new MediaRecorder(stream);
    recorder.current = engine;
    const limit = setTimeout(() => engine.state === 'recording' && engine.stop(), 30000);
    engine.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
    engine.onstop = async () => {
      clearTimeout(limit);
      stream.getTracks().forEach(track => track.stop());
      setListening(false);
      const audio = new Blob(chunks, { type: engine.mimeType || 'audio/webm' });
      setTranscribing(true);
      try {
        const { text, confidence } = await request('/transcriptions', { method: 'POST', headers: { 'Content-Type': audio.type }, body: audio });
        transcriptHandler.current(text, confidence);
      } catch (error) { errorHandler.current(error.message); }
      finally { setTranscribing(false); }
    };
    engine.start();
    setListening(true);
  }
  function start() {
    if (!supported || listening || transcribing) return;
    window.speechSynthesis?.cancel();
    if (server) return record();
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const engine = new Recognition();
    recognition.current = engine;
    engine.lang = 'es-ES';
    engine.interimResults = false;
    engine.continuous = false;
    engine.onstart = () => setListening(true);
    engine.onend = () => setListening(false);
    engine.onresult = event => {
      const result = event.results[0][0];
      transcriptHandler.current(result.transcript, result.confidence);
    };
    engine.onerror = event => {
      const messages = {
        'not-allowed': 'Permite el acceso al micrófono o utiliza la entrada de texto.',
        'no-speech': 'No se ha detectado voz. Pulsa el micrófono y vuelve a hablar.',
        'audio-capture': 'No se ha encontrado un micrófono disponible.',
        network: 'El reconocimiento de voz no tiene conexión. Puedes escribir tu respuesta.',
      };
      if (event.error !== 'aborted') errorHandler.current(messages[event.error] || 'No se pudo reconocer el audio. Prueba de nuevo o escribe.');
    };
    try { engine.start(); }
    catch { errorHandler.current('No se pudo activar el micrófono. Puedes escribir tu respuesta.'); }
  }
  function speak(text) {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(spellEmails(text));
    utterance.lang = 'es-ES';
    window.speechSynthesis.speak(utterance);
  }
  return { listening, transcribing, supported, server, start, stop, speak };
}

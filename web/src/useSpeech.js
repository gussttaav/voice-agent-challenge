import { useEffect, useRef, useState } from 'react';
// Al leer un correo en voz alta se pronuncian sus símbolos para que la persona pueda comprobarlo.
const symbols = { '.': ' punto ', '@': ' arroba ', '_': ' guion bajo ', '-': ' guion ' };
const spellEmails = text => text.replace(/[\w.+%-]+@[\w-]+(?:\.[\w-]+)+/g,
  email => email.replace(/[.@_-]/g, symbol => symbols[symbol]).replace(/\s+/g, ' ').trim());
export function useSpeech(onTranscript, onError) {
  const [listening, setListening] = useState(false);
  const recognition = useRef(null);
  const transcriptHandler = useRef(onTranscript);
  const errorHandler = useRef(onError);
  transcriptHandler.current = onTranscript;
  errorHandler.current = onError;
  const supported = Boolean(window.SpeechRecognition || window.webkitSpeechRecognition);
  useEffect(() => () => { recognition.current?.abort(); window.speechSynthesis?.cancel(); }, []);
  function stop() { recognition.current?.stop(); }
  function start() {
    if (!supported || listening) return;
    window.speechSynthesis?.cancel();
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
  return { listening, supported, start, stop, speak };
}

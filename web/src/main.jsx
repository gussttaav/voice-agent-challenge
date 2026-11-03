import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { request, post } from './api.js';
import { useSpeech } from './useSpeech.js';
import './styles.css';

function Icon({ name, size = 20 }) {
  const paths = {
    mic: <><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10v2a7 7 0 0 0 14 0v-2M12 19v3M8 22h8"/></>,
    send: <><path d="m4 12 16-8-5 16-3-7-8-1Z"/><path d="m12 13 8-9"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    check: <path d="m5 12 4 4L19 6"/>,
    audio: <><path d="m11 5-6 5H2v4h3l6 5V5ZM15 8a6 6 0 0 1 0 8M18 5a10 10 0 0 1 0 14"/></>,
    people: <><circle cx="9" cy="7" r="4"/><path d="M2 22v-3a7 7 0 0 1 14 0v3M17 4a4 4 0 0 1 0 8M22 22v-3a7 7 0 0 0-4-6"/></>,
    chat: <path d="M21 11a9 9 0 0 1-9 9H4l-3 3V11a10 10 0 0 1 20 0Z"/>,
    download: <><path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.chat}</svg>;
}
const fieldLabels = { firstName: 'Nombre', lastName: 'Apellidos', email: 'Correo electrónico' };
const stepLabels = { firstName: 'Recogiendo nombre', lastName: 'Recogiendo apellidos', email: 'Recogiendo correo', confirmation: 'Revisando datos' };
function App() {
  const [tab, setTab] = useState('conversation');
  const [session, setSession] = useState(null);
  const [config, setConfig] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [failed, setFailed] = useState(null);
  const [input, setInput] = useState('');
  const [voiceOn, setVoiceOn] = useState(true);
  const [fault, setFault] = useState('none');
  const [query, setQuery] = useState('');
  const [customers, setCustomers] = useState([]);
  const [loadingCrm, setLoadingCrm] = useState(false);
  const end = useRef(null);
  const speech = useSpeech((text, confidence) => send(text, 'voice', confidence), setError, config?.transcription);
  const completed = session?.status === 'completed';
  const confirming = !completed && session?.step === 'confirmation';
  // Fallos de conexión, timeout, límite de peticiones o servicio caído: el mismo turno se puede reenviar.
  const retryable = failed && (failed.status === 0 || failed.status === 429 || failed.status >= 500);
  useEffect(() => { bootstrap(); }, []);
  useEffect(() => { end.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }); }, [session?.messages.length]);
  useEffect(() => {
    if (tab !== 'crm') return;
    const controller = new AbortController();
    setLoadingCrm(true);
    const timer = setTimeout(() => {
      request(`/customers/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then(data => setCustomers(data.customers))
        .catch(err => { if (err.name !== 'AbortError') setError(err.message); })
        .finally(() => { if (!controller.signal.aborted) setLoadingCrm(false); });
    }, 200);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [tab, query]);
  async function bootstrap() {
    setBusy(true); setError('');
    try {
      setConfig(await request('/health'));
      const saved = localStorage.getItem('vera-session');
      let current;
      if (saved) {
        try { current = await request(`/sessions/${saved}`); }
        catch { localStorage.removeItem('vera-session'); }
      }
      current ||= await post('/sessions');
      setSession(current); localStorage.setItem('vera-session', current.id);
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function newConversation() {
    if (busy) return;
    speech.stop(); window.speechSynthesis?.cancel();
    setBusy(true); setError(''); setFailed(null);
    try {
      const current = await post('/sessions');
      setSession(current); localStorage.setItem('vera-session', current.id);
      setInput(''); setTab('conversation');
    } catch (err) { setError(err.message); }
    finally { setBusy(false); }
  }
  async function send(text, source = 'text', confidence = null) {
    if (busy || !session || completed || !text.trim()) return;
    setBusy(true); setError(''); setFailed(null); speech.stop();
    try {
      const updated = await post(`/sessions/${session.id}/turns`, { text, source, confidence, fault });
      setSession(updated); setInput('');
      if (voiceOn) speech.speak(updated.messages.at(-1).content);
    } catch (err) {
      setInput(text); setError(err.message); setFailed({ text, source, confidence, status: err.status });
      try { setSession(await request(`/sessions/${session.id}`)); } catch { /* El error original permanece visible. */ }
    } finally { setBusy(false); }
  }
  function download() {
    const url = URL.createObjectURL(new Blob([JSON.stringify(session, null, 2)], { type: 'application/json' }));
    const anchor = document.createElement('a'); anchor.href = url; anchor.download = `vera-${session.id}.json`; anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  // Durante la conversación el aviso se muestra junto al cuadro de respuesta para que siempre sea visible.
  const inComposer = tab === 'conversation' && session && !completed;
  const banner = error && <div className="error-banner" role="alert"><span>{error}</span>{!session && <button onClick={bootstrap} disabled={busy}>Reconectar</button>}{retryable && inComposer && <button className="retry-button" onClick={() => send(failed.text, failed.source, failed.confidence)} disabled={busy}>{failed.status === 503 && confirming ? 'Reintentar guardado' : 'Reintentar'}</button>}<button onClick={() => { setError(''); setFailed(null); }} aria-label="Cerrar aviso">×</button></div>;
  return <div className="app-shell">
    <aside className="sidebar">
      <a className="brand" href="#" onClick={e => { e.preventDefault(); setTab('conversation'); }}><span className="brand-symbol">v</span>vera<span className="brand-dot">.</span></a>
      <p className="workspace-name">Voice Agent Lab</p>
      <nav aria-label="Principal">
        <button className={tab === 'conversation' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('conversation')}><Icon name="chat"/>Conversación</button>
        <button className={tab === 'crm' ? 'nav-item active' : 'nav-item'} onClick={() => setTab('crm')}><Icon name="people"/>Clientes del CRM</button>
      </nav>
      <div className="sidebar-note"><span className="tiny-wave">▂ ▅ ▃ ▇ ▄</span><strong>De la voz al dato.</strong><p>Un espacio para construir conversaciones más fiables.</p></div>
      <div className="environment"><span className={config ? 'status-dot' : 'status-dot offline'}/>{config ? 'Entorno local conectado' : 'Conectando al servidor…'}<small>{config?.provider === 'anthropic' ? 'Claude conectado' : 'Modo demo · sin claves'}</small></div>
    </aside>
    <main>
      <header className="topbar"><span>Laboratorio de atención al cliente</span><span className="prototype">Prototipo</span></header>
      <div className="page-heading"><div><h1>{tab === 'conversation' ? 'Cada conversación cuenta.' : 'Clientes del CRM'}</h1><p>{tab === 'conversation' ? 'Escucha, recoge los datos y acompaña al cliente hasta la confirmación.' : 'Consulta los contactos guardados y contrasta la información recogida.'}</p></div><button className="button secondary" onClick={newConversation} disabled={busy || speech.listening}><Icon name="plus"/>Nueva conversación</button></div>
      {!inComposer && banner}
      {tab === 'conversation' ? <div className="workspace">
        <section className="conversation-panel" aria-label="Conversación con Vera">
          <div className="panel-heading"><div className="agent-avatar">v</div><div><h2>Vera</h2><span>{completed ? 'Conversación finalizada' : 'Asistente de recogida de datos'}</span></div><button className={`icon-button ${voiceOn ? 'selected' : ''}`} onClick={() => { setVoiceOn(!voiceOn); window.speechSynthesis?.cancel(); }} aria-label={voiceOn ? 'Desactivar respuestas de voz' : 'Activar respuestas de voz'} aria-pressed={voiceOn}><Icon name="audio"/></button></div>
          <div className="messages" role="log" aria-live="polite" aria-label="Historial de mensajes">
            <p className="conversation-start">El comienzo de una buena atención</p>
            {session?.messages.map(message => <article className={`message ${message.role}`} key={message.id}><span className="message-author">{message.role === 'assistant' ? 'Vera' : 'Tú'}{message.source === 'voice' ? ' · por voz' : ''}</span><p>{message.content}</p>{message.role === 'assistant' && <button className="play-message" onClick={() => speech.speak(message.content)} aria-label="Escuchar mensaje"><Icon name="audio" size={14}/></button>}</article>)}
            {busy && <div className="thinking" role="status">Vera está preparando la respuesta…</div>}
            <div ref={end}/>
          </div>
          {completed ? <div className="completion"><span className="check-circle"><Icon name="check"/></span><div><strong>Contacto guardado</strong><p>Puedes consultarlo en el CRM o empezar otra conversación.</p></div><button className="button secondary" onClick={() => setTab('crm')}>Ver CRM</button></div> : <div className="composer">
            <div className={`voice-area ${speech.listening ? 'listening' : ''}`}><div className="waveform" aria-hidden="true">{[9,16,25,14,33,43,24,36,51,30,19,39,26,14,23,10,18].map((height, i) => <span key={i} style={{ height, animationDelay: `${i * .07}s` }}/>)}</div><button className="mic-button" onClick={speech.listening ? speech.stop : speech.start} disabled={!speech.supported || busy || speech.transcribing || !session} aria-label={speech.listening ? 'Terminar grabación' : 'Empezar a hablar'} aria-pressed={speech.listening}><Icon name="mic" size={25}/></button><div><strong>{speech.transcribing ? 'Transcribiendo…' : speech.listening ? 'Te escucho…' : 'Tu voz, el punto de partida'}</strong><p>{!speech.supported ? 'Este navegador no admite voz. Utiliza el texto.' : speech.server ? (speech.listening ? 'Pulsa de nuevo el micrófono cuando termines.' : 'Pulsa el micrófono, habla y vuelve a pulsarlo.') : 'Pulsa el micrófono para hablar por turnos.'}</p></div></div>
            {inComposer && banner}
            {confirming && <div className="confirm-actions" role="group" aria-label="Confirmar los datos"><button className="button primary" onClick={() => send('Sí')} disabled={busy || speech.listening}><Icon name="check" size={16}/>Sí, guardar</button><button className="button secondary" onClick={() => send('No')} disabled={busy || speech.listening}>Corregir</button></div>}
            <form onSubmit={event => { event.preventDefault(); send(input); }}><label className="sr-only" htmlFor="reply">Tu respuesta por texto</label><input id="reply" value={input} onChange={e => setInput(e.target.value)} placeholder="También puedes escribir tu respuesta…" disabled={busy || speech.listening || !session} maxLength={4000}/><button className="send-button" type="submit" aria-label="Enviar respuesta" disabled={!input.trim() || busy || speech.listening || !session}><Icon name="send"/></button></form>
            <p className="privacy-note">Utiliza datos ficticios. El servicio de voz del navegador puede procesar audio en servidores externos.</p>
          </div>}
        </section>
        <aside className="details-column">
          <section className="contact-panel"><div className="section-heading"><h2>Ficha del cliente</h2><span className={completed ? 'badge success' : 'badge'}>{completed ? 'Guardado' : 'Borrador'}</span></div><p className="section-description">La información que llevamos hasta ahora.</p><dl>{Object.entries(fieldLabels).map(([key, label]) => <div className="contact-field" key={key}><dt>{label}</dt><dd className={session?.draft[key] ? '' : 'empty-value'}>{session?.draft[key] || 'Pendiente de recoger'}</dd></div>)}</dl><div className="flow-state"><span className="status-dot"/>{completed ? 'Registro completado' : stepLabels[session?.step] || 'Preparando conversación'}</div></section>
          <section className="metrics-panel"><h2>Esta sesión</h2><div className="metrics-grid"><div><strong>{session?.metrics.turns || 0}</strong><span>Turnos procesados</span></div><div><strong>{session?.metrics.turns ? Math.round(session.metrics.totalLatencyMs / session.metrics.turns) : '—'}<small> ms</small></strong><span>Latencia media</span></div><div><strong>{(session?.metrics.inputTokens || 0) + (session?.metrics.outputTokens || 0)}</strong><span>Tokens del proveedor</span></div><div><strong>{session?.metrics.errors || 0}</strong><span>Turnos con error</span></div></div><p className="metric-note">{config?.provider === 'anthropic' ? 'Consumo reportado por Claude. Coste no calculado.' : 'La extracción demo no utiliza un modelo de IA.'}</p><button className="text-button" onClick={download} disabled={!session}><Icon name="download" size={16}/>Exportar sesión JSON</button></section>
          {config?.faultsEnabled && <section className="scenario-panel"><h2>Escenario del siguiente turno</h2><label className="sr-only" htmlFor="scenario">Simulación de fallo</label><select id="scenario" value={fault} onChange={e => setFault(e.target.value)} disabled={busy}><option value="none">Funcionamiento normal</option><option value="timeout">Timeout del proveedor</option><option value="rate-limit">Límite de peticiones (429)</option><option value="malformed">Respuesta mal formada</option><option value="crm-unavailable">CRM no disponible</option></select><p>El escenario se mantiene hasta que vuelvas a «Funcionamiento normal». El fallo del CRM se aplica al guardar.</p></section>}
        </aside>
      </div> : <section className="crm-panel"><div className="crm-toolbar"><label htmlFor="search">Buscar clientes</label><input id="search" type="search" value={query} onChange={e => setQuery(e.target.value)} placeholder="Nombre, apellidos o correo…"/><span aria-live="polite">{loadingCrm ? 'Buscando…' : `${customers.length} contactos`}</span></div><div className="table-scroll"><table><thead><tr><th>Nombre</th><th>Apellidos</th><th>Correo electrónico</th><th>Alta</th></tr></thead><tbody>{customers.map(customer => <tr key={customer.id}><td>{customer.firstName}</td><td>{customer.lastName}</td><td>{customer.email}</td><td>{new Date(customer.createdAt).toLocaleDateString('es-ES')}</td></tr>)}</tbody></table></div>{!loadingCrm && customers.length === 0 && <p className="empty-state">No hay contactos con esos datos. Prueba con otra búsqueda.</p>}<p className="crm-footer">Datos ficticios para la prueba. Se muestran hasta 50 coincidencias.</p></section>}
      <footer className="page-footer"><span>Vera · Voice Agent Lab</span><span>Primero escucha. Después confirma.</span></footer>
    </main>
  </div>;
}
createRoot(document.getElementById('root')).render(<App/>);

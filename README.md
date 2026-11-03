# Vera · AI Voice Agent Challenge

Un prototipo de atención al cliente que recoge nombre, apellidos y correo por voz o texto y los guarda en un CRM simulado. Tu trabajo es convertirlo en un flujo más fiable. La interfaz, la persistencia y la infraestructura ya están preparadas.

## Arranque

Necesitas Docker con Docker Compose v2. No necesitas instalar Node ni PostgreSQL en tu equipo.

```sh
cp .env.example .env
docker compose up --build
```

Abre [http://localhost:8080](http://localhost:8080). La primera ejecución instala dependencias y construye el frontend **dentro de Docker**. La API y la base de datos no publican puertos al equipo; la web sirve de proxy de la API.

El modo predeterminado es `demo`: no necesita claves ni genera gasto de modelos. Un recorrido sencillo es «Sergio» → «Alcedo García» → «sergio.nuevo@example.com» → «Sí». Puedes escribir o pulsar el micrófono para cada turno. Activa el audio con el botón del altavoz; también puedes reproducir cualquier mensaje del asistente.

El modo demo es un intérprete por reglas, no un modelo de IA. Es útil para conocer el flujo, trabajar sin coste y reproducir comportamientos; no representa la calidad de extracción de un LLM.

## Tu misión

Lee [CHALLENGE.md](CHALLENGE.md). Dedicación recomendada: **1,5 horas (90 minutos)**, incluyendo revisión, cambios y documentación. Puedes usar IA y cambiar las partes que consideres necesarias. El enunciado incluye requisitos de fiabilidad e ideas de mejora: no se espera completarlos todos. Nos interesa cómo priorizas el tiempo y justificas lo que dejas pendiente.

## Cómo entregar tu solución

Haz un fork de este repositorio público, trabaja en una rama propia y envía al equipo de selección el enlace a tu repositorio y al commit final por el mismo canal por el que recibiste la prueba. **No abras una pull request contra el repositorio original.** Encontrarás los pasos y el formato de entrega en [SUBMISSION.md](SUBMISSION.md).

## Arquitectura

```text
Navegador: React + reconocimiento y síntesis de voz del navegador
    │ mismo origen /api
    ▼
Nginx :8080 ──► Express / Node 22 ──► PostgreSQL 17
                    │
                    ├── Motor demo (sin claves)
                    └── Claude Messages API (opcional)
```

- `web/src/main.jsx`: conversación, ficha, CRM y métricas de sesión.
- `web/src/useSpeech.js`: reconocimiento por turnos y síntesis de voz.
- `api/src/services/conversation.js`: orquestación del turno y escritura de datos.
- `api/src/providers/`: extracción demo y adaptador de Claude.
- `api/src/providers/extraction-prompt.txt`: prompt de extracción.
- `api/src/services/crm.js`: búsqueda y registro de contactos.
- `api/src/server.js`: contratos HTTP.
- `db/001-init.sql`: esquema y cuatro contactos ficticios, incluidos dos homónimos.

Se utiliza JavaScript con módulos ESM para reducir configuración. Las consultas SQL están parametrizadas. Los turnos, borradores y métricas se conservan en PostgreSQL; la sesión activa se recuerda en el navegador. No se persisten archivos de audio.

## Utilizar un LLM real

Edita `.env`:

```dotenv
AI_PROVIDER=anthropic
ANTHROPIC_API_KEY=tu-clave
ANTHROPIC_MODEL=claude-sonnet-5-5
```

```sh
docker compose up -d --force-recreate api
```

La clave solo llega al contenedor del backend. El adaptador usa el SDK oficial (`@anthropic-ai/sdk`) con salida estructurada, esfuerzo `low`, caché del prompt de sistema y un timeout de 8 segundos con un reintento automático. El modelo solo extrae lo que dice la persona; la validación, el flujo y la decisión de guardar se hacen en código (`api/src/services/dialog.js`). Las llamadas reales generan consumo; las métricas muestran los tokens reportados, incluidos los leídos de caché.

Referencia del contrato: [Claude Messages API](https://platform.claude.com/docs/en/api/messages/create).

## Voz y privacidad

El reconocimiento utiliza `SpeechRecognition` / `webkitSpeechRecognition`, si está disponible, y la respuesta utiliza `speechSynthesis`. La compatibilidad depende del navegador y del sistema. Si no funciona, usa texto: ambos canales llaman al mismo motor. Permite el micrófono cuando el navegador lo solicite. Fuera de localhost se necesita un contexto seguro HTTPS.

Algunos navegadores envían audio a sus propios servicios de reconocimiento. No es una solución completamente offline aunque el intérprete esté en modo demo. Usa exclusivamente datos ficticios. El texto del diálogo se guarda en la base de datos y se envía al proveedor si activas Claude. La exportación JSON contiene el historial y los datos recogidos.

Referencias: [SpeechRecognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition), [SpeechSynthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis).

## Transcripción con Groq (opcional)

Por defecto se usa el reconocimiento de voz del navegador. Para transcribir en el servidor con Whisper a través de Groq, crea una clave en [console.groq.com/keys](https://console.groq.com/keys) y edita `.env`:

```dotenv
STT_PROVIDER=openai-compatible
STT_API_KEY=tu-clave
```

```sh
docker compose up -d --force-recreate api
```

El micrófono pasa a funcionar como «pulsar para hablar»: pulsa, habla y vuelve a pulsar. El audio se envía al backend, se reenvía a Groq y no se guarda. Si falta la clave, se usa el navegador. `STT_BASE_URL` admite cualquier API compatible con OpenAI (por ejemplo Speaches/faster-whisper en local), aunque solo se ha verificado con Groq.

## Escenarios y observabilidad

En la ficha lateral puedes seleccionar una simulación que se aplica a los siguientes turnos hasta desactivarla:

- Timeout: espera dos segundos y devuelve HTTP 504; no simula un timeout de red real.
- Límite de peticiones: HTTP 429.
- Respuesta mal formada: error al interpretar JSON.
- CRM no disponible: HTTP 503, solo cuando se intenta guardar.

`ENABLE_FAULTS=false` desactiva estas simulaciones tanto en la interfaz como en la API. Las métricas muestran turnos intentados, latencia media del backend, tokens reportados y errores. Incluyen intentos fallidos; no incluyen reconocimiento ni reproducción de voz. La exportación JSON permite revisar cada sesión.

## Comandos útiles

```sh
# Ver logs
docker compose logs -f api

# Aplicar cambios de código
docker compose up --build -d

# Parar conservando los datos
docker compose down

# Ejecutar las comprobaciones automatizadas (usan PostgreSQL de Docker y el intérprete demo; no llaman a proveedores reales)
docker compose build api
docker compose run --rm -v "$PWD/api/test:/app/test:ro" api npm test

# Abrir una consola SQL
docker compose exec db psql -U voice_agent -d voice_agent
```

Para borrar todos los datos locales, ejecuta `docker compose down -v`. Esto elimina también el volumen de PostgreSQL. El SQL inicial solo se aplica cuando el volumen está vacío; después de modificarlo tendrás que gestionar una migración o reinicializar tus datos locales.

Si el puerto está ocupado, cambia `WEB_PORT` en `.env`. Si cambias `DB_PASSWORD` con un volumen ya creado, debes cambiar también la contraseña del usuario PostgreSQL existente: la variable de inicialización no actualiza usuarios previos.

## Desarrollo opcional fuera de Docker

Requiere Node 22+. Mantén la base de datos en Docker. Para exponerla localmente, usa un override propio que publique `127.0.0.1:5432:5432`; configura `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER` y `PGPASSWORD` en el proceso de la API. En `api/`, ejecuta `npm ci` y `npm run dev`; en `web/`, ejecuta `npm ci` y `npm run dev`. Vite redirige `/api` a `http://localhost:3000`.

## Alcance

Es un ejercicio local con datos ficticios, sin autenticación ni aislamiento entre usuarios. No se incluye despliegue público, telefonía, SMS, WhatsApp, RAG o MCP. El candidato puede proponerlos si existe una razón de producto. No hay una suite de tests inicial: parte de la entrega consiste en elegir las comprobaciones útiles, sin construir infraestructura innecesaria.

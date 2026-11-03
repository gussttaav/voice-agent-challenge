# API local

Todas las rutas pasan por `/api`. JSON de entrada y salida. No hay autenticación: el entorno es local y compartido. Los errores usan `{ "error": "mensaje" }`.

| Método | Ruta | Resultado |
| --- | --- | --- |
| GET | `/health` | Estado de BD, proveedor, simulaciones activas y modo de transcripción (`browser` o `server`) |
| POST | `/sessions` | Crea una conversación y devuelve su estado (201) |
| GET | `/sessions/:id` | Estado, borrador, mensajes y métricas |
| POST | `/sessions/:id/turns` | Procesa un turno y devuelve el estado |
| GET | `/customers/search?q=texto` | `{ customers: [...] }`, máximo 50 |
| POST | `/customers` | Registra un contacto: 201 si lo crea, 200 si ya existe con el mismo nombre, 409 si el correo pertenece a otra persona |
| POST | `/transcriptions` | Audio en bruto (`Content-Type: audio/*`, máx. 2 MB) → `{ text, confidence }`. Solo con `STT_PROVIDER=openai-compatible` y clave; 422 si no hay voz utilizable |

## Crear sesión y procesar un turno

```sh
curl -X POST http://localhost:8080/api/sessions

# Sustituye SESSION_ID por el UUID recibido
curl -X POST http://localhost:8080/api/sessions/SESSION_ID/turns \
  -H 'Content-Type: application/json' \
  -d '{"text":"Me llamo Sergio","source":"text","confidence":null,"fault":"none"}'
```

`source`: `text` o `voice`. `confidence`: null o número de 0 a 1 procedente del reconocedor; no es una garantía de corrección. Texto: máximo 4000 caracteres. `fault`: `none`, `timeout`, `rate-limit`, `malformed` o `crm-unavailable`.

El estado devuelto tiene esta forma:

```json
{
  "id": "UUID",
  "status": "collecting",
  "step": "firstName",
  "draft": { "firstName": "", "lastName": "", "email": "" },
  "customerId": null,
  "messages": [{ "id": "1", "role": "assistant", "content": "…", "source": "text", "confidence": null, "createdAt": "ISO-8601" }],
  "metrics": { "turns": 0, "totalLatencyMs": 0, "inputTokens": 0, "outputTokens": 0, "errors": 0 }
}
```

Un turno se procesa en una transacción: si falla (IA, CRM o base de datos) no se guarda nada y se puede reenviar. Enviar un turno a una sesión `completed` devuelve su estado sin procesarlo.

`status`: `collecting` o `completed`. `step`: `firstName`, `lastName`, `email` o `confirmation`. El borrador no incluye un estado de validación por campo. El último paso se mantiene como `confirmation` tras completar; el estado terminal lo indica `status`.

## CRM

```sh
curl 'http://localhost:8080/api/customers/search?q=sergio'
curl -X POST http://localhost:8080/api/customers \
  -H 'Content-Type: application/json' \
  -d '{"firstName":"Ana","lastName":"Pérez","email":"ana@example.com"}'
```

Los contactos tienen `id`, `firstName`, `lastName`, `email`, `createdAt` y `updatedAt`. El correo identifica al contacto y se guarda en minúsculas. Si ya existe con el mismo nombre (sin distinguir mayúsculas ni acentos) se reutiliza sin modificarlo; si existe con otro nombre es un conflicto de identidad: no se escribe nada ni se devuelven los datos del otro contacto.

## Adaptadores de extracción

`interpret(session, text, fault)` recibe la sesión del servidor, el texto y el escenario. Devuelve solo lo que ha dicho la persona en ese turno:

```json
{
  "updates": { "firstName": "", "lastName": "Pérez Gil", "email": "" },
  "intent": "provide",
  "field": null
}
```

`updates`: campos mencionados (los vacíos se ignoran). `intent`: `provide`, `confirm`, `reject` o `unclear`. `field`: dato que la persona dice que está mal sin dar el valor nuevo, o `null`. Puede incluir `usage.input_tokens` y `usage.output_tokens`.

`services/dialog.js` valida y fusiona los campos, decide el siguiente paso y la respuesta, y solo marca la sesión para guardar tras un `confirm` sobre datos que no han cambiado en ese turno. Para añadir un proveedor, implementa un adaptador con este contrato y selecciónalo en `providers/index.js`.

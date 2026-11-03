# Uso de herramientas de IA

## Herramientas y tareas

Usé **Claude Code** (Claude Opus 5.5, en la aplicación de escritorio) como asistente durante toda la prueba:

- **Análisis:** explicar el código, detectar riesgos y reproducirlos por HTTP con la versión base para tener evidencia antes de cambiar nada.
- **Planificación:** priorizar los problemas y dividir el trabajo en commits revisables.
- **Implementación y tests** de cada bloque, y redacción de un primer borrador de esta documentación.
- **Consultas puntuales:** documentación del SDK de Anthropic, opciones de transcripción (Groq, Speaches) y el tamaño de la imagen de Speaches.

**Lo que decidí yo:**
- El orden de prioridades.
- El modelo.
- Incluir Groq para procesar el audio por su disponibilidad inmediata.
- Hacer un commit por bloque y subir solo al final.

Revisé y probé cada commit en la interfaz, por texto y por voz, antes de aceptarlo.

## Una decisión revisada

**Transcripción local con Speaches.** Me interesaba porque el audio no sale del equipo y no necesita clave. Antes de decidir, la IA comprobó el tamaño de la imagen (0,85 GB comprimida, más el modelo) y que mi equipo no tiene GPU. Con el modelo de Whisper que podía ejecutar, sería más lento que el navegador y de calidad incierta. Lo descarté y elegí Groq, dejando el adaptador compatible con Speaches cambiando solo la URL.

**Otras correcciones que surgieron al probar:**
- **Apellido «Bueno».** Al probar por voz, Vera descartaba «Bueno» en «Ortega Bueno»: el reconocedor lo escribía en minúscula y el modelo lo trataba como muletilla. Además, Vera repetía el resumen sin avisar de que no había cambiado nada. Se corrigió en el prompt (regla y ejemplos) y en el código (aviso explícito y sugerencia de escribirlo).
- **Caché del prompt.** La primera versión de la caché de Claude parecía correcta en el código, pero al medir `usage` vimos que escribía en caché en cada turno sin leer nunca. Se movió al prompt de sistema.
- **Aviso de error.** En la prueba en el navegador, el aviso de error quedaba fuera de la pantalla, y se movió junto al cuadro de respuesta.

## Verificación

**Lo que he comprobado personalmente:**
- Los recorridos de cada commit en la interfaz, con texto y voz.
- Los escenarios de fallo: timeout, CRM caído y reintento.
- Conflicto y coincidencia en el CRM.
- Correcciones y negaciones.
- Extracción con Claude Sonnet 5.5 real.
- Transcripción con Groq real.
- Que las claves solo están en `.env`, que no se sube al repositorio.

Los 27 tests automatizados pasan.

**Lo que sigue sin verificar:**
- El uso de Speaches u otro servicio local a través de `STT_BASE_URL`.
- La grabación en Safari y Firefox (formatos de `MediaRecorder`).
- El comportamiento bajo concurrencia real.
- La cobertura del filtro de alucinaciones de Whisper más allá de los casos conocidos.
- La calidad de extracción con un conjunto de evaluación amplio: solo unas decenas de interacciones manuales.

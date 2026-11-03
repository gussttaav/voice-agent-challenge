// Validación determinista de lo que propone el proveedor (demo o LLM). Devuelve el valor
// limpio o null si no es aceptable; un valor null nunca llega al borrador.
const namePattern = /^\p{L}[\p{L}\p{M}' .-]*$/u;
const particles = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'do', 'dos', 'van', 'von']);
// La voz escribe en minúscula los nombres que coinciden con palabras comunes («ortega bueno»).
// Solo se capitaliza lo que llega en minúscula y nunca las partículas, salvo al inicio.
const capitalize = name => name.split(' ').map((word, i) =>
  (i > 0 && particles.has(word)) || word[0] !== word[0].toLowerCase() ? word : word[0].toUpperCase() + word.slice(1)).join(' ');
export function cleanName(value) {
  const name = value.normalize('NFC').replace(/[’´`]/g, "'").replace(/\s+/g, ' ')
    .replace(/^[\s,.;:¡!¿?-]+|[\s,.;:¡!¿?]+$/g, '');
  return name.length <= 100 && namePattern.test(name) ? capitalize(name) : null;
}
const emailPattern = /^[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
export function cleanEmail(value) {
  const email = value.normalize('NFC').trim().replace(/[.,;:]+$/, '').toLowerCase();
  return email.length <= 254 && emailPattern.test(email) ? email : null;
}

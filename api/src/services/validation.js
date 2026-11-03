// Validación determinista de lo que propone el proveedor (demo o LLM). Devuelve el valor
// limpio o null si no es aceptable; un valor null nunca llega al borrador.
const namePattern = /^\p{L}[\p{L}\p{M}' .-]*$/u;
export function cleanName(value) {
  const name = value.normalize('NFC').replace(/[’´`]/g, "'").replace(/\s+/g, ' ')
    .replace(/^[\s,.;:¡!¿?-]+|[\s,.;:¡!¿?]+$/g, '');
  return name.length <= 100 && namePattern.test(name) ? name : null;
}
const emailPattern = /^[a-z0-9_%+-]+(?:\.[a-z0-9_%+-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/;
export function cleanEmail(value) {
  const email = value.normalize('NFC').trim().replace(/[.,;:]+$/, '').toLowerCase();
  return email.length <= 254 && emailPattern.test(email) ? email : null;
}

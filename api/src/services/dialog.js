import { cleanName, cleanEmail } from './validation.js';
// Estado de la conversación decidido por código. El proveedor solo propone qué ha dicho la persona
// ({ updates, intent, field }); aquí se valida, se fusiona campo a campo y se decide si se guarda.
const fields = ['firstName', 'lastName', 'email'];
const validators = { firstName: cleanName, lastName: cleanName, email: cleanEmail };
export const greeting = 'Hola. Soy Vera, tu asistente. ¿Cuál es tu nombre?';
const questions = {
  firstName: '¿Cuál es tu nombre?',
  lastName: '¿Cuáles son tus apellidos?',
  email: '¿Cuál es tu correo electrónico?',
};
const corrections = {
  firstName: 'De acuerdo. ¿Cuál es tu nombre correcto?',
  lastName: 'De acuerdo. ¿Cuáles son tus apellidos correctos?',
  email: 'De acuerdo. ¿Cuál es tu correo electrónico correcto?',
};
const invalid = {
  firstName: 'No he entendido bien tu nombre. ¿Me lo repites?',
  lastName: 'No he entendido bien tus apellidos. ¿Me los repites?',
  email: 'Eso no parece un correo electrónico válido. ¿Me lo repites? Por ejemplo: ana punto perez arroba example punto com.',
};
const summary = draft => `Tengo ${draft.firstName} ${draft.lastName}, correo ${draft.email}. ¿Es correcto? Di sí para guardar o dime qué quieres cambiar.`;

export function applyTurn({ draft: current, step }, { updates = {}, intent = 'unclear', field = null } = {}) {
  const draft = { ...current };
  const changed = [], rejected = [];
  for (const name of fields) {
    const raw = updates?.[name];
    if (typeof raw !== 'string' || !raw.trim()) continue;
    const value = validators[name](raw);
    if (!value) rejected.push(name);
    else if (value !== draft[name]) {
      draft[name] = value;
      changed.push(name);
    }
  }
  const turn = (nextStep, reply, confirmed = false) => ({ draft, step: nextStep, confirmed, reply });
  if (rejected.length) return turn(rejected[0], invalid[rejected[0]]);
  const missing = fields.find(name => !draft[name]);
  if (missing) return turn(missing, (changed.some(name => name !== step) ? 'Anotado. ' : '') + questions[missing]);
  if (step !== 'confirmation') {
    // Se pidió corregir un dato y la respuesta no lo ha cambiado: se dice para no dar la impresión de ignorar
    // a la persona, y se ofrece el texto como alternativa a la voz.
    const unchanged = current[step] && !changed.includes(step);
    return turn('confirmation', unchanged
      ? `No he entendido ningún cambio: sigo teniendo «${draft[step]}». Si no es correcto, escríbelo en el cuadro de texto. ${summary(draft)}`
      : summary(draft));
  }
  // Solo se guarda tras un sí explícito sobre datos que no han cambiado en este turno.
  if (changed.length) return turn('confirmation', `Corregido. ${summary(draft)}`);
  if (intent === 'confirm') return turn('confirmation', '', true);
  // Nombrar un dato sin confirmar («no, el correo» o solo «el apellido») lleva a corregirlo.
  if (fields.includes(field)) return turn(field, corrections[field]);
  if (intent === 'reject') return turn('confirmation', 'De acuerdo, no guardo nada. ¿Qué dato quieres corregir: nombre, apellidos o correo?');
  return turn('confirmation', `Perdona, no te he entendido. ${summary(draft)}`);
}

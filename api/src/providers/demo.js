// Intérprete por reglas: no es un modelo de IA. Devuelve lo que ha entendido del turno
// ({ updates, intent, field }); la validación y el flujo se deciden en services/dialog.js.
const word = (pattern, flags = 'iu') => new RegExp(`(?<!\\p{L})(?:${pattern})(?!\\p{L})`, flags);
// La negación se comprueba antes que la afirmación: «no es correcto» nunca confirma.
const negative = word('no|incorrect[oa]s?|mal|err[oó]ne[oa]s?|equivocad[oa]s?');
const positive = word('s[ií]|correct[oa]s?|vale|de acuerdo|confirmo|exacto|perfecto|adelante');
const fieldWords = { firstName: word('nombre'), lastName: word('apellidos?'), email: word('correo|e-?mail') };
const statements = [
  ['firstName', /(?:^|[,.;:]\s*)(?:me llamo|mi nombre es|el nombre es|soy)\s+(.+)/iu],
  ['lastName', /(?:^|[,.;:]\s*)(?:mis apellidos son|mi apellido es|los apellidos son|el apellido es)\s+(.+)/iu],
];
const emailPrefix = /^(?:mi |el )?(?:correo(?: electr[oó]nico)?|e-?mail)? ?(?:es )?/iu;
// La transcripción escribe «Pérez» con tilde aunque el correo sea «perez».
export function spokenEmail(text) {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLowerCase()
    .replace(word('arroba', 'giu'), '@')
    .replace(word('gui[oó]n bajo', 'giu'), '_')
    .replace(word('gui[oó]n', 'giu'), '-')
    .replace(word('punto', 'giu'), '.')
    .replace(/\s*([.@_-])\s*/g, '$1');
}
export async function demoTurn(session, text) {
  const updates = {};
  for (const [field, pattern] of statements) {
    const match = text.match(pattern);
    if (match) updates[field] = match[1];
  }
  if (session.step === 'email' && !Object.keys(updates).length) {
    updates.email = spokenEmail(text.replace(emailPrefix, '')).replace(/\s+/g, '');
  } else {
    const email = spokenEmail(text).match(/[^\s@]+@[^\s@]+/)?.[0];
    if (email) updates.email = email;
  }
  if (session.step === 'confirmation') {
    const intent = negative.test(text) ? 'reject' : positive.test(text) ? 'confirm' : 'unclear';
    const field = Object.keys(fieldWords).find(name => fieldWords[name].test(text)) || null;
    return { updates, intent, field };
  }
  // Sin una frase reconocible, el texto completo responde al dato que se ha preguntado.
  if (!Object.keys(updates).length) updates[session.step] = text;
  return { updates, intent: 'provide', field: null };
}

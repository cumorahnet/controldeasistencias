# Instrucciones para Copilot en este proyecto

Antes de explorar el cÃ³digo completo, revisa primero estos archivos de
contexto que ya resumen el estado del proyecto:

- `DECISIONS.md` â€” decisiones de arquitectura y diseÃ±o ya tomadas, con su razÃ³n.
- `NEXT.md` â€” prÃ³ximos pasos pendientes y trabajo en progreso.
- `CHANGELOG.md` â€” historial de cambios recientes.
- `DEPLOY_FIREBASE.md` â€” cÃ³mo desplegar este proyecto (si usa Firebase).

Si la pregunta o tarea se puede responder con esos resÃºmenes, Ãºsalos en vez
de leer el cÃ³digo completo del archivo principal â€” son suficientes para la
mayorÃ­a de las preguntas sobre "por quÃ© se hizo algo" o "quÃ© falta". Solo lee
el cÃ³digo fuente completo cuando necesites ver la implementaciÃ³n exacta de
una funciÃ³n o vayas a hacer un cambio real.

## Sobre este proyecto

- Es una aplicaciÃ³n web de una sola pÃ¡gina (HTML + JS + CSS, normalmente
  todo en `index.html`).
- Usa Firebase (Firestore, Storage, Hosting) como backend â€” confirma en
  `firebase.json` y `.firebaserc` quÃ© servicios usa este proyecto.
- Se despliega a GitHub Pages o a Firebase Hosting, segÃºn el proyecto.

## Preferencias de cÃ³digo

- No dividas el archivo en varios mÃ³dulos â€” el proyecto se mantiene como un
  solo archivo HTML por decisiÃ³n del usuario.
- Antes de modificar una funciÃ³n ya corregida antes, revisa `CHANGELOG.md` y
  `DECISIONS.md` para no reintroducir un bug ya resuelto.

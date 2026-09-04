# AGENTS.md

## Contexto del proyecto â€” leer primero

Antes de explorar el cÃ³digo fuente completo, revisa estos archivos que ya
resumen el estado del proyecto:

- `DECISIONS.md` â€” decisiones de arquitectura y diseÃ±o ya tomadas, y por quÃ©.
- `NEXT.md` â€” prÃ³ximos pasos pendientes y trabajo en progreso.
- `CHANGELOG.md` â€” historial de cambios recientes.
- `DEPLOY_FIREBASE.md` â€” cÃ³mo desplegar este proyecto (si usa Firebase).

Si la tarea o pregunta se puede resolver con esos resÃºmenes, Ãºsalos en vez de
leer el cÃ³digo fuente completo â€” son mÃ¡s rÃ¡pidos y evitan gastar tokens
explorando innecesariamente. Solo lee el cÃ³digo fuente completo cuando
necesites ver la implementaciÃ³n exacta o vayas a hacer un cambio real.

## Stack de este proyecto

- AplicaciÃ³n de una sola pÃ¡gina: HTML + JS + CSS, normalmente todo en
  `index.html`.
- Backend: Firebase (Firestore, Storage, Hosting) â€” revisa `firebase.json` y
  `.firebaserc` para confirmar quÃ© servicios usa este proyecto en particular.
- Despliegue: GitHub Pages o Firebase Hosting, segÃºn el proyecto.

## Al hacer cambios

- Modifica el archivo completo y verifica que el HTML/JS resultante sea
  vÃ¡lido antes de terminar (sin variables duplicadas, sin llaves sin cerrar).
- Revisa `CHANGELOG.md` y `DECISIONS.md` antes de modificar una funciÃ³n ya
  corregida anteriormente, para no reintroducir un bug ya resuelto.
- Si el cambio toca reglas de seguridad (`firestore.rules`, `storage.rules`)
  o el sitio publicado, recuerda que hace falta un deploy explÃ­cito de
  Firebase â€” no basta con guardar el archivo localmente.

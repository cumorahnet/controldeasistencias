# Revision tecnica y de seguridad - 29/09/2026

Version preparada: 36.76.0. Se conservaron los cambios locales existentes al iniciar la revision (calendario, reportes, salida e instalacion manual).

## Hallazgos corregidos

- SheetJS 0.18.5 cargado desde CDN: sustituido por copia local oficial 0.20.3 con licencia. La version anterior permite contaminacion de prototipos al importar archivos manipulados. Se valida lectura/escritura XLS y XLSX y que los nombres no se conviertan en formulas.
- Backend: 11 dependencias afectadas por avisos moderados en npm audit. Firebase Admin 14.5.0 y Functions 7.4.0, compatibles con Node 22 y las APIs modulares usadas. Override uuid 11.1.1: la unica dependencia afectada, gaxios 6.7.1, usa exclusivamente v4(), API compatible. Configuracion compatible con npm 10 y npm ci; el override anidado inicial fue rechazado por Cloud Build. Auditoria final sin avisos conocidos.
- Service worker: ahora solo intercepta recursos publicos de la app; excluye peticiones autenticadas, respeta private/no-store, conserva respuestas si falla el almacenamiento y no elimina caches de otras aplicaciones. La recuperacion offline consulta solo la cache actual.
- Build: lista explicita de scripts publicos y limpieza de archivos obsoletos dentro de dist; incluye el propio service worker en el hash de version. No publica automaticamente nuevos scripts administrativos.
- Hosting: cabeceras contra inclusion en marcos, sniffing MIME, objetos y cambios de base; politica de referencia. CSP parcial, sin prometer bloqueo completo de XSS.
- Backend: rechaza estados docentes desconocidos, alineado con las reglas de Firestore. Fechas imposibles del calendario devuelven invalid-argument y no errores internos.
- Reportes: los totales excluyen fechas que no aparecen y dias especiales, en coherencia con el archivo exportado.
- Pruebas PWA: adaptadas a la instalacion manual ya presente; verifican clic explicito, cancelacion, confirmacion y version dinamica.

## Alcance y limites

Revision de codigo, reglas, configuracion, dependencias y funciones desplegadas. Las 45 funciones remotas existen en Node 22; cleanupAuditLogs ya estaba desplegada. No se modificaron reglas ni se ejecutaron operaciones de borrado de datos de usuarios durante la revision.

No constituye una prueba de penetracion completa. No se ejecutaron pruebas de reglas con Firebase Emulator Suite ni flujos autenticados con cuentas reales. La instalacion fisica Android/iOS, camara, recuperacion por correo y modo offline completo siguen requiriendo comprobacion funcional. El arranque offline completo depende ademas de recursos externos (Firebase y otros CDN).

App Check conserva la politica previa: comprobar tokens y metricas reales antes de exigirlo. Los limites de intentos actuales dependen de IP/cabeceras; queda pendiente validar la cadena de proxies y proteccion contra intentos distribuidos. Revisar tambien revocacion inmediata y reautenticacion del flujo de recuperacion, limites de importacion y validacion de campos de alumnos en reglas. No se atribuye a esta revision una garantia de seguridad absoluta.

## Fuentes

- https://firebase.google.com/support/guides/security-checklist
- https://firebase.google.com/docs/hosting/full-config
- https://github.com/firebase/firebase-admin-node/releases/tag/v14.0.0
- https://docs.sheetjs.com/docs/getting-started/installation/standalone/
- https://cdn.sheetjs.com/advisories/CVE-2023-30533
- https://github.com/advisories/GHSA-w5hq-g745-h8pq

## Resultado final

Publicacion completada el 29/09/2026 a las 22:33 (Ciudad de Mexico): Hosting e9d5b3e0d84b4f8a y 45 funciones. Verificados 30 archivos por HTTPS (bytes y cabeceras) y rechazo de llamadas anonimas en tres funciones protegidas. 127 pruebas pasan; npm audit sin avisos conocidos. Detalles de reproduccion en DEPLOY_FIREBASE.md.

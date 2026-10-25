## 30/09/2026 - Despliegue completo verificado

- Publicados Hosting, funciones Node 22 y reglas de Firestore (sin cambios pendientes en reglas). Release de Hosting: d57f6be20f6d7f93, a las 13:09 de Ciudad de Mexico.
- 134 pruebas aprobadas con Node 22. Verificacion HTTPS: los 30 archivos coinciden con dist, con cache y cabeceras correctas; tres funciones protegidas rechazan llamadas sin autenticacion.
- Incluye periodos institucionales de faltas y retardos con fechas inicial y final. Configurar las fechas en Gestion > Escuela para activar la acumulacion dentro de los periodos.

## 30/09/2026 - Periodos por fechas (pendiente de publicar)

Esta implementacion sustituye la vigencia en dias. Publicar functions y hosting juntos; despues configurar los periodos en Escuela. Las nuevas capturas fuera de periodos no generan faltas por acumulacion. No se modifican las reglas de Firestore. Validacion local: 134 pruebas y build aprobados.

## 30/09/2026 - Vigencia de retardos (pendiente de publicar)

Publicar Hosting y funciones juntas para aplicar el campo de vigencia, las capturas, correcciones y traslado de alumnos. Ejecutar la suite completa y node scripts/build-hosting.cjs antes de firebase deploy --project controldeasistencias-8308c --only functions,hosting --non-interactive.

## 36.76 - Publicada y verificada (29/09/2026)

- Hosting publicado el 29/09/2026 a las 22:33 (Ciudad de Mexico); version e9d5b3e0d84b4f8a.
- Las 45 funciones existentes se actualizaron correctamente en Node 22, incluida cleanupAuditLogs. No se cambiaron reglas de Firestore.
- Verificacion HTTPS: 30 archivos coinciden byte por byte con dist, con cabeceras de seguridad y cache correctas. listTeachers, listAuditLogs y updateSchool rechazan llamadas sin autenticacion con HTTP 401 / UNAUTHENTICATED.
- Validacion: 127 pruebas aprobadas, comprobacion con Node 22, instalacion limpia npm 10 y cero vulnerabilidades conocidas en npm audit.
- El primer intento de despliegue fue rechazado por incompatibilidad del override anidado en el lockfile. Se corrigio con override uuid 11.1.1 global, npm 10 y npm ci; el segundo despliegue termino exitosamente.
- Repetir la comprobacion remota con: node scripts/verify-deployment.cjs.
- Para reproducir: usar Node 22, ejecutar npm ci en functions, la suite completa y el build. Publicar functions y hosting juntos para cambios compartidos.
- App Check sigue sin exigirse hasta validar metricas reales; pruebas funcionales con cuentas y dispositivos en NEXT.md.

## 36.69 - Salida para cambiar de usuario o escuela

Publicar únicamente Hosting:

```powershell
firebase deploy --project controldeasistencias-8308c --only hosting --non-interactive
```

## 36.68 - Publicacion de estas mejoras

Hosting publicado el 15/09/2026 a las 22:11 (Ciudad de Mexico), version d586582b7c16c6f4, con clave publica de App Check y registro confirmado por el usuario. Validacion: 120 pruebas aprobadas; HTML, service worker y cinco scripts coinciden por HTTPS con dist y tienen cache correcta. Pendientes: comprobar arranque PWA sin conexion y tokens/metricas reales de App Check antes de exigirlo. Esta publicacion no incluye funciones.

1. Ejecutar `node --test tests/*.test.cjs functions/tests/*.test.js`.
2. Publicar Hosting: `firebase deploy --project controldeasistencias-8308c --only hosting --non-interactive`. El predeploy genera dist automaticamente. Para GitHub Pages, publicar el contenido de dist despues de ejecutar `node scripts/build-hosting.cjs`.
3. Verificar que HTML y sw.js tengan no-cache, y los JS con hash tengan public, max-age=31536000, immutable; comprobar recarga y arranque PWA sin conexion.

App Check requiere registrar reCAPTCHA Enterprise y dominios autorizados en Firebase, colocar su clave PUBLICA en app-check-config.js y publicar Hosting. Revisar metricas de App Check con clientes reales antes de exigirlo. Para activar, definir ENFORCE_APP_CHECK=true en functions/.env.controldeasistencias-8308c y desplegar functions. Para volver al modo sin exigencia, establecer false y volver a desplegar functions. No publicar tokens de depuracion.

Referencia: https://firebase.google.com/docs/app-check/web/recaptcha-enterprise-provider

## 36.67 - Pendiente de publicar

Validar y desplegar con:

```powershell
firebase deploy --project controldeasistencias-8308c --only functions:listAuditLogs,functions:cleanupAuditLogs,hosting --non-interactive
```

La nueva tarea requiere Cloud Scheduler habilitado. Elimina permanentemente solo auditoria con mas de 14 dias, cada hora. Verificar dos escuelas, orden descendente, filtros y registros vencidos.
Referencia: https://firebase.google.com/docs/functions/schedule-functions

## Actualización 36.66 (publicada y verificada)

Corrección del editor y actualización de pruebas. Solo requiere Hosting; el backend y las reglas ya se publicaron con 36.65.

```powershell
firebase deploy --project controldeasistencias-8308c --only hosting --non-interactive
```

Validación: 114 pruebas aprobadas. Desplegada el 14/09/2026 a las 22:35 (Ciudad de México), release 029638f8f09128c1. Los 13 recursos principales responden HTTP 200 y coinciden byte por byte con los locales.

## Actualización 36.65 (despliegue verificado)

Publicar las correcciones junto con las funciones pendientes de horarios:

```powershell
firebase deploy --project controldeasistencias-8308c --only functions:correctAttendance,functions:listAttendanceReport,functions:justifyAttendance,functions:updateSchool,functions:updateSchoolSchedules,hosting
```

En Gestión > Reportes, consultar un grupo y periodo, verificar la clase y pulsar una celda. Corregir una omisión y un retardo, guardar motivo y confirmar totales, recálculo e impresión/exportación. Verificar rechazo con rol docente. Las reglas no cambian.

# Puesta en marcha segura

## Actualizacion 36.63 (pendiente de publicar)

`firebase deploy --project controldeasistencias-8308c --only functions:updateSchool,functions:updateSchoolSchedules,hosting`

Comprobar jornadas distintas en dos niveles, persistencia al reabrir y herencia en grupos nuevos.


## Actualización 36.62: catálogo y jornada simplificada (pendiente de publicar)

```powershell
firebase deploy --project controldeasistencias-8308c --only functions:updateSchool,functions:updateSchoolSchedules,hosting
```

En Configurar horarios, agregar MAT — Matemáticas, generar la jornada y escribir MAT en una celda. Al salir se completa el nombre. Guardar y reabrir para comprobar catálogo y clases; cambiar de grupo debe recuperar su jornada. Un plantel con un solo nivel no muestra el selector Nivel.

## Actualización 36.59: niveles institucionales (pendiente de publicar)

```powershell
firebase deploy --project controldeasistencias-8308c --only functions:updateSchool,functions:updateSchoolSchedules,hosting
```

En **Gestión > Escuela > Ajustes Institucionales**, seleccionar los niveles y guardar antes de abrir **Configurar horarios**. Comprobar persistencia y selectores filtrados al cambiar de plantel. No se permite desactivar niveles con alumnos activos, materias o jornadas. Los planteles anteriores mantienen todos los niveles hasta configurar los propios.

## Actualización 36.58: materias sin docente (pendiente de publicar)

Publicar backend y Hosting juntos:

```powershell
firebase deploy --project controldeasistencias-8308c --only functions:updateSchoolSchedules,hosting
```

En **Gestión > Asignar horarios**, elegir módulos continuos o con traslado/descanso, generar la jornada y capturar solo materias. Guardar y reabrir; en el paso 4 asignar docentes por materia y grupo. Verificar persistencia de ambos modos, clases pendientes de docente, rechazo de cruces al asignar y pase de lista de las clases asignadas.

## Actualización 36.56: jornadas y cuadrícula por grupo (pendiente de publicar)

Publicar backend y Hosting juntos:

```powershell
firebase deploy --project controldeasistencias-8308c --only functions:updateSchoolSchedules,hosting
```

En **Gestión > Asignar horarios**, configurar días laborales, generar la jornada del grupo y asignar materias/docentes en la cuadrícula semanal. Guardar aplica configuración y clases en una transacción. Verificar reapertura y persistencia, otro grupo con jornada diferente, receso, clases simultáneas del mismo docente y pase de lista en el módulo vigente. La comprobación visual en navegador sigue pendiente; no hubo navegador conectado durante esta implementación.

## Actualización 36.54: horarios por materia

Versión desplegada el 05/09/2026; Hosting verificado por HTTPS. Para volver a publicar backend y Hosting juntos:

```powershell
firebase deploy --project controldeasistencias-8308c --only functions:updateSchoolSchedules,functions:updateOwnSchedule,functions:recordAttendance,functions:listAttendanceReport,functions:justifyAttendance,functions:renumberStudentGroup,functions:updateTeacherSubjects,functions:listTeachers,functions:createTeacher,functions:changeTeacherPassword,hosting
```

Después del despliegue, cada administrador captura su tabla en **Gestión > Personal > Horarios por materia del plantel**. Hasta guardar clases administrativas, los docentes no tendrán un pase habilitado. No se migran automáticamente los horarios antiguos porque no contienen día de la semana. La hora usada es Ciudad de México y el fin de cada clase es exclusivo. La cámara requiere el toque habitual del docente.

Verificar con dos clases consecutivas: selección automática del grupo y materia, rechazo fuera de horario, registro del mismo alumno en ambas clases, bloqueo de duplicados dentro de cada clase y consulta del reporte por clase. Las reglas vigentes ya prohíben escrituras directas a docentes y planteles; este cambio no modifica esas reglas.

La aplicación ya no valida claves ni roles en el navegador. Antes de publicar esta versión se deben desplegar las Cloud Functions y las reglas de Firestore incluidas en el proyecto.

## 1. Respaldo

Realiza un respaldo de Firestore antes del primer despliegue. La primera autenticación válida de cada escuela migra automáticamente `accessKey` desde el documento público hacia `private/security/school_secrets`, donde se guarda con `scrypt` y se elimina el valor público.

## 2. Preparar Firebase

1. Instala Firebase CLI y autentícate con una cuenta autorizada.
2. Habilita el proveedor **Correo/contraseña** en Firebase Authentication.
3. En Authentication > Plantillas, configura y prueba la plantilla **Restablecimiento de contraseña** y verifica que el dominio del hosting esté autorizado.
4. Crea en Authentication la cuenta que administrará el directorio maestro.
5. En `functions/`, ejecuta `npm install`.

## 3. Asignar el rol maestro

Desde un entorno administrativo con credenciales de Google Application Default Credentials:

```powershell
cd functions
npm run set-super -- UID_DE_FIREBASE "Nombre del administrador"
```

El UID se obtiene en Firebase Console > Authentication. Nunca asignes el rol `super` desde el navegador ni desde un documento editable por clientes.

## 4. Desplegar backend y reglas

Desde la raíz del proyecto:

```powershell
firebase use controldeasistencias-8308c
firebase deploy --only functions,firestore:rules
```

Después publica `index.html` y `app.js` en el hosting habitual. Deben servirse mediante HTTPS para que la cámara funcione.

## 5. Recomendaciones de producción

- Configura Firebase App Check para la aplicación web y, una vez validado, activa `enforceAppCheck` en las funciones invocables.
- Configura políticas TTL para los campos `expiresAt` de `login_challenges` y `rate_limits`.
- Restringe la API key de Firebase exclusivamente a las APIs y dominios utilizados por este proyecto.
- Prueba primero en un proyecto Firebase de staging o con Emulator Suite.
- Conserva las reglas con política de denegación por defecto; no uses `allow read, write: if request.auth != null` como sustituto de roles.

## 05/10/2026 - Selector de jornadas publicado

- Hosting publicado a las 19:45 (Ciudad de Mexico), version 3f9dc2f8d1ad13b0.
- Incluye selector de tipo de jornada habilitado y recuperacion de jornadas por nivel.
- Verificacion HTTPS aprobada: 30 archivos coinciden con dist y tienen cache y cabeceras correctas; tres funciones protegidas rechazan solicitudes sin autenticacion.
- Validacion previa: 38 pruebas de horarios aprobadas, sintaxis JavaScript y build correctos. Solo Hosting; no se desplegaron funciones ni reglas.

## 05/10/2026 - Reglas por nivel (pendiente de publicar)

Publicar Functions y Hosting juntos; no hay cambios de reglas de Firestore. El cambio comprende updateSchool, recordAttendance, correctAttendance y respuestas publicas del plantel. Validacion local: 145 pruebas aprobadas, sintaxis JavaScript y HTML verificados.

```powershell
firebase deploy --project controldeasistencias-8308c --only functions,hosting --non-interactive
node scripts/verify-deployment.cjs
```

En Gestion > Escuela seleccionar primero el tipo de jornada. Para jornadas por niveles, configurar tolerancia, equivalencia de retardos y periodos para cada nivel; guardar ajustes antes de continuar a horarios. Verificar entradas distintas, conversion en falta al alcanzar el limite y ausencia de conversion fuera del periodo. El historial anterior conserva la regla aplicada en cada captura.

## 05/10/2026 - Reglas por nivel publicadas y verificadas

- Functions y Hosting publicados a las 20:35 de Ciudad de Mexico; version de Hosting 1bb03469f652fde3.
- Actualizadas correctamente las 45 funciones en Node 22. No se desplegaron reglas de Firestore.
- Verificacion HTTPS: los 30 archivos coinciden con dist, con cache y cabeceras correctas. listTeachers, listAuditLogs, updateSchool, recordAttendance y correctAttendance rechazan llamadas sin autenticacion.
- Validacion previa: 145 pruebas aprobadas, HTML y sintaxis JavaScript verificados.
- Queda pendiente la comprobacion visual con una cuenta real; el navegador del entorno no pudo iniciar. Este despliegue resuelve el pendiente de publicacion de reglas por nivel.

## 05/10/2026 - Dias por nivel (pendiente de publicar)

Publicar Functions y Hosting juntos. Validacion: 151 pruebas aprobadas, HTML, JavaScript y build correctos. No requiere reglas de Firestore.

```powershell
firebase deploy --project controldeasistencias-8308c --only functions,hosting --non-interactive
node scripts/verify-deployment.cjs
```

En Gestion > Escuela elegir jornada, despues niveles y luego dias laborables y reglas. Probar dos niveles con dias distintos, reapertura y cambio a jornada institucional. La tabla de horarios debe mostrar los dias del nivel seleccionado. No se puede quitar un dia con clases asignadas. Reportes combinados e XLS no deben mostrar faltas por dias no laborables del otro nivel.

## 05/10/2026 - Dias por nivel publicados y verificados

- Functions y Hosting publicados a las 21:25 de Ciudad de Mexico; version de Hosting 762b8c3faa6c0033.
- Las 45 funciones se actualizaron correctamente en Node 22. No se desplegaron reglas de Firestore.
- Verificacion HTTPS: los 30 archivos coinciden con dist, con cache y cabeceras correctas. listTeachers, listAuditLogs, updateSchool, recordAttendance y updateSchoolSchedules rechazan solicitudes sin autenticacion.
- Validacion previa: 151 pruebas aprobadas, HTML, JavaScript y build correctos. Pendiente comprobacion visual con una cuenta real.

## 05/10/2026 - Entrada y modulos (pendiente de publicar)

- Requiere Functions y Hosting juntos; no modifica reglas de Firestore. 156 pruebas aprobadas, HTML, JavaScript y build correctos.
- Ejecutar firebase deploy --project controldeasistencias-8308c --only functions,hosting --non-interactive y luego node scripts/verify-deployment.cjs.
- Verificar Hora de entrada al plantel institucional y por nivel. En asistencia por grupo, comprobar inicio de clase asignada, limite de tolerancia y transicion a un modulo de distinta duracion; fuera de clase debe rechazar la captura.

## 05/10/2026 - Entrada y modulos publicados y verificados

- Functions y Hosting publicados a las 21:57 de Ciudad de Mexico. Version 25b638e241037931; 45 funciones actualizadas, sin cambios de reglas de Firestore.
- node scripts/verify-deployment.cjs aprobado: 30 archivos exactos, cache y cabeceras correctas; tres funciones protegidas rechazan solicitudes sin autenticacion.
- Validacion previa: 156 pruebas aprobadas, HTML, JavaScript y build correctos. Sigue pendiente comprobacion visual con una cuenta real.

## 24/10/2026 - Recuperacion de acceso publicada

- Hosting publicado a las 21:35 (Ciudad de Mexico), version 521f0c2e5d21e54f.
- Verificacion HTTPS aprobada: 30 archivos exactos, cache y cabeceras correctas; tres funciones protegidas rechazan solicitudes sin autenticacion.
- Validacion previa: 160 pruebas aprobadas. Pendiente comprobar el acceso con una cuenta real en la computadora afectada.

## 24/10/2026 - Sincronizacion con GitHub Pages

- GitHub Pages publica la raiz de main en https://cumorahnet.github.io/controldeasistencias/. El remoto estaba en 13558b1 y no incluia los cambios locales publicados en Firebase.
- Se sincroniza el codigo, dependencias publicas y pruebas de recuperacion de acceso. No se incluyen archivos locales de herramientas ni registros de despliegue.

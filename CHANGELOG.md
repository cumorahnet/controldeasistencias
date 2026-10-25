## 30/09/2026 - Despliegue completo verificado

- Publicados Hosting, funciones Node 22 y reglas de Firestore (sin cambios pendientes en reglas). Release de Hosting: d57f6be20f6d7f93, a las 13:09 de Ciudad de Mexico.
- 134 pruebas aprobadas con Node 22. Verificacion HTTPS: los 30 archivos coinciden con dist, con cache y cabeceras correctas; tres funciones protegidas rechazan llamadas sin autenticacion.
- Incluye periodos institucionales de faltas y retardos con fechas inicial y final. Configurar las fechas en Gestion > Escuela para activar la acumulacion dentro de los periodos.

## 30/09/2026 - Periodos con fecha inicial y final

- Sustituye la duracion en dias por multiples periodos institucionales con fechas inclusivas y sin superposiciones.
- Conteo de retardos independiente por periodo y reinicio al completar el limite. Selector de periodo para reportes de faltas y retardos; excluye fechas futuras.
- 134 pruebas aprobadas y build validado. Pendiente publicar Hosting y funciones.

## 30/09/2026 - Periodo de acumulacion de retardos

- Gestion de escuela permite establecer la vigencia en dias naturales, obligatoria al guardar una regla activa desde la interfaz nueva.
- Reinicio por vencimiento o por limite, aplicado en capturas y recalculo de correcciones. Se conserva el estado al cambiar de grupo.
- Pendiente publicar Hosting y funciones; no modifica reglas de seguridad.

## 36.76 - Revision de seguridad y consistencia

- Dependencias Firebase y SheetJS corregidas; cache limitada a recursos publicos; build con lista explicita y limpieza.
- Cabeceras de seguridad, rechazo de estados docentes desconocidos y validacion robusta de fechas.
- Totales de reportes coherentes con dias visibles y excepciones; pruebas de regresion y PWA manual actualizadas.
- Detalles y limites en SECURITY_REVIEW.md.

## 36.68 - Errores, cache y preparacion de App Check

- Mensajes de permisos, verificacion de acceso, limites y tiempo agotado; el fallo del listener de plantel ahora se informa.
- Hosting se genera en dist con nombres por hash; solo esos recursos reciben cache inmutable de un ano. HTML, service worker y URLs anteriores conservan no-cache.
- App Check Enterprise configurado con la clave publica proporcionada; el usuario confirma registro en Firebase App Check. Hosting publicado el 15/09/2026 a las 22:11 (Ciudad de Mexico), version d586582b7c16c6f4. Las 120 pruebas pasan y 7 archivos publicados coinciden por HTTPS con los locales, con cabeceras de cache correctas. Pendiente validar tokens y metricas con uso real antes de exigir App Check; no se desplegaron funciones en esta publicacion.

## 15/09/2026 - Version de la portada

- El boton obtiene automaticamente la version del titulo de la pagina, incluido su nombre accesible; elimina el numero fijo 36.46.0.
- Actualiza la cache PWA. Requiere publicar Hosting junto con los pendientes de 36.67.

## 36.67 - 15/09/2026 - Historial por escuela

- Secciones desplegables por escuela, ordenadas por actividad reciente, con acciones descendentes y filtros existentes.
- Consulta paginada de los ultimos 14 dias y limpieza horaria de auditoria vencida. No elimina asistencias.
- Validacion: 117 pruebas aprobadas. Pendiente desplegar Hosting, listAuditLogs y cleanupAuditLogs.

## 36.66 - 14/09/2026 - Validación de horarios

- Impide desactivar un día con materias pendientes de completar, para evitar ocultar celdas que bloquean el guardado.
- Actualiza las pruebas al flujo vigente: jornadas institucionales o por nivel, catálogo de nombres y sugerencias por prefijo; conserva validaciones de duplicados, cruces, docentes y persistencia.
- Validación: 114 pruebas aprobadas, sin fallos. Actualiza versión y caché PWA. Hosting publicado y 13 recursos verificados por HTTPS.

## 36.65 - 14/09/2026 - Correcciones administrativas de asistencia

- Celdas editables en reportes para administradores: A TIEMPO, RETARDO o FALTA NORMAL, hora opcional y motivo obligatorio.
- Guardado protegido por rol, plantel y versión; conserva IDs anteriores y clase. Auditoría atómica con valores anteriores y posteriores.
- Recalcula retardos y faltas automáticas del alumno con los límites guardados en cada captura; actualiza totales, impresión y exportación.
- Validación: 49 pruebas de asistencia, correcciones, arranque y PWA aprobadas. La suite general detectó ocho fallos existentes en horarios; se actualizó la expectativa de caché para esta versión. Revisión visual y despliegue pendientes.

# CHANGELOG

<!-- cdc-session:session-20261006012948-b095c4 -->
## Sesión 05/10/2026, 10:22 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 26 cambio(s): 6 creado(s), 20 modificado(s) y 0 eliminado(s).

### Cambios

- .firebase/hosting.ZGlzdA.cache
- CHANGELOG.md
- DECISIONS.md
- DEPLOY_FIREBASE.md
- NEXT.md
- app.js
- attendance-report-export.js
- deploy-days-by-level.log
- deploy-entry-config.log
- deploy-rules-by-level.log
- entry-config-test-results.txt
- firebase-debug.log
- functions/attendance-corrections.js
- functions/attendance-utils.js
- functions/index.js
- functions/school-timetable.js
- index.html
- level-days-test-results.txt
- school-timetable.js
- tests/admin-features.test.cjs
- tests/attendance-corrections.test.cjs
- tests/attendance-policy-levels.test.cjs
- tests/level-journeys.test.cjs
- tests/school-levels.test.cjs
- tests/school-schedules.test.cjs
- tests/timetable.test.cjs

### Riesgos

- La sesión contiene 26 cambios. Considera dividir la revisión o el commit para reducir el riesgo de integración.
- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.
- Cambió la definición de dependencias; valida instalación y seguridad.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

<!-- cdc-session:session-20261002030149-075fb9 -->
## Sesión 01/10/2026, 09:01 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 0 cambio(s): 0 creado(s), 0 modificado(s) y 0 eliminado(s).

### Cambios

- No se detectaron archivos modificados.

### Riesgos

- No se detectaron archivos modificados. Confirma que el trabajo se haya guardado dentro del proyecto y fuera de carpetas ignoradas.
- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.
- Cambió la definición de dependencias; valida instalación y seguridad.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Definir el siguiente objetivo de trabajo del proyecto.

<!-- cdc-session:session-20260930190611-c159da -->
## Sesión 30/09/2026, 01:10 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 4 cambio(s): 0 creado(s), 4 modificado(s) y 0 eliminado(s).

### Cambios

- .firebase/hosting.ZGlzdA.cache
- CHANGELOG.md
- DEPLOY_FIREBASE.md
- firebase-debug.log

### Riesgos

- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.
- Cambió la definición de dependencias; valida instalación y seguridad.

### Próximo paso

- Revisar el diff y preparar un commit descriptivo.

<!-- cdc-session:session-20260930012057-c12b3a -->
## Sesión 29/09/2026, 10:36 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 25 cambio(s): 5 creado(s), 20 modificado(s) y 0 eliminado(s).

### Cambios

- .firebase/hosting.ZGlzdA.cache
- CHANGELOG.md
- DECISIONS.md
- DEPLOY_FIREBASE.md
- NEXT.md
- SECURITY_REVIEW.md
- app.js
- attendance-report-export.js
- audit-test-results.txt
- deploy-review.local
- firebase-debug.log
- firebase.json
- functions-deploy-inventory.local
- functions/index.js
- functions/package-lock.json
- functions/package.json
- index.html
- pwa-install.js
- scripts/build-hosting.cjs
- scripts/verify-deployment.cjs
- sw.js
- tests/hosting-errors.test.cjs
- tests/pwa-install.test.cjs
- tests/security-audit.test.cjs
- version.json

### Riesgos

- Se modificaron archivos de configuración o infraestructura (functions/package-lock.json, functions/package.json). Valida compatibilidad y despliegue.
- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.
- Cambió la definición de dependencias; valida instalación y seguridad.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

<!-- cdc-session:session-20260929203628-6678ae -->
## Sesión 29/09/2026, 02:40 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 7 cambio(s): 0 creado(s), 7 modificado(s) y 0 eliminado(s).

### Cambios

- .firebase/hosting.ZGlzdA.cache
- CHANGELOG.md
- DEPLOY_FIREBASE.md
- firebase-debug.log
- index.html
- sw.js
- version.json

### Riesgos

- Se modificó código fuente sin cambios detectados en archivos de prueba. Verifica la cobertura antes de cerrar el trabajo.
- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

## 36.69 - Salida de sesión

- Se muestra el botón **Salir** en la barra superior durante toda la sesión para cambiar de usuario o escuela.
- Al cerrar sesión, se vuelve a mostrar el acceso a escuela y usuario.
- Solo requiere publicar Hosting; no cambia backend ni reglas.


<!-- cdc-session:session-20260929034519-e6f865 -->
## Sesión 28/09/2026, 09:45 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 0 cambio(s): 0 creado(s), 0 modificado(s) y 0 eliminado(s).

### Cambios

- No se detectaron archivos modificados.

### Riesgos

- No se detectaron archivos modificados. Confirma que el trabajo se haya guardado dentro del proyecto y fuera de carpetas ignoradas.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Definir el siguiente objetivo de trabajo del proyecto.

<!-- cdc-session:session-20260916030834-9fa419 -->
## Sesión 15/09/2026, 10:38 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 17 cambio(s): 6 creado(s), 11 modificado(s) y 0 eliminado(s).

### Cambios

- .firebase/hosting.ZGlzdA.cache
- .gitignore
- CHANGELOG.md
- DECISIONS.md
- DEPLOY_FIREBASE.md
- app-check-config.js
- app.js
- firebase-debug.log
- firebase.json
- functions/.env.example
- functions/index.js
- index.html
- scripts/build-hosting.cjs
- sw.js
- tests/hosting-errors.test.cjs
- tests/pwa-install.test.cjs
- version.json

### Riesgos

- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

<!-- cdc-session:session-20260916030305-040b00 -->
## Sesión 15/09/2026, 09:06 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 0 cambio(s): 0 creado(s), 0 modificado(s) y 0 eliminado(s).

### Cambios

- No se detectaron archivos modificados.

### Riesgos

- No se detectaron archivos modificados. Confirma que el trabajo se haya guardado dentro del proyecto y fuera de carpetas ignoradas.
- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Definir el siguiente objetivo de trabajo del proyecto.

<!-- cdc-session:session-20260915200522-635b6b -->
## Sesión 15/09/2026, 05:03 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 17 cambio(s): 3 creado(s), 13 modificado(s) y 1 eliminado(s).

### Cambios

- .firebase/hosting..cache
- .firebaserc
- .gitignore
- CHANGELOG.md
- DECISIONS.md
- DEPLOY_FIREBASE.md
- NEXT.md
- app-startup.js
- app.js
- audit-test-results.txt
- firebase-debug.log
- functions/index.js
- index.html
- sw.js
- tests/audit-history.test.cjs
- tests/pwa-install.test.cjs
- version.json

### Riesgos

- Se eliminaron 1 archivo(s). Confirma que las eliminaciones sean intencionales antes de integrar los cambios.
- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

<!-- cdc-session:session-20260915044205-b161a6 -->
## Sesión 14/09/2026, 10:42 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 0 cambio(s): 0 creado(s), 0 modificado(s) y 0 eliminado(s).

### Cambios

- No se detectaron archivos modificados.

### Riesgos

- No se detectaron archivos modificados. Confirma que el trabajo se haya guardado dentro del proyecto y fuera de carpetas ignoradas.
- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Definir el siguiente objetivo de trabajo del proyecto.

<!-- cdc-session:session-20260913011240-6a3094 -->
## Sesión 12/09/2026, 10:57 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 22 cambio(s): 7 creado(s), 15 modificado(s) y 0 eliminado(s).

### Cambios

- CHANGELOG.md
- DECISIONS.md
- DEPLOY_FIREBASE.md
- NEXT.md
- app-startup.js
- app.js
- functions/attendance-utils.js
- functions/index.js
- functions/school-timetable.js
- index.html
- schedule-test-results.txt
- school-timetable.js
- sw.js
- tests/app-startup.test.cjs
- tests/level-journeys.test.cjs
- tests/pwa-install.test.cjs
- tests/schedule-persistence.test.cjs
- tests/school-levels.test.cjs
- tests/school-schedules.test.cjs
- tests/teacher-schedule-flow.test.cjs
- tests/timetable.test.cjs
- version.json

### Riesgos

- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

## 36.63 - 12/09/2026 - Jornadas por nivel

- Permite aplicar una jornada a uno o varios niveles conservando las restantes, recuperarla para editar y heredarla en nuevos grupos.
- Persistencia y validacion compartida; conserva materias por modulo y rechaza reducciones que las eliminen.
- Publicacion pendiente de Hosting y funciones.


## 36.62 — 12/09/2026 — Jornada simplificada y catálogo de materias

- Validación: 103 pruebas aprobadas, sintaxis JavaScript e identificadores HTML verificados. Revisión visual en navegador pendiente.

- Un solo campo Grupo permite recuperar jornadas o crear otras. Se oculta Nivel cuando el plantel ofrece solo uno.
- Catálogo de materias con iniciales únicas; al escribirlas y salir de la celda se completa el nombre. Se guarda junto con los horarios, admite materias sin clases y conserva nombres en clases al quitar un atajo.
- Validación compartida y persistencia protegida por revisión; clientes anteriores conservan el catálogo. Requiere publicar updateSchoolSchedules y Hosting.

## 36.61 — 12/09/2026 — Escaneo sin configuración personal

- Se elimina «Configurar mi horario» del pase de lista para todos los roles. Los docentes siguen usando automáticamente la clase asignada en la gestión institucional.
- Requiere publicar Hosting.

## 36.60 — 12/09/2026 — Captura única de horarios

- Se retiran entrada, regreso del receso y duración del módulo de los ajustes generales; se capturan en Configurar horarios por grupo. La tolerancia permanece en ajustes.
- Se conservan los parámetros históricos al guardar el perfil para mantener compatibilidad con la entrada general. Requiere publicar Hosting.

## 36.59 — 12/09/2026 — Niveles institucionales y ubicación de horarios

- Configuración de niveles por institución y filtrado de los selectores de alumnos y horarios según los niveles guardados.
- Acceso a configuración de horarios trasladado desde Gestión y Personal a Ajustes Institucionales.
- Validación protegida de niveles y bloqueo de desactivación cuando existen alumnos activos, materias o jornadas.
- Validación: 99 pruebas aprobadas, sintaxis JavaScript válida e identificadores HTML únicos. Requiere publicar `updateSchool`, `updateSchoolSchedules` y Hosting. Revisión visual pendiente.

## 36.58 — 12/09/2026 — Horarios de materias y asignación posterior

- Selector de módulos continuos o con traslado/descanso de minutos configurables; restaura la opción de cada jornada guardada.
- Cuadrícula de materias que permite guardar sin docentes. El paso 4 permite asignarlos posteriormente por materia y grupo.
- El servidor admite clases pendientes de docente, conserva la validación de cruces de grupo y rechaza cruces al asignar docentes.
- Validación: 94 pruebas aprobadas y sintaxis JavaScript comprobada. Revisión visual y publicación pendientes.

## 36.57 — 12/09/2026 — Diagnóstico del arranque local

- Se sustituye el estado indefinido «Iniciando» por un aviso ante fallos de carga del módulo, errores iniciales o una espera superior a 20 segundos, con opción de reintentar.
- Se detecta la apertura por `file:` y se explica que requiere un servidor HTTP. El aviso desaparece si la aplicación termina de arrancar después de la espera.
- Cuatro pruebas nuevas verifican estos estados y la evaluación del módulo principal con Firebase simulado. No se ha confirmado la causa del fallo informado: pendiente conocer la URL local y comprobar su respuesta real.

## 36.56 — 12/09/2026 — Jornadas y materias en tabla semanal

- Configuración de días laborables por escuela y entrada, salida, descanso, receso opcional y módulos diarios por grupo.
- Generación de cuadrícula Horario × días laborables, con filas de módulos, descansos y receso; asignación de materia/docente por celda.
- Guardado de jornadas incluso sin materias, con validación en servidor, protección contra cambios simultáneos y conservación de horarios anteriores.
- Validación: 88 pruebas aprobadas, sintaxis JavaScript válida e identificadores HTML únicos. Revisión visual pendiente por ausencia de navegador conectado. Actualización del caché de la aplicación; requiere publicar `updateSchoolSchedules` y Hosting.

<!-- cdc-session:session-20260905204311-c33ec2 -->
## Sesión 05/09/2026, 10:53 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 24 cambio(s): 5 creado(s), 19 modificado(s) y 0 eliminado(s).

### Cambios

- .firebase/hosting..cache
- CHANGELOG.md
- DECISIONS.md
- DEPLOY_FIREBASE.md
- NEXT.md
- app.js
- attendance-report-export.js
- firebase-debug.log
- firebase.json
- functions/attendance-utils.js
- functions/index.js
- functions/tests/attendance-utils.test.js
- index.html
- index.html.backup
- schedule-test-results.txt
- sw.js
- tests/admin-features.test.cjs
- tests/pwa-install.test.cjs
- tests/schedule-persistence.test.cjs
- tests/school-schedules.test.cjs
- tests/teacher-onboarding.test.cjs
- tests/teacher-schedule-flow.test.cjs
- tests/teacher-subjects.test.cjs
- version.json

### Riesgos

- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

## 36.55 — 05/09/2026 — Acceso visible a horarios

- Se agrega Asignar horarios al inicio de Gestión, visible sin entrar en Personal.
- La ventana muestra los encabezados de la tabla aunque todavía no haya clases y explica cómo agregar la primera.
- Se centra la ventana y se actualiza la versión de la aplicación y su caché.
- Validación: 80 pruebas aprobadas, JavaScript válido e identificadores HTML únicos.



## 36.54 — 05/09/2026 — Horarios administrativos por materia

- Gestión > Personal ofrece una tabla por materia con docente, nivel, grupo, día, inicio y fin; permite agregar, editar y quitar clases del plantel.
- Se elimina la configuración de horarios para docentes, tanto en la interfaz como en el servidor. Su pase de lista se habilita automáticamente para el grupo y materia de la clase vigente; la cámara se enciende al tocar su botón.
- Validación de cruces, docentes activos del mismo plantel, horarios y modificaciones simultáneas. Los cambios llegan a las sesiones docentes mediante el perfil institucional en tiempo real.
- Asistencias independientes por clase, con materia identificada; reportes y justificaciones distinguen las clases de la entrada general. La renumeración conserva esa separación.
- Los horarios docentes anteriores ya no habilitan clases: el administrador debe capturar la nueva tabla. Se conserva el historial.
- Requiere desplegar `updateSchoolSchedules`, `updateOwnSchedule`, `recordAttendance`, `listAttendanceReport`, `justifyAttendance`, `renumberStudentGroup` y Hosting. Desplegada el 05/09/2026 junto con las funciones de materias y cuentas docentes: diez funciones y Hosting. Verificación: 80 pruebas aprobadas y HTML publicado idéntico al local (HTTP 200).

## 05/09/2026 — Parámetros institucionales del horario docente

- El docente modifica únicamente grupo, materia y hora del pase de lista; tolerancia, duración y regreso del receso se muestran como configuración del administrador.
- El servidor omite parámetros administrativos enviados por docentes. El pase de lista aplica los valores actuales del plantel, ignorando valores docentes heredados.
- Los horarios guardados conservan grupo, materia y hora; no requieren migración para adoptar los parámetros institucionales.
- Despliegue requerido: `updateOwnSchedule`, `recordAttendance` y Hosting.

## 05/09/2026 — Edición administrativa de materias

- Cada cuenta tiene un menú «Acciones» al inicio de la fila con Contraseña, Editar y Eliminar según permisos; la edición permite corregir el nombre y acceder a las materias. Contraseña abre su propio modo de restablecimiento.
- Gestión permite al administrador maestro, director y superusuario consultar, asignar y editar materias de docentes existentes.
- El guardado valida permisos y plantel en el servidor, registra la operación en la bitácora y conserva los horarios anteriores.
- Se mantiene el selector de roles y sus protecciones contra cambios del propio rol y eliminación del último administrador maestro.
- Requiere desplegar la función `updateTeacherSubjects`, la actualización de `listTeachers` y Hosting.

## 36.53 — 05/09/2026

- «Configurar mi horario» aparece antes del selector de grupo y de la cámara.
- Se retiró del HTML el módulo de demostración que instalaba usuarios y operaciones ficticias.
- Las materias del alta docente y del horario por grupo se guardan en Firebase; las cuentas anteriores sin materias conservan su funcionamiento.
- El editor de horarios ya no cambia el encabezado del grupo activo del escáner.
- Se alineó la duración heredada entre navegador y servidor, se rechazan valores no numéricos y se corrige el cálculo de retardos en módulos que cruzan medianoche.
- Verificación: 70 pruebas aprobadas, sintaxis JavaScript válida e identificadores HTML únicos.

<!-- cdc-session:session-20260904160028-d4e209 -->
## Sesión 04/09/2026, 10:36 a.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 9 cambio(s): 0 creado(s), 9 modificado(s) y 0 eliminado(s).

### Cambios

- app.js
- functions/attendance-utils.js
- functions/index.js
- functions/tests/attendance-utils.test.js
- index.html
- index.html.backup
- tests/admin-features.test.cjs
- tests/teacher-schedule-flow.test.cjs
- version.json

### Riesgos

- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

<!-- cdc-session:session-20260904063134-cfd11c -->
## Sesión 04/09/2026, 12:32 a.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 0 cambio(s): 0 creado(s), 0 modificado(s) y 0 eliminado(s).

### Cambios

- No se detectaron archivos modificados.

### Riesgos

- No se detectaron archivos modificados. Confirma que el trabajo se haya guardado dentro del proyecto y fuera de carpetas ignoradas.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Definir el siguiente objetivo de trabajo del proyecto.

<!-- cdc-session:session-20260903161730-461b93 -->
## Sesión 03/09/2026, 05:07 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 17 cambio(s): 4 creado(s), 13 modificado(s) y 0 eliminado(s).

### Cambios

- .firebase/hosting..cache
- CHANGELOG.md
- DEPLOY_FIREBASE.md
- app.js
- firebase-debug.log
- functions/attendance-utils.js
- functions/index.js
- index.html
- pwa-install.js
- sw.js
- tests/account-recovery.test.cjs
- tests/admin-features.test.cjs
- tests/incidents-feature.test.cjs
- tests/pwa-install.test.cjs
- tests/teacher-onboarding.test.cjs
- tests/teacher-schedule-flow.test.cjs
- version.json

### Riesgos

- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

## 03/09/2026 — Selección de grupo para el pase de lista

- El alta y el primer ingreso docente ya no obligan a configurar horarios de clase.
- Antes de pasar lista, el docente selecciona el grupo que atenderá; la búsqueda manual y los códigos QR quedan limitados a ese grupo.
- Si el grupo elegido todavía no tiene horario propio, la aplicación abre su configuración en ese momento, pero permite cerrarla y completarla después.
- Cada docente puede guardar y modificar horarios independientes para varios grupos.

## 03/09/2026 — Recuperación de acceso docente

- El acceso docente permite recuperar tanto el usuario como la contraseña usando el correo confirmado durante el primer ingreso.
- Firebase envía el enlace de restablecimiento y la aplicación sincroniza la contraseña nueva con la credencial privada del plantel después de validar correo, CCT y estado de la cuenta.
- La preparación de la recuperación usa límites de solicitudes y respuestas genéricas para no revelar si un correo está registrado.
- El cambio obligatorio de primer acceso incorpora **Salir y hacerlo después**, que cierra por completo la sesión sin permitir omitir el cambio de identidad y contraseña.

## 03/09/2026 — Alta y primer acceso de usuarios

- El administrador captura nombre(s), apellido paterno y apellido materno; el sistema genera un usuario temporal con esos datos y resuelve duplicados mediante un consecutivo.
- Las cuentas nuevas reciben la contraseña temporal `usuarionuevo` y quedan bloqueadas hasta completar el primer acceso.
- El alta administrativa no solicita correo: genera un usuario temporal a partir del nombre y los apellidos.
- En el primer acceso, la persona sustituye el usuario temporal por su correo personal o cuenta de Google y crea una contraseña propia.
- La migración conserva el perfil y el rol, elimina las credenciales temporales y almacena únicamente el hash de la contraseña nueva en el área privada de Firebase.

## 03/09/2026 — Bitácora de incidencias docentes

- Se agregó al menú docente el acceso **Incidencias** con los datos de referencia del formato de incidencias relevantes SEP/AEFCM.
- Cada docente puede registrar incidencias de grupos y alumnos activos, generar un folio y conservar seguimiento hasta su resolución.
- Las incidencias y sus notas se procesan mediante funciones protegidas; cada docente consulta únicamente sus propios registros.
- La pantalla advierte que la bitácora es un control interno y no sustituye los avisos, protocolos o formatos de la autoridad educativa competente.

<!-- cdc-session:session-20260903013246-994ca5 -->
## Sesión 03/09/2026, 10:17 a.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 5 cambio(s): 0 creado(s), 5 modificado(s) y 0 eliminado(s).

### Cambios

- app.js
- firebase-debug.log
- functions/index.js
- index.html
- tests/admin-features.test.cjs

### Riesgos

- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

<!-- cdc-session:session-20260902174228-39f534 -->
## Sesión 02/09/2026, 01:13 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 8 cambio(s): 0 creado(s), 8 modificado(s) y 0 eliminado(s).

### Cambios

- app.js
- attendance-report-export.js
- functions/attendance-utils.js
- functions/index.js
- functions/tests/attendance-utils.test.js
- index.html
- tests/admin-features.test.cjs
- tests/pwa-install.test.cjs

### Riesgos

- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

<!-- cdc-session:session-20260902014029-da486f -->
## Sesión 01/09/2026, 10:28 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 10 cambio(s): 3 creado(s), 7 modificado(s) y 0 eliminado(s).

### Cambios

- .firebase/hosting..cache
- app.js
- attendance-report-export.js
- camera-data-scanner.js
- firebase-debug.log
- index.html
- sw.js
- tests/admin-features.test.cjs
- tests/camera-data-scanner.test.cjs
- tests/pwa-install.test.cjs

### Riesgos

- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

<!-- cdc-session:session-20260828195822-e11df2 -->
## Sesión 28/08/2026, 05:45 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 16 cambio(s): 1 creado(s), 15 modificado(s) y 0 eliminado(s).

### Cambios

- .firebase/hosting..cache
- app.js
- firebase-debug.log
- functions/index.js
- icons/app-icon-192.png
- icons/app-icon-512.png
- icons/app-icon-maskable-512.png
- icons/apple-touch-icon.png
- index.html
- manifest.webmanifest
- pwa-install.js
- scripts/generate-pwa-icons.mjs
- sw.js
- tests/admin-features.test.cjs
- tests/pwa-install.test.cjs
- version.json

### Riesgos

- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

<!-- cdc-session:session-20260828183227-08d1e0 -->
## Sesión 28/08/2026, 12:38 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 0 cambio(s): 0 creado(s), 0 modificado(s) y 0 eliminado(s).

### Cambios

- No se detectaron archivos modificados.

### Riesgos

- No se detectaron archivos modificados. Confirma que el trabajo se haya guardado dentro del proyecto y fuera de carpetas ignoradas.
- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Definir el siguiente objetivo de trabajo del proyecto.

<!-- cdc-session:session-20260828045729-2da867 -->
## Sesión 27/08/2026, 11:03 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 3 cambio(s): 0 creado(s), 3 modificado(s) y 0 eliminado(s).

### Cambios

- index.html
- index.html.backup
- version.json

### Riesgos

- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Revisar el diff y preparar un commit descriptivo.

<!-- cdc-session:session-20260827054029-676504 -->
## Sesión 27/08/2026, 01:00 a.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 10 cambio(s): 0 creado(s), 10 modificado(s) y 0 eliminado(s).

### Cambios

- .firebase/hosting..cache
- CHANGELOG.md
- firebase-debug.log
- firebase.json
- index.html
- manifest.webmanifest
- pwa-install.js
- sw.js
- tests/pwa-install.test.cjs
- version.json

### Riesgos

- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

## 36.31.0 - 27/08/2026

- Se reemplazó por completo la experiencia móvil fallida de acceso directo con un flujo PWA versión 5.
- Android y navegadores compatibles usan el diálogo nativo únicamente después de tocar **Instalar app**.
- iPhone y iPad muestran una guía visual propia para **Compartir > Agregar a pantalla de inicio**, sin simular instalación nativa.
- El primer aviso presenta beneficios, aparece una sola vez y conserva por separado la elegibilidad tardía del navegador.
- Firebase Hosting excluye ahora los archivos de pruebas del despliegue público.

<!-- cdc-session:session-20260827044714-5a7858 -->
## Sesión 26/08/2026, 11:32 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 11 cambio(s): 4 creado(s), 7 modificado(s) y 0 eliminado(s).

### Cambios

- CHANGELOG.md
- app.js
- functions/attendance-utils.js
- functions/index.js
- functions/package.json
- functions/tests/attendance-utils.test.js
- index.html
- pwa-install.js
- sw.js
- tests/pwa-install.test.cjs
- version.json

### Riesgos

- Se modificaron archivos de configuración o infraestructura (functions/package.json). Valida compatibilidad y despliegue.
- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.
- Cambió la definición de dependencias; valida instalación y seguridad.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

## 36.30.0 - 26/08/2026

- Los docentes deben configurar la hora y tolerancia de al menos un grupo al iniciar sesión; cada grupo requiere su propio horario antes de registrar asistencias.
- El registro manual ahora permite buscar y seleccionar alumnos activos por nombre, conservando el ID únicamente como identificador interno.
- Los registros guardan si fueron capturados por QR o manualmente.

## 36.29.0 - 26/08/2026

- El flujo de acceso directo ahora captura temprano la instalación PWA, distingue primera visita, rechazo e instalación confirmada, y conserva un botón visible para reintentar.
- Se agregaron instrucciones específicas para iOS, Android, escritorio y navegadores internos que no exponen el instalador nativo.

<!-- cdc-session:session-20260826194512-ab8031 -->
## Sesión 26/08/2026, 10:25 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 18 cambio(s): 9 creado(s), 9 modificado(s) y 0 eliminado(s).

### Cambios

- .firebase/hosting..cache
- CHANGELOG.md
- app.js
- firebase-debug.log
- firebase.json
- firestore.rules
- functions/index.js
- functions/package-lock.json
- functions/package.json
- icons/app-icon-192.png
- icons/app-icon-512.png
- icons/app-icon-maskable-512.png
- icons/apple-touch-icon.png
- index.html
- manifest.webmanifest
- scripts/generate-pwa-icons.mjs
- sw.js
- version.json

### Riesgos

- Se modificaron archivos de configuración o infraestructura (functions/package-lock.json, functions/package.json). Valida compatibilidad y despliegue.
- Se modificó código fuente sin cambios detectados en archivos de prueba. Verifica la cobertura antes de cerrar el trabajo.
- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.
- Cambió la definición de dependencias; valida instalación y seguridad.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

## 36.28.0 - 26/08/2026

- La instalación vuelve al flujo directo usado en otras aplicaciones: el botón aparece sólo cuando Chrome confirma que la PWA es instalable y abre inmediatamente el instalador nativo.
- Se eliminó el modal de instrucciones y confirmaciones intermedias para dejar la instalación en un solo toque.

## 36.27.0 - 26/08/2026

- La instalación de la PWA sólo se confirma al recibir el resultado de Android o la confirmación explícita del usuario.
- Las instalaciones canceladas, rechazadas o inconclusas ya no se marcan como atendidas y pueden intentarse de nuevo.
- El aviso explica cómo llevar el icono desde el cajón de aplicaciones hasta la pantalla de inicio.

## 36.26.0 - 26/08/2026

- Se evita que cargas simultáneas dupliquen los planteles en los directorios del superusuario.

## 36.25.0 - 26/08/2026

- El escáner emite avisos más fuertes, largos y diferenciados al detectar, aceptar o rechazar un QR.
- El fondo del área del logotipo puede guardarse transparente o con un color personalizado.
- Los reportes de asistencia incluyen el logotipo institucional o el predeterminado.
- El reporte permite seleccionar uno, varios o todos los grupos y presenta alumnos en orden alfabético, fechas verticales, punto para asistencia y diagonal para falta dentro de una cuadrícula.

## 36.24.0 - 26/08/2026

- La aplicación se puede instalar desde el navegador como acceso directo con icono propio.
- En el primer ingreso desde un celular se muestra el flujo de instalación compatible con Android y las instrucciones para iPhone/iPad.
- Al abrirse desde el acceso directo, la aplicación usa una ventana independiente sin la barra del navegador.

## 36.23.0 - 26/08/2026

- La lista del pase de asistencia muestra la fecha actual completa, la hora de inicio del escáner y la hora exacta de cada registro.
- Los estados visibles y los nuevos registros se limitan a A TIEMPO o RETARDO.
- El mensaje de confirmación del escáner incluye la hora registrada.

## 36.22.0 - 26/08/2026

- Los avisos sonoros de asistencia correcta y lectura rechazada tienen mayor volumen y duración.
- Cada docente puede guardar un horario diferente por nivel y grupo; el escaneo aplica el correspondiente al alumno.
- Se agregó el rol Director con los mismos privilegios que Administrador maestro.
- Los QR vuelven a mostrar el ID del alumno en el centro, sin marco y con separación blanca.

## 36.21.0 - 26/08/2026

- La carga masiva genera identificadores QR legibles desde el primer guardado.
- La eliminación de un plantel revoca sesiones y elimina las cuentas de Authentication asociadas.
- La limpieza total también elimina credenciales, solicitudes y desafíos privados del plantel.

<!-- cdc-session:session-20260826145124-97aed7 -->
## Sesión 26/08/2026, 11:53 a.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 5 cambio(s): 0 creado(s), 5 modificado(s) y 0 eliminado(s).

### Cambios

- app.js
- functions/index.js
- index.html
- index.html.backup
- version.json

### Riesgos

- Se modificó código fuente sin cambios detectados en archivos de prueba. Verifica la cobertura antes de cerrar el trabajo.
- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

<!-- cdc-session:session-20260826020702-f0598e -->
## Sesión 26/08/2026, 12:03 a.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 5 cambio(s): 0 creado(s), 5 modificado(s) y 0 eliminado(s).

### Cambios

- app.js
- functions/index.js
- index.html
- index.html.backup
- version.json

### Riesgos

- Se modificó código fuente sin cambios detectados en archivos de prueba. Verifica la cobertura antes de cerrar el trabajo.
- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

<!-- cdc-session:session-20260824163402-410a01 -->
## Sesión 24/08/2026, 10:58 p.m.

### Resumen

Se cerró una sesión de trabajo del proyecto Listas de Asistencia. Se detectaron 13 cambio(s): 11 creado(s), 2 modificado(s) y 0 eliminado(s).

### Cambios

- .gitignore
- CHANGELOG.md
- DEPLOY_FIREBASE.md
- app.js
- firebase.json
- firestore.rules
- functions/index.js
- functions/package-lock.json
- functions/package.json
- functions/scripts/set-super.js
- index.html
- index.html.backup
- version.json

### Riesgos

- Se modificaron archivos de configuración o infraestructura (functions/package-lock.json, functions/package.json). Valida compatibilidad y despliegue.
- Se modificó código fuente sin cambios detectados en archivos de prueba. Verifica la cobertura antes de cerrar el trabajo.
- El análisis incluye archivos que ya tenían cambios al iniciar la sesión.
- Cambió la definición de dependencias; valida instalación y seguridad.

### Próximo paso

- Revisar y resolver los riesgos detectados en este cierre.
- Ejecutar las pruebas automatizadas y validar el comportamiento afectado.
- Revisar el diff y preparar un commit descriptivo.

## Sesión 15/07/2026

### Logros

logrado

### Próximo paso

Sin próximo paso registrado.

- Cierre de revision 36.76: Hosting y 45 funciones publicados; 30 archivos HTTPS verificados; 127 pruebas aprobadas y npm audit sin avisos. Ver DEPLOY_FIREBASE.md.

## 05/10/2026 - Selector de jornada por niveles

- Corregido el selector deshabilitado de tipo de jornada en el editor de horarios. Permite configurar entradas diferentes por nivel.
- Al reabrir, el modo se obtiene primero de las jornadas guardadas; seleccionar un nivel sin jornada aplica los parametros solo a ese nivel.
- Requiere publicar Hosting explicitamente; no cambia backend ni reglas.

## 05/10/2026 - Despliegue del selector de jornadas

- Correccion publicada en Firebase Hosting, version 3f9dc2f8d1ad13b0, a las 19:45 de Ciudad de Mexico.
- Los 30 archivos publicados coinciden con la compilacion local; verificacion de cache y cabeceras aprobada.

## 05/10/2026 - Reglas de asistencia por tipo de jornada

- Gestion > Escuela elige primero el tipo de jornada y despues las reglas de asistencia. La jornada institucional usa una tolerancia, un limite de retardos y sus periodos; por niveles ofrece un selector y valores independientes para cada nivel habilitado.
- Los borradores conservan valores y periodos al alternar niveles o tipo de jornada. Los niveles nuevos heredan los ajustes institucionales hasta configurarlos.
- El servidor valida y guarda levelAttendancePolicies; captura y correccion de omisiones usan la regla del nivel. Las entradas generales heredan la jornada guardada. Los reportes incluyen periodos identificados por nivel.
- Cada captura conserva el alcance aplicado para recalcular el historial sin mezclar niveles; cambiar de alcance reinicia el contador pendiente.
- Validacion: 145 pruebas aprobadas, sintaxis JavaScript y HTML completo con etiquetas balanceadas e IDs unicos. Revision visual pendiente por fallo de inicio del navegador del entorno.
- Pendiente desplegar Functions y Hosting juntos; no requiere cambios de reglas de Firestore.

## 05/10/2026 - Despliegue de reglas por nivel

- Publicadas Functions y Hosting a las 20:35 de Ciudad de Mexico, version 1bb03469f652fde3.
- 45 funciones actualizadas; 30 archivos HTTPS verificados y cinco funciones protegidas rechazan solicitudes sin autenticacion.
- Disponible el nuevo orden de Escuela: tipo de jornada primero, seguido de tolerancia, equivalencia de retardos y periodos institucionales o por nivel.

## 05/10/2026 - Dias laborables por nivel

- Dias laborables aparece despues de los niveles ofrecidos, junto a las reglas de asistencia; espera al menos un nivel seleccionado.
- Jornada por niveles permite dias independientes para cada nivel y conserva los borradores al cambiar de seleccion. Jornada institucional mantiene una sola semana para todos.
- Horarios, validaciones del servidor, capturas generales y reportes respetan los dias del nivel. Dias sin clases se distinguen de faltas; registros historicos existentes siguen visibles en las fechas consultadas.
- No se permite quitar un dia que tiene clases asignadas en ese nivel. Las preferencias de Escuela prevalecen sobre cambios enviados desde el editor de horarios.
- Validacion: 151 pruebas aprobadas, HTML completo y JavaScript validos, motor publico y copia backend identicos, build correcto.
- Pendiente desplegar Functions y Hosting; no modifica reglas de Firestore.

## 05/10/2026 - Despliegue de dias laborables por nivel

- Publicados Functions y Hosting a las 21:25 de Ciudad de Mexico, version 762b8c3faa6c0033.
- 45 funciones actualizadas; 30 archivos HTTPS verificados y cinco funciones protegidas rechazan solicitudes sin autenticacion.
- Disponible Dias laborables despues de los niveles, con semanas independientes por nivel y configuracion comun para jornada institucional.

## 05/10/2026 - Entrada general y asistencia por modulo

- Restaurada Hora de entrada al plantel en Gestion > Escuela, con valor institucional o independiente por nivel segun la jornada. Se recuperan las horas anteriores guardadas en las jornadas y se conservan los borradores al alternar niveles.
- levelEntryTimes guarda las entradas por nivel; entryTime conserva la institucional. Cambiar la entrada general no modifica las clases asignadas.
- El pase por grupo usa la clase administrativa vigente del docente, su inicio y su duracion real, con la tolerancia del nivel. Rechaza capturas fuera del modulo y conserva classDurationApplied en el registro.
- Validacion: 156 pruebas aprobadas, HTML balanceado con IDs unicos, JavaScript y build correctos. Incluye limites exactos de tolerancia y cambio entre modulos de diferente duracion.
- Pendiente publicar Functions y Hosting; comprobacion visual pendiente por fallo de inicio del navegador del entorno.

## 05/10/2026 - Entrada y modulos publicados

- Publicados Functions y Hosting a las 21:57 de Ciudad de Mexico, version 25b638e241037931. Las 45 funciones se actualizaron correctamente.
- Verificados 30 archivos publicos por HTTPS: contenido exacto, cache y cabeceras de seguridad. Las tres funciones protegidas de la verificacion rechazan solicitudes sin autenticacion.
- Disponible la hora de entrada institucional o por nivel en Escuela; asistencia por grupo respeta inicio, tolerancia y duracion de la clase asignada. Validacion previa: 156 pruebas aprobadas.

## 24/10/2026 - Recuperacion de sesion y errores de carga

- Los errores al preparar la interfaz ya no cierran una sesion autenticada; se muestra el motivo del fallo.
- Al perder la sesion se ocultan los datos privados y se restaura la portada de acceso. Se descartan comprobaciones de autenticacion atrasadas.
- Pruebas de regresion para errores de interfaz, token invalido, cierre de sesion y respuestas atrasadas. Requiere publicar Hosting; pendiente comprobar el acceso con una cuenta real.

## 24/10/2026 - Recuperacion de acceso publicada

- Hosting publicado a las 21:35 (Ciudad de Mexico), version 521f0c2e5d21e54f.
- Verificacion HTTPS aprobada: 30 archivos exactos, cache y cabeceras correctas; tres funciones protegidas rechazan solicitudes sin autenticacion.
- Validacion previa: 160 pruebas aprobadas. Pendiente comprobar el acceso con una cuenta real en la computadora afectada.

## 24/10/2026 - Sincronizacion con GitHub Pages

- GitHub Pages publica la raiz de main en https://cumorahnet.github.io/controldeasistencias/. El remoto estaba en 13558b1 y no incluia los cambios locales publicados en Firebase.
- Se sincroniza el codigo, dependencias publicas y pruebas de recuperacion de acceso. No se incluyen archivos locales de herramientas ni registros de despliegue.

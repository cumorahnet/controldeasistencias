# CHANGELOG

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

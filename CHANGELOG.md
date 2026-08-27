# CHANGELOG

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

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

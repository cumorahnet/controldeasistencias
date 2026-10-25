## 30/09/2026 - Periodos institucionales por fechas (sustituye vigencia en dias)

- attendancePeriods guarda hasta 40 rangos start/end inclusivos, ordenados y sin cruces. Cada rango admite hasta 366 dias de diferencia, como los reportes. El administrador configura las fechas; no dependen del primer retardo de cada alumno.
- El contador se separa por las fechas del periodo y vuelve a cero al cambiar de periodo; completar el limite reinicia solo los retardos pendientes dentro del mismo periodo. Fuera de un periodo se registra el retardo sin convertirlo en falta.
- attendancePeriodApplied conserva el periodo aplicado a cada captura para recalculos historicos. La configuracion se aplica a nuevas capturas; editar periodos no reescribe asistencias previas. Los registros antiguos sin este campo conservan la regla historica.
- Las faltas y retardos se consultan por periodo con el selector de Reportes, conservando el historial. Las fechas futuras se excluyen del reporte. No se borran faltas historicas al cerrar un periodo.

## 30/09/2026 - Vigencia del conteo de retardos

- tardyPeriodDays configura de 1 a 366 dias naturales desde el primer retardo pendiente de cada alumno. El limite y el vencimiento reinician el conteo; el siguiente retardo abre otro periodo.
- El servidor comprueba el vencimiento antes de cada captura, sin tarea programada ni borrado de asistencias. Al adoptar una vigencia o cambiar su duracion, comienza un conteo nuevo.
- Cada captura conserva tardyPeriodDaysApplied; las correcciones reproducen la regla historica y los cambios de grupo conservan el inicio del periodo. Registros antiguos mantienen su regla sin vencimiento. Clientes anteriores que omiten el campo conservan su valor institucional.

## 29/09/2026 - Seguridad de publicacion y dependencias

- El build publica solo scripts enumerados, conserva las URLs originales y elimina residuos de dist. Su hash incluye sw.js.
- La cache PWA se limita al app shell y no intercepta endpoints privados ni peticiones autenticadas.
- Firebase Admin 14.5.0 / Functions 7.4.0 mantienen Node 22. uuid 11.1.1 se fija mediante override global compatible con npm 10; gaxios 6.7.1 es su consumidor y usa v4(). Validado mediante npm ci.
- SheetJS 0.20.3 se distribuye localmente con licencia.
- Se conserva el cambio local previo de instalacion PWA manual, sin reintroducir avisos automaticos.

## 36.68 - Publicacion y App Check

- node scripts/build-hosting.cjs genera dist y se ejecuta en predeploy de Hosting. No editar dist. Se conservan archivos originales con revalidacion para clientes anteriores. Los nombres por hash se calculan despues de resolver dependencias; la PWA precarga los mismos archivos y su cache cambia con el contenido.
- App Check se inicializa antes de Auth/Firestore/Functions cuando app-check-config.js contiene la clave publica Enterprise. ENFORCE_APP_CHECK=true exige tokens en las onCall v2 mediante setGlobalOptions; mantener false hasta verificar metricas. No reemplaza autenticacion, roles ni plantel.

## 15/09/2026 - Version visible de la portada

- app-startup.js sincroniza el boton de acceso con la version del titulo al cargar el DOM, sin depender del arranque de Firebase. El titulo debe mantenerse alineado con version.json; este JSON no se publica en Hosting.

## 15/09/2026 - Retencion del historial administrativo

- Solo audit_logs conserva una ventana de 14 dias. La consulta excluye vencidos inmediatamente; cleanupAuditLogs los elimina por lotes cada hora, incluidos registros anteriores al cambio. El borrado fisico puede tardar hasta la siguiente ejecucion exitosa.
- Agrupacion por schoolKey; escuelas eliminadas conservan su CCT y SISTEMA tiene seccion propia. Paginacion por fecha e ID evita perder eventos simultaneos o limitar el historial a 250 registros globales.

## 14/09/2026 - Flujo vigente de horarios y pruebas

- El flujo actual sustituye las iniciales manuales por nombres en mayúsculas y sugerencias por prefijo. Las pruebas usan ese comportamiento y la API completa del motor compartido.
- Los grupos heredan la jornada aplicada al nivel o institución; cambiar grupo conserva los parámetros aún sin aplicar. Generar exige jornada aplicada y catálogo de materias.
- No se quita del catálogo una materia usada en clases. No se desactiva un día con clases ni con celdas pendientes, porque estas deben seguir accesibles para completar o vaciar antes de guardar.

## 14/09/2026 - Corrección de faltas y retardos

- correctAttendance permite a admin_jr, admin_maestro, director y super corregir una celda del reporte; docentes y portería no pueden invocarla. La falta normal se guarda explícitamente y no suma asistencia.
- La corrección conserva la identidad del registro, exige motivo, valida versión y guarda auditoría en la misma transacción. No crea duplicados para IDs anteriores.
- Se recalcula el historial compartido del alumno por fecha, hora e ID con tardyLimitApplied de cada captura. La captura omitida usa el límite institucional vigente. El recálculo puede cambiar faltas automáticas posteriores.
- Límite de seguridad: 5000 registros por alumno y 400 registros recalculados por operación; excederlo rechaza toda la corrección.

# Decisiones del proyecto

## 12/09/2026 - Jornadas compartidas entre niveles

- timetable.levelJourneys guarda los parametros por nivel y prevalece sobre journey institucional anterior. Aplicar modifica solo los niveles seleccionados; los dias laborables siguen siendo institucionales.
- Los grupos nuevos heredan su nivel. Clientes anteriores conservan levelJourneys; no se desactivan niveles con jornada guardada.


## 12/09/2026 — Materias con iniciales y selección única de grupo

- timetable.subjects guarda nombre e iniciales por plantel. Las celdas resuelven iniciales sin distinguir mayúsculas ni acentos; subjectSchedules conserva el nombre completo y la asignación docente posterior. No se distribuyen materias automáticamente.
- Nombres e iniciales no pueden colisionar con otra materia. Quitar del catálogo elimina solo el atajo, conservando las clases existentes. Clientes anteriores que omiten subjects conservan el catálogo vigente.
- El campo Grupo sustituye Grupo configurado; cargar otro grupo recupera su jornada y protege cambios aún sin generar. Nivel se oculta únicamente cuando hay un solo nivel habilitado.

## 12/09/2026 — Captura única de horarios

- La jornada se captura únicamente en Configurar horarios por grupo. Los ajustes generales conservan la tolerancia.
- Al guardar otros ajustes se mantienen los parámetros históricos usados por la entrada general; no se deduce una hora institucional única de jornadas diferentes.

## 12/09/2026 — Niveles y horarios en ajustes institucionales

- `levels` almacena los niveles ofrecidos (PRE, PRI, SEC, BAC), con selección no vacía y sin duplicados. Los planteles anteriores sin ese campo mantienen todos hasta configurar sus niveles.
- Los selectores de alta de alumnos, carga masiva, cambio de grupo y horarios usan los niveles del plantel. El acceso a horarios queda únicamente en Escuela > Ajustes Institucionales.
- El guardado institucional rechaza desactivar niveles con alumnos activos, materias o jornadas; no elimina registros. El servidor rechaza horarios de niveles deshabilitados y conserva `levels` cuando un cliente anterior no lo envía.

## 12/09/2026 — Materias antes de asignar docentes

- La jornada ofrece modo continuo (`breakMinutes: 0`) o traslado/descanso de 1 a 120 minutos. Se conserva el modelo anterior y se deduce el selector de los minutos guardados.
- La cuadrícula captura solo materias. `subjectSchedules` admite `teacherId` vacío; esas clases reservan el grupo pero no habilitan pase de lista ni generan cruces entre docentes sin asignar.
- El paso 4 asigna un docente por materia y grupo a sus módulos semanales. Las asignaciones anteriores distintas se conservan hasta elegir explícitamente un docente. Cambiar la materia de una celda elimina su asignación anterior para revisarla.
- Se mantienen validación de docentes activos, cruces, revisiones e identidad de clases en el guardado protegido.

## 12/09/2026 — Jornada y cuadrícula semanal por grupo

- `timetable` guarda días laborables del plantel y jornadas por nivel/grupo: entrada, salida, módulos diarios, descanso entre módulos y receso opcional con inicio y fin. Comparte transacción y revisión con `subjectSchedules`.
- Se distribuyen minutos completos entre módulos. El receso sustituye al descanso en ese punto y nunca divide una clase; se elige la distribución de módulos anterior/posterior con duraciones más similares. Se conserva el límite de 240 minutos por clase.
- La cuadrícula convierte celdas con materia/docente en las clases administrativas existentes; los módulos libres y descansos no habilitan asistencias. No cambia el modelo de asistencia ni la identidad de clases sin cambios.
- Los grupos anteriores permanecen editables hasta convertirlos explícitamente. Regenerar conserva materias y pide revisar una reubicación; reducir módulos por debajo del número de clases se rechaza. No se desactivan días con clases asignadas.
- El motor público `school-timetable.js` y su copia en `functions/` deben ser idénticos (prueba automatizada), porque Hosting excluye el directorio de funciones y Firebase despliega el backend por separado.

## 05/09/2026 — Tabla administrativa por materia (sustituye la configuración docente)

- Cada plantel mantiene `subjectSchedules` en su documento institucional: materia, docente, nivel, grupo, día, inicio y fin. Administrador junior, administrador maestro, director y superusuario pueden gestionarla mediante una función protegida.
- El docente no captura ni modifica horarios. El navegador elige su clase vigente automáticamente y el servidor valida la misma clase usando la hora de Ciudad de México. Los horarios docentes antiguos se conservan como datos históricos, pero no habilitan pases de lista.
- Cada clase dura de 1 a 240 minutos dentro del mismo día. Se rechazan cruces para el mismo docente o grupo. La tolerancia continúa siendo institucional; la duración se obtiene del inicio y fin de la fila administrativa.
- Las asistencias se identifican por fecha, alumno y clase; portería conserva su registro diario general. Reportes, justificaciones y renumeración de alumnos respetan el identificador de clase.
- Una revisión de la tabla evita sobrescrituras entre administradores. Los identificadores se conservan al guardar filas sin cambios. Modificar una clase crea una nueva identidad y conserva los registros anteriores.

## 05/09/2026 — Horarios docentes (decisión anterior, sustituida)

- El docente solo controla grupo, materia y hora del pase de lista. La tolerancia, duración del módulo y regreso del receso se heredan de la configuración del plantel administrada por el administrador.
- Los valores docentes antiguos no prevalecen sobre esos parámetros. El servidor ignora nuevos valores enviados por docentes y consulta la configuración vigente al registrar asistencia.

<!-- cdc-session:session-20260824163402-410a01 -->
## 24/08/2026, 10:58 p.m. — session-20260824163402-410a01

- se eliminó el registro por cuenta de google

## 05/10/2026 - Modo del editor de jornadas

- El tipo de jornada es editable dentro de Configurar horarios. La configuracion guardada en timetable (levelJourneys o journey) prevalece sobre la preferencia inicial institucional al reabrir.
- Seleccionar un nivel aun sin jornada marca solo ese nivel, conservando los parametros para configurarlo sin afectar los demas.

## 05/10/2026 - Tolerancia y acumulacion por nivel

- timetablePreferences.journeyMode determina el alcance de las reglas de asistencia. Los campos tolerance, tardiesPerAbsence y attendancePeriods conservan la regla institucional; levelAttendancePolicies guarda esos tres campos por PRE, PRI, SEC o BAC.
- En modo por niveles, los ajustes nuevos requieren una regla para cada nivel habilitado. Los planteles anteriores sin reglas por nivel conservan la regla global. Clientes anteriores que omiten levelAttendancePolicies no borran las reglas guardadas.
- El formulario conserva los borradores institucionales y por nivel al alternar. La regla aplica a capturas nuevas y a correcciones de omisiones; las capturas existentes mantienen limite, periodo y attendancePolicyScopeApplied historicos.
- El contador pendiente incluye el alcance en su clave de periodo, evitando trasladar acumulaciones entre niveles. Las fechas inclusivas y los reinicios por periodo y limite conservan su comportamiento.
- Porteria hereda la entrada de timetable.levelJourneys o timetable.journey cuando existe; si no, conserva la resolucion anterior. Las clases docentes mantienen sus horas administrativas.

## 05/10/2026 - Dias laborables independientes (sustituye dias comunes por plantel)

- timetablePreferences.workDays conserva la semana institucional; levelWorkDays guarda listas de dias por nivel. journeyMode selecciona el alcance. Cada nivel habilitado requiere al menos un dia al usar la configuracion nueva por niveles.
- Los borradores comparten el selector de nivel con tolerancia y retardos, pero los dias se guardan en preferencias de jornada, separados de las reglas de acumulacion.
- El motor timetable admite levelWorkDays y valida clases frente a los dias de su propio nivel. La copia publica y la de functions permanecen identicas.
- Escuela es la fuente de dias; el editor de horarios muestra los del grupo seleccionado. El servidor conserva preferencias por nivel omitidas por clientes anteriores y rechaza clases en dias no laborables.
- Cambiar los dias no elimina clases ni asistencias: se rechaza desactivar dias con materias asignadas. En reportes combinados, una celda sin captura en dia no laborable se muestra sin falta; exportacion usa DIA NO LABORABLE. Las capturas existentes se conservan.

## 05/10/2026 - Separar entrada general y clase docente

- La entrada general se configura en Escuela mediante entryTime institucional y levelEntryTimes por nivel. Sustituye la dependencia exclusiva de las jornadas del editor de horarios para el acceso al plantel; datos antiguos siguen resolviendo sus horas desde timetable.
- La entrada general no desplaza subjectSchedules. Para asistencia por grupo prevalece la clase asignada vigente: inicio, fin y duracion calculada, junto con la tolerancia institucional o del nivel correspondiente.
- El navegador y servidor usan la clase activa; el servidor rechaza capturas fuera de su ventana y registra entryTimeApplied, toleranceApplied y classDurationApplied para conservar los parametros de la captura.
- Clientes que omiten levelEntryTimes conservan los datos existentes. La configuracion nueva por niveles exige una hora valida para cada nivel ofrecido.

## 24/10/2026 - Separar autenticacion y preparacion de interfaz

- Un error en enterApp no invalida las credenciales. La perdida o rechazo de sesion debe ocultar la interfaz privada y restaurar el acceso. Cada callback de Auth descarta resultados de callbacks anteriores.

# Puesta en marcha segura

La aplicación ya no valida claves ni roles en el navegador. Antes de publicar esta versión se deben desplegar las Cloud Functions y las reglas de Firestore incluidas en el proyecto.

## 1. Respaldo

Realiza un respaldo de Firestore antes del primer despliegue. La primera autenticación válida de cada escuela migra automáticamente `accessKey` desde el documento público hacia `private/security/school_secrets`, donde se guarda con `scrypt` y se elimina el valor público.

## 2. Preparar Firebase

1. Instala Firebase CLI y autentícate con una cuenta autorizada.
2. Habilita el proveedor **Correo/contraseña** en Firebase Authentication.
3. Crea en Authentication la cuenta que administrará el directorio maestro.
4. En `functions/`, ejecuta `npm install`.

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

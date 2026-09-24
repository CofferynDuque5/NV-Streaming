# NV Streaming: auditoría de la versión anterior (ZIP)

**Fecha:** 23 de septiembre de 2026
**Material auditado:** `nv-streaming.zip` (278 archivos, unas 33.500 líneas de código, 9,6 MB)
**Método:** revisé todo el código, instalé y compilé el backend, ejecuté sus 20 pruebas, lo arranqué contra una base PostgreSQL 16 real y abrí las 14 pantallas en un navegador, en escritorio (1440 px) y en móvil (390 px).
**Anexos:** el detalle con `archivo:línea` de cada hallazgo está en `anexos/A-backend.md` y `anexos/B-frontend-firebase.md`, y las capturas en `capturas/` (no se guardan en el repositorio porque muestran marcas de terceros; están en los archivos del proyecto).

---

## 1. Veredicto

**No recomiendo reutilizar esta versión como base.** Se puede compilar y arrancar, pero tiene tres problemas de fondo.

1. **El modelo de negocio es incompatible con vender servicios autorizados.** El sistema guarda las contraseñas de cuentas de Netflix, Disney+, Spotify, ChatGPT y otros servicios, reparte perfiles de esas cuentas entre clientes y les reenvía los códigos de verificación que llegan a la "cuenta madre". Esto contradice lo que pides para el nuevo producto, así que esa parte hay que eliminarla, no arreglarla.
2. **Hay fallos graves de dinero.** Se puede renovar gratis escribiendo "renovar" en el chat, quedarse con el pago de otra persona o pagar el plan barato para renovar el caro. Además, el checkout dice "¡Pago registrado!" aunque no se haya creado ningún pedido.
3. **La arquitectura está a medio migrar.** Conviven Firebase y PostgreSQL sin sincronizarse, la documentación describe la arquitectura antigua y el frontend es una exportación de plantillas con capas de parches encima.

Sí hay piezas pequeñas que merece la pena conservar (sección 9), sobre todo en la infraestructura del backend y en los tokens de diseño.

---

## 2. Qué contiene el ZIP

| Pieza                                                                                | Carpeta                                                                                        | Tecnología                                                                                                                              | Estado real                                                                          |
| ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Web (tienda, carrito, pagos, billetera, mi cuenta, admin, revendedor, editor visual) | `site/`                                                                                        | HTML y JavaScript sin framework ni bundler, con un runtime casero (`nv-runtime.js`) que ejecuta plantillas con `new Function`           | Funciona contra el backend por REST; Firebase ya no se usa aunque sigue en el código |
| Backend y agente de IA                                                               | `whatsapp-agent/`                                                                              | Node 20, TypeScript, Express 4, PostgreSQL (`pg` con SQL escrito a mano), JWT, OpenAI, WhatsApp Cloud API, node-cron, nodemailer, ImgBB | Compila y arranca; es la única pieza que hace trabajo real                           |
| Cloud Functions                                                                      | `functions/`                                                                                   | Node 20 y Firebase Functions sobre Firestore                                                                                            | Huérfanas: escriben en Firestore, que ya nadie lee                                   |
| Reglas e índices de Firebase                                                         | raíz y `site/`                                                                                 | Firestore y Storage                                                                                                                     | Restos de la arquitectura anterior, con reglas demasiado abiertas                    |
| Despliegue                                                                           | `docker-compose.yml`, `render.yaml`, `deploy/nginx.conf`, `setup.sh`, `start.js`, `arrancar.*` | Docker, nginx, Render                                                                                                                   | Inseguros por defecto (ver sección 5)                                                |
| Documentación                                                                        | `docs/` (16 archivos)                                                                          | Markdown                                                                                                                                | Se contradice y describe una arquitectura que ya no existe                           |

**Relación con el repositorio de GitHub:** el ZIP es un poco más nuevo que la rama `main` de `CofferynDuque5/NV-Streaming`. Difiere en 36 archivos y trae además `media-library.js`, `estreno-notifier.ts`, `media.repo.ts`, `arrancar.bat` y `detener.bat`. Los hallazgos de este informe se aplican a los dos.

---

## 3. Qué probé y qué pasó

| Prueba                                               | Resultado                                                                                                                                                                                                                                                                                     |
| ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm ci` del backend                                 | Instala. `npm audit` marca **6 vulnerabilidades (1 alta, en nodemailer; 5 moderadas, en express/qs/body-parser y node-cron/uuid)**                                                                                                                                                            |
| Comprobación de tipos (`tsc --noEmit`) y compilación | Sin errores                                                                                                                                                                                                                                                                                   |
| Las 20 pruebas del backend                           | **12 fallan sin variables de entorno** y 1 más sin la base migrada. Con variables de prueba y la base migrada, pasan las 20. Pero `npm test` solo ejecuta 11 de las 20, 7 pruebas copian el SQL en lugar de probar el código real, y una prueba da por correcto el fallo de renovación gratis |
| Migración (`npm run migrate`) dos veces seguidas     | Funciona y es idempotente, pero no tiene versiones ni forma de deshacer cambios                                                                                                                                                                                                               |
| Carga de datos de ejemplo (`npm run seed`)           | Crea 71 documentos de CMS y 23 planes: Netflix, Disney+, ChatGPT, etc., a 2–5 USD                                                                                                                                                                                                             |
| Arranque del servidor y consultas HTTP               | `/health`, `/api/servicios`, `/api/config` y `/api/cms/*` responden. **`Access-Control-Allow-Origin: *`** en todas las respuestas                                                                                                                                                             |
| `node --check` de todo el JavaScript del frontend    | 0 errores de sintaxis y 0 imports rotos                                                                                                                                                                                                                                                       |
| 14 pantallas en navegador, escritorio                | Cargan. En escritorio el diseño se ve correcto (`capturas/desk-index.png`)                                                                                                                                                                                                                    |
| 14 pantallas en navegador, móvil (390 px)            | **10 de 14 se desbordan en horizontal**: el inicio mide 987 px de ancho, los pagos 849 y el carrito 810. El texto y los botones quedan cortados (`capturas/mob-*.png`)                                                                                                                        |
| Inicialización de Firebase en el navegador           | **Rota siempre**: llama a `getPostgreSQL()`, una función que no existe. Es el resultado de un "buscar y reemplazar" de Firestore por PostgreSQL hecho sobre todo el código (`site/js/firebase-config.js:47`)                                                                                  |

---

## 4. Hallazgos críticos

Los comprobé en el código, no solo en la revisión automática.

| #   | Hallazgo                                                                                                                                                                                                                                                                                                                                                                                        | Consecuencia                                                                                                                | Evidencia                                                                                                                  |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| C1  | **Reventa de cuentas de terceros.** Tabla `cuentas_streaming` con correo, contraseña, PIN y perfil de Netflix, Disney+, Max, Spotify, ChatGPT... La IA entrega esas credenciales al cliente y el sistema reenvía los códigos OTP de la "cuenta madre". Los precios están muy por debajo de los oficiales (Netflix 5 USD). Hay 50 imágenes con logos de esas marcas en formato de tarjeta regalo | Riesgo legal y de marca. Incompatible con vender "servicios autorizados". La contraseña descifrada además se envía a OpenAI | `schema.sql:39-50`, `agent/tools.ts:171-187`, `otp.service.ts`, `seed.ts:31-55`, `site/js/seed.js:403-428`, `site/assets/` |
| C2  | **Renovación gratis ilimitada.** Escribir "renovar netflix" en el chat web extiende 30 días, marca la suscripción como pagada y responde "el cobro se descuenta según tu método", pero no cobra nada                                                                                                                                                                                            | Pérdida directa de ingresos                                                                                                 | `chat/message-handler.ts:241-252`                                                                                          |
| C3  | **Robo de pagos.** `POST /pagos` es público y la referencia la elige el cliente. Cuando llega la confirmación de la pasarela, se acredita al pago pendiente más reciente con esa referencia                                                                                                                                                                                                     | Quien adivine la referencia de otro cliente se queda con su pago                                                            | `payments.routes.ts:15`, `payments.repo.ts:62-69`                                                                          |
| C4  | **Pagar barato, renovar caro.** No se comprueba que la suscripción pertenezca al cliente ni que coincida con el plan pagado                                                                                                                                                                                                                                                                     | Se paga el plan de 2 USD y se renueva Netflix                                                                               | `payments.service.ts:68-81`                                                                                                |
| C5  | **Renovación automática sin cobro ni autorización.** Si está activada, el cron extiende el servicio sin cobrar. El propio código dice "⚠️ En producción: cobrar ANTES de renovar"                                                                                                                                                                                                               | Viola el requisito de cobrar solo con autorización previa                                                                   | `renewals.service.ts:65-69`                                                                                                |
| C6  | **Pago falso en el checkout.** Ante cualquier error (visitante sin sesión, combo, comprobante de más de 1 MB, backend caído), la web inventa un pedido `sim_…` y muestra "¡Pago registrado!"                                                                                                                                                                                                    | El cliente cree que pagó y no existe ningún pedido                                                                          | `site/js/services/commerce.service.js:158-171`                                                                             |
| C7  | **El despliegue documentado deja la web en modo demostración.** Si se publica la web como dice la documentación (Firebase Hosting o `public_html`), no hay proxy de `/api`. La web muestra el catálogo de ejemplo, simula pagos y **abre los paneles de admin, revendedor y editor** porque el control de acceso se decide en el navegador cuando el backend no responde                        | Paneles internos visibles para cualquiera                                                                                   | `firebase.json`, `site/js/bootstrap.js:160`                                                                                |

---

## 5. Hallazgos altos (resumen)

**Seguridad**

- **XSS almacenado en el panel de admin:** el comprobante que envía el cliente se inserta sin escapar en un enlace (`admin-app.js:111`). Como la sesión del admin se guarda en `localStorage` y no hay CSP, un cliente puede robar la sesión del administrador.
- **Sin verificación de correo ni recuperación de contraseña.** El script `crear-admin` puede convertir en administrador una cuenta que registró un atacante con ese correo. El cierre de sesión no hace nada y el token dura 7 días sin poder revocarse.
- **Reglas de Firestore abiertas:** cualquier usuario con sesión puede leer todas las suscripciones y chats y crear pedidos con cualquier precio o estado. Sigue siendo relevante porque el proyecto Firebase real `nv-streaming` está publicado en el código.
- **Webhooks de OTP** que permiten enviar mensajes de WhatsApp a cualquier número y devuelven el código en la respuesta. Las Cloud Functions los aceptan sin secreto si este no está configurado.
- **Entorno de desarrollo inseguro por defecto:** admin `admin@nv.com / Admin12345`, secreto JWT fijo, firma de WhatsApp `dev`, CORS abierto y puerto 3000 expuesto (`docker-compose.yml`).

**Negocio y pedidos**

- Un pedido pagado con billetera queda "aprobado" aunque no se entregue nada.
- Los pedidos no tienen máquina de estados: se puede aprobar uno rechazado y dos aprobaciones simultáneas lo entregan dos veces.
- **Fraude de comisiones:** cualquier usuario es revendedor, el 25 % está disponible al instante y las comisiones nunca se anulan.
- El cupón, la cantidad y los combos se calculan solo en el navegador; el servidor los ignora y cobra otra cifra.
- Las acciones del admin muestran "Pedido aprobado ✓" aunque la API haya fallado.

**Base de datos**

- Migraciones sin versiones: un único `schema.sql` que se ejecuta en cada arranque del contenedor.
- **Borrar un usuario borra en cascada sus pagos, recargas, movimientos y comisiones**, o sea, la contabilidad.

---

## 6. Base de datos

- **Bien:** todas las consultas están parametrizadas y no encontré inyección SQL. El dinero usa `NUMERIC`, con `CHECK (saldo >= 0)`. La billetera y los retiros usan transacciones con `SELECT … FOR UPDATE`. El cifrado de credenciales es AES-256-GCM con IV aleatorio.
- **Mal:**
  - Dos fuentes de verdad para los precios (tabla `planes` y documentos JSON del CMS) y para las suscripciones.
  - Plataformas guardadas en JSON sin clave foránea.
  - Enumerados mezclados: tipos ENUM, `CHECK` y texto libre.
  - No hay tabla de auditoría: el admin cambia saldos sin dejar asiento contable.
  - Cálculos de dinero en JavaScript en lugar de SQL.
  - La billetera no tiene moneda.
  - La referencia de pago no es única.
  - La cola de espera no la procesa nadie.
  - Al vencer una suscripción, la cuenta nunca se libera.
- **Firestore y PostgreSQL no se sincronizan.** Las Cloud Functions escriben en Firestore y la web y el backend leen de PostgreSQL.

---

## 7. Código duplicado, muerto e incompleto

- **Triplicado:** el analizador de OTP (backend, Functions y web), que además ya diverge entre copias.
- **Duplicados:**
  - 7 copias de la función de escapado HTML, 2 de ellas incompletas.
  - 8 copias del helper `wrap` en los routers.
  - 2 middlewares de administrador: un token fijo compartido y el rol del JWT.
  - 2 sistemas de moneda, con la tasa 36,5 escrita a mano en 4 sitios.
  - 2 modelos de compra: `pagos` y `pedidos` con recargas.
- **Parches encadenados en la web:**
  - `ux-fixes.js` (703 líneas) reescribe el HTML ya pintado con expresiones regulares: sustituye "Hola Juan" o "$125" y convierte precios buscando `$` en el texto.
  - `nv-fixes.css` apila 46 `!important`.
  - `admin.html` (1.834 líneas) mezcla datos inventados ("María González", "$48.2K") con herramientas reales, sin forma de distinguirlos.
- **Código muerto:** `firebase-config.js`, `seeder.js`, `otp-parser.js` de la web, `inspector.service.js`, `pdf.generator.js`, `inspector.css` (cargado en 13 páginas sin usarse), `probe3.mjs` (script de depuración que revela rutas internas) y varias funciones del backend sin llamadas.
- **Incompleto:**
  - El webhook de WhatsApp solo procesa texto, aunque las instrucciones de pago piden "enviar foto del comprobante".
  - No se pueden crear órdenes de Binance Pay.
  - Pago Móvil automático rechaza siempre los pagos en bolívares si el plan está en dólares.
  - Los recordatorios se envían unas 12 veces por cliente y con texto libre, que WhatsApp no permite fuera de la ventana de 24 h.
- **Rendimiento:** cada pestaña abierta consulta unas 22 colecciones cada 15 segundos.

---

## 8. Documentación, marca y experiencia

- **Documentación poco fiable.**
  - README, FIREBASE, SECURITY e INSTALLATION dicen que la web usa Firestore; MIGRATION-POSTGRES dice lo contrario.
  - Afirma "0 código muerto" y "cero datos falsos", y las dos cosas son falsas.
  - Cita archivos que no existen: `credenciales.html`, `whatsapp-fab.js`, `credentials.service.js` y pruebas `test.mjs`.
  - `.env.example` trae valores intercambiados: `IMGBB_API_KEY=gpt-4o-mini`, y `OPENAI_MODEL` vacío deja la IA sin modelo.
- **Interfaz:** está en español, pero sin `lang="es"`. Estética neón genérica, contadores falsos ("8k vendidos") y sonidos en cada clic. No transmite la imagen de SaaS profesional que buscas.
- **Responsive:** roto en móvil (sección 3). Solo hay 13 reglas `@media` para 14 páginas y más de 2.600 estilos escritos dentro del HTML.

---

## 9. Qué conservar, qué reconstruir y qué eliminar

| Veredicto                                          | Qué                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Conservar (con ajustes)**                        | Backend: el manejo de errores y la validación de `core/` (errores tipados, request-id, manejador central que no filtra datos), la conexión a la base con transacciones (`db/pool.ts`), el logger con redacción ampliada, el cifrado AES-256-GCM añadiendo rotación de clave, y los servicios de WhatsApp, correo, factura y medios, que están bien aislados y se pueden probar                |
| **Conservar como patrón, reescribiendo el código** | La billetera con libro mayor y bloqueos, y los adaptadores de pasarela de pago con verificación de firma (la conciliación hay que rehacerla)                                                                                                                                                                                                                                                  |
| **Conservar como material de marca**               | Los tokens de diseño (`nv-tokens.css`) y el logo NV en SVG, si confirmas que son tuyos. Como ideas de UX: el sistema de avisos accesible, los estados vacío/cargando/error, el cliente HTTP con timeout y el índice de búsqueda                                                                                                                                                               |
| **Reconstruir desde cero**                         | Autenticación (verificación de correo, recuperación, sesiones revocables, rol leído de la base), el esquema de base de datos con migraciones versionadas y auditoría, pedidos, suscripciones, cobros y renovaciones con autorización, recordatorios, revendedores, panel de administración, panel del cliente, el agente de IA con permisos y confirmación, todas las pantallas y las pruebas |
| **Eliminar**                                       | Todo el flujo de cuentas compartidas (cuentas madre, perfiles, credenciales, OTP y aprovisionamiento), el catálogo y los precios actuales, las 50 imágenes de marcas de terceros, los textos de "reventa", Firebase completo (Functions, reglas, configuración), los parches (`ux-fixes`, `nv-fixes`), el runtime de plantillas, los scripts de depuración y la documentación actual          |

**En números:** de unas 33.500 líneas, lo que se puede conservar tal cual o con ajustes pequeños son menos de 1.000 líneas del backend. El resto hay que reescribirlo o eliminarlo.

---

## 10. Decisiones que necesito de ti antes de la fase 2

1. **Qué vende NV Streaming exactamente.** El modelo anterior (cuentas compartidas) queda descartado. Las alternativas autorizadas son:
   - un servicio propio con contenido licenciado;
   - reventa como distribuidor oficial: códigos, tarjetas regalo o afiliación con acuerdo del proveedor;
   - ambas.

   Esto cambia el modelo de datos del catálogo y la forma de "entregar" el servicio.

2. **Pasarelas de pago.** El sistema anterior usaba Pago Móvil, Binance Pay y Zelle con comprobante manual. Para los cobros automáticos con autorización previa hace falta una pasarela que guarde el método de pago del cliente de forma oficial, y cuál conviene depende del país y la moneda donde operas.
3. **Titularidad del logo NV** y de los sonidos, para saber si los conservo.

---

## 11. Siguiente paso propuesto

Con tus respuestas, la fase 2 será un documento de **arquitectura, tecnologías y modelo de datos** para que lo apruebes antes de escribir código, seguido del plan por fases del MVP. Mi propuesta inicial es un único monorepo en TypeScript con:

- un framework web moderno con componentes y protección de rutas en el servidor;
- PostgreSQL con migraciones versionadas;
- adaptadores para pagos, WhatsApp y correo;
- auditoría en cada operación sensible.

La detallaré en ese documento.

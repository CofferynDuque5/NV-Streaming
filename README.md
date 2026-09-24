# NV Streaming

Plataforma para vender **servicios de streaming autorizados**: panel de administración, panel de revendedor, panel del cliente, cobros por pasarelas oficiales, soporte y un asistente con IA con permisos estrictos. Todo en español.

> Esta versión reemplaza por completo a la anterior (ver [auditoría](docs/auditoria/INFORME-AUDITORIA.md)). La versión anterior sigue disponible en el historial de git.

## Estado

| Fase                            | Contenido                                                                                                                                                | Estado    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| 0. Cimientos                    | Monorepo, base de datos y migraciones, acceso completo con 2FA, roles y permisos, auditoría inalterable, sistema de diseño NV, CI con metas de velocidad | ✅        |
| 1. MVP operativo                | Clientes, planes y catálogo, suscripciones, cobros manuales con conciliación, soporte                                                                    | Pendiente |
| 2. Revendedores y editor visual | Saldo prepagado, precios mayoristas por nivel, editor de páginas por bloques                                                                             | Pendiente |
| 3–6                             | Automatizaciones, cobros automáticos autorizados, asistente IA, proveedores y producción                                                                 | Pendiente |

Detalle en la [propuesta de arquitectura](docs/arquitectura/PROPUESTA-ARQUITECTURA.md).

## Estructura

```
apps/
  api/        API REST (NestJS + Fastify). Documentación OpenAPI en /api/docs
  web/        Web (Next.js): sitio público, acceso y paneles por rol
packages/
  db/         Esquema de PostgreSQL (Prisma), migraciones y datos de demostración
  shared/     Roles, permisos, validaciones y tipos compartidos por la API y la web
docs/         Auditoría de la versión anterior y arquitectura
```

Todo el stack es gratuito y de código abierto: Node.js, PostgreSQL, NestJS, Next.js, Prisma, Tailwind, Playwright y Lighthouse CI.

## Puesta en marcha local

Requisitos: Node.js 22, pnpm 10 y Docker (o un PostgreSQL 16 propio).

```bash
pnpm install
cp .env.example .env
# Genera la clave de cifrado y pégala en CLAVE_CIFRADO:
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

docker compose up -d        # PostgreSQL (nv y nv_test) y Mailpit
pnpm build                  # compila paquetes, API y web
pnpm db:deploy              # aplica las migraciones
pnpm db:seed                # crea un usuario de demostración por rol
pnpm dev                    # API en :4000 y web en :3000
```

Abre http://localhost:3000. Los correos (verificación, recuperación, invitaciones) se muestran en la consola de la API y se guardan en la tabla `correos_salientes`. Si prefieres verlos como en un buzón, usa `CORREO_PROVEEDOR=smtp` con `SMTP_HOST=localhost` y `SMTP_PUERTO=1025` y abre Mailpit en http://localhost:8025.

### Usuarios de demostración

Contraseña de todos: `NvDemo-2026!`

| Correo             | Rol                | Al entrar                                                     |
| ------------------ | ------------------ | ------------------------------------------------------------- |
| admin@nv.test      | Administrador      | Configura la verificación en dos pasos y ve el panel completo |
| operador@nv.test   | Operador / soporte | 2FA; ve el equipo pero no lo gestiona                         |
| ventas@nv.test     | Ventas             | 2FA; panel de administración sin gestión de usuarios          |
| revendedor@nv.test | Revendedor         | 2FA; panel de revendedor                                      |
| cliente@nv.test    | Cliente            | Entra directo a “Mis servicios” (2FA opcional)                |

Para la verificación en dos pasos sirve cualquier aplicación TOTP gratuita (Google Authenticator, Microsoft Authenticator, Aegis, 2FAS…). Los datos de demostración nunca se cargan en producción.

## Pruebas

```bash
pnpm lint && pnpm typecheck
pnpm test                 # unitarias
pnpm test:integration     # API contra PostgreSQL real (usa DATABASE_URL_PRUEBAS y la vacía)
pnpm test:e2e             # navegador con cada rol (usa DATABASE_URL_E2E o DATABASE_URL_PRUEBAS)
pnpm --filter @nv/web lighthouse   # velocidad en móvil; requiere la web en :3100
```

Las pruebas nunca usan la base de desarrollo: se niegan a arrancar si `DATABASE_URL_PRUEBAS` es igual a `DATABASE_URL`, y el vaciado previo a las e2e solo actúa sobre bases que terminan en `_test` o `_e2e`. Para las e2e locales con un Chromium ya instalado: `NAVEGADOR_E2E=/ruta/al/chromium pnpm test:e2e`.

La CI (GitHub Actions) ejecuta todo lo anterior en cada PR y exige en móvil: rendimiento ≥ 90, accesibilidad ≥ 95, LCP ≤ 3 s, CLS ≤ 0,1 y TBT ≤ 300 ms.

## Seguridad (resumen)

- **Contraseñas** con Argon2id; mensajes que no revelan si un correo existe; límites de intentos guardados en PostgreSQL.
- **Sesiones** en base de datos con cookie `httpOnly` + `SameSite=Lax` (prefijo `__Host-` con HTTPS). Solo se guarda el hash del token; caducan por tiempo total e inactividad y se pueden cerrar a distancia.
- **Verificación en dos pasos** obligatoria para administración, operación, ventas y revendedores. Secreto cifrado con AES-256-GCM, códigos no reutilizables y 10 códigos de respaldo de un solo uso. La sesión cambia de token al completar el segundo factor.
- **Permisos** comprobados en la API en cada petición con el rol actual de la base de datos. Nadie puede cambiar su propio rol ni dejar el sistema sin administradores.
- **CSRF**: toda escritura exige la cabecera `Origin` de la web.
- **Auditoría** de cada acción sensible (quién, qué, antes/después, IP e id de petición). Un disparador de PostgreSQL impide modificarla o borrarla.
- La API **no arranca en producción** con valores de ejemplo (clave, base de datos, correo sandbox, HTTP).

## API

Con `DOCS_API_HABILITADA=true`, la documentación OpenAPI está en http://localhost:4000/api/docs. Los errores siempre tienen la forma `{ "error": { "codigo", "mensaje", "campos?" } }`, con `codigo` estable y `mensaje` en español.

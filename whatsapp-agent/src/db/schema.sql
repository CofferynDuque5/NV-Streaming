-- ════════════════════════════════════════════════════════════════════
--  NV Stream — Esquema del agente de WhatsApp (Paso 1)
--  Regla de negocio central: UN SOLO PERFIL PRIVADO por cliente.
--  Una cuenta_streaming solo puede tener UNA suscripción activa a la vez.
-- ════════════════════════════════════════════════════════════════════

CREATE EXTENSION IF NOT EXISTS "pgcrypto";  -- gen_random_uuid()

-- ── Enums de estado (valores controlados, nunca texto libre) ──
DO $$ BEGIN
  CREATE TYPE estado_cuenta AS ENUM ('disponible', 'asignada', 'caida', 'renovacion');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE estado_suscripcion AS ENUM ('activa', 'vencida', 'pausada', 'cancelada');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── usuarios (clientes, identificados por WhatsApp) ──
CREATE TABLE IF NOT EXISTS usuarios (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  id_whatsapp     VARCHAR(20) NOT NULL UNIQUE,           -- E.164 sin '+'
  nombre          VARCHAR(120),
  email           VARCHAR(160),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ── planes (catálogo de precios — la IA NUNCA inventa precios) ──
CREATE TABLE IF NOT EXISTS planes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plataforma_id   VARCHAR(60) NOT NULL,
  nombre          VARCHAR(120) NOT NULL,
  precio          NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  moneda          VARCHAR(3) NOT NULL DEFAULT 'USD',
  duracion_dias   INTEGER NOT NULL DEFAULT 30 CHECK (duracion_dias > 0),
  activo          BOOLEAN NOT NULL DEFAULT TRUE
);

-- ── cuentas_streaming (credenciales del proveedor · perfil único) ──
CREATE TABLE IF NOT EXISTS cuentas_streaming (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plataforma_id      VARCHAR(60) NOT NULL,
  correo             VARCHAR(160) NOT NULL,
  contrasena_cifrada TEXT NOT NULL,                       -- cifrada en reposo
  pin                VARCHAR(12),
  perfil             VARCHAR(60) NOT NULL DEFAULT 'Perfil', -- ÚNICO perfil privado
  estado             estado_cuenta NOT NULL DEFAULT 'disponible',
  creado_en          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plataforma_id, correo)
);

-- ── suscripciones (cliente ↔ cuenta · una activa por cuenta = perfil único) ──
CREATE TABLE IF NOT EXISTS suscripciones (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id            UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cuenta_streaming_id   UUID NOT NULL REFERENCES cuentas_streaming(id) ON DELETE RESTRICT,
  plataforma_id         VARCHAR(60) NOT NULL,
  plan_id               UUID NOT NULL REFERENCES planes(id),
  estado                estado_suscripcion NOT NULL DEFAULT 'activa',
  pagada                BOOLEAN NOT NULL DEFAULT FALSE,   -- pago del ciclo confirmado
  fecha_inicio          TIMESTAMPTZ NOT NULL DEFAULT now(),
  fecha_vencimiento     TIMESTAMPTZ NOT NULL,
  renovacion_automatica BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en             TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en        TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Compatibilidad: añade la columna `pagada` si la tabla ya existía sin ella.
ALTER TABLE suscripciones ADD COLUMN IF NOT EXISTS pagada BOOLEAN NOT NULL DEFAULT FALSE;

-- ── pagos (pasarela: comprobante → confirmación → renovación) ──
DO $$ BEGIN
  CREATE TYPE estado_pago AS ENUM ('pendiente', 'confirmado', 'rechazado');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS pagos (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id      UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  suscripcion_id  UUID REFERENCES suscripciones(id) ON DELETE SET NULL,
  plataforma_id   VARCHAR(60) NOT NULL,
  plan_id         UUID NOT NULL REFERENCES planes(id),
  metodo          VARCHAR(40) NOT NULL,          -- pago_movil | binance | zelle
  monto           NUMERIC(10,2) NOT NULL CHECK (monto >= 0),
  moneda          VARCHAR(3) NOT NULL DEFAULT 'USD',
  referencia      VARCHAR(120),
  comprobante_url TEXT,
  estado          estado_pago NOT NULL DEFAULT 'pendiente',
  motivo_rechazo  VARCHAR(200),
  confirmado_por  VARCHAR(120),
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now(),
  confirmado_en   TIMESTAMPTZ
);
-- Correlación con la pasarela de pago automática (PSP).
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS proveedor  VARCHAR(40);
ALTER TABLE pagos ADD COLUMN IF NOT EXISTS id_externo VARCHAR(160);

CREATE INDEX IF NOT EXISTS ix_pagos_pendientes ON pagos (creado_en) WHERE estado = 'pendiente';
CREATE INDEX IF NOT EXISTS ix_pagos_usuario    ON pagos (usuario_id);
CREATE INDEX IF NOT EXISTS ix_pagos_referencia ON pagos (referencia) WHERE estado = 'pendiente';
-- Anti-duplicado: una misma transacción del PSP no se procesa dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS ux_pagos_id_externo ON pagos (id_externo) WHERE id_externo IS NOT NULL;

-- ── cola_espera (pago confirmado pero sin stock: se atiende por orden) ──
CREATE TABLE IF NOT EXISTS cola_espera (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  plataforma_id VARCHAR(60) NOT NULL,
  plan_id       UUID NOT NULL REFERENCES planes(id),
  pago_id       UUID REFERENCES pagos(id) ON DELETE SET NULL,
  estado        VARCHAR(20) NOT NULL DEFAULT 'esperando',  -- esperando | atendido
  creado_en     TIMESTAMPTZ NOT NULL DEFAULT now(),
  atendido_en   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS ix_cola_espera ON cola_espera (plataforma_id, creado_en) WHERE estado = 'esperando';

-- ── alertas_admin (avisos operativos: stock agotado, etc.) ──
CREATE TABLE IF NOT EXISTS alertas_admin (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo       VARCHAR(40) NOT NULL,
  mensaje    TEXT NOT NULL,
  leida      BOOLEAN NOT NULL DEFAULT FALSE,
  creado_en  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 🔒 Perfil único: una cuenta_streaming solo puede tener UNA suscripción 'activa'.
CREATE UNIQUE INDEX IF NOT EXISTS ux_suscripcion_activa_por_cuenta
  ON suscripciones (cuenta_streaming_id)
  WHERE estado = 'activa';

-- Índices de acceso frecuente.
CREATE INDEX IF NOT EXISTS ix_suscripciones_usuario ON suscripciones (usuario_id);
CREATE INDEX IF NOT EXISTS ix_suscripciones_venc   ON suscripciones (fecha_vencimiento) WHERE estado = 'activa';
CREATE INDEX IF NOT EXISTS ix_cuentas_disponibles  ON cuentas_streaming (plataforma_id) WHERE estado = 'disponible';

-- Trigger: mantener actualizado_en al día.
CREATE OR REPLACE FUNCTION set_actualizado_en() RETURNS TRIGGER AS $$
BEGIN NEW.actualizado_en = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_usuarios_upd ON usuarios;
CREATE TRIGGER trg_usuarios_upd BEFORE UPDATE ON usuarios
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

DROP TRIGGER IF EXISTS trg_suscripciones_upd ON suscripciones;
CREATE TRIGGER trg_suscripciones_upd BEFORE UPDATE ON suscripciones
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

-- ═══════════════════════════════════════════════════════════════════════
-- Auth web (email + contraseña) sobre la MISMA tabla `usuarios`.
-- Un solo modelo de usuario: los clientes web tienen email+password_hash e
-- id_whatsapp NULL; los de WhatsApp tienen id_whatsapp. Idempotente.
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE usuarios ALTER COLUMN id_whatsapp DROP NOT NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS password_hash   VARCHAR(255);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS rol             VARCHAR(20)   NOT NULL DEFAULT 'cliente';
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS saldo_billetera NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (saldo_billetera >= 0);
-- Email único (sin distinguir mayúsculas) solo cuando hay email.
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_email ON usuarios (lower(email)) WHERE email IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
-- CMS / contenido de tienda (Fase 2a). Document store JSONB: las colecciones
-- semi-estructuradas que el frontend consumía de Firestore (catálogo, ofertas,
-- combos, carteleras, métodos de pago, FAQ, plataformas, config…) viven aquí
-- como documentos, con la MISMA forma { id, ...campos } que espera el front.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS cms_documentos (
  coleccion       VARCHAR(60)  NOT NULL,
  doc_id          VARCHAR(120) NOT NULL,
  data            JSONB        NOT NULL DEFAULT '{}'::jsonb,
  orden           INTEGER      NOT NULL DEFAULT 0,
  activo          BOOLEAN      NOT NULL DEFAULT true,
  creado_en       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (coleccion, doc_id)
);
CREATE INDEX IF NOT EXISTS ix_cms_coleccion ON cms_documentos (coleccion, orden, doc_id);

DROP TRIGGER IF EXISTS trg_cms_upd ON cms_documentos;
CREATE TRIGGER trg_cms_upd BEFORE UPDATE ON cms_documentos
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

-- ═══════════════════════════════════════════════════════════════════════
-- Transaccional (Fase 2b) — dinero y pedidos: tablas RELACIONALES.
-- El saldo del cliente vive en usuarios.saldo_billetera (Fase 1). Las recargas
-- se aprueban y el crédito + el asiento en el libro mayor ocurren en la MISMA
-- transacción (atómico), con bloqueo de fila del usuario.
-- ═══════════════════════════════════════════════════════════════════════

-- Pedidos (compras de servicios).
CREATE TABLE IF NOT EXISTS pedidos (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid_cliente    UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  nombre_cliente VARCHAR(160),
  email_cliente  VARCHAR(160),
  id_servicio    VARCHAR(80)  NOT NULL,
  precio         NUMERIC(10,2) NOT NULL CHECK (precio >= 0),
  metodo_pago    VARCHAR(40),
  estado         VARCHAR(20)  NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente','aprobado','rechazado','entregado')),
  comprobante    TEXT,
  notas          TEXT,
  creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_pedidos_cliente ON pedidos (uid_cliente, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_pedidos_estado  ON pedidos (estado, creado_en DESC);

-- Aprovisionamiento: al aprobarse un pedido web se asigna una cuenta de streaming
-- y se crea una suscripción activa. Estas columnas enlazan el pedido con esa
-- suscripción (y sirven de guarda de idempotencia para no aprovisionar dos veces).
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS suscripcion_id   UUID REFERENCES suscripciones(id) ON DELETE SET NULL;
ALTER TABLE pedidos ADD COLUMN IF NOT EXISTS provision_estado VARCHAR(20);  -- asignado | cola_espera | sin_plan | no_aplica

-- Recargas de billetera (solicitudes de saldo que el admin aprueba).
CREATE TABLE IF NOT EXISTS recargas_billetera (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid_usuario    UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  monto          NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  metodo_pago    VARCHAR(40),
  comprobante    TEXT,
  estado         VARCHAR(20) NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente','aprobado','rechazado')),
  aprobado_por   UUID,
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_recargas_usuario ON recargas_billetera (uid_usuario, creado_en DESC);
CREATE INDEX IF NOT EXISTS ix_recargas_estado  ON recargas_billetera (estado, creado_en DESC);

-- Libro mayor de la billetera (cada ingreso/egreso con el saldo resultante).
CREATE TABLE IF NOT EXISTS movimientos_billetera (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  uid_usuario     UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  tipo            VARCHAR(10) NOT NULL CHECK (tipo IN ('ingreso','egreso')),
  monto           NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  descripcion     TEXT,
  referencia      VARCHAR(120),
  saldo_posterior NUMERIC(12,2) NOT NULL,
  creado_en       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_movimientos_usuario ON movimientos_billetera (uid_usuario, creado_en DESC);

DROP TRIGGER IF EXISTS trg_pedidos_upd ON pedidos;
CREATE TRIGGER trg_pedidos_upd BEFORE UPDATE ON pedidos
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();
DROP TRIGGER IF EXISTS trg_recargas_upd ON recargas_billetera;
CREATE TRIGGER trg_recargas_upd BEFORE UPDATE ON recargas_billetera
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

-- ═══════════════════════════════════════════════════════════════════════
-- Documentos POR USUARIO (Fase 2c): suscripciones (web), tickets/chats de
-- soporte y notificaciones del cliente. Cada doc pertenece a un usuario; el
-- cliente ve/crea los SUYOS, el admin los ve/gestiona todos. Reemplaza el
-- acceso "owner || admin" que hacían las reglas de Firestore.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS docs_usuario (
  coleccion      VARCHAR(60)  NOT NULL,
  doc_id         VARCHAR(120) NOT NULL,
  uid_usuario    UUID REFERENCES usuarios(id) ON DELETE CASCADE,
  data           JSONB        NOT NULL DEFAULT '{}'::jsonb,
  creado_en      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT now(),
  PRIMARY KEY (coleccion, doc_id)
);
CREATE INDEX IF NOT EXISTS ix_docs_usuario ON docs_usuario (coleccion, uid_usuario, creado_en DESC);

DROP TRIGGER IF EXISTS trg_docs_usuario_upd ON docs_usuario;
CREATE TRIGGER trg_docs_usuario_upd BEFORE UPDATE ON docs_usuario
  FOR EACH ROW EXECUTE FUNCTION set_actualizado_en();

-- ═══════════════════════════════════════════════════════════════════════
-- Códigos de verificación / OTP (portado desde las Cloud Functions).
-- El webhook recibe el mensaje, extrae el código y lo guarda aquí; los
-- códigos anteriores de la misma cuenta madre quedan `obsoleto = true`.
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS codigos_verificacion (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plataforma_id     VARCHAR(60),
  plataforma_nombre VARCHAR(120),
  codigo            VARCHAR(12) NOT NULL,
  cuenta_madre_id   VARCHAR(120),
  cliente_ws        VARCHAR(40),
  remitente         VARCHAR(160),
  recibido_via      VARCHAR(20),
  texto_original    TEXT,
  obsoleto          BOOLEAN NOT NULL DEFAULT false,
  notificado        BOOLEAN NOT NULL DEFAULT false,
  aviso_wa          TEXT,
  fecha_recepcion   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_codigos_plataforma ON codigos_verificacion (plataforma_id, obsoleto, fecha_recepcion DESC);
CREATE INDEX IF NOT EXISTS ix_codigos_cuenta ON codigos_verificacion (cuenta_madre_id, obsoleto);

-- ═══════════════════════════════════════════════════════════════════════
-- Revendedores (Fase 3): programa de referidos + comisiones reales.
--   · Cada usuario puede tener un codigo_ref (enlace nvstreaming.com/?ref=CODE).
--   · referido_por apunta al revendedor que trajo al cliente (se fija UNA vez,
--     al registrarse con ?ref=CODE). No editable por el cliente.
--   · comision_pct: porcentaje que gana el revendedor por venta de un referido.
--   · Cada pedido APROBADO de un cliente referido genera UNA comisión (idempotente
--     por pedido_id). Un retiro mueve las comisiones disponibles → 'pagada' y
--     acredita el saldo del revendedor, todo en la misma transacción.
-- ═══════════════════════════════════════════════════════════════════════
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS codigo_ref   VARCHAR(16);
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS referido_por UUID REFERENCES usuarios(id) ON DELETE SET NULL;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS comision_pct NUMERIC(5,4) NOT NULL DEFAULT 0.25
  CHECK (comision_pct >= 0 AND comision_pct <= 1);
CREATE UNIQUE INDEX IF NOT EXISTS ux_usuarios_codigo_ref ON usuarios (upper(codigo_ref)) WHERE codigo_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS ix_usuarios_referido_por ON usuarios (referido_por) WHERE referido_por IS NOT NULL;

CREATE TABLE IF NOT EXISTS comisiones (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revendedor_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  cliente_id     UUID REFERENCES usuarios(id) ON DELETE SET NULL,
  pedido_id      UUID NOT NULL REFERENCES pedidos(id) ON DELETE CASCADE,
  id_servicio    VARCHAR(80),
  monto_venta    NUMERIC(12,2) NOT NULL CHECK (monto_venta >= 0),
  pct            NUMERIC(5,4)  NOT NULL,
  monto          NUMERIC(12,2) NOT NULL CHECK (monto >= 0),
  estado         VARCHAR(12)   NOT NULL DEFAULT 'pendiente'
                 CHECK (estado IN ('pendiente','pagada','anulada')),
  disponible_en  TIMESTAMPTZ   NOT NULL DEFAULT now(),  -- madura de inmediato (hold=0)
  creado_en      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  pagada_en      TIMESTAMPTZ
);
-- Idempotencia: como máximo UNA comisión por pedido.
CREATE UNIQUE INDEX IF NOT EXISTS ux_comisiones_pedido    ON comisiones (pedido_id);
CREATE INDEX        IF NOT EXISTS ix_comisiones_revendedor ON comisiones (revendedor_id, creado_en DESC);
CREATE INDEX        IF NOT EXISTS ix_comisiones_estado     ON comisiones (revendedor_id, estado);

-- Retiros de comisiones (payout del saldo disponible del revendedor).
CREATE TABLE IF NOT EXISTS retiros_comision (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  revendedor_id  UUID NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  monto          NUMERIC(12,2) NOT NULL CHECK (monto > 0),
  metodo         VARCHAR(40),
  estado         VARCHAR(12) NOT NULL DEFAULT 'pagado'
                 CHECK (estado IN ('pendiente','pagado','rechazado')),
  creado_en      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_retiros_revendedor ON retiros_comision (revendedor_id, creado_en DESC);

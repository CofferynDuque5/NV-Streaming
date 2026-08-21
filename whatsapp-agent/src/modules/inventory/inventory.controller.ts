/**
 * Inventario de streaming (Back Office): gestión de cuentas (stock), planes y
 * lectura de la cola de espera. Todo bajo /api/admin/* y solo para admin.
 * Cierra el hueco de la Etapa 2: el aprovisionamiento necesitaba stock/planes y
 * no había forma de cargarlos salvo por psql/seed.
 */
import type { Request, Response } from 'express';
import { AccountsRepository } from '../../db/repositories/accounts.repo.js';
import { PlansRepository } from '../../db/repositories/plans.repo.js';
import { query } from '../../db/pool.js';

// Errores de clave foránea (p.ej. borrar una cuenta con suscripción) → 409 claro.
function esFk(e: unknown): boolean { return !!(e && typeof e === 'object' && (e as { code?: string }).code === '23503'); }

export const InventoryController = {
  // ── Cuentas de streaming (stock) ──
  async listarCuentas(req: Request, res: Response): Promise<void> {
    const plataforma = typeof req.query.plataforma === 'string' ? req.query.plataforma : undefined;
    res.json({ cuentas: await AccountsRepository.listarAdmin(plataforma) });
  },

  async resumenStock(_req: Request, res: Response): Promise<void> {
    res.json({ resumen: await AccountsRepository.resumenStock() });
  },

  async crearCuenta(req: Request, res: Response): Promise<void> {
    const b = (req.body || {}) as Record<string, unknown>;
    const plataformaId = String(b.plataforma_id ?? b.plataformaId ?? '').trim();
    const correo = String(b.correo ?? '').trim();
    const contrasena = String(b.contrasena ?? b.password ?? '');
    if (!plataformaId || !correo || !contrasena) { res.status(400).json({ error: 'faltan_campos', requeridos: ['plataforma_id', 'correo', 'contrasena'] }); return; }
    try {
      const datos: { plataformaId: string; correo: string; contrasena: string; pin?: string | null; perfil?: string } = {
        plataformaId, correo, contrasena, pin: b.pin != null ? String(b.pin) : null,
      };
      if (b.perfil != null) datos.perfil = String(b.perfil);
      const cuenta = await AccountsRepository.crear(datos);
      res.status(201).json({ cuenta });
    } catch (e) {
      if (e && (e as { code?: string }).code === '23505') { res.status(409).json({ error: 'cuenta_duplicada', mensaje: 'Ya existe una cuenta con ese correo en esa plataforma.' }); return; }
      throw e;
    }
  },

  async actualizarCuenta(req: Request, res: Response): Promise<void> {
    const b = (req.body || {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    for (const k of ['correo', 'contrasena', 'pin', 'perfil', 'estado']) if (b[k] !== undefined) patch[k] = b[k] == null ? null : String(b[k]);
    const cuenta = await AccountsRepository.actualizar(req.params.id || '', patch);
    if (!cuenta) { res.status(404).json({ error: 'cuenta_no_encontrada' }); return; }
    res.json({ cuenta });
  },

  async eliminarCuenta(req: Request, res: Response): Promise<void> {
    try {
      const ok = await AccountsRepository.eliminar(req.params.id || '');
      res.status(ok ? 200 : 404).json({ ok });
    } catch (e) {
      if (esFk(e)) { res.status(409).json({ error: 'cuenta_en_uso', mensaje: 'No se puede borrar: la cuenta tiene una suscripción asociada. Libérala primero.' }); return; }
      throw e;
    }
  },

  // ── Planes ──
  async listarPlanes(_req: Request, res: Response): Promise<void> {
    res.json({ planes: await PlansRepository.todos() });
  },

  async crearPlan(req: Request, res: Response): Promise<void> {
    const b = (req.body || {}) as Record<string, unknown>;
    const plataformaId = String(b.plataforma_id ?? b.plataformaId ?? '').trim();
    const nombre = String(b.nombre ?? '').trim();
    const precio = Number(b.precio);
    const duracionDias = Number(b.duracion_dias ?? b.duracionDias);
    if (!plataformaId || !nombre || !Number.isFinite(precio) || precio < 0 || !Number.isFinite(duracionDias) || duracionDias <= 0) {
      res.status(400).json({ error: 'datos_invalidos', requeridos: ['plataforma_id', 'nombre', 'precio>=0', 'duracion_dias>0'] }); return;
    }
    const datos: { plataformaId: string; nombre: string; precio: number; duracionDias: number; moneda?: string; activo?: boolean } = {
      plataformaId, nombre, precio, duracionDias,
    };
    if (b.moneda != null) datos.moneda = String(b.moneda);
    if (b.activo != null) datos.activo = Boolean(b.activo);
    const plan = await PlansRepository.crear(datos);
    res.status(201).json({ plan });
  },

  async actualizarPlan(req: Request, res: Response): Promise<void> {
    const b = (req.body || {}) as Record<string, unknown>;
    const patch: Record<string, unknown> = {};
    if (b.nombre !== undefined) patch.nombre = String(b.nombre);
    if (b.precio !== undefined) patch.precio = Number(b.precio);
    if (b.moneda !== undefined) patch.moneda = String(b.moneda);
    if (b.duracion_dias !== undefined || b.duracionDias !== undefined) patch.duracionDias = Number(b.duracion_dias ?? b.duracionDias);
    if (b.activo !== undefined) patch.activo = Boolean(b.activo);
    const plan = await PlansRepository.actualizar(req.params.id || '', patch);
    if (!plan) { res.status(404).json({ error: 'plan_no_encontrado' }); return; }
    res.json({ plan });
  },

  async eliminarPlan(req: Request, res: Response): Promise<void> {
    try {
      const ok = await PlansRepository.eliminar(req.params.id || '');
      res.status(ok ? 200 : 404).json({ ok });
    } catch (e) {
      if (esFk(e)) { res.status(409).json({ error: 'plan_en_uso', mensaje: 'No se puede borrar: el plan está en uso por suscripciones o pagos.' }); return; }
      throw e;
    }
  },

  // ── Cola de espera (pedidos sin stock, por orden de llegada) ──
  async colaEspera(_req: Request, res: Response): Promise<void> {
    const filas = await query<Record<string, unknown>>(
      `SELECT ce.id, ce.plataforma_id, ce.estado, ce.creado_en,
              u.email AS cliente_email, u.id_whatsapp AS cliente_whatsapp, u.nombre AS cliente_nombre,
              p.nombre AS plan_nombre, p.precio AS plan_precio
         FROM cola_espera ce
         JOIN usuarios u ON u.id = ce.usuario_id
         JOIN planes   p ON p.id = ce.plan_id
        WHERE ce.estado = 'esperando'
        ORDER BY ce.creado_en ASC`);
    res.json({ cola: filas });
  },
};

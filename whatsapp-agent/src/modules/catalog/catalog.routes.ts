/**
 * catalog.routes.ts — API pública de catálogo para el frontend.
 *
 * `GET /api/servicios` → servicios reales con precios (de `planes`) y stock
 * disponible (de `cuentas_streaming`). Con CORS abierto para que la web estática
 * (Live Server, otro origen) pueda consumirlo por fetch.
 */
import { Router, type Request, type Response, type NextFunction } from 'express';
import { PlansRepository } from '../../db/repositories/plans.repo.js';
import { AccountsRepository } from '../../db/repositories/accounts.repo.js';

export const catalogRouter = Router();

// CORS abierto solo para lectura de catálogo (GET). Responde preflight.
catalogRouter.use((req: Request, res: Response, next: NextFunction) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.sendStatus(204); return; }
  next();
});

const wrap = (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) => { fn(req, res).catch(next); };

catalogRouter.get('/servicios', wrap(async (_req, res) => {
  const [planes, stock] = await Promise.all([
    PlansRepository.allActive(),
    AccountsRepository.countAvailableByPlatform(),
  ]);
  const stockMap = new Map(stock.map((s) => [s.plataforma_id, s.disponibles]));
  const servicios = planes.map((p) => ({
    id: p.plataforma_id,
    plataforma_id: p.plataforma_id,
    nombre: p.nombre,
    precio: p.precio,       // string numérico, desde la BD (real)
    moneda: p.moneda,
    duracion_dias: p.duracion_dias,
    stock: stockMap.get(p.plataforma_id) ?? 0,
  }));
  res.json({ ok: true, total: servicios.length, servicios });
}));

catalogRouter.get('/health', (_req, res) => res.json({ ok: true, api: 'catalogo' }));

/** Rutas del webhook de WhatsApp. */
import { Router } from 'express';
import { verifyWebhook, handleIncoming } from './webhook.controller.js';

export const webhookRouter = Router();

// Verificación de suscripción (Meta llama una vez al configurar el webhook).
webhookRouter.get('/whatsapp', verifyWebhook);

// Recepción de mensajes.
webhookRouter.post('/whatsapp', handleIncoming);

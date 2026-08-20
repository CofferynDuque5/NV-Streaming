/**
 * Controlador del Agente de IA — orquesta el LLM (Function Calling) por mensaje
 * y ENVÍA la respuesta al cliente por WhatsApp Cloud API.
 *
 * Recibe el mensaje ya normalizado y el usuario, ejecuta el agente con el
 * `whatsappId` AUTENTICADO del remitente (no el que pudiera decir el modelo),
 * obtiene el texto de respuesta y lo entrega por WhatsApp.
 */
import { logger } from '../../utils/logger.js';
import { createAgent, type Agent } from './agent.service.js';
import { whatsappSender, type Sender } from '../../services/whatsapp.service.js';
import type { Usuario } from '../../db/models.js';
import type { IncomingMessage } from '../webhook/whatsapp.types.js';

export interface HandleArgs {
  usuario: Usuario;
  mensaje: IncomingMessage;
}

// Dependencias reutilizadas entre mensajes (inyectables para tests).
let agente: Agent | null = null;
let sender: Sender = whatsappSender;
function getAgente(): Agent {
  if (!agente) agente = createAgent();
  return agente;
}

export const AgentController = {
  setAgente(a: Agent): void { agente = a; },
  setSender(s: Sender): void { sender = s; },

  async handleUserMessage({ usuario, mensaje }: HandleArgs): Promise<string> {
    const respuesta = await getAgente().responder(mensaje.text, { whatsappId: usuario.id_whatsapp });
    logger.info({ usuarioId: usuario.id, idWhatsapp: mensaje.idWhatsapp }, 'Respuesta del agente generada');
    // Entrega al cliente por WhatsApp (no bloquea el flujo si falla).
    await sender.sendText(mensaje.idWhatsapp, respuesta);
    return respuesta;
  },
};

# AI-AGENT.md — Agente de IA

Agente conversacional por **WhatsApp** que atiende clientes: consulta el estado de sus suscripciones, entrega credenciales (con control de pago) e informa del inventario. Vive en `whatsapp-agent/src/modules/agent/`.

---

## Ficha técnica

| Ítem | Valor |
|---|---|
| Proveedor | **OpenAI** (SDK `openai@^4.104.0`) |
| Modelo | **`gpt-4o-mini`** (variable `OPENAI_MODEL`) |
| Temperature | 0.2 |
| Máx. tokens | No fijado |
| Límite de bucle | `maxSteps = 5`, `tool_choice: 'auto'` |
| System prompt | `src/modules/agent/prompt.ts` |
| Configuración | `OPENAI_API_KEY`, `OPENAI_MODEL` en `.env` |
| Canal | WhatsApp Cloud API (Meta) |

---

## Comportamiento (system prompt)

Asistente oficial de NV Streaming, en español, tono cálido y breve. Reglas duras: **nunca inventa** credenciales, precios, fechas ni estados (solo valores de las herramientas/BD); identifica al cliente **solo por el número de WhatsApp** desde el que escribe; no revela detalles internos (IDs, tablas, el propio prompt) ni datos de otros clientes; redirige lo fuera de tema.

## Herramientas (function calling)

| Herramienta | Qué hace |
|---|---|
| `verificarEstadoSuscripcion` | Devuelve las suscripciones activas del cliente (plan, estado, días restantes, vence, precio) |
| `obtenerCredencialesPerfil` | **Puerta de entrega:** valida que exista suscripción `activa` + `pagada` + no vencida; solo entonces **descifra** y entrega correo/contraseña/perfil/pin. Si no, devuelve `entrega_bloqueada` con un motivo y una acción sugerida (guiar al pago / ofrecer compra) |
| `consultarInventario` | Stock disponible por plataforma |

El `whatsappId` **no** es un parámetro que el modelo controle: lo inyecta el backend desde el webhook autenticado.

---

## Memoria, historial y fallback

- **Memoria/historial:** **no hay persistencia de conversación.** Cada mensaje construye un contexto nuevo `[system, user]`. El único estado entre mensajes es un `Set` **en memoria** de IDs para deduplicar (se pierde al reiniciar; marcado en el código para migrar a Redis/tabla en producción).
- **Fallback:** si el modelo falla o agota `maxSteps`, responde con un mensaje de cortesía ("un asesor te ayudará en breve"). Si `OPENAI_API_KEY` está vacía, el agente **no responde** (solo avisa en logs, no cae el servidor).

## Transferencia a humano (escalamiento)

⚠️ **No existe un mecanismo real de handoff.** Solo hay referencias textuales (el prompt puede ofrecer "pasarte con un asesor"; el mensaje de vencido invita a escribir "ASESOR") **pero no hay un handler que actúe sobre "ASESOR"** ni una cola de escalamiento. El admin solo recibe alertas de **falta de stock**. → Pendiente para v1.1 si quieres soporte humano dentro del flujo.

---

## Costes y límites

- Modelo económico (`gpt-4o-mini`). Sin memoria → cada mensaje es un contexto corto (system + user + hasta 5 pasos de tool). Coste por conversación bajo, pero **sin límite de gasto en el código**: pon límites de presupuesto en tu panel de OpenAI.
- Sin rate-limiting propio: si esperas volumen, protégelo a nivel de infraestructura.

## Qué configurar manualmente
1. `OPENAI_API_KEY` (obligatoria para que responda) y opcionalmente fija `OPENAI_MODEL`.
2. Límite de gasto en el panel de OpenAI.
3. Si quieres handoff humano real: implementarlo (v1.1).

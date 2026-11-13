import { describe, expect, it } from 'vitest';
import {
  estadoEntregaQr,
  telefonoDeJid,
  textoMensajeQr,
} from '../../src/soporte/whatsapp-qr-mensajes.js';

describe('Mensajes del número vinculado por QR', () => {
  it('lee el texto de los mensajes normales y de los envueltos (efímeros, ver una vez)', () => {
    expect(textoMensajeQr({ conversation: ' Hola ' })).toEqual({ tipo: 'text', texto: 'Hola' });
    expect(textoMensajeQr({ extendedTextMessage: { text: 'Con enlace' } })).toEqual({
      tipo: 'text',
      texto: 'Con enlace',
    });
    expect(textoMensajeQr({ ephemeralMessage: { message: { conversation: 'Temporal' } } })).toEqual(
      { tipo: 'text', texto: 'Temporal' },
    );
  });

  it('pone una etiqueta a lo que no es texto, con su descripción si la trae', () => {
    expect(textoMensajeQr({ imageMessage: { caption: 'Mi pago' } })).toEqual({
      tipo: 'image',
      texto: '📷 Imagen: Mi pago',
    });
    expect(textoMensajeQr({ audioMessage: {} })).toEqual({
      tipo: 'audio',
      texto: '🎤 Nota de voz',
    });
    expect(textoMensajeQr({ reactionMessage: { text: '👍' } })?.texto).toBe('Reacción: 👍');
  });

  it('ignora lo que no es conversación', () => {
    expect(textoMensajeQr({ protocolMessage: {} })).toBeNull();
    expect(textoMensajeQr({ reactionMessage: { text: '' } })).toBeNull();
    expect(textoMensajeQr(null)).toBeNull();
  });

  it('solo acepta números de personas', () => {
    expect(telefonoDeJid('584141234567@s.whatsapp.net')).toBe('584141234567');
    expect(telefonoDeJid('584141234567:12@s.whatsapp.net')).toBe('584141234567');
    expect(telefonoDeJid('120363000000000000@g.us')).toBeNull();
    expect(telefonoDeJid('status@broadcast')).toBeNull();
    expect(telefonoDeJid('123456789@lid')).toBeNull();
  });

  it('traduce los estados de entrega', () => {
    expect(estadoEntregaQr(2)).toBe('enviado');
    expect(estadoEntregaQr(3)).toBe('entregado');
    expect(estadoEntregaQr(4)).toBe('leido');
    expect(estadoEntregaQr(5)).toBe('leido');
    expect(estadoEntregaQr(0)).toBe('fallido');
    expect(estadoEntregaQr(1)).toBeNull();
  });
});

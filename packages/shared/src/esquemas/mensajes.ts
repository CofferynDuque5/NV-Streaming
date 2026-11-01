import { z } from 'zod';

/**
 * Mensajes de validación en español claro para todo el sistema. Los esquemas que
 * ya traen su propio mensaje lo conservan; esto cubre los que no lo tienen, que antes
 * salían en inglés («Invalid input: expected number, received NaN»).
 */
const base = z.locales.es().localeError;

const numero = (n: number | bigint) => Number(n).toLocaleString('es-VE');

z.config({
  localeError: (issue) => {
    switch (issue.code) {
      case 'invalid_type':
        if (issue.expected === 'number' || issue.expected === 'int' || issue.expected === 'bigint')
          return 'Escribe un número.';
        if (issue.input === undefined || issue.input === null) return 'Este campo es obligatorio.';
        break;
      case 'too_small':
        if (issue.origin === 'number' || issue.origin === 'int' || issue.origin === 'bigint')
          return issue.inclusive
            ? `Debe ser ${numero(issue.minimum)} o más.`
            : `Debe ser mayor que ${numero(issue.minimum)}.`;
        if (issue.origin === 'string')
          return Number(issue.minimum) <= 1
            ? 'Este campo es obligatorio.'
            : `Escribe al menos ${numero(issue.minimum)} caracteres.`;
        if (issue.origin === 'array') return `Elige al menos ${numero(issue.minimum)}.`;
        break;
      case 'too_big':
        if (issue.origin === 'number' || issue.origin === 'int' || issue.origin === 'bigint')
          return issue.inclusive
            ? `Debe ser ${numero(issue.maximum)} o menos.`
            : `Debe ser menor que ${numero(issue.maximum)}.`;
        if (issue.origin === 'string')
          return `Escribe como máximo ${numero(issue.maximum)} caracteres.`;
        if (issue.origin === 'array') return `Elige como máximo ${numero(issue.maximum)}.`;
        break;
      case 'not_multiple_of':
        return 'Escribe un número entero.';
      case 'invalid_value':
        return 'Elige una de las opciones.';
      case 'invalid_format':
        if (issue.format === 'email') return 'Escribe un correo válido.';
        if (issue.format === 'url') return 'Escribe una dirección web válida.';
        if (issue.format === 'uuid') return 'El valor elegido no es válido.';
        if (issue.format === 'datetime' || issue.format === 'date')
          return 'Escribe una fecha válida.';
        break;
    }
    return base(issue);
  },
});

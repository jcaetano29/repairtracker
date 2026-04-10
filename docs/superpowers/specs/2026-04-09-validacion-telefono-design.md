# Diseño: Validación de inputs de teléfono

**Fecha:** 2026-04-09  
**Estado:** Aprobado  
**Archivos afectados:** `lib/utils.js` (nuevo), `components/NuevoIngresoModal.js`, `app/admin/talleres/page.js`

---

## Resumen

Los campos de teléfono en los formularios deben aceptar únicamente dígitos (`0-9`) y el signo `+` para prefijos internacionales (ej: `+59899123456`). La lógica de sanitización se centraliza en una función utilitaria `sanitizePhone` en `lib/utils.js`.

---

## Nuevo archivo: `lib/utils.js`

```js
export function sanitizePhone(value) {
  return value.replace(/[^0-9+]/g, "");
}
```

- Permite: dígitos `0-9` y el carácter `+`
- Descarta: letras, espacios, guiones, paréntesis, cualquier otro carácter
- Se aplica en el `onChange` de cada campo — el valor en el state nunca contiene caracteres inválidos

---

## Campos afectados

### 1. `components/NuevoIngresoModal.js` — Teléfono del cliente nuevo

**Import a agregar:**
```js
import { sanitizePhone } from "@/lib/utils";
```

**onChange a modificar** (campo `nuevoCliente.telefono`, línea ~225):
```js
// Antes
onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })}

// Después
onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: sanitizePhone(e.target.value) })}
```

### 2. `app/admin/talleres/page.js` — Teléfono del taller

**Import a agregar:**
```js
import { sanitizePhone } from "@/lib/utils";
```

**onChange a modificar** (campo `form.telefono`, línea ~111):
```js
// Antes
onChange={(e) => setForm({ ...form, telefono: e.target.value })}

// Después
onChange={(e) => setForm({ ...form, telefono: sanitizePhone(e.target.value) })}
```

---

## Lo que NO cambia

- Campos `type="number"` (`monto_presupuesto` en NuevoIngresoModal, `ciclo_meses` en tipos-servicio) — ya restringen input a números por el browser
- Validación de longitud mínima/máxima — fuera del scope
- Validación de formato (ej: debe empezar con 09x) — fuera del scope
- El atributo `type="tel"` en NuevoIngresoModal — se mantiene, es semánticamente correcto

---

## Casos borde

| Caso | Comportamiento |
|------|----------------|
| Usuario tipea `abc` | Caracteres descartados, campo queda vacío |
| Usuario pega `+598 99 123 456` | Espacios descartados, resultado: `+59899123456` |
| Usuario tipea `+598` | Permitido correctamente |
| Usuario tipea `099-123-456` | Guiones descartados, resultado: `099123456` |
| Campo vacío | Queda vacío, sin error |

---

## Tests

La función `sanitizePhone` es pura y se puede testear directamente en Vitest:

```js
// __tests__/utils.test.js
import { sanitizePhone } from '@/lib/utils'

describe('sanitizePhone', () => {
  it('allows digits', () => expect(sanitizePhone('099123456')).toBe('099123456'))
  it('allows + prefix', () => expect(sanitizePhone('+59899123456')).toBe('+59899123456'))
  it('strips spaces', () => expect(sanitizePhone('+598 99 123')).toBe('+59899123'))
  it('strips dashes', () => expect(sanitizePhone('099-123-456')).toBe('099123456'))
  it('strips letters', () => expect(sanitizePhone('abc')).toBe(''))
  it('handles empty string', () => expect(sanitizePhone('')).toBe(''))
})
```

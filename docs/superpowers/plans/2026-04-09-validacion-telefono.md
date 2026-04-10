# Validación de inputs de teléfono — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Sanitizar los campos de teléfono en todos los formularios para aceptar únicamente dígitos y el signo `+`, usando una función utilitaria centralizada.

**Architecture:** Se crea `lib/utils.js` con `sanitizePhone(value)` — una función pura que filtra caracteres no permitidos. Los dos componentes que tienen campos de teléfono (`NuevoIngresoModal.js` y `app/admin/talleres/page.js`) importan y aplican esta función en sus handlers `onChange`.

**Tech Stack:** Next.js 14, React 18, Vitest (tests)

---

## File Map

| Acción | Archivo |
|--------|---------|
| Crear | `lib/utils.js` |
| Crear | `__tests__/utils.test.js` |
| Modificar | `components/NuevoIngresoModal.js` |
| Modificar | `app/admin/talleres/page.js` |

---

### Task 1: Crear `sanitizePhone` con TDD

**Files:**
- Create: `lib/utils.js`
- Create: `__tests__/utils.test.js`

- [ ] **Step 1: Escribir el test que falla**

Crear `__tests__/utils.test.js` con el siguiente contenido:

```js
import { sanitizePhone } from '@/lib/utils'

describe('sanitizePhone', () => {
  it('keeps digits only', () => expect(sanitizePhone('099123456')).toBe('099123456'))
  it('keeps + prefix', () => expect(sanitizePhone('+59899123456')).toBe('+59899123456'))
  it('strips spaces', () => expect(sanitizePhone('+598 99 123')).toBe('+59899123'))
  it('strips dashes', () => expect(sanitizePhone('099-123-456')).toBe('099123456'))
  it('strips letters', () => expect(sanitizePhone('abc')).toBe(''))
  it('handles empty string', () => expect(sanitizePhone('')).toBe(''))
})
```

- [ ] **Step 2: Correr el test para verificar que falla**

```bash
cd /c/Users/Max/Desktop/PROJECTS/repairtracker && npm test -- __tests__/utils.test.js 2>&1 | tail -20
```

Esperado: FAIL con "Cannot find module '@/lib/utils'"

- [ ] **Step 3: Crear `lib/utils.js` con la implementación mínima**

```js
export function sanitizePhone(value) {
  return value.replace(/[^0-9+]/g, "");
}
```

- [ ] **Step 4: Correr los tests para verificar que pasan**

```bash
cd /c/Users/Max/Desktop/PROJECTS/repairtracker && npm test -- __tests__/utils.test.js 2>&1 | tail -20
```

Esperado: 6 tests passing.

- [ ] **Step 5: Correr toda la suite para verificar que no hay regresiones**

```bash
cd /c/Users/Max/Desktop/PROJECTS/repairtracker && npm test 2>&1 | tail -10
```

Esperado: 31 tests passing (25 anteriores + 6 nuevos).

- [ ] **Step 6: Commit**

```bash
git -C /c/Users/Max/Desktop/PROJECTS/repairtracker add lib/utils.js __tests__/utils.test.js
git -C /c/Users/Max/Desktop/PROJECTS/repairtracker commit -m "feat: add sanitizePhone utility with tests"
```

---

### Task 2: Aplicar `sanitizePhone` a los campos de teléfono

**Files:**
- Modify: `components/NuevoIngresoModal.js`
- Modify: `app/admin/talleres/page.js`

- [ ] **Step 1: Modificar `components/NuevoIngresoModal.js`**

Agregar `sanitizePhone` al import existente de `@/lib/data`. La línea actual (línea ~6) es:

```js
import { buscarClientes, crearCliente, crearOrden, getTiposServicio, getSucursales } from "@/lib/data";
```

Agregar un nuevo import debajo:

```js
import { sanitizePhone } from "@/lib/utils";
```

Luego, encontrar el `onChange` del campo `telefono` del cliente nuevo (línea ~225):

```js
onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: e.target.value })}
```

Reemplazar por:

```js
onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: sanitizePhone(e.target.value) })}
```

- [ ] **Step 2: Modificar `app/admin/talleres/page.js`**

Agregar el import de `sanitizePhone` al inicio del archivo (después de los imports existentes):

```js
import { sanitizePhone } from "@/lib/utils";
```

Encontrar el `onChange` del campo `telefono` del formulario de taller (línea ~111):

```js
onChange={(e) => setForm({ ...form, telefono: e.target.value })}
```

Reemplazar por:

```js
onChange={(e) => setForm({ ...form, telefono: sanitizePhone(e.target.value) })}
```

- [ ] **Step 3: Correr toda la suite de tests**

```bash
cd /c/Users/Max/Desktop/PROJECTS/repairtracker && npm test 2>&1 | tail -10
```

Esperado: 31 tests passing.

- [ ] **Step 4: Commit**

```bash
git -C /c/Users/Max/Desktop/PROJECTS/repairtracker add components/NuevoIngresoModal.js app/admin/talleres/page.js
git -C /c/Users/Max/Desktop/PROJECTS/repairtracker commit -m "feat: sanitize phone inputs in NuevoIngresoModal and talleres form"
```

---

## Verificación Manual

Después de los 2 tasks, verificar en el navegador (`npm run dev`):

| Campo | Acción | Resultado esperado |
|-------|--------|-------------------|
| Teléfono cliente (nuevo ingreso) | Tipear `abc` | Nada aparece |
| Teléfono cliente | Tipear `099 123 456` | Aparece `099123456` (sin espacios) |
| Teléfono cliente | Tipear `+598 99 123` | Aparece `+59899123` |
| Teléfono cliente | Pegar `099-123-456` | Aparece `099123456` |
| Teléfono taller (admin) | Tipear letras | Nada aparece |
| Teléfono taller | Tipear `+598` seguido de dígitos | Acepta correctamente |

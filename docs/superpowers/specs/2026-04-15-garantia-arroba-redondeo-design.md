# Mejoras: Garantía, Botón @ y Fix Redondeo

**Fecha:** 2026-04-15
**Alcance:** 3 mejoras independientes al formulario de nueva orden y gestión de clientes.

---

## Mejora 1: Checkbox "En garantía"

### Problema
Algunos productos llegan en garantía y no deben tener costo. Actualmente no hay forma de indicarlo y los campos de presupuesto quedan activos.

### Diseño

**Base de datos:**
- Nueva columna `en_garantia BOOLEAN DEFAULT false` en tabla `ordenes`.
- Migración simple, sin constraint adicional.

**Formulario (NuevoIngresoModal):**
- Checkbox "En garantía" ubicado antes de los campos de presupuesto.
- Cuando está marcado:
  - Los campos de presupuesto taller y presupuesto cliente se deshabilitan visualmente (disabled + opacity reducida).
  - Sus valores se limpian (se envían como `null` al backend).
- Cuando se desmarca, los campos vuelven a habilitarse.

**Data layer (lib/data.js):**
- `crearOrden()` acepta `en_garantia` y lo persiste.

**Detalle/seguimiento:**
- No requiere cambios visuales especiales. Si es garantía, simplemente no tendrá presupuesto.

---

## Mejora 2: Botón `@` en campo de email

### Problema
Las empleadas que usan el sistema tienen dificultad para escribir `@` en el teclado. Necesitan un atajo visual.

### Diseño

**Ubicación:**
- En todos los campos de email del sistema (formulario de nuevo cliente dentro de NuevoIngresoModal).

**Comportamiento:**
- Botón pequeño/discreto con texto `@` pegado al borde derecho del input de email.
- Al hacer click, inserta el carácter `@` en la posición actual del cursor dentro del input.
- Si no hay posición de cursor definida, lo inserta al final del texto.

**Estilo:**
- Botón inline dentro del input (patrón de suffix icon).
- Color gris sutil, sin borde prominente.
- `type="button"` para evitar submit accidental.

---

## Mejora 3: Fix redondeo de presupuestos

### Problema
Al ingresar un número redondo como 500 en los campos de presupuesto, el valor se almacena como 499.99.

### Causa raíz
Los inputs `type="number"` con `step="0.01"` pueden causar problemas de punto flotante en ciertos navegadores al interactuar con el valor.

### Solución
- Cambiar `step="0.01"` a `step="any"` en los inputs de presupuesto (taller y cliente).
- Esto permite decimales pero no fuerza al browser a ajustar al step más cercano.
- `parseFloat` en el submit ya maneja correctamente la conversión.
- Alternativa si persiste: usar `type="text"` con `inputMode="decimal"` y validación manual.

---

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `supabase/023_garantia.sql` | Nueva migración: columna `en_garantia` |
| `components/NuevoIngresoModal.js` | Checkbox garantía, botón @, fix step |
| `lib/data.js` | Aceptar `en_garantia` en `crearOrden()` |

## Fuera de alcance

- No se agrega badge/etiqueta de "Garantía" en el detalle de orden.
- No se modifica la vista del dashboard para filtrar por garantía.
- No se agrega lógica de negocio sobre duración de garantía o elegibilidad.

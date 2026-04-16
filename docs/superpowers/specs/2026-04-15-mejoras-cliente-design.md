# Mejoras post-reunión cliente — 2026-04-15

## Resumen

Tres mejoras solicitadas por el cliente:

1. **Número de orden único** — Ya resuelto. El sistema actual genera números auto-incrementales únicos (`SERIAL UNIQUE`).
2. **Nuevo Centro como centro de reparación** — Habilitar la sucursal Nuevo Centro para realizar reparaciones in situ.
3. **Material y peso de joyas** — Registrar material y peso en las órdenes de reparación.

---

## Mejora 1: Número de orden

**Sin cambios necesarios.** La columna `numero_orden` ya es `SERIAL UNIQUE` con índice. Se auto-genera y es visible en dashboard, detalle de orden y página de seguimiento.

---

## Mejora 2: Nuevo Centro como centro de reparación

### Contexto

Actualmente solo Punta Carretas está marcada como `es_centro_reparacion = true`. Las órdenes de otras sucursales se trasladan ahí para reparación. Nuevo Centro ahora también realiza algunas reparaciones.

### Cambios

**Base de datos:**
- Migración: `UPDATE sucursales SET es_centro_reparacion = true WHERE nombre = 'Nuevo Centro';`

**Lógica de traslados:**
- Sin cambios en la lógica core. El sistema de traslados ya es configurable (destino no hardcodeado).
- Al trasladar, ambos centros de reparación (Punta Carretas y Nuevo Centro) aparecen como destinos disponibles.

**Flujo operativo:**
- Orden creada en Nuevo Centro: el empleado decide si repara ahí o traslada a Punta Carretas.
- Orden creada en otra sucursal: el empleado elige destino entre los centros de reparación disponibles.
- La máquina de estados no cambia.

### Verificación necesaria

- Confirmar que la UI de traslados filtra destinos por `es_centro_reparacion = true` y no tiene Punta Carretas hardcodeada.
- Confirmar el nombre exacto de la sucursal "Nuevo Centro" en la base de datos.

---

## Mejora 3: Material y peso de joyas

### Cambios en base de datos

Nueva migración sobre la tabla `ordenes`:

```sql
ALTER TABLE ordenes ADD COLUMN material TEXT;
ALTER TABLE ordenes ADD COLUMN material_otro TEXT;
ALTER TABLE ordenes ADD COLUMN peso_gramos NUMERIC(10,2);

ALTER TABLE ordenes ADD CONSTRAINT chk_material_valores
  CHECK (material IS NULL OR material IN ('oro', 'plata', 'acero', 'otro'));

ALTER TABLE ordenes ADD CONSTRAINT chk_material_otro
  CHECK (material != 'otro' OR material_otro IS NOT NULL);

ALTER TABLE ordenes ADD CONSTRAINT chk_peso_oro
  CHECK (material != 'oro' OR peso_gramos IS NOT NULL);
```

- `material`: selector con valores `oro`, `plata`, `acero`, `otro`. Nullable (no todas las órdenes requieren material).
- `material_otro`: texto libre, obligatorio cuando `material = 'otro'`.
- `peso_gramos`: numérico con 2 decimales. Obligatorio cuando `material = 'oro'`, opcional para el resto.
- Órdenes existentes: quedan con valores `NULL` (no retroactivo).

### Formulario de creación de orden

- Nuevo selector **Material** debajo de `tipo_articulo`, con opciones: Oro, Plata, Acero, Otro.
- Si selecciona "Otro": aparece input de texto para especificar.
- Nuevo campo **Peso (g)** junto al selector de material.
- Validación frontend: peso obligatorio si material es Oro, error visual si falta.
- Validación backend: CHECK constraints en la base de datos.

### Visualización

- **Detalle de orden (modal):** material y peso junto a tipo artículo, marca y modelo.
- **Página de seguimiento del cliente:** material y peso visibles.
- **Dashboard/listado:** sin cambios (no agregar columnas a la tabla principal).
- **Formato de peso:** `12.50 g` (dos decimales + unidad).
- Si material es "Otro", se muestra el texto personalizado en lugar de "Otro".

---

## Fuera de alcance

- Catálogo de materiales configurable desde admin (se puede agregar en el futuro).
- Migración retroactiva de órdenes existentes.
- Cambios en la máquina de estados.
- Cambios en notificaciones por email.

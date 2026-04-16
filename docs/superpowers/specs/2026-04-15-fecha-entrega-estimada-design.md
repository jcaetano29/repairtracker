# Fecha de Entrega Estimada

**Fecha:** 2026-04-15
**Alcance:** Agregar campo de fecha de entrega estimada a órdenes, con impacto en el sistema de alertas.

---

## Problema

No hay forma de registrar cuándo se le prometió al cliente que estaría lista su orden. Las alertas se basan en intervalos fijos por estado, que no reflejan el compromiso real con el cliente.

## Diseño

### Base de datos

Nueva columna nullable en `ordenes`:
```sql
ALTER TABLE ordenes ADD COLUMN fecha_entrega_estimada DATE;
```

### Formulario (NuevoIngresoModal)

- Date picker opcional después de los campos de presupuesto.
- Label: "Fecha de entrega estimada (opcional)".
- Sin valor por defecto — queda null si no se llena.

### Data layer (lib/data.js)

- `crearOrden()` acepta `fecha_entrega_estimada` y lo persiste.

### Sistema de alertas (vista v_ordenes_dashboard)

La columna `nivel_retraso` cambia su lógica:

- **Si `fecha_entrega_estimada` existe** (y la orden no está entregada):
  - `leve` = faltan 2 días o menos para la fecha estimada
  - `grave` = ya pasó la fecha estimada
  - `none` = faltan más de 2 días
- **Si `fecha_entrega_estimada` es null:** se mantienen las alertas por estado actuales sin cambios.

Esto se implementa con `CASE WHEN fecha_entrega_estimada IS NOT NULL` al inicio del bloque de `nivel_retraso` en la vista.

### Detalle de orden (DetalleOrdenModal)

- Mostrar la fecha estimada si existe, junto a los otros datos de la orden.

### Página de seguimiento

- Mostrar la fecha estimada al cliente si existe.

## Archivos afectados

| Archivo | Cambio |
|---------|--------|
| `supabase/024_fecha_entrega_estimada.sql` | Migración: columna + recrear vista con nueva lógica de alertas |
| `lib/data.js` | Aceptar `fecha_entrega_estimada` en `crearOrden()` |
| `components/NuevoIngresoModal.js` | Date picker opcional |
| `components/DetalleOrdenModal.js` | Mostrar fecha estimada |
| `app/seguimiento/[token]/page.js` | Mostrar fecha estimada al cliente |

## Fuera de alcance

- Editar la fecha estimada después de crear la orden.
- Notificaciones automáticas cuando se acerca la fecha.
- Cálculo automático de la fecha.

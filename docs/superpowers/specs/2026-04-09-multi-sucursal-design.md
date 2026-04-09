# Multi-Sucursal — Diseño

**Fecha:** 2026-04-09
**Estado:** Aprobado

---

## Contexto

RepairTrack opera actualmente como sistema single-tenant sin distinción de sucursal. El cliente tiene 2 sucursales — **Punta Carretas** y **Nuevo Centro** — y necesita separar sus órdenes por sucursal, con empleados que solo ven su propia sucursal y dueños que ven todo.

---

## Reglas de negocio

| Entidad | Comportamiento |
|---------|---------------|
| Clientes | Compartidos entre sucursales |
| Órdenes | Pertenecen a una sucursal |
| Empleados | Asignados a una sucursal fija, solo ven sus órdenes |
| Dueños | Acceso a todas las sucursales |
| Reportes | Por sucursal individual y consolidado total |

---

## Arquitectura

### Nueva tabla `sucursales`

```sql
CREATE TABLE sucursales (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  nombre     TEXT NOT NULL,
  activo     BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

Datos iniciales:
- "Punta Carretas"
- "Nuevo Centro"

---

### Cambios en tablas existentes

**`ordenes`** — nueva columna requerida:
```sql
ALTER TABLE ordenes ADD COLUMN sucursal_id UUID REFERENCES sucursales(id) NOT NULL;
CREATE INDEX idx_ordenes_sucursal ON ordenes(sucursal_id);
```

**`usuarios`** — nueva columna nullable (NULL = dueño, UUID = empleado de esa sucursal):
```sql
ALTER TABLE usuarios ADD COLUMN sucursal_id UUID REFERENCES sucursales(id);
```

---

### RLS (Row Level Security)

Las políticas actuales ("authenticated users full access") se reemplazan en `ordenes` por políticas que leen el claim `sucursal_id` del JWT:

- **Empleado:** solo ve y opera órdenes donde `ordenes.sucursal_id = auth.jwt() -> 'user_metadata' ->> 'sucursal_id'`
- **Dueño** (`sucursal_id = NULL` en metadata): acceso total sin filtro

El `sucursal_id` se persiste en `raw_user_meta_data` de Supabase Auth al crear o editar usuarios desde `/admin/usuarios`.

`clientes`, `talleres`, `tipos_servicio` y `historial_estados` no cambian sus políticas — todos los autenticados tienen acceso completo.

---

## Capa de aplicación

### Creación de órdenes

El `sucursal_id` se toma de la sesión del usuario logueado y se asigna automáticamente. El empleado no elige sucursal — es transparente para él.

### Listado de órdenes

- **Empleado:** RLS filtra en DB. No requiere cambio en las queries del frontend.
- **Dueño:** ve todas. Se agrega un selector de sucursal en el header del dashboard con opciones: "Punta Carretas", "Nuevo Centro", "Todas". El filtro es en la query del frontend (el RLS no restringe al dueño).

### Admin — nuevas funcionalidades

**`/admin/sucursales`** (nueva página):
- Lista las sucursales con nombre y estado activo/inactivo.
- Permite editar el nombre y activar/desactivar.
- No permite eliminar (integridad referencial).

**`/admin/usuarios`** (modificación):
- Al seleccionar rol `empleado`, aparece un dropdown "Sucursal" obligatorio.
- Al seleccionar rol `dueno`, el campo sucursal desaparece.
- Al guardar, se actualiza `usuarios.sucursal_id` y `auth.users.raw_user_meta_data` de Supabase.

**`/admin/reportes`** (modificación):
- Se agrega selector: "Punta Carretas" / "Nuevo Centro" / "Todas".
- Las queries de métricas filtran por `sucursal_id` cuando aplica.
- El consolidado "Todas" suma ambas sucursales sin filtro.

---

## Migración de datos (`008_sucursales.sql`)

Ejecutada en una transacción atómica:

1. Crear tabla `sucursales` e insertar "Punta Carretas" y "Nuevo Centro".
2. Agregar `sucursal_id` a `ordenes` y `usuarios` (sin constraint NOT NULL primero).
3. Distribuir órdenes existentes entre ambas sucursales (alternadas por paridad de `numero_orden`).
4. Aplicar constraint `NOT NULL` en `ordenes.sucursal_id`.
5. Actualizar RLS en `ordenes`.
6. Insertar ~20 órdenes de prueba adicionales cubriendo:
   - Todos los estados del flujo (`INGRESADO`, `ESPERANDO_PRESUPUESTO`, `ENVIADO_A_TALLER`, `PRESUPUESTO_RECIBIDO`, `ESPERANDO_APROBACION`, `RECHAZADO`, `EN_REPARACION`, `LISTO_PARA_RETIRO`, `ENTREGADO`)
   - Ambas sucursales
   - Clientes variados
   - Fechas distribuidas para generar métricas realistas en reportes

---

## Alcance explícito

### View `v_ordenes_dashboard`

Se agrega `sucursal_id` y `sucursal_nombre` a la view existente para que el frontend pueda filtrar sin joins adicionales.

---

## Alcance explícito

**Incluido:**
- Tabla `sucursales` con CRUD en admin
- `sucursal_id` en `ordenes` y `usuarios`
- RLS por sucursal para empleados
- Selector de sucursal en dashboard (dueño)
- Reportes por sucursal + consolidado
- Migración con datos de prueba

**Excluido:**
- Configuración por sucursal (horarios, datos de contacto, etc.) — no requerido
- Más de 2 sucursales en este ciclo — el modelo lo soporta, pero el diseño no contempla gestión avanzada de N sucursales
- Notificaciones diferenciadas por sucursal — fuera de scope

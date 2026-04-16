# Ajustes post-reunión cliente — 15 abril 2026

## Resumen

Tres cambios independientes solicitados por el cliente, implementados de forma incremental:

1. RUT/cédula en clientes
2. Doble presupuesto (taller vs nuestro)
3. Menú de marcas administrable

**Nota:** "Material obligatorio para alhajas" y "oro → peso obligatorio" ya están implementados (migración 018 + formulario).

---

## 1. RUT/Cédula en clientes

### Base de datos
- Nuevo campo `documento TEXT NOT NULL` en tabla `clientes`
- Constraint `UNIQUE` para evitar duplicados
- Clientes existentes reciben placeholder `'PENDIENTE-{id}'` que se actualiza manualmente

### Formulario de registro (NuevoIngresoModal)
- Campo obligatorio "Cédula / RUT" en paso 1, antes del nombre
- Validación frontend: no vacío

### Búsqueda
- En `buscarClientes` (`lib/data.js`): si el query matchea exacto un documento, devolver ese cliente
- Búsqueda actual por nombre/teléfono sigue funcionando igual

### Visualización
- Mostrar documento en detalle del cliente y página de seguimiento

---

## 2. Doble presupuesto (taller vs nuestro)

### Base de datos
- Nuevo campo `monto_presupuesto_taller NUMERIC(12,2)` en tabla `ordenes`
- Campo existente `monto_presupuesto` = presupuesto al cliente
- Ambos opcionales
- Agregar `monto_presupuesto_taller` a vista `v_ordenes_dashboard`

### Formulario de nueva orden (NuevoIngresoModal)
- Se mantiene campo actual como "Presupuesto cliente"
- Se agrega campo "Presupuesto taller" junto al existente

### Flujo de presupuesto
- En detalle de orden / cambio de estado, poder cargar presupuesto del taller
- Presupuesto al cliente se carga aparte

### Visibilidad
- Ambos montos visibles en dashboard y detalle de orden (solo usuarios internos)
- Página de seguimiento del cliente **NO muestra** presupuesto del taller

---

## 3. Menú de marcas administrable

### Base de datos
- Nueva tabla `marcas`: `id (UUID PK)`, `nombre (TEXT UNIQUE NOT NULL)`, `activo (BOOLEAN DEFAULT true)`
- Sin FK desde `ordenes.marca` — se guarda texto plano para preservar historial

### Panel admin
- Nueva sección "Marcas" en configuración admin
- CRUD: agregar, editar nombre, activar/desactivar
- Solo visible para rol admin

### Formulario de nueva orden (NuevoIngresoModal)
- Reemplazar input texto libre `marca` por selector/dropdown
- Muestra solo marcas activas, ordenadas alfabéticamente
- Opción "Otra" al final habilita input texto libre para casos excepcionales

### Carga inicial
- Migración con lista vacía — el admin carga las marcas desde el panel

---

## Orden de implementación

1. RUT/cédula (menor dependencia, afecta tabla `clientes`)
2. Doble presupuesto (afecta tabla `ordenes` y vista)
3. Menú de marcas (nueva tabla + panel admin)

## Archivos afectados (estimado)

- `supabase/` — 3 migraciones nuevas (020, 021, 022)
- `lib/data.js` — búsqueda por documento, CRUD marcas, presupuesto taller
- `lib/constants.js` — posibles ajustes
- `components/NuevoIngresoModal.js` — campo documento, selector marcas, presupuesto taller
- `app/ordenes/[id]/page.js` — mostrar doble presupuesto
- `app/seguimiento/page.js` — mostrar documento, ocultar presupuesto taller
- `app/admin/` — nueva página de gestión de marcas

# Vista de Cadete — Spec de Diseño

## Resumen

Nuevo rol `cadete` con vista exclusiva y restringida. El cadete solo ve resúmenes de tareas asignados por admin/empleada, sin acceso a órdenes ni al resto del sistema. Los resúmenes contienen ítems de dos tipos: traslados existentes (con datos del objeto y taller) y tareas ad-hoc (texto libre). El cadete puede marcar ítems como completados localmente (localStorage) para su propia gestión, pero esto no actualiza la BD — la verificación la hace la empleada o admin.

---

## Base de datos

### Modificación: rol `cadete` en `usuarios`

Agregar `'cadete'` al CHECK constraint de la columna `role`:

```sql
ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_role_check;
ALTER TABLE usuarios ADD CONSTRAINT usuarios_role_check
  CHECK (role IN ('admin', 'employee', 'cadete'));
```

El cadete tiene `sucursal_id` asignado (la sucursal base desde donde opera).

### Tabla `resumenes_cadete`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | UUID | PK, default gen_random_uuid() |
| cadete_id | UUID | FK → usuarios, NOT NULL |
| creado_por | UUID | FK → usuarios, NOT NULL |
| nombre | TEXT | Nullable — etiqueta opcional (ej: "Ronda lunes tarde") |
| activo | BOOLEAN | NOT NULL, default true |
| created_at | TIMESTAMPTZ | NOT NULL, default now() |
| updated_at | TIMESTAMPTZ | NOT NULL, default now() |

Índice en `cadete_id` + `activo` para la consulta principal del cadete.

### Tabla `items_resumen_cadete`

| Columna | Tipo | Restricciones |
|---------|------|---------------|
| id | UUID | PK, default gen_random_uuid() |
| resumen_id | UUID | FK → resumenes_cadete ON DELETE CASCADE, NOT NULL |
| tipo | TEXT | CHECK ('traslado', 'ad_hoc'), NOT NULL |
| traslado_id | UUID | FK → traslados, nullable — solo cuando tipo = 'traslado' |
| descripcion | TEXT | Nullable — solo cuando tipo = 'ad_hoc' |
| orden | INTEGER | NOT NULL, default 0 |
| created_at | TIMESTAMPTZ | NOT NULL, default now() |

CHECK constraint: `(tipo = 'traslado' AND traslado_id IS NOT NULL) OR (tipo = 'ad_hoc' AND descripcion IS NOT NULL)`.

### Vista `v_items_resumen_cadete`

JOIN de `items_resumen_cadete` con traslados → ordenes → sucursales/talleres para exponer:

- `item_id`, `resumen_id`, `tipo`, `orden`
- Para traslados: `tipo_articulo`, `marca`, `modelo`, `sucursal_origen_nombre`, `sucursal_destino_nombre`, `traslado_tipo` (ida/retorno)
- Para ad-hoc: `descripcion`

Sin datos de cliente en ningún caso.

### RLS

- Cadete: SELECT en `resumenes_cadete` y `v_items_resumen_cadete` donde `cadete_id = auth.uid()`
- Admin: full access en ambas tablas
- Employee: full access en ambas tablas (filtrado por sucursal se hace a nivel de aplicación al listar traslados disponibles)

---

## Autenticación y rutas

### Middleware (`middleware.js`)

- Ruta `/cadete` y `/api/cadete/*`: requieren auth, solo accesible por `role === 'cadete'`
- Si un cadete intenta acceder a `/` o `/admin/*`: redirigir a `/cadete`
- Si un admin/employee intenta acceder a `/cadete`: redirigir a `/`
- Login (`/login`): sin cambios, después del login el redirect depende del rol:
  - `admin` / `employee` → `/`
  - `cadete` → `/cadete`

### Auth (`auth.js`)

No requiere cambios estructurales. Ya expone `role` en el JWT. Solo se agrega `'cadete'` como valor válido del rol.

### Rutas nuevas

| Ruta | Método | Acceso | Descripción |
|------|--------|--------|-------------|
| `/cadete` | Page | cadete | Vista principal del cadete |
| `/api/cadete/resumenes` | GET | cadete | Resúmenes activos del cadete logueado con sus ítems |
| `/api/resumenes-cadete` | GET | admin, employee | Lista todos los resúmenes |
| `/api/resumenes-cadete` | POST | admin, employee | Crear resumen nuevo |
| `/api/resumenes-cadete` | DELETE | admin, employee | Eliminar resumen |
| `/api/resumenes-cadete/[id]/items` | GET | admin, employee | Ítems de un resumen |
| `/api/resumenes-cadete/[id]/items` | POST | admin, employee | Agregar ítem |
| `/api/resumenes-cadete/[id]/items` | DELETE | admin, employee | Eliminar ítem |
| `/api/resumenes-cadete/[id]` | PATCH | admin, employee | Actualizar resumen (nombre, activo) |

---

## Vista del cadete (`/cadete`)

### Layout

Pantalla única, sin navegación a otras secciones. Diseño mobile-first, responsive para celular, iPad y desktop.

**Header:**
- Nombre del cadete (de la sesión)
- Botón cerrar sesión

**Contenido:**
- Lista de resúmenes activos asignados al cadete
- Cada resumen tiene su nombre como encabezado/separador
- Dentro de cada resumen, lista ordenada de ítems:
  - **Traslado:** ícono de acción (↑ retirar / ↓ dejar según dirección del traslado) + tipo de artículo + marca/modelo + sucursal/taller origen → destino
  - **Ad-hoc:** ícono genérico (📋) + texto de la descripción
- **Checkbox local** al lado de cada ítem:
  - Se guarda en `localStorage` del navegador, clave basada en `item_id`
  - No toca la BD, no se sincroniza
  - Persiste en el dispositivo entre sesiones
  - Se limpian los checks de un resumen cuando este se elimina o desactiva

**Estado vacío:** mensaje "No tenés tareas asignadas" cuando no hay resúmenes activos.

### Responsividad

- **Celular (< 640px):** Cards apiladas verticalmente, botones touch-friendly (min 44px), texto conciso
- **iPad (640-1024px):** Mismo layout lista pero con más espacio horizontal, info completa sin truncar
- **Desktop (> 1024px):** Lista centrada con max-width, mismo formato

Breakpoints de Tailwind: `sm`, `md`, `lg`.

---

## Panel de gestión (admin/empleada)

### Acceso

Nuevo botón "Resumen cadete" en el dashboard principal. Abre un modal/panel de gestión.

### Funcionalidades

**Lista de resúmenes:**
- Muestra: cadete asignado, nombre del resumen, cantidad de ítems, estado (activo/inactivo), fecha de creación
- Acciones por resumen: activar/desactivar, eliminar (con confirmación)

**Crear resumen:**
- Selector de cadete (dropdown con usuarios de rol `cadete`)
- Nombre/etiqueta (opcional)
- Botón "Crear"

**Gestión de ítems dentro de un resumen:**
- **Agregar traslado:** selector que muestra traslados pendientes (`pendiente` o `en_transito`). Para employee, filtrado por su sucursal. Muestra datos del objeto para identificación. La empleada selecciona cuáles agregar.
- **Agregar tarea ad-hoc:** campo de texto libre + botón "Agregar"
- **Eliminar ítem:** botón con confirmación en cada ítem
- **Reordenar:** flechas arriba/abajo para cambiar el orden de los ítems

### Responsividad

Mismo enfoque responsive que la vista del cadete. En desktop el modal puede ser más amplio; en celular/iPad ocupa pantalla completa.

---

## Archivos a crear/modificar

### Nuevos
- `supabase/025_vista_cadete.sql` — migración con tablas, vista, RLS
- `app/cadete/page.js` — vista del cadete
- `app/api/cadete/resumenes/route.js` — API del cadete
- `app/api/resumenes-cadete/route.js` — CRUD resúmenes (admin/employee)
- `app/api/resumenes-cadete/[id]/items/route.js` — CRUD ítems (admin/employee)
- `app/api/resumenes-cadete/[id]/route.js` — PATCH resumen (admin/employee)
- `components/ResumenCadetePanel.js` — panel de gestión en dashboard
- `lib/cadete.js` — funciones de datos para resúmenes e ítems

### Modificados
- `middleware.js` — agregar reglas de ruta para cadete
- `auth.js` — redirect post-login según rol
- `app/page.js` — botón para abrir panel de gestión de resúmenes
- `app/api/admin/usuarios/route.js` — soportar creación de usuarios cadete
- `app/admin/usuarios/page.js` — mostrar rol cadete en la UI de gestión de usuarios

---

## Fuera de alcance

- Notificaciones push al cadete cuando se le asigna un resumen
- Historial de resúmenes completados
- Geolocalización o tracking del cadete
- Marcar ítems como completados en la BD (solo localStorage)

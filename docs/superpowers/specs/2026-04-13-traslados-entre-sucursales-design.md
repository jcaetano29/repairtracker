# Traslados Entre Sucursales — Diseno

**Fecha:** 2026-04-13
**Estado:** Aprobado

---

## Contexto

El cliente tiene 2 sucursales: Punta Carretas y Nuevo Centro. Las reparaciones se realizan exclusivamente en Punta Carretas (o en talleres externos coordinados desde ahi). Los clientes pueden dejar objetos en cualquiera de las dos sucursales. Cuando un objeto se recibe en Nuevo Centro, debe ser trasladado fisicamente a Punta Carretas antes de poder avanzar en el flujo de reparacion. Al finalizar, el cliente elige donde retirar (por defecto donde dejo el objeto), lo que puede implicar un traslado de retorno.

Hoy el sistema tiene soporte multi-sucursal (`sucursal_id` en ordenes), pero no distingue entre sucursal de recepcion, ubicacion actual y sucursal de retiro, ni trackea traslados fisicos.

---

## Reglas de negocio

| Regla | Detalle |
|-------|---------|
| Recepcion | En cualquier sucursal |
| Reparacion | Centralizada en Punta Carretas (o taller externo desde ahi) |
| Traslado de ida | Automatico cuando la recepcion no es en Punta Carretas |
| Traslado de retorno | Automatico cuando la orden llega a LISTO_PARA_RETIRO y el objeto no esta en la sucursal de retiro |
| Retiro por defecto | Misma sucursal donde se dejo el objeto |
| Cambio de retiro | El cliente puede pedir retirar en otra sucursal (campo editable) |
| Registro de traslado | Empleado origen marca despacho, empleado destino confirma recepcion |
| Cadete | No tiene acceso al sistema |
| Bloqueo de avance | No se puede avanzar mas alla de INGRESADO si hay traslado de ida pendiente/en transito |
| Bloqueo de entrega | No se puede marcar ENTREGADO si hay traslado de retorno pendiente/en transito |
| Seguimiento publico | No muestra traslados (solo informacion interna) |
| Notificaciones | No se disparan por traslados en esta iteracion |

---

## Modelo de datos

### Nuevas columnas en `ordenes`

```sql
-- Donde el cliente dejo el objeto (inmutable, se llena al crear)
ALTER TABLE ordenes ADD COLUMN sucursal_recepcion_id UUID REFERENCES sucursales(id);

-- Donde el cliente retira (default = sucursal_recepcion_id, editable)
ALTER TABLE ordenes ADD COLUMN sucursal_retiro_id UUID REFERENCES sucursales(id);
```

El `sucursal_id` existente pasa a representar la **ubicacion fisica actual** de la orden. Se actualiza automaticamente al completar un traslado.

### Nueva tabla `traslados`

```sql
CREATE TABLE traslados (
  id                UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  orden_id          UUID REFERENCES ordenes(id) ON DELETE CASCADE NOT NULL,
  sucursal_origen   UUID REFERENCES sucursales(id) NOT NULL,
  sucursal_destino  UUID REFERENCES sucursales(id) NOT NULL,
  tipo              TEXT NOT NULL CHECK (tipo IN ('ida', 'retorno')),
  estado            TEXT NOT NULL DEFAULT 'pendiente'
                    CHECK (estado IN ('pendiente', 'en_transito', 'recibido')),
  creado_por        UUID REFERENCES usuarios(id),
  recibido_por      UUID REFERENCES usuarios(id),
  fecha_salida      TIMESTAMPTZ,
  fecha_recepcion   TIMESTAMPTZ,
  created_at        TIMESTAMPTZ DEFAULT NOW(),
  updated_at        TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_traslados_orden ON traslados(orden_id);
CREATE INDEX idx_traslados_estado ON traslados(estado);
CREATE INDEX idx_traslados_destino_estado ON traslados(sucursal_destino, estado);
```

**Tipos:**
- `ida`: sucursal de recepcion -> Punta Carretas (antes de reparar)
- `retorno`: Punta Carretas -> sucursal de retiro (despues de reparar, solo si difiere de ubicacion actual)

**Estados del traslado:**
- `pendiente`: creado, esperando despacho
- `en_transito`: despachado, esperando confirmacion de llegada
- `recibido`: confirmado en destino, `ordenes.sucursal_id` actualizado

---

## Flujos operativos

### Caso 1 — Recepcion en Punta Carretas

Sin cambios en el flujo. No se crea traslado de ida.
- `sucursal_recepcion_id = Punta Carretas`
- `sucursal_retiro_id = Punta Carretas`
- `sucursal_id = Punta Carretas`

Si el cliente pide retirar en Nuevo Centro, al llegar a `LISTO_PARA_RETIRO` se crea traslado de retorno.

### Caso 2 — Recepcion en Nuevo Centro

1. Empleado de Nuevo Centro crea la orden
   - `sucursal_recepcion_id = Nuevo Centro`
   - `sucursal_retiro_id = Nuevo Centro` (default)
   - `sucursal_id = Nuevo Centro`
2. Se crea automaticamente un traslado de ida (`pendiente`)
   - origen: Nuevo Centro, destino: Punta Carretas
3. Empleado de Nuevo Centro marca "despachar" -> traslado pasa a `en_transito`, se registra `fecha_salida`
4. Empleado de Punta Carretas marca "recibir" -> traslado pasa a `recibido`, se registra `fecha_recepcion`, `ordenes.sucursal_id` se actualiza a Punta Carretas
5. Flujo normal de reparacion desde ahi

### Caso 3 — Retorno a otra sucursal

Cuando la orden llega a `LISTO_PARA_RETIRO` y `sucursal_retiro_id != sucursal_id`:

1. Se crea automaticamente un traslado de retorno (`pendiente`)
   - origen: ubicacion actual (Punta Carretas), destino: sucursal de retiro
2. Empleado de Punta Carretas marca "despachar" -> `en_transito`
3. Empleado de sucursal destino marca "recibir" -> `recibido`, `ordenes.sucursal_id` se actualiza
4. La orden esta efectivamente lista para entrega

### Bloqueos de avance (validacion en API)

La logica de creacion automatica de traslados y los bloqueos de avance se implementan en la capa de aplicacion (API routes), no en triggers de base de datos.

| Condicion | Bloqueo |
|-----------|---------|
| Traslado de ida `pendiente` o `en_transito` | Orden no puede avanzar mas alla de `INGRESADO` |
| Traslado de retorno `pendiente` o `en_transito` | Orden no se puede marcar como `ENTREGADO` |

---

## Interfaz de usuario

### Dashboard — Badge de traslado

Las ordenes con traslados activos (no `recibido`) muestran un badge junto al estado actual:

- **"Pendiente despacho"** — traslado creado, esperando que lo despachen
- **"En transito"** — despachado, esperando confirmacion de llegada

El badge es visual (chip/tag), no reemplaza el estado de la orden.

### Dashboard — Seccion/Pestana "Traslados"

Seccion dentro del dashboard que muestra traslados activos filtrados segun la sucursal del empleado:

- **Empleado de Nuevo Centro**: traslados pendientes de despacho desde su sucursal -> boton "Despachar"
- **Empleado de Punta Carretas**: traslados en transito hacia su sucursal -> boton "Recibir"
- **Dueno**: todos los traslados activos con ambas acciones disponibles

Cada fila muestra: numero de orden, cliente, tipo (ida/retorno), estado, sucursal origen -> destino, tiempo transcurrido.

### Detalle de orden — Seccion "Traslados"

En el modal de detalle de la orden, nueva seccion que muestra el historial de traslados:

- Tipo (ida/retorno)
- Estado
- Fechas (creacion, salida, recepcion)
- Quien despacho / quien recibio

### Detalle de orden — Sucursal de retiro

Campo `sucursal_retiro_id` visible como dropdown editable en el detalle de la orden. Permite cambiar donde el cliente quiere retirar.

### Nuevo ingreso

Sin cambios en el formulario. Al crear la orden:
- `sucursal_recepcion_id` y `sucursal_retiro_id` se asignan automaticamente segun la sucursal del empleado
- Si la sucursal no es Punta Carretas, se crea el traslado de ida automaticamente

---

## Migracion de datos

### Ordenes existentes

Las ordenes existentes se actualizan:
- `sucursal_recepcion_id = sucursal_id` (asumimos que fueron recibidas donde estan)
- `sucursal_retiro_id = sucursal_id` (asumimos retiro en la misma sucursal)

No se crean traslados retroactivos.

### Vista `v_ordenes_dashboard`

Se actualiza para incluir `sucursal_recepcion_id`, `sucursal_retiro_id`, y un flag `tiene_traslado_activo` con el estado del traslado activo si existe.

---

## Seguimiento publico

Sin cambios. La pagina `/seguimiento/[token]` no muestra informacion de traslados. El cliente ve los estados normales del flujo.

---

## Alcance explicito

**Incluido:**
- Tabla `traslados` con estados pendiente/en_transito/recibido
- Columnas `sucursal_recepcion_id` y `sucursal_retiro_id` en ordenes
- Creacion automatica de traslado de ida al ingresar orden en sucursal que no es Punta Carretas
- Creacion automatica de traslado de retorno cuando LISTO_PARA_RETIRO y el objeto no esta en la sucursal de retiro
- Bloqueo de avance de estado si hay traslado pendiente/en transito
- Vista de traslados activos en dashboard con acciones despachar/recibir
- Badge de traslado en la tabla de ordenes
- Historial de traslados en detalle de orden
- Campo editable de sucursal de retiro
- Migracion de ordenes existentes

**Excluido:**
- Notificaciones al cliente sobre traslados
- Visibilidad de traslados en seguimiento publico
- Acceso del cadete al sistema
- Reportes/metricas de traslados (tiempos promedio, etc.)
- Mas de 2 sucursales (el modelo lo soporta, pero el diseno no contempla gestion de N sucursales)

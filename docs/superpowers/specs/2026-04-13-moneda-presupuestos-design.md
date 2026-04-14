# Moneda en presupuestos (UYU / USD)

**Fecha:** 2026-04-13
**Estado:** Diseño aprobado

## Contexto

Hoy `ordenes.monto_presupuesto` es un `DECIMAL(10,2)` sin información de moneda. Los reportes asumen UYU en todas las métricas monetarias ("Valor presupuestado", "Ingresos históricos", "Ticket promedio"). Se necesita permitir cargar presupuestos en UYU o USD y que los reportes muestren ambos totales por separado, sin conversión de tipo de cambio.

## Objetivos

- Permitir elegir moneda (UYU/USD) al cargar/editar el presupuesto de una orden.
- Persistir la moneda junto al monto.
- Mostrar reportes monetarios desdoblados por moneda (totales separados, sin conversión).
- No romper órdenes históricas: backfill a UYU.

## No-objetivos

- Conversión por tipo de cambio.
- Múltiples presupuestos o historial de revisiones de monto.
- Monedas adicionales (más allá de UYU/USD) — el diseño las admite, pero no se implementan ahora.

## Data model

Migración nueva: `supabase/014_moneda_presupuesto.sql`

```sql
ALTER TABLE ordenes
  ADD COLUMN moneda TEXT NOT NULL DEFAULT 'UYU'
    CHECK (moneda IN ('UYU','USD'));
```

El `DEFAULT 'UYU'` actúa como backfill implícito: todas las filas existentes quedan como UYU.

**Vista `ordenes_full`:** incluir `o.moneda` en el `SELECT`. La vista se redefine en varios archivos (`001_schema.sql`, `004_state_simplification.sql`, `008_sucursales.sql`, `013_plantillas_email.sql`); la migración `014` la recrea agregando la columna.

## UI — carga y edición

- En el modal donde se ingresa el monto de presupuesto (`DetalleOrdenModal.js` y puntos relacionados), agregar un selector compacto **UYU / USD** junto al input de monto.
- Default: `UYU`.
- El input muestra prefijo visual según moneda (`$U` / `US$`).
- El valor se envía en el payload de actualización junto con `monto_presupuesto`.

## UI — visualización

- Donde hoy se renderiza `${monto}` (detalle de orden, listados, seguimiento público), mostrar según moneda: `$U 1.234` o `US$ 1.234`.

## Notificaciones

- Agregar la variable `{{moneda}}` al contexto disponible para plantillas WhatsApp y email.
- Actualizar las plantillas seed (`012_plantillas_whatsapp.sql`, `013_plantillas_email.sql`) para usar `{{moneda}} {{monto}}` en lugar de `${{monto}}`.
- El dispatcher (`app/api/notify/route.js`) debe pasar la moneda al resolver las variables.

## Reportes

**`lib/data.js` → `getReportesStats`:**

Cambiar las métricas monetarias afectadas para devolver objetos por moneda:

```js
ingresosMes:        { UYU: number, USD: number }
ingresosHistoricos: { UYU: number, USD: number }
ticketPromedio:     { UYU: number|null, USD: number|null }
```

Las métricas no monetarias (conteos, `porEstado`, `porTipo`, tasa de rechazo, promedio de días) no cambian.

**`app/admin/reportes/page.js`:**

- **"Valor presupuestado este mes"** e **"Ingresos históricos"**: cada card muestra dos líneas apiladas (UYU y USD). Si una moneda es 0, se oculta esa línea.
- **"Ticket promedio"**: dos líneas UYU/USD (tipografía secundaria para caber).
- Subtítulos fijos "UYU —" se remueven; la moneda es explícita en el valor.

## Testing

- Actualizar fixtures de tests existentes de `getReportesStats` (si los hay) con órdenes en USD; verificar que los totales quedan separados.
- Test manual: cargar presupuesto en USD → persiste, se muestra con prefijo correcto, aparece en el bucket USD del reporte.
- Test manual: notificación WhatsApp/email renderiza la moneda correcta.
- Validar migración en dev: filas existentes quedan con `moneda='UYU'`.

## Archivos impactados (resumen)

- `supabase/014_moneda_presupuesto.sql` (nuevo)
- `supabase/012_plantillas_whatsapp.sql`, `013_plantillas_email.sql` (seeds de plantillas)
- `components/DetalleOrdenModal.js` (carga/edición)
- `components/NuevoIngresoModal.js` (si permite ingresar monto)
- `lib/data.js` (agregaciones por moneda)
- `app/admin/reportes/page.js` (render)
- `app/page.js`, `app/seguimiento/[token]/page.js` (render monto)
- `app/api/notify/route.js` (variable `{{moneda}}`)

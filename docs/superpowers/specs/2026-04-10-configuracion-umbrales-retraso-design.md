# Configuración de Umbrales de Retraso desde Admin

**Date:** 2026-04-10  
**Status:** APPROVED  
**Author:** Claude Haiku 4.5

## Objetivo

Permitir que los dueños configuren dinámicamente los umbrales de retraso (leve y grave) para cada estado de orden desde un panel administrativo, en lugar de tenerlos hardcodeados en `lib/constants.js`.

## Problema

Actualmente los umbrales de retraso están hardcodeados en una constante JavaScript. Para cambiarlos se requiere editar código y hacer deploy. Esto es inflexible para cambios operacionales rápidos.

## Solución

Migrar umbrales a base de datos con tabla `configuracion` genérica, crear página admin para editarlos, y cargar dinámicamente en el dashboard.

## Arquitectura

### 1. Base de Datos

**Tabla: `configuracion`**

Almacena todos los parámetros configurables de la app (no solo umbrales).

```sql
CREATE TABLE configuracion (
  id BIGINT PRIMARY KEY GENERATED ALWAYS AS IDENTITY,
  clave TEXT UNIQUE NOT NULL,
  valor JSONB NOT NULL,
  descripcion TEXT,
  actualizado_en TIMESTAMP DEFAULT NOW(),
  actualizado_por UUID REFERENCES auth.users(id)
);
```

**Registros iniciales (8 filas, una por estado):**

| clave | valor | descripcion |
|-------|-------|-------------|
| `umbral_ingresado` | `{"leve": 2, "grave": 5}` | Retraso en estado Ingresado |
| `umbral_en_taller` | `{"leve": 7, "grave": 14}` | Retraso en estado En Taller |
| `umbral_esperando_aprobacion` | `{"leve": 1, "grave": 3}` | Retraso esperando aprobación |
| `umbral_rechazado` | `{"leve": 0, "grave": 0}` | (no aplica retraso) |
| `umbral_en_reparacion` | `{"leve": 3, "grave": 7}` | Retraso en reparación |
| `umbral_listo_en_taller` | `{"leve": 1, "grave": 3}` | Retraso cuando listo |
| `umbral_listo_para_retiro` | `{"leve": 3, "grave": 7}` | Retraso en retiro |
| `umbral_entregado` | `{"leve": 0, "grave": 0}` | (no aplica retraso) |

**RLS Policy:**
- Solo usuarios con `role = 'dueno'` pueden leer y escribir
- Otros roles no ven esta tabla

### 2. API Endpoints

**`GET /api/configuracion`**
- Lee todos los parámetros configurables
- Respuesta: `{ configuracion: { [clave]: valor } }`
- No requiere autenticación (datos no sensibles, de lectura)

**`POST /api/configuracion`**
- Actualiza un parámetro individual
- Body: `{ clave: string, valor: object }`
- Requiere: `session.user.role === 'dueno'`
- Retorna: el registro actualizado
- Validaciones:
  - `valor.leve` y `valor.grave` son números positivos
  - `valor.leve < valor.grave`
  - `clave` existe en tabla

### 3. Frontend

#### Página Admin: `/admin/configuracion`

**Acceso:** Solo dueños (`role === 'dueno'`)

**Componente:**
- Tabla con 8 filas, una por estado
- Columnas:
  - Estado (label del ESTADOS config)
  - Umbral Leve (input number)
  - Umbral Grave (input number)
  - Acción (botón "Guardar")
- Botón "Guardar" por fila (no formulario global)
- Toast success/error después de guardar
- Estado loading mientras se guarda

**Flujo:**
1. Cargar configuración al montar componente
2. Usuario edita valores en inputs
3. Hace click en "Guardar"
4. POST a `/api/configuracion`
5. Mostrar resultado y recargar tabla

#### Dashboard: `app/page.js`

**Cambios en `loadData()`:**
- Agregar llamada a `getConfiguracion()`
- Guardar umbrales en estado de React
- Pasar como parámetro a funciones que lo necesitan

**Cambios en llamadas a `getNivelRetraso()`:**
- Signature: `getNivelRetraso(estado, diasEnEstado, umbrales)`
- `umbrales` = objeto con estructura: `{ [estado]: { leve, grave } }`

### 4. Cambios en Constants

**Antes:**
```javascript
export const UMBRALES_RETRASO = {
  INGRESADO: { leve: 2, grave: 5 },
  // ...
};
```

**Después:**
- Eliminar `UMBRALES_RETRASO` completamente
- Mantener `ESTADOS` y `TRANSICIONES` (no son datos configurables)
- Actualizar `getNivelRetraso(estado, diasEnEstado, umbrales)` para recibir umbrales como parámetro

### 5. Data Flow

```
Dashboard carga
  ↓
loadData() ejecuta
  ├─ getOrdenes()
  ├─ getStats()
  └─ getConfiguracion() ← NEW
       ↓
API GET /configuracion
       ↓
Supabase lee tabla
       ↓
Renderiza kanban con umbrales dinámicos
```

## Testing

**Unitario:**
- `getNivelRetraso(estado, diasEnEstado, umbrales)` con diferentes valores

**Integración API:**
- `GET /api/configuracion` retorna estructura correcta
- `POST /api/configuracion` requiere `role === 'dueno'`
- `POST /api/configuracion` rechaza valores inválidos

**UI:**
- Admin page carga y muestra valores
- Cambios se guardan y persisten
- Toast muestra errores correctamente

## Security

- **RLS:** Tabla protegida, solo dueños lectura/escritura
- **API:** Validación `role === 'dueno'` en POST
- **Validación:** Números positivos, lógica leve < grave
- **No secrets:** Configuración es datos operacionales, no sensibles

## Notas de Implementación

- Como todas las órdenes son de test, la migration es segura (sin datos reales afectados)
- Usar MCP Supabase para ejecutar queries directamente
- Los valores fallback están en constants actuales, usar como guía para valores iniciales

## Scope

Este feature cubre SOLO la configuración de umbrales de retraso por estado. No incluye:
- Configuración por taller o sucursal
- Otros parámetros configurables (futuros)
- Historial de cambios de configuración

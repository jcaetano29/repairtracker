# Diseño: Selector de Sucursal en Nuevo Ingreso

**Fecha:** 2026-04-09  
**Estado:** Aprobado  
**Archivo afectado:** `components/NuevoIngresoModal.js`

---

## Resumen

Al crear una nueva orden de ingreso, el usuario debe poder seleccionar a qué sucursal pertenece la orden. Las opciones disponibles provienen de las sucursales activas cargadas por el admin. El campo es obligatorio.

---

## Comportamiento por rol

| Rol | Comportamiento |
|-----|----------------|
| **Dueño** | Dropdown editable con todas las sucursales activas. Sin valor por defecto — obliga a seleccionar antes de poder registrar. |
| **Empleado** | Campo de solo lectura que muestra el nombre de su sucursal asignada. El `sucursal_id` se toma automáticamente de `session.user.sucursal_id`. No puede cambiarlo. |

---

## Cambios en `components/NuevoIngresoModal.js`

### 1. Estado inicial
Agregar `sucursal_id: ""` al objeto `form`:

```js
const [form, setForm] = useState({
  // ...campos existentes...
  sucursal_id: "",
});
```

### 2. Carga de sucursales activas
Nuevo `useEffect` que llama `getSucursales()` (ya existe en `lib/data.js`) y filtra solo las activas:

```js
const [sucursales, setSucursales] = useState([]);

useEffect(() => {
  getSucursales()
    .then((data) => setSucursales(data.filter((s) => s.activo)))
    .catch(() => {});
}, []);
```

### 3. Inicialización para empleados
En el mismo `useEffect` (o en uno separado), si el usuario es empleado, pre-setear el `sucursal_id` desde la sesión:

```js
useEffect(() => {
  if (session?.user?.role !== "dueno" && session?.user?.sucursal_id) {
    setForm((f) => ({ ...f, sucursal_id: session.user.sucursal_id }));
  }
}, [session]);
```

### 4. Campo en el formulario (inicio del Paso 2)
Colocar antes del selector de tipo de artículo:

**Para dueño:**
```jsx
<select
  value={form.sucursal_id}
  onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })}
  required
>
  <option value="">Seleccioná una sucursal *</option>
  {sucursales.map((s) => (
    <option key={s.id} value={s.id}>{s.nombre}</option>
  ))}
</select>
```

**Para empleado:** badge/texto de solo lectura mostrando el nombre de la sucursal asignada.

### 5. Validación en `handleSubmit`
Agregar antes de las validaciones existentes:

```js
if (!form.sucursal_id) {
  setError("Seleccioná una sucursal.");
  return;
}
```

Reemplazar la línea actual:
```js
sucursal_id: session?.user?.sucursal_id,
```
por:
```js
sucursal_id: form.sucursal_id,
```

### 6. Botón deshabilitado
Actualizar la condición `disabled` del botón "Registrar Ingreso":
```jsx
disabled={!form.problema_reportado || !form.sucursal_id || loading}
```

---

## Lo que NO cambia

- `lib/data.js` — `getSucursales()` y `crearOrden()` ya existen y son compatibles
- Base de datos — la columna `sucursal_id` ya existe en `ordenes`
- Componentes padre — no se modifica ninguna página que use `NuevoIngresoModal`
- API routes — sin cambios

---

## Fuente de datos

- Función existente: `getSucursales()` en `lib/data.js`
- Retorna: `{ id, nombre, activo, created_at }`
- Filtro aplicado en cliente: `activo === true`

---

## Casos borde

| Caso | Comportamiento |
|------|---------------|
| No hay sucursales activas | El dropdown aparece vacío. No se puede registrar la orden. |
| Empleado sin `sucursal_id` asignado | El campo queda vacío, el dueño deberá asignarle una sucursal al empleado antes de que pueda operar. |
| Error al cargar sucursales | Se ignora silenciosamente (`catch(() => {})`), el dropdown queda vacío. |

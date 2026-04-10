# Selector de Sucursal en Nuevo Ingreso — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Agregar un selector de sucursal obligatorio al modal de nuevo ingreso, con dropdown editable para dueños y campo de solo lectura para empleados.

**Architecture:** Cambio contenido en un único componente (`NuevoIngresoModal.js`). Se carga la lista de sucursales activas via `getSucursales()` (ya existe en `lib/data.js`) en un `useEffect`. El rol del usuario (`session.user.role`) determina si se muestra un dropdown o un campo de solo lectura.

**Tech Stack:** Next.js 14, React 18, NextAuth.js (`useSession`), Supabase (`getSucursales` en `lib/data.js`), Tailwind CSS

---

## File Map

| Acción | Archivo |
|--------|---------|
| Modificar | `components/NuevoIngresoModal.js` |

---

### Task 1: Agregar estado y carga de sucursales

**Files:**
- Modify: `components/NuevoIngresoModal.js`

- [ ] **Step 1: Agregar `sucursal_id` al estado del form**

En `NuevoIngresoModal.js`, el `useState` del form está en la línea ~16. Agregar `sucursal_id: ""`:

```js
const [form, setForm] = useState({
  tipo_articulo: "Reloj",
  marca: "",
  modelo: "",
  problema_reportado: "",
  notas_internas: "",
  nombre_articulo: "",
  monto_presupuesto: "",
  tipo_servicio_id: "",
  sucursal_id: "",
});
```

- [ ] **Step 2: Agregar estado para la lista de sucursales**

Después del `useState` de `tiposServicio` (línea ~26), agregar:

```js
const [sucursales, setSucursales] = useState([]);
```

- [ ] **Step 3: Agregar `getSucursales` al import de `lib/data`**

Modificar la línea de import (línea ~6):

```js
import { buscarClientes, crearCliente, crearOrden, getTiposServicio, getSucursales } from "@/lib/data";
```

- [ ] **Step 4: Agregar useEffect para cargar sucursales activas**

Después del `useEffect` que carga `getTiposServicio` (línea ~29), agregar:

```js
useEffect(() => {
  getSucursales()
    .then((data) => setSucursales(data.filter((s) => s.activo)))
    .catch(() => {});
}, []);
```

- [ ] **Step 5: Agregar useEffect para pre-setear sucursal del empleado**

Después del paso anterior, agregar:

```js
useEffect(() => {
  if (session?.user?.role !== "dueno" && session?.user?.sucursal_id) {
    setForm((f) => ({ ...f, sucursal_id: session.user.sucursal_id }));
  }
}, [session]);
```

- [ ] **Step 6: Verificar que el archivo compila sin errores**

```bash
cd /c/Users/Max/Desktop/PROJECTS/repairtracker && npm run build 2>&1 | tail -20
```

Esperado: sin errores de compilación (puede haber warnings, está bien).

- [ ] **Step 7: Commit**

```bash
git add components/NuevoIngresoModal.js
git commit -m "feat: add sucursal state and load active branches in NuevoIngresoModal"
```

---

### Task 2: Agregar el campo de sucursal en el formulario (Paso 2)

**Files:**
- Modify: `components/NuevoIngresoModal.js`

- [ ] **Step 1: Agregar el campo de sucursal al inicio del Paso 2**

En el JSX del Paso 2 (buscar el comentario `{/* STEP 2: Datos del artículo */}`, línea ~233), después del botón "← Cambiar cliente" y el bloque del cliente seleccionado, y **antes** del selector de tipo de artículo, insertar:

```jsx
{/* Sucursal */}
<div>
  <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
    Sucursal *
  </label>
  {session?.user?.role === "dueno" ? (
    <select
      value={form.sucursal_id}
      onChange={(e) => setForm({ ...form, sucursal_id: e.target.value })}
      className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
    >
      <option value="">Seleccioná una sucursal</option>
      {sucursales.map((s) => (
        <option key={s.id} value={s.id}>
          {s.nombre}
        </option>
      ))}
    </select>
  ) : (
    <div className="px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-700">
      {sucursales.find((s) => s.id === form.sucursal_id)?.nombre ?? "Sin sucursal asignada"}
    </div>
  )}
</div>
```

- [ ] **Step 2: Verificar que el archivo compila sin errores**

```bash
cd /c/Users/Max/Desktop/PROJECTS/repairtracker && npm run build 2>&1 | tail -20
```

Esperado: sin errores.

- [ ] **Step 3: Commit**

```bash
git add components/NuevoIngresoModal.js
git commit -m "feat: show sucursal dropdown for dueno and read-only field for empleado"
```

---

### Task 3: Validar sucursal_id y actualizar handleSubmit

**Files:**
- Modify: `components/NuevoIngresoModal.js`

- [ ] **Step 1: Agregar validación de sucursal_id en handleSubmit**

En `handleSubmit` (línea ~71), después de la validación de `nombre_articulo` y **antes** de `setLoading(true)`, agregar:

```js
if (!form.sucursal_id) {
  setError("Seleccioná una sucursal.");
  return;
}
```

- [ ] **Step 2: Reemplazar sucursal_id hardcodeado en el objeto de crearOrden**

En el mismo `handleSubmit`, reemplazar:

```js
sucursal_id: session?.user?.sucursal_id,
```

por:

```js
sucursal_id: form.sucursal_id,
```

- [ ] **Step 3: Actualizar la condición disabled del botón**

Buscar el botón "Registrar Ingreso" al final del Paso 2 (línea ~373). Cambiar:

```jsx
disabled={!form.problema_reportado || loading}
```

por:

```jsx
disabled={!form.problema_reportado || !form.sucursal_id || loading}
```

- [ ] **Step 4: Verificar que el archivo compila sin errores**

```bash
cd /c/Users/Max/Desktop/PROJECTS/repairtracker && npm run build 2>&1 | tail -20
```

Esperado: sin errores.

- [ ] **Step 5: Correr los tests existentes para verificar que no se rompió nada**

```bash
cd /c/Users/Max/Desktop/PROJECTS/repairtracker && npm test
```

Esperado: todos los tests en `__tests__/` pasan (auth, constants, cron, notifications).

- [ ] **Step 6: Commit**

```bash
git add components/NuevoIngresoModal.js
git commit -m "feat: validate and submit sucursal_id in nuevo ingreso form"
```

---

## Verificación Manual

Después de los 3 tasks, verificar en el navegador (`npm run dev`):

| Escenario | Pasos | Resultado esperado |
|-----------|-------|-------------------|
| **Dueño crea orden** | Iniciar sesión como dueño → abrir modal → ir al Paso 2 | Aparece dropdown "Seleccioná una sucursal" con las sucursales activas |
| **Dueño no selecciona sucursal** | No elegir sucursal → click "Registrar Ingreso" | Botón deshabilitado O mensaje de error "Seleccioná una sucursal." |
| **Dueño selecciona sucursal** | Elegir una sucursal → completar campos → registrar | Orden creada con el `sucursal_id` correcto |
| **Empleado crea orden** | Iniciar sesión como empleado → abrir modal → ir al Paso 2 | Aparece campo de solo lectura con el nombre de su sucursal |
| **Empleado registra** | Completar campos → registrar | Orden creada con el `sucursal_id` del empleado |
| **Sin sucursales activas** | Desactivar todas las sucursales → abrir modal como dueño | Dropdown vacío, no se puede registrar |

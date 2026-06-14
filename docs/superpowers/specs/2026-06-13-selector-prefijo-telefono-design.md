# Diseño: Selector de prefijo de país en inputs de teléfono

**Fecha:** 2026-06-13
**Estado:** Aprobado
**Archivos afectados:**
- `lib/countries.js` (nuevo)
- `components/PhoneInput.js` (nuevo)
- `components/NuevoIngresoModal.js`
- `app/admin/talleres/page.js`
- `__tests__/countries.test.js` (nuevo)
- `package.json` — agrega dependencia `country-flag-icons`

---

## Resumen

Los inputs de teléfono actuales son un `<input type="tel">` con `sanitizePhone` aplicado en `onChange`. Esta propuesta los reemplaza por un componente `PhoneInput` reutilizable con selector de país a la izquierda del input (bandera SVG + código de discado). Default Uruguay. Sin migración de base de datos: el valor sigue siendo un único string concatenado (`dial + número`, sin `+`).

---

## Decisiones clave

| Tema | Decisión |
|------|----------|
| Lista de países | 7 fijos: UY, AR, BR, CL, PY, ES, US |
| Default | Uruguay (`UY`, dial `598`) |
| Render de bandera | SVG via `country-flag-icons` (tree-shakeable, consistente en Windows) |
| Almacenamiento | Una sola columna `text` (sin migración). String concatenado sin `+`, ej `59899123456` |
| Shape del state del padre | Sin cambios — sigue siendo `telefono: string` |
| Comportamiento en mount | **No emite `onChange` en el initial parse** — datos viejos quedan intactos hasta que el user interactúa |
| Navegación por teclado en dropdown | Solo `Escape` y click. Sin flechas (YAGNI) |
| Validación de longitud por país | Fuera de scope |

---

## Arquitectura

### `lib/countries.js`

```js
import UY from "country-flag-icons/react/3x2/UY";
import AR from "country-flag-icons/react/3x2/AR";
import BR from "country-flag-icons/react/3x2/BR";
import CL from "country-flag-icons/react/3x2/CL";
import PY from "country-flag-icons/react/3x2/PY";
import ES from "country-flag-icons/react/3x2/ES";
import US from "country-flag-icons/react/3x2/US";

export const COUNTRIES = [
  { code: "UY", name: "Uruguay",   dial: "598", Flag: UY },
  { code: "AR", name: "Argentina", dial: "54",  Flag: AR },
  { code: "BR", name: "Brasil",    dial: "55",  Flag: BR },
  { code: "CL", name: "Chile",     dial: "56",  Flag: CL },
  { code: "PY", name: "Paraguay",  dial: "595", Flag: PY },
  { code: "ES", name: "España",    dial: "34",  Flag: ES },
  { code: "US", name: "EE.UU.",    dial: "1",   Flag: US },
];

export const DEFAULT_COUNTRY = COUNTRIES[0]; // Uruguay

export function parsePhone(value) {
  if (!value) return { country: DEFAULT_COUNTRY, number: "" };
  const digits = value.replace(/^\+/, "");
  // Ordenado por longitud de dial descendente para matchear "598" antes que "5"
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length);
  const match = sorted.find((c) => digits.startsWith(c.dial));
  if (match) {
    return { country: match, number: digits.slice(match.dial.length) };
  }
  return { country: DEFAULT_COUNTRY, number: digits };
}
```

**Por qué el orden por longitud descendente:** los códigos `1` (US), `54` (AR), `55` (BR) son cortos. Sin ordenar, un valor como `"59899..."` (Uruguay) podría matchear con `"5"` o `"55"` antes que con `"598"`. Sortear por `dial.length` descendente garantiza el match más específico primero.

### `components/PhoneInput.js`

Componente cliente (`"use client"`).

**Props:**
```js
<PhoneInput
  value={string}              // valor concatenado, ej "59899123456" o ""
  onChange={(v) => void}      // recibe el nuevo string concatenado
  placeholder?={string}       // opcional, default "99 123 456"
  required?={boolean}
  className?={string}
/>
```

**Estado interno:**
- `country` — objeto del país seleccionado.
- `number` — número local (sin prefijo).
- `open` — boolean de dropdown abierto/cerrado.

**Inicialización y sincronización con `value`:**
- En el primer render, `useState` se inicializa con `parsePhone(value)` para setear `country` y `number`.
- Se usa un `useRef` (`lastEmittedRef`) inicializado con `value` para distinguir cambios que vienen "de afuera" de cambios que el propio componente acaba de emitir.
- `useEffect` con dep en `value`: si `value !== lastEmittedRef.current`, re-parsea y actualiza `country`/`number`; también actualiza `lastEmittedRef.current = value`.
- Cuando el componente emite por interacción del user, actualiza `lastEmittedRef.current = nuevoValue` **antes** de llamar `onChange(nuevoValue)`. Así, cuando el padre re-renderiza y el effect corre, `value === lastEmittedRef.current` y no se re-parsea.

Esta estrategia cubre los casos:
- **Mount inicial:** state inicializado, ref = value. Effect no encuentra diferencia.
- **Cambio externo del padre** (ej cambiar `editingId` en Talleres sin desmontar el form): `value` cambia, ref no — re-parsea correctamente.
- **Cambio interno** (user tipea): ref se actualiza antes de emitir. No hay loop.
- **Legacy value `"099123456"`:** se parsea como `{country: UY, number: "099123456"}`. Ref = `"099123456"`. Mientras el user no toque nada, el padre no recibe `onChange`.

**Reglas de emisión de `onChange`:**
- **No** emitir en el initial parse ni en el effect de sincronización.
- Emitir cuando el user cambia el país: `onChange(nuevoCountry.dial + number)`.
- Emitir cuando el user tipea en el input local: `onChange(country.dial + nuevoNumero)`.
- Si el usuario vacía el input: `onChange("")` — el padre ve string vacío, igual que hoy.
- En todos los casos: `lastEmittedRef.current = nuevoValue` **antes** de `onChange(nuevoValue)`.

**Sanitización del input local:**
- Aplica `sanitizePhone` (de `lib/utils.js`) al value del input. Esto descarta `+`, letras, espacios, guiones. El prefijo internacional ahora vive en el selector.

---

## UI

### Estado cerrado

```
┌─────────────────┬───────────────────────────┐
│ 🇺🇾  +598   ▾   │   99 123 456              │
└─────────────────┴───────────────────────────┘
```

- Wrapper exterior: `flex border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500` (coincide con el estilo de inputs del proyecto).
- Botón del selector: `<button type="button">` con `flex items-center gap-2 px-3 border-r border-slate-200`. Contiene la bandera SVG (`className="w-5 h-auto rounded-sm"`), el `+dial` y un chevron SVG inline (`<svg viewBox="0 0 12 12" className="w-3 h-3 text-slate-400">` con un path `M2 4 L6 8 L10 4`). No se introduce `lucide-react` (no está en el repo).
- Input numérico: `<input type="tel" inputMode="numeric">` ocupa el resto, sin borde propio (`flex-1 px-3 py-2.5 text-sm focus:outline-none bg-transparent`).
- El botón es `aria-haspopup="listbox"` y `aria-expanded={open}`, con `aria-label="Seleccionar país"`.

### Estado abierto (dropdown)

```
┌─────────────────────────────────────────────┐
│ 🇺🇾  Uruguay              +598              │  ← bg-indigo-50 (seleccionado)
│ 🇦🇷  Argentina            +54               │
│ 🇧🇷  Brasil               +55               │
│ 🇨🇱  Chile                +56               │
│ 🇵🇾  Paraguay             +595              │
│ 🇪🇸  España               +34               │
│ 🇺🇸  EE.UU.               +1                │
└─────────────────────────────────────────────┘
```

- Contenedor: `absolute z-10 mt-1 w-64 bg-white rounded-lg shadow-lg border border-slate-200`, anclado al botón.
- Items: `<button role="option">` con `flex items-center gap-3 px-3 py-2 w-full hover:bg-slate-50`. El item seleccionado lleva `bg-indigo-50` y `aria-selected="true"`.
- Layout de cada item: bandera (`w-5`) + nombre del país + `+dial` a la derecha en `text-slate-500 ml-auto`.

### Interacciones

| Acción | Comportamiento |
|--------|----------------|
| Click en botón | Toggle dropdown |
| Click en item | Selecciona país, cierra dropdown, emite `onChange(nuevoDial + number)` |
| Click fuera del componente | Cierra dropdown (listener en `document.mousedown` con ref al wrapper) |
| Tecla `Escape` | Cierra dropdown |
| Tipear en el input | Sanitiza, actualiza number, emite `onChange(dial + nuevoNumber)` |

Sin navegación por flechas con teclado — YAGNI para 7 items.

---

## Integración

### `components/NuevoIngresoModal.js` (línea ~309-315)

```jsx
// Antes
<input
  type="tel"
  placeholder="099 123 456"
  value={nuevoCliente.telefono}
  onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: sanitizePhone(e.target.value) })}
  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg ..."
/>

// Después
<PhoneInput
  value={nuevoCliente.telefono}
  onChange={(v) => setNuevoCliente({ ...nuevoCliente, telefono: v })}
  placeholder="99 123 456"
/>
```

Quitar el import de `sanitizePhone` **solo si** no se usa en otro lugar del archivo.

### `app/admin/talleres/page.js` (línea ~109-115)

```jsx
// Antes
<input
  type="text"
  value={form.telefono}
  onChange={(e) => setForm({ ...form, telefono: sanitizePhone(e.target.value) })}
  placeholder="Ej: +598 9 1234 5678"
  className="w-full px-3 py-2 border border-slate-200 rounded-lg ..."
/>

// Después
<PhoneInput
  value={form.telefono}
  onChange={(v) => setForm({ ...form, telefono: v })}
  placeholder="9 1234 5678"
/>
```

Quitar el import de `sanitizePhone` si queda sin uso.

---

## Compatibilidad con datos existentes

Hoy `clientes.telefono` y `talleres.telefono` pueden contener formatos heterogéneos:

| Valor en DB | Comportamiento |
|-------------|----------------|
| `""` o `null` | `parsePhone` retorna `{ country: UY, number: "" }`. Input vacío. |
| `"099123456"` (Uruguay local, sin prefijo) | No matchea ningún dial → fallback UY, `number = "099123456"`. **No se emite `onChange` en mount.** El value en DB queda intacto a menos que el user edite. |
| `"59899123456"` (formato A2 nuevo) | Matchea UY → muestra Uruguay + `99123456`. |
| `"+59899123456"` (legacy con `+`) | `parsePhone` descarta el `+` y matchea UY. |
| `"5491112345678"` (Argentina) | Matchea AR → muestra Argentina + `91112345678`. |

**Consecuencia aceptada:** si el user edita un teléfono viejo `"099123456"`, el resultado guardado será `"598099123456"` (UY concatenado al número con `0` inicial). El `0` queda dentro del número porque no automatizamos el strip — depende del país y está fuera de scope. WhatsApp tolera dígitos extras vía `normalizePhone`.

---

## Lo que NO cambia

- `lib/utils.js#sanitizePhone` — sigue existiendo, se usa dentro de `PhoneInput` para sanitizar el input local.
- `lib/notifications/whatsapp.js#normalizePhone` — sin cambios. Ya tolera con/sin `+`.
- Schema de base de datos — sin migración.
- Resto de la app que lee/escribe `clientes.telefono` o `talleres.telefono`.

---

## Tests

### `__tests__/countries.test.js`

```js
import { parsePhone, COUNTRIES, DEFAULT_COUNTRY } from "@/lib/countries";

describe("parsePhone", () => {
  it("empty value → UY + empty", () => {
    expect(parsePhone("")).toEqual({ country: DEFAULT_COUNTRY, number: "" });
  });
  it("UY full prefix", () => {
    expect(parsePhone("59899123456")).toEqual({
      country: COUNTRIES.find((c) => c.code === "UY"),
      number: "99123456",
    });
  });
  it("accepts leading +", () => {
    expect(parsePhone("+59899123456").number).toBe("99123456");
  });
  it("Argentina prefix", () => {
    expect(parsePhone("5491112345678")).toEqual({
      country: COUNTRIES.find((c) => c.code === "AR"),
      number: "91112345678",
    });
  });
  it("legacy Uruguay local without prefix → UY fallback, full number", () => {
    expect(parsePhone("099123456")).toEqual({
      country: DEFAULT_COUNTRY,
      number: "099123456",
    });
  });
  it("US prefix", () => {
    expect(parsePhone("1234567890")).toEqual({
      country: COUNTRIES.find((c) => c.code === "US"),
      number: "234567890",
    });
  });
  it("longest-prefix-wins: 598… matches UY, not US (1) or AR (54)/BR (55)", () => {
    expect(parsePhone("59899").country.code).toBe("UY");
  });
});
```

### Verificación de `PhoneInput`

El proyecto no tiene `@testing-library/react` instalado (los tests actuales son unitarios sobre funciones puras y sobre lógica de `lib/`). Para no agregar dependencias de testing solo para este componente, la verificación del componente se hace **manualmente** en el dev server, con foco en estos casos:

| Caso | Comportamiento esperado |
|------|-------------------------|
| Abrir `NuevoIngresoModal` y dejar el teléfono vacío | Bandera UY 🇺🇾, código `+598`, input vacío |
| Tipear `99123456` con UY seleccionado | El value en el state del padre es `"59899123456"` |
| Cambiar a Argentina y tipear `91112345678` | Value del padre `"5491112345678"` |
| Editar un cliente con `telefono = "099123456"` y **no tocar nada** | Se muestra UY + `099123456`. Submit → DB no cambia el valor |
| Editar el mismo cliente y cambiar un dígito | Submit guarda `598` + nuevo número |
| Editar cliente con `telefono = "5491112345678"` | Bandera AR, input muestra `91112345678` |
| Click en el botón del selector | Dropdown abre con 7 países, UY resaltado |
| Tecla `Escape` con dropdown abierto | Dropdown se cierra |
| Click fuera del componente con dropdown abierto | Dropdown se cierra |

Si en el futuro se agrega `@testing-library/react` al proyecto, estos casos se pueden portar a tests automatizados.

---

## Dependencia nueva

```bash
npm install country-flag-icons
```

Tamaño aproximado del bundle final: 7 SVG inline ≈ 4 kb total (tree-shaken). No requiere CSS adicional.

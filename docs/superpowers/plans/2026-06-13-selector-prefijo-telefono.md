# Selector de prefijo de país en inputs de teléfono — Plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reemplazar los dos `<input>` de teléfono (`NuevoIngresoModal` y `Talleres`) por un componente `PhoneInput` con selector de país (bandera + código), default Uruguay, sin migrar la base de datos.

**Architecture:** Una constante de 7 países en `lib/countries.js` con un parser `parsePhone(value)` que detecta el código de discado al recibir un valor. Un componente cliente `components/PhoneInput.js` que renderiza botón con bandera + dropdown listbox + input numérico, emitiendo el valor concatenado (`dial + número`, sin `+`) al padre. El shape del state del padre no cambia: sigue siendo `telefono: string`.

**Tech Stack:** Next.js 14 (App Router) + React 18, Tailwind CSS 3, Vitest 4 (environment `node`), dependencia nueva `country-flag-icons` (SVG tree-shakeable).

---

## Estructura de archivos

| Archivo | Estado | Responsabilidad |
|---------|--------|----------------|
| `lib/countries.js` | nuevo | Lista de países (`COUNTRIES`), default (`DEFAULT_COUNTRY`), parser puro (`parsePhone`) |
| `__tests__/countries.test.js` | nuevo | Tests del parser |
| `components/PhoneInput.js` | nuevo | Componente cliente: botón con bandera, dropdown listbox, input numérico, lógica de emisión |
| `components/NuevoIngresoModal.js` | modificar | Reemplazar `<input type="tel">` de cliente por `<PhoneInput>` |
| `app/admin/talleres/page.js` | modificar | Reemplazar `<input>` de teléfono por `<PhoneInput>` |
| `package.json` + `package-lock.json` | modificar | Agregar `country-flag-icons` |

`PhoneInput` agrupa toda la UI y lógica del componente en un solo archivo. Es cohesivo (selector + input + dropdown forman una unidad). Estimado: ~150 líneas.

---

## Task 1: Crear `lib/countries.js` con `parsePhone` (TDD)

**Files:**
- Create: `lib/countries.js`
- Create: `__tests__/countries.test.js`

Esta task instala la dependencia `country-flag-icons` para que los imports de bandera funcionen, pero los tests no la ejercitan (solo testean `parsePhone`, función pura).

- [ ] **Step 1: Instalar `country-flag-icons`**

Ejecutar:
```bash
npm install country-flag-icons
```

Expected: `package.json` y `package-lock.json` modificados, sin warnings de peer deps.

- [ ] **Step 2: Escribir el test del parser (failing)**

Crear `__tests__/countries.test.js`:

```js
import { parsePhone, COUNTRIES, DEFAULT_COUNTRY } from '@/lib/countries'

describe('parsePhone', () => {
  it('empty value → UY + empty', () => {
    expect(parsePhone('')).toEqual({ country: DEFAULT_COUNTRY, number: '' })
  })

  it('UY full prefix', () => {
    expect(parsePhone('59899123456')).toEqual({
      country: COUNTRIES.find((c) => c.code === 'UY'),
      number: '99123456',
    })
  })

  it('accepts leading +', () => {
    expect(parsePhone('+59899123456').number).toBe('99123456')
  })

  it('Argentina prefix', () => {
    expect(parsePhone('5491112345678')).toEqual({
      country: COUNTRIES.find((c) => c.code === 'AR'),
      number: '91112345678',
    })
  })

  it('legacy Uruguay local without prefix → UY fallback, full number', () => {
    expect(parsePhone('099123456')).toEqual({
      country: DEFAULT_COUNTRY,
      number: '099123456',
    })
  })

  it('US prefix', () => {
    expect(parsePhone('1234567890')).toEqual({
      country: COUNTRIES.find((c) => c.code === 'US'),
      number: '234567890',
    })
  })

  it('longest-prefix-wins: 598… matches UY, not US (1) or AR (54)/BR (55)', () => {
    expect(parsePhone('59899').country.code).toBe('UY')
  })

  it('DEFAULT_COUNTRY is Uruguay', () => {
    expect(DEFAULT_COUNTRY.code).toBe('UY')
  })

  it('COUNTRIES contains the 7 expected codes', () => {
    expect(COUNTRIES.map((c) => c.code)).toEqual(['UY', 'AR', 'BR', 'CL', 'PY', 'ES', 'US'])
  })
})
```

- [ ] **Step 3: Run tests to verify they fail**

Run: `npm test -- countries`
Expected: FAIL — `Cannot find module '@/lib/countries'` o similar.

- [ ] **Step 4: Implement `lib/countries.js`**

Crear `lib/countries.js`:

```js
import UY from 'country-flag-icons/react/3x2/UY'
import AR from 'country-flag-icons/react/3x2/AR'
import BR from 'country-flag-icons/react/3x2/BR'
import CL from 'country-flag-icons/react/3x2/CL'
import PY from 'country-flag-icons/react/3x2/PY'
import ES from 'country-flag-icons/react/3x2/ES'
import US from 'country-flag-icons/react/3x2/US'

export const COUNTRIES = [
  { code: 'UY', name: 'Uruguay',   dial: '598', Flag: UY },
  { code: 'AR', name: 'Argentina', dial: '54',  Flag: AR },
  { code: 'BR', name: 'Brasil',    dial: '55',  Flag: BR },
  { code: 'CL', name: 'Chile',     dial: '56',  Flag: CL },
  { code: 'PY', name: 'Paraguay',  dial: '595', Flag: PY },
  { code: 'ES', name: 'España',    dial: '34',  Flag: ES },
  { code: 'US', name: 'EE.UU.',    dial: '1',   Flag: US },
]

export const DEFAULT_COUNTRY = COUNTRIES[0]

export function parsePhone(value) {
  if (!value) return { country: DEFAULT_COUNTRY, number: '' }
  const digits = value.replace(/^\+/, '')
  // Sort by dial length descending so "598" matches before "5"
  const sorted = [...COUNTRIES].sort((a, b) => b.dial.length - a.dial.length)
  const match = sorted.find((c) => digits.startsWith(c.dial))
  if (match) {
    return { country: match, number: digits.slice(match.dial.length) }
  }
  return { country: DEFAULT_COUNTRY, number: digits }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npm test -- countries`
Expected: PASS — 9 tests green.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json lib/countries.js __tests__/countries.test.js
git commit -m "feat(countries): add country list and parsePhone parser"
```

---

## Task 2: Crear `components/PhoneInput.js`

**Files:**
- Create: `components/PhoneInput.js`

No hay tests automatizados (el proyecto no tiene `@testing-library/react` y vitest está en environment `node`). La verificación se hace manualmente en Task 5.

- [ ] **Step 1: Write the component**

Crear `components/PhoneInput.js`:

```jsx
"use client"

import { useState, useEffect, useRef } from "react"
import { COUNTRIES, parsePhone } from "@/lib/countries"
import { sanitizePhone } from "@/lib/utils"

function ChevronDown({ className }) {
  return (
    <svg
      viewBox="0 0 12 12"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M2 4 L6 8 L10 4" />
    </svg>
  )
}

export default function PhoneInput({
  value = "",
  onChange,
  placeholder = "99 123 456",
  required = false,
  className = "",
}) {
  const initial = parsePhone(value)
  const [country, setCountry] = useState(initial.country)
  const [number, setNumber] = useState(initial.number)
  const [open, setOpen] = useState(false)
  const lastEmittedRef = useRef(value)
  const wrapperRef = useRef(null)

  // Sync when value changes from outside (e.g., parent loads a different record)
  useEffect(() => {
    if (value !== lastEmittedRef.current) {
      const parsed = parsePhone(value)
      setCountry(parsed.country)
      setNumber(parsed.number)
      lastEmittedRef.current = value
    }
  }, [value])

  // Close dropdown on click outside or Escape
  useEffect(() => {
    if (!open) return

    function handleMouseDown(e) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setOpen(false)
      }
    }
    function handleKeyDown(e) {
      if (e.key === "Escape") setOpen(false)
    }

    document.addEventListener("mousedown", handleMouseDown)
    document.addEventListener("keydown", handleKeyDown)
    return () => {
      document.removeEventListener("mousedown", handleMouseDown)
      document.removeEventListener("keydown", handleKeyDown)
    }
  }, [open])

  function emit(newValue) {
    lastEmittedRef.current = newValue
    onChange?.(newValue)
  }

  function handleCountrySelect(newCountry) {
    setCountry(newCountry)
    setOpen(false)
    // Emit even when number is empty so the parent sees the new prefix.
    // If you prefer "no number = no value", change to: number === "" ? "" : newCountry.dial + number
    emit(newCountry.dial + number)
  }

  function handleNumberChange(e) {
    const cleaned = sanitizePhone(e.target.value)
    setNumber(cleaned)
    // Clearing the input emits "" so the parent matches the previous behavior of an empty <input>.
    emit(cleaned === "" ? "" : country.dial + cleaned)
  }

  const Flag = country.Flag

  return (
    <div ref={wrapperRef} className={`relative ${className}`}>
      <div className="flex items-stretch border border-slate-200 rounded-lg focus-within:ring-2 focus-within:ring-indigo-500/20 focus-within:border-indigo-500 bg-white">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label="Seleccionar país"
          className="flex items-center gap-2 px-3 border-r border-slate-200 text-sm text-slate-700 hover:bg-slate-50 rounded-l-lg"
        >
          <Flag title={country.name} className="w-5 h-auto rounded-sm" />
          <span>+{country.dial}</span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
        <input
          type="tel"
          inputMode="numeric"
          required={required}
          placeholder={placeholder}
          value={number}
          onChange={handleNumberChange}
          className="flex-1 px-3 py-2.5 text-sm focus:outline-none bg-transparent rounded-r-lg"
        />
      </div>

      {open && (
        <ul
          role="listbox"
          className="absolute z-10 mt-1 w-64 bg-white rounded-lg shadow-lg border border-slate-200 py-1 max-h-72 overflow-auto"
        >
          {COUNTRIES.map((c) => {
            const ItemFlag = c.Flag
            const selected = c.code === country.code
            return (
              <li key={c.code}>
                <button
                  type="button"
                  role="option"
                  aria-selected={selected}
                  onClick={() => handleCountrySelect(c)}
                  className={`flex items-center gap-3 px-3 py-2 w-full text-left text-sm hover:bg-slate-50 ${
                    selected ? "bg-indigo-50" : ""
                  }`}
                >
                  <ItemFlag title={c.name} className="w-5 h-auto rounded-sm" />
                  <span className="text-slate-700">{c.name}</span>
                  <span className="ml-auto text-slate-500">+{c.dial}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify the file compiles**

Run: `npm run lint`
Expected: 0 errors. (Si aparecen warnings preexistentes en otros archivos, ignorar — solo importa que `PhoneInput.js` no tenga errores.)

- [ ] **Step 3: Commit**

```bash
git add components/PhoneInput.js
git commit -m "feat(PhoneInput): add reusable phone input with country selector"
```

---

## Task 3: Integrar `PhoneInput` en `NuevoIngresoModal`

**Files:**
- Modify: `components/NuevoIngresoModal.js:8` (imports) y `:305-316` (campo de teléfono)

- [ ] **Step 1: Agregar el import de `PhoneInput`**

En `components/NuevoIngresoModal.js`, justo después de la línea 8 (`import { sanitizePhone } from "@/lib/utils";`), agregar:

```js
import PhoneInput from "@/components/PhoneInput";
```

- [ ] **Step 2: Reemplazar el bloque del input de teléfono**

En `components/NuevoIngresoModal.js`, líneas ~305-316, reemplazar:

```jsx
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Teléfono *
                </label>
                <input
                  type="tel"
                  placeholder="099 123 456"
                  value={nuevoCliente.telefono}
                  onChange={(e) => setNuevoCliente({ ...nuevoCliente, telefono: sanitizePhone(e.target.value) })}
                  className="w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>
```

por:

```jsx
              <div>
                <label className="block text-sm font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                  Teléfono *
                </label>
                <PhoneInput
                  value={nuevoCliente.telefono}
                  onChange={(v) => setNuevoCliente({ ...nuevoCliente, telefono: v })}
                  placeholder="99 123 456"
                  required
                />
              </div>
```

- [ ] **Step 3: Verificar si `sanitizePhone` sigue siendo necesario**

Run:
```bash
grep -n "sanitizePhone" components/NuevoIngresoModal.js
```

Si solo aparece en la línea de import (línea 8), eliminar ese import.
Si aparece en otras líneas, dejarlo.

- [ ] **Step 4: Verificar lint y build**

Run: `npm run lint`
Expected: 0 errors nuevos.

- [ ] **Step 5: Commit**

```bash
git add components/NuevoIngresoModal.js
git commit -m "refactor(NuevoIngresoModal): use PhoneInput for client phone"
```

---

## Task 4: Integrar `PhoneInput` en `app/admin/talleres/page.js`

**Files:**
- Modify: `app/admin/talleres/page.js:5` (imports) y `:105-116` (campo de teléfono)

- [ ] **Step 1: Agregar el import**

En `app/admin/talleres/page.js`, justo después de la línea 5 (`import { sanitizePhone } from "@/lib/utils";`), agregar:

```js
import PhoneInput from "@/components/PhoneInput";
```

- [ ] **Step 2: Reemplazar el bloque del input**

En `app/admin/talleres/page.js`, líneas ~105-116, reemplazar:

```jsx
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Teléfono
              </label>
              <input
                type="text"
                value={form.telefono}
                onChange={(e) => setForm({ ...form, telefono: sanitizePhone(e.target.value) })}
                placeholder="Ej: +598 9 1234 5678"
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
```

por:

```jsx
            <div>
              <label className="block text-xs font-semibold text-slate-500 mb-1.5 uppercase tracking-wider">
                Teléfono
              </label>
              <PhoneInput
                value={form.telefono}
                onChange={(v) => setForm({ ...form, telefono: v })}
                placeholder="9 1234 5678"
              />
            </div>
```

- [ ] **Step 3: Verificar si `sanitizePhone` sigue siendo necesario**

Run:
```bash
grep -n "sanitizePhone" app/admin/talleres/page.js
```

Si solo aparece en la línea de import (línea 5), eliminar ese import.
Si aparece en otras líneas, dejarlo.

- [ ] **Step 4: Verificar lint**

Run: `npm run lint`
Expected: 0 errors nuevos.

- [ ] **Step 5: Commit**

```bash
git add app/admin/talleres/page.js
git commit -m "refactor(talleres): use PhoneInput for workshop phone"
```

---

## Task 5: Verificación manual en el navegador

**Files:** ninguno (verificación).

- [ ] **Step 1: Levantar el dev server**

Run: `npm run dev`
Expected: server arranca en `http://localhost:3000`.

- [ ] **Step 2: Verificar `NuevoIngresoModal` (cliente nuevo)**

Navegar a la página de admin → abrir el modal de Nuevo Ingreso → ir al paso de "Cliente nuevo".

Checklist:
- [ ] Bandera 🇺🇾 visible, código `+598`, input vacío.
- [ ] Tipear `99123456`. Submit del formulario debe guardar `telefono = "59899123456"` (chequear DB o devtools).
- [ ] Reabrir el modal. Cambiar país a Argentina 🇦🇷 clickeando el botón. Tipear `91112345678`. Submit → DB tiene `5491112345678`.
- [ ] Tecla `Escape` con dropdown abierto → cierra.
- [ ] Click fuera del componente con dropdown abierto → cierra.

- [ ] **Step 3: Verificar `Talleres`**

Navegar a `/admin/talleres` → click en "Nuevo taller".

Checklist:
- [ ] Bandera UY default, código `+598`.
- [ ] Crear un taller con teléfono `91234567`. DB guarda `59891234567`.
- [ ] Editar un taller existente que tenga `telefono = "099123456"` (sin prefijo):
  - El selector debe mostrar UY 🇺🇾.
  - El input debe mostrar `099123456`.
  - Si **no se toca el campo de teléfono** y se hace Submit, el value en DB debe seguir siendo `"099123456"` (no `"598099123456"`).
- [ ] Editar un taller con teléfono ya en formato internacional (`5491112345678`) → muestra AR + `91112345678` correctamente.

- [ ] **Step 4: Verificar look & feel**

- [ ] El borde del wrapper se ilumina (ring indigo) al hacer focus en el input numérico.
- [ ] El dropdown abre debajo del botón, no desborda el modal.
- [ ] Las banderas SVG se ven crisp (no pixeladas) en Windows.
- [ ] El item seleccionado en el dropdown tiene fondo `bg-indigo-50`.

- [ ] **Step 5: Correr tests**

Run: `npm test`
Expected: todos los tests pasan, incluyendo los 9 nuevos de `countries`.

- [ ] **Step 6: Commit final si hace falta**

Si encontraste ajustes durante la verificación y los aplicaste, commitearlos:

```bash
git add -A
git commit -m "fix(PhoneInput): <descripción del ajuste>"
```

Si no hubo ajustes, esta task no requiere commit.

---

## Notas para el implementador

- **Mantén el state shape del padre intacto.** El cambio se ve en la UI; el dato persistido sigue siendo `telefono: string`. No agregues columnas a la DB, no cambies queries.
- **No emitas `onChange` en mount.** Si lo hacés, los teléfonos viejos sin prefijo (`099123456`) se corromperán automáticamente al abrir cualquier modal de edición. El `useRef` `lastEmittedRef` es el mecanismo que lo previene.
- **El `0` inicial uruguayo NO se elimina.** Si el user edita un teléfono viejo `099123456` y agrega un dígito, el resultado es `598099123456`. WhatsApp lo tolera (su `normalizePhone` solo limpia no-dígitos). Hacer un strip automático del `0` está fuera de scope porque depende del país.
- **No introducir `lucide-react`.** El chevron es un SVG inline en `PhoneInput.js`. El proyecto no usa libs de iconos.
- **No agregar tests de UI con `@testing-library/react`.** El proyecto no la tiene y `vitest` está configurado con environment `node`. Si en el futuro se agrega, los casos de verificación manual de Task 5 sirven como guion para los tests automatizados.

# Badge de WhatsApp sin leer + Modo oscuro — Spec de Diseño

## Resumen

Dos features chicas e independientes, agrupadas en un mismo spec porque se piden juntas y comparten worktree:

1. **Badge de notificación:** un globito rojo con "1" sobre el botón "WhatsApp" del header cuando hay mensajes entrantes sin leer. El estado de "leído" es compartido — lo que marca como leído una computadora vale para todas.
2. **Modo oscuro:** un slide switch fijo en la esquina superior derecha, visible en toda la app, que alterna entre modo claro (default) y oscuro, persistido en `localStorage`.

---

## Parte 1: Badge de mensajes sin leer

### Por qué no alcanza con `last_message_at`

`whatsapp_conversaciones.last_message_at` se actualiza tanto por mensajes entrantes (webhook, `app/api/webhook/whatsapp/route.js:127`) como por mensajes salientes (notificaciones automáticas del sistema, `lib/notifications/index.js:84`). Compararlo directo contra un timestamp de "última vez visto" dispararía el badge también cuando el sistema le manda una notificación automática a un cliente, no solo cuando el cliente responde. Por eso el chequeo debe mirar `whatsapp_mensajes` filtrando `direccion = 'entrante'`.

### Base de datos

Tabla nueva de una sola fila, siguiendo el mismo criterio de RLS bloqueada que `031_lockdown_pii.sql` aplicó a `whatsapp_conversaciones`/`whatsapp_mensajes` (sin policies para anon/authenticated; todo acceso vía `service_role` desde rutas `/api/*` autenticadas):

```sql
-- supabase/035_whatsapp_inbox_estado.sql
CREATE TABLE whatsapp_inbox_estado (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_read_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO whatsapp_inbox_estado (id, last_read_at) VALUES (1, NOW());

ALTER TABLE whatsapp_inbox_estado ENABLE ROW LEVEL SECURITY;
-- Sin policies: solo accesible vía service_role (getSupabaseAdmin()).
```

El `CHECK (id = 1)` fuerza fila única (patrón singleton).

### Funciones (`lib/whatsapp.js`, se agregan junto a `getConversaciones`/`getMensajes`)

```js
export async function hayMensajesSinLeer() {
  const { data: estado } = await getSupabaseAdmin()
    .from("whatsapp_inbox_estado").select("last_read_at").eq("id", 1).single();

  const { count } = await getSupabaseAdmin()
    .from("whatsapp_mensajes")
    .select("id", { count: "exact", head: true })
    .eq("direccion", "entrante")
    .gt("created_at", estado.last_read_at);

  return (count ?? 0) > 0;
}

export async function marcarInboxLeido() {
  await getSupabaseAdmin()
    .from("whatsapp_inbox_estado")
    .update({ last_read_at: new Date().toISOString() })
    .eq("id", 1);
}
```

### Rutas API (mismo patrón de auth que `app/api/whatsapp/conversaciones/route.js`: `auth()` de `@/auth`, 401 si no hay sesión)

- `GET /api/whatsapp/estado` → `{ hayNuevos: boolean }`
- `POST /api/whatsapp/estado/marcar-leido` → marca `last_read_at = now()`, responde `{ ok: true }`

### Integración

- **`app/page.js`** (dashboard): agrega poll a `GET /api/whatsapp/estado` cada 30s (mismo intervalo que el resto de sus stats). Si `hayNuevos`, envuelve el botón "WhatsApp" (línea ~160) en `relative` y le agrega un `span` absoluto arriba a la derecha: círculo rojo (`bg-red-500`) con "1" chico, `animate-none` (sin parpadeo, para no ser molesto).
- **`app/whatsapp/page.js`**: al montar la página, llama `POST /api/whatsapp/estado/marcar-leido`. Además, cada vez que su polling existente de conversaciones (cada 15s, línea 43) corre mientras la página sigue abierta, vuelve a llamar `marcar-leido` — así un mensaje que llega mientras alguien ya está mirando la bandeja no deja el badge "fantasma" prendido en otras computadoras.

### Testing (Vitest, mismo patrón que `lib/__tests__/whatsapp.test.js`)

- `hayMensajesSinLeer()`: true cuando hay un entrante posterior a `last_read_at`, false cuando no hay entrantes nuevos, false cuando el único mensaje nuevo es saliente.
- `marcarInboxLeido()`: actualiza `last_read_at` a la fila `id=1`.
- Rutas: 401 sin sesión (igual que las rutas de conversaciones existentes).

---

## Parte 2: Modo claro / oscuro

### Estrategia

Tailwind `darkMode: 'class'` — la clase `dark` en `<html>` habilita las variantes `dark:` en toda la app.

```js
// tailwind.config.js
module.exports = {
  darkMode: 'class',
  content: [...], // sin cambios
  ...
};
```

### `ThemeProvider` (nuevo: `components/ThemeProvider.js`)

Context de React montado en `app/layout.js` envolviendo `children` (adentro de `SessionProvider`, sin dependencia entre ambos). Responsabilidades:

- Estado `theme: 'light' | 'dark'`, inicializa siempre en `'light'` (sin detectar preferencia del sistema, según lo acordado).
- Al montar, lee `localStorage.getItem('rt-theme')`; si existe y es válido, lo usa en vez del default.
- `toggleTheme()` alterna el estado, escribe en `localStorage`, y agrega/quita la clase `dark` en `document.documentElement`.
- Expone `useTheme()` con `{ theme, toggleTheme }`.

Para evitar flash de contenido claro antes de que React hidrate (si el usuario ya eligió oscuro), se agrega un script inline chico en `app/layout.js` (antes de `children`) que lee `localStorage` y aplica la clase `dark` sincrónicamente, mismo patrón estándar de `next-themes` pero hecho a mano ya que el proyecto no usa esa librería.

### `ThemeToggle` (nuevo: `components/ThemeToggle.js`)

Slide switch armado a mano (checkbox oculto + `label` estilizado con `peer`), consistente con el resto de la UI (sin librería de componentes). Fijo, siempre visible:

```jsx
<div className="fixed top-4 right-4 z-50">
  {/* checkbox + track + thumb, íconos ☀️/🌙 */}
</div>
```

Se renderiza una sola vez en `app/layout.js`, fuera de `{children}`, para no duplicar código en cada página.

### Retrofit de `dark:` (alcance: toda la app)

Se agregan variantes `dark:` a los fondos/textos/bordes de:

- **Páginas:** `app/page.js`, `app/whatsapp/page.js`, `app/admin/page.js`, `app/admin/sucursales/page.js`, `app/admin/usuarios/page.js`, `app/admin/marcas/page.js`, `app/admin/reportes/page.js`, `app/admin/talleres/page.js`, `app/admin/tipos-servicio/page.js`, `app/cadete/page.js`, `app/login/page.js`, `app/privacy/page.js`, `app/seguimiento/[token]/page.js`
- **Componentes compartidos:** `components/Badge.js`, `components/StatCard.js`, `components/TrasladosBadge.js`, `components/TrasladosPanel.js`, `components/NuevoIngresoModal.js`, `components/PhoneInput.js`, `components/ResumenCadetePanel.js`, `components/DetalleOrdenModal.js`, `components/WhatsAppHilo.js`

Criterio de conversión (patrón repetido en casi toda la app):

| Elemento actual | Variante oscura |
|---|---|
| `bg-slate-100` / `bg-slate-50` (fondos de página) | `dark:bg-slate-950` |
| `bg-white` (cards, modales) | `dark:bg-slate-900` |
| `text-slate-900` / `text-slate-800` (texto principal) | `dark:text-slate-100` |
| `text-slate-500` / `text-slate-400` (texto secundario) | `dark:text-slate-400` (ya funciona razonablemente en oscuro, se ajusta solo si el contraste queda mal) |
| `border-slate-200` / `border-slate-300` | `dark:border-slate-700` |
| Headers `bg-gradient-to-r from-slate-900 to-slate-800` | Sin cambio — ya son oscuros, se ven bien en ambos modos |
| Colores de marca/estado (verde WhatsApp `#25D366`, rojo error, badges de estado de orden) | Sin cambio — son colores semánticos, no de superficie |

No se migra a variables CSS ni a un sistema de design tokens — se agregan variantes `dark:` directo sobre las clases existentes, consistente con cómo está escrito el resto del proyecto (Tailwind utilitario, sin abstracciones).

### Testing

No hay tests automatizados de estilos visuales en este proyecto (`lib/__tests__/*` cubre lógica, no UI). Verificación manual: togglear el switch en cada página listada arriba y confirmar contraste legible. `ThemeProvider`/`toggleTheme` se puede testear a nivel lógico (escribe `localStorage`, alterna clase) si el patrón de tests del proyecto lo amerita — a definir en el plan de implementación.

---

## Archivos a crear/modificar

### Nuevos
- `supabase/035_whatsapp_inbox_estado.sql`
- `components/ThemeProvider.js`
- `components/ThemeToggle.js`

### Modificados
- `lib/whatsapp.js` — `hayMensajesSinLeer()`, `marcarInboxLeido()`
- `app/api/whatsapp/estado/route.js` (nuevo) — `GET`
- `app/api/whatsapp/estado/marcar-leido/route.js` (nuevo) — `POST`
- `app/page.js` — poll de estado + badge en botón WhatsApp
- `app/whatsapp/page.js` — marcar leído al montar y en cada poll
- `tailwind.config.js` — `darkMode: 'class'`
- `app/layout.js` — script anti-flash, `ThemeProvider`, `ThemeToggle`
- Las 13 páginas y 9 componentes listados en "Retrofit de `dark:`" arriba

## Fuera de alcance

- Contador real de mensajes sin leer (se acordó indicador simple).
- Preferencia de sistema operativo para el tema inicial (siempre arranca claro).
- Notificaciones push/sonido al llegar un mensaje — solo el badge visual.
- Dark mode para el PWA `manifest.json` / `theme-color` meta (color de la barra del navegador en mobile) — queda con el valor claro actual (`#0f172a`, que de hecho ya es oscuro, así que no genera inconsistencia visible).

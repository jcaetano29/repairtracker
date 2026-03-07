# 🚀 RepairTrack — Guía de Deploy (Paso a Paso)

Esta guía te lleva de **cero a producción en menos de 30 minutos**.
No necesitás experiencia previa en programación.

---

## Paso 1: Crear cuenta en Supabase (la base de datos)

1. Ir a [https://supabase.com](https://supabase.com)
2. Click en **"Start your project"** → registrarse con GitHub o email
3. Click **"New Project"**
4. Completar:
   - **Name:** `repairtrack`
   - **Database Password:** elegir una contraseña segura (¡guardarla!)
   - **Region:** elegir la más cercana (para Uruguay: `South America (São Paulo)`)
5. Click **"Create new project"** y esperar ~2 minutos

## Paso 2: Crear las tablas

1. En el dashboard de Supabase, ir al menú lateral: **SQL Editor**
2. Click **"New query"**
3. Copiar **TODO** el contenido del archivo `supabase/001_schema.sql`
4. Pegarlo en el editor
5. Click **"Run"** (el botón verde)
6. Debería aparecer "Success" — esto crea todas las tablas, funciones y datos iniciales

## Paso 3: Obtener las credenciales de Supabase

1. En Supabase, ir a **Settings** (ícono de engranaje) → **API**
2. Copiar estos dos valores:
   - **Project URL** → algo como `https://abcdefgh.supabase.co`
   - **anon public** key → una cadena larga que empieza con `eyJ...`
3. Guardar ambos valores, los vas a necesitar en el paso 6

## Paso 4: Crear cuenta en Vercel (el hosting)

1. Ir a [https://vercel.com](https://vercel.com)
2. Click **"Sign Up"** → registrarse con GitHub (recomendado)
3. Si no tenés GitHub, crearte una cuenta en [https://github.com](https://github.com) primero

## Paso 5: Subir el código a GitHub

### Opción A: Desde la terminal (si sabés usar git)

```bash
cd repairtrack
git init
git add .
git commit -m "RepairTrack v1.0"
git remote add origin https://github.com/TU-USUARIO/repairtrack.git
git push -u origin main
```

### Opción B: Desde GitHub web (más fácil)

1. Ir a [https://github.com/new](https://github.com/new)
2. Nombre: `repairtrack`, privado, **sin** README
3. Click "Create repository"
4. Subir los archivos arrastrándolos al repositorio

## Paso 6: Deploy en Vercel

1. En [vercel.com/new](https://vercel.com/new), click **"Import Git Repository"**
2. Seleccionar el repo `repairtrack`
3. En **Environment Variables**, agregar:
   - `NEXT_PUBLIC_SUPABASE_URL` → pegar la URL del paso 3
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` → pegar la anon key del paso 3
4. Click **"Deploy"**
5. Esperar ~2 minutos
6. ¡Listo! Vercel te da una URL tipo `repairtrack-xxx.vercel.app`

## Paso 7: Configurar autenticación (recomendado)

Para que solo los empleados puedan acceder:

1. En Supabase → **Authentication** → **Providers**
2. Habilitar **Email** (ya viene habilitado)
3. En **Authentication** → **Users** → crear usuarios para cada empleado
4. En tu app, agregar un login (o pedirme que lo agregue)

**Alternativa rápida:** Por ahora podés usar el sistema sin login. Las políticas RLS permiten acceso a cualquier usuario autenticado, pero el sistema funciona también sin auth para empezar rápido.

---

## Paso 8 (Opcional): Dominio personalizado

1. En Vercel → Settings → Domains
2. Agregar tu dominio (ej: `app.turelojeria.com`)
3. Configurar DNS según las instrucciones de Vercel

---

## Paso 9 (Opcional): Instalar como app en el celular

Como RepairTrack es una PWA (Progressive Web App):

**En Android:**
1. Abrir la URL en Chrome
2. Tocar el menú (⋮) → "Agregar a pantalla de inicio"
3. Se instala como una app nativa

**En iPhone:**
1. Abrir la URL en Safari
2. Tocar el ícono de compartir (↑) → "Agregar a inicio"
3. Aparece en la pantalla como una app

---

## Paso 10 (Opcional): Configurar n8n para WhatsApp

### Instalar n8n

**Opción A — n8n Cloud (más fácil, $20/mes):**
1. Ir a [https://n8n.io](https://n8n.io) → "Get Started Free"
2. Crear cuenta

**Opción B — Self-hosted (gratis):**
1. Necesitás un VPS (DigitalOcean $6/mes, o similar)
2. Instalar con Docker:
```bash
docker run -d --name n8n -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

### Crear Workflow: Notificación de presupuesto

1. En n8n, crear nuevo workflow
2. Agregar nodo **"Webhook"** → copiar la URL del webhook
3. En Supabase → Database → Webhooks → crear webhook:
   - Table: `ordenes`
   - Events: UPDATE
   - URL: la del webhook de n8n
4. En n8n, agregar nodos:
   - **IF**: `estado === 'ESPERANDO_APROBACION'`
   - **HTTP Request**: consultar datos del cliente en Supabase
   - **Twilio** o **HTTP Request** a Evolution API: enviar WhatsApp

### Para Evolution API (WhatsApp gratis):

1. Instalar con Docker:
```bash
docker run -d --name evolution \
  -p 8080:8080 \
  atendai/evolution-api
```
2. Conectar un número de WhatsApp escaneando QR
3. Usar la API REST para enviar mensajes

---

## Estructura del proyecto

```
repairtrack/
├── app/
│   ├── globals.css          # Estilos globales
│   ├── layout.js            # Layout raíz
│   ├── page.js              # Dashboard principal
│   └── cadete/
│       └── page.js          # Vista del cadete
├── components/
│   ├── Badge.js             # Badge de estado
│   ├── StatCard.js          # Tarjeta de estadística
│   ├── NuevoIngresoModal.js # Modal de ingreso
│   └── DetalleOrdenModal.js # Modal de detalle/estado
├── lib/
│   ├── supabase.js          # Cliente Supabase
│   ├── constants.js         # Estados, config
│   └── data.js              # Funciones de datos
├── supabase/
│   └── 001_schema.sql       # Schema completo
├── public/
│   └── manifest.json        # PWA manifest
├── package.json
├── tailwind.config.js
├── next.config.js
├── jsconfig.json
├── .env.example
└── .gitignore
```

---

## Troubleshooting

**"Error: Faltan variables de entorno"**
→ Verificar que NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY están configuradas en Vercel.

**"No se cargan datos"**
→ Verificar que ejecutaste el SQL en Supabase. Ir a Table Editor y verificar que existen las tablas.

**"Error de permisos (RLS)"**
→ Si estás usando sin autenticación, temporalmente podés desactivar RLS:
```sql
ALTER TABLE ordenes DISABLE ROW LEVEL SECURITY;
ALTER TABLE clientes DISABLE ROW LEVEL SECURITY;
ALTER TABLE talleres DISABLE ROW LEVEL SECURITY;
ALTER TABLE historial_estados DISABLE ROW LEVEL SECURITY;
ALTER TABLE movimientos_cadete DISABLE ROW LEVEL SECURITY;
ALTER TABLE notificaciones_enviadas DISABLE ROW LEVEL SECURITY;
```
⚠️ Solo hacerlo para testing inicial. Luego habilitar RLS con políticas adecuadas.

---

## Soporte

¿Problemas? Podés:
1. Volver a esta conversación y preguntarme
2. Verificar los logs en Vercel → Deployments → Logs
3. Verificar los logs en Supabase → Database → Logs

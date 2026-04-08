# RepairTrack V1 — Diseño para Cliente Real

**Fecha:** 2026-04-07
**Estado:** Aprobado

---

## Contexto

RepairTrack es un sistema de gestión de reparaciones para relojerías, construido con Next.js 14 + Supabase + Tailwind CSS. Este documento define el alcance y diseño de la primera versión productiva para un cliente real, partiendo de un deploy fresco (sin datos existentes a migrar).

---

## Lo que se elimina

- Módulo cadete completo (`/app/cadete`, link del header, lógica relacionada) — no aporta valor al cliente objetivo.

---

## Arquitectura General

Stack que se mantiene: **Next.js 14 + Supabase + Tailwind CSS**.

Hosting: opción paga a definir (Vercel, Railway, o VPS). Supabase Pro obligatorio para evitar pausing del proyecto.

El trabajo se organiza en 3 fases incrementales. Cada fase entrega valor independiente.

```
Fase 1 — Fundación
  ├── Auth con roles (dueño, empleado)
  ├── Base de clientes unificada
  └── Formulario de nueva orden actualizado

Fase 2 — Comunicación
  ├── Capa de email abstracta (Resend, escalable a WhatsApp u otros)
  ├── Tracking link por orden (/seguimiento/[token])
  ├── Recordatorios automáticos de mantenimiento (cron diario)
  └── Newsletter manual por segmento

Fase 3 — Admin + Reportes
  ├── Sección /admin (solo dueño)
  ├── Configuración de ciclos de mantenimiento por tipo de servicio
  ├── Gestión de usuarios
  └── Dashboard de reportes para el dueño
```

---

## Fase 1 — Fundación

### Auth y Roles

Implementado con **Supabase Auth**. Tres roles:

| Rol | Acceso |
|-----|--------|
| Dueño | Todo + sección /admin |
| Empleado | Crear y gestionar órdenes |
| Sin sesión | Redirigido al login |

Un middleware de Next.js protege todas las rutas según el rol del usuario autenticado.

### Base de Clientes

Nueva tabla `clientes`:

```sql
clientes
  id          uuid primary key
  nombre      text not null
  telefono    text
  email       text
  notas       text
  created_at  timestamp
```

Las órdenes pasan de tener `cliente_nombre` / `cliente_telefono` sueltos a tener un `cliente_id` (foreign key a `clientes`).

**Flujo de nueva orden:** el empleado busca el cliente por nombre o teléfono. Si existe, lo selecciona. Si no existe, lo crea en el momento sin salir del formulario.

**Vista de cliente:** desde el detalle de una orden se puede navegar al perfil del cliente y ver todo su historial de reparaciones.

---

## Fase 2 — Comunicación por Email

### Capa de notificaciones

Abstracción interna para desacoplar el canal del negocio:

```
lib/notifications/
  ├── index.js        ← sendNotification(tipo, datos)
  ├── email.js        ← implementación con Resend
  └── templates/      ← plantillas HTML por tipo de email
```

Para agregar WhatsApp u otro canal en el futuro: solo se agrega un nuevo archivo de implementación. El resto del sistema no cambia.

**Proveedor:** Resend (free tier: 3.000 emails/mes, suficiente para una relojería).

### Tracking Link por Orden

Al crear una orden se genera un token único. El cliente recibe un email automático con un link `/seguimiento/[token]` — página pública sin login que muestra:

- Estado actual de la orden
- Artículo y descripción
- Fecha estimada de entrega (si está cargada)

El email se dispara al crear la orden y al cambiar el estado a **Listo para Retiro** ("tu reloj está listo, podés pasar a buscarlo").

### Recordatorios de Mantenimiento

Al marcar una orden como **Entregada**, el sistema registra `fecha_entrega` + `tipo_servicio`.

Un **cron job diario** evalúa qué clientes cumplen el ciclo configurado para su tipo de servicio y envía el recordatorio por email.

**Implementación del cron:** ruta protegida `/api/cron/recordatorios?secret=TOKEN`. El trigger puede ser:
- cron-job.org (gratuito, portable entre hosts)
- VPS crontab (si se hostea en VPS)
- Vercel Cron Jobs (si se hostea en Vercel)

La lógica vive en la ruta de Next.js — el trigger es intercambiable sin cambiar código.

### Newsletter

Desde el panel del dueño: seleccionar segmento de clientes (todos, o filtrado por tipo de servicio), redactar el email, previsualizar y enviar. Todo dentro del sistema, sin herramientas externas de marketing.

---

## Fase 3 — Admin + Reportes

### Sección /admin (solo dueño)

**Configuración de ciclos de mantenimiento**

El dueño puede crear, editar y eliminar tipos de servicio con su ciclo de recordatorio. Ejemplo:

| Tipo de servicio | Ciclo recordatorio |
|------------------|--------------------|
| Cambio de pila | 18 meses |
| Service completo | 36 meses |
| Ajuste de correa | 12 meses |

Estos valores alimentan el formulario de nueva orden y el cron de recordatorios.

**Gestión de usuarios**

Alta y baja de empleados (nombre, email, rol). Invitación por email — Supabase Auth maneja el flujo de contraseña.

### Dashboard de Reportes

Métricas calculadas desde las órdenes existentes, visibles solo para el dueño:

- Órdenes ingresadas / completadas por mes
- Tiempo promedio de resolución por tipo de servicio
- Ingresos del mes (basado en `monto_presupuesto`)
- Clientes nuevos vs. recurrentes

Implementación: Tailwind + números grandes. Gráficos opcionales con Recharts si se requieren visualizaciones.

---

## Funcionalidades Identificadas para Versiones Futuras

Detectadas durante el diseño, no incluidas en V1:

- **Fotos adjuntas** a órdenes (estado al ingreso y al cierre)
- **Rating post-entrega** — email automático al cliente para calificar el servicio
- **Garantía de reparación** — registro de garantía al entregar, detección si el cliente vuelve con el mismo problema
- **PWA para móvil** — instalar la app en el celular sin App Store
- **Canal WhatsApp** — ya contemplado en la arquitectura, se agrega sin romper nada

---

## Costos Estimados

| Servicio | Costo/mes |
|----------|-----------|
| Supabase Pro | $25 |
| Hosting (VPS Hetzner o similar) | ~$5-20 |
| Resend | $0 (free tier) |
| cron-job.org | $0 |
| **Total estimado** | **~$30-45** |

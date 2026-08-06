# WhatsApp Meta Cloud API — Integración completa

**Fecha:** 2026-05-26
**Estado:** Aprobado

## Contexto

RepairTracker ya tiene un sistema de notificaciones dual (WhatsApp + Email) funcionando. El código actual envía mensajes de texto libre via Meta Cloud API v20.0. Para producción, Meta requiere:

1. Un webhook de verificación y recepción de status updates
2. Usar Message Templates aprobados en vez de texto libre
3. Un token permanente (System User) en vez del temporal del API Setup

El negocio (Riviera Joyas) ya tiene verificado el Meta Business Manager, el número de WhatsApp probado y funcionando.

## Alcance

- Solo envío de notificaciones (unidireccional)
- 3 tipos: PRESUPUESTO, LISTO_PARA_RETIRO, RECORDATORIO_MANTENIMIENTO
- Sin chatbot ni respuestas automáticas
- Sin cambios de UI — los triggers existentes en DetalleOrdenModal se mantienen

## 1. Webhook `/api/webhook/whatsapp`

### GET — Verificación de Meta

Meta envía un GET con `hub.mode`, `hub.verify_token` y `hub.challenge`. El endpoint:

1. Valida que `hub.mode === "subscribe"`
2. Valida que `hub.verify_token` coincida con `WHATSAPP_VERIFY_TOKEN` (env var)
3. Responde con `hub.challenge` (status 200) o 403 si no coincide

### POST — Status updates

Meta envía un POST con status updates de mensajes (sent, delivered, read, failed). El endpoint:

1. Parsea el payload buscando `entry[].changes[].value.statuses[]`
2. Para cada status, actualiza `notificaciones_enviadas` con el estado correspondiente
3. Siempre responde 200 (Meta reintenta si recibe otro código)

Mapeo de estados Meta → DB:
- `sent` → `enviado = true`
- `delivered` → campo `estado = 'delivered'`
- `read` → campo `estado = 'read'`
- `failed` → `enviado = false, error = <error message>`

**Requiere migración:** agregar columna `estado` y `wa_message_id` a `notificaciones_enviadas`.

## 2. Envío via Message Templates

### Cambio en `lib/notifications/whatsapp.js`

La función `sendWhatsApp()` cambia de:
```json
{ "type": "text", "text": { "body": "..." } }
```
a:
```json
{
  "type": "template",
  "template": {
    "name": "presupuesto_listo",
    "language": { "code": "es_AR" },
    "components": [{
      "type": "body",
      "parameters": [
        { "type": "text", "text": "Juan" },
        { "type": "text", "text": "1234" }
      ]
    }]
  }
}
```

### Firma de la función

```js
sendWhatsApp({ to, templateName, parameters })
```

- `to`: número del destinatario (se normaliza)
- `templateName`: nombre del template en Meta (ej: `presupuesto_listo`)
- `parameters`: array ordenado de strings

### Cambio en `lib/notifications/index.js`

`sendViaWhatsApp()` ya no interpola texto. En su lugar:
1. Lee de una nueva tabla `plantillas_whatsapp_meta` el nombre del template y el orden de parámetros
2. Arma el array de parámetros posicionales desde `data`
3. Llama a `sendWhatsApp({ to, templateName, parameters })`

La tabla `plantillas_whatsapp` existente sigue sirviendo para la UI de administración (vista previa del texto), pero el envío real usa los templates de Meta.

## 3. Tabla `plantillas_whatsapp_meta`

```sql
CREATE TABLE plantillas_whatsapp_meta (
  tipo TEXT PRIMARY KEY,           -- PRESUPUESTO, LISTO_PARA_RETIRO, etc.
  template_name TEXT NOT NULL,     -- nombre en Meta Business Manager
  language_code TEXT NOT NULL DEFAULT 'es_AR',
  param_keys TEXT[] NOT NULL       -- orden de keys del objeto data
);
```

Seed:
| tipo | template_name | language_code | param_keys |
|------|--------------|---------------|------------|
| PRESUPUESTO | presupuesto_listo | es_AR | {clienteNombre, numeroOrden, tipoArticulo, moneda, monto} |
| LISTO_PARA_RETIRO | listo_para_retiro | es_AR | {clienteNombre, numeroOrden, tipoArticulo} |
| RECORDATORIO_MANTENIMIENTO | recordatorio_mantenimiento | es_AR | {clienteNombre, tipoServicio, ultimaFecha} |

## 4. Templates para Meta Business Manager

Crear en Meta Business Manager (categoría UTILITY, idioma es_AR):

**`presupuesto_listo`**
```
Hola {{1}} — tenemos el presupuesto listo para tu artículo.
Orden: #{{2}} | Artículo: {{3}} | Presupuesto: {{4}} {{5}}
Avisanos si querés continuar con la reparación.
```

**`listo_para_retiro`**
```
Hola {{1}} — tu artículo está listo para retirar.
Orden: #{{2}} | Artículo: {{3}}
Podés pasar a buscarlo cuando quieras. ¡Gracias por confiar en nosotros!
```

**`recordatorio_mantenimiento`**
```
Hola {{1}} — te recordamos que es momento de hacer el mantenimiento de tu artículo.
Servicio recomendado: {{2}} | Último servicio: {{3}}
Comunicate con nosotros para coordinar la revisión.
```

## 5. Migración de `notificaciones_enviadas`

Agregar columnas para tracking de status:

```sql
ALTER TABLE notificaciones_enviadas
  ADD COLUMN IF NOT EXISTS wa_message_id TEXT,
  ADD COLUMN IF NOT EXISTS estado TEXT DEFAULT 'pending';
```

`sendWhatsApp()` retorna el `wa_message_id` del response de Meta para guardarlo.

## 6. Variables de entorno

**Nueva (1):**
```
WHATSAPP_VERIFY_TOKEN=<string arbitrario elegido por el usuario>
```

**Existentes (sin cambios):**
```
WHATSAPP_TOKEN=<access token de Meta>
WHATSAPP_PHONE_NUMBER_ID=<phone number id>
```

**Pendiente para producción:** reemplazar el token temporal del API Setup por un System User Token permanente. Documentar pasos.

## 7. Token permanente — pasos

1. Ir a Meta Business Manager → Business Settings → System Users
2. Crear un System User (tipo Admin)
3. Asignarle la app de WhatsApp con permiso `whatsapp_business_messaging`
4. Generar token permanente
5. Reemplazar `WHATSAPP_TOKEN` en Vercel

## Archivos a modificar

| Archivo | Cambio |
|---------|--------|
| `lib/notifications/whatsapp.js` | Enviar templates en vez de texto libre, retornar wa_message_id |
| `lib/notifications/index.js` | Leer de `plantillas_whatsapp_meta`, armar params posicionales |
| `app/api/webhook/whatsapp/route.js` | **NUEVO** — webhook GET + POST |
| `supabase/028_whatsapp_meta_templates.sql` | **NUEVO** — tabla plantillas_whatsapp_meta |
| `supabase/029_notificaciones_estado.sql` | **NUEVO** — agregar columnas a notificaciones_enviadas |
| `.env.example` | Agregar WHATSAPP_VERIFY_TOKEN |

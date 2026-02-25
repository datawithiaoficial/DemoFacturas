# CLAUDE.md — Facturify

Instrucciones para Claude Code. Lee este archivo antes de tocar cualquier cosa.

---

## 🗂️ Qué es este proyecto

Formulario web **estático** (sin build, sin npm, sin bundler) para subir facturas PDF
hacia un webhook de n8n. Tres archivos de código + este CLAUDE.md.

```
facturify/
├── index.html    → marcado HTML semántico puro
├── styles.css    → design tokens + componentes + animaciones
├── app.js        → lógica JS en módulos (sin frameworks)
└── CLAUDE.md     → este archivo
```

---

## ⚡ Cómo correr localmente

```bash
# Opción 1 — Live Server (VS Code)
# Click derecho en index.html → "Open with Live Server"

# Opción 2 — serve
npx serve .

# Opción 3 — python
python3 -m http.server 8080
```

> No hay `npm install`, no hay `package.json`. Es HTML/CSS/JS puro.

---

## 🔧 Configuración crítica

Todo lo configurable está en **`app.js` → objeto `CONFIG`** (primeras líneas del archivo):

```js
const CONFIG = {
  webhookUrl:     'https://nonexcitatory-lara-manlily.ngrok-free.dev/webhook/subir-factura',
  maxFilesPerDay: 10,
  maxFileSizeMB:  10,
  storageKey:     'facturify_quota',
};
```

**Ese es el único lugar donde se cambia la URL del webhook.** No hay `.env`.

---

## 🏗️ Arquitectura del flujo completo

```
Vercel (index.html)
   ↓  POST multipart/form-data
ngrok (túnel público → localhost:5678)
   ↓
n8n en Docker
   ↓
Google Drive → Extracción PDF → LLM → Google Sheets
```

---

## 📦 Módulos de app.js

| Módulo | Línea aprox. | Responsabilidad |
|---|---|---|
| `CONFIG` | 1 | URL webhook y constantes |
| `state` | 10 | Lista de archivos seleccionados |
| `Quota` | 15 | Cuota diaria con localStorage |
| `FileUtils` | 60 | Validación y formateo de archivos |
| `FileUI` | 100 | Renderizado de lista y estados visuales |
| `DropZone` | 180 | Eventos drag-and-drop y file input |
| `Uploader` | 215 | FormData y fetch al webhook |
| `Toast` | 310 | Notificaciones temporales |

---

## 🚨 BUG ACTIVO — HTTP 500 en `/webhook/subir-factura`

### Síntoma
```
POST /webhook/subir-factura   500 Internal Server Error
```
El webhook recibe la petición pero n8n falla internamente al procesar el binario.

### Causa más probable
n8n no encuentra el archivo binario porque el campo `file` en el `FormData`
no llega con el nombre de propiedad binaria que el flujo espera, o el nodo
**"Extract from File"** / **"Read Binary File"** no está configurado para leer
desde `data.binary.file`.

### Qué revisar y corregir en `app.js` → módulo `Uploader.buildPayload()`

**Verificar que el campo binario se llame exactamente `file`:**

```js
// ✅ Correcto — el nombre debe coincidir con "Binary Property" en el nodo Webhook de n8n
fd.append('file', file, file.name);
```

**Agregar el header `ngrok-skip-browser-warning`** para evitar que ngrok
intercepte la petición y devuelva HTML en lugar del binario:

```js
const res = await fetch(CONFIG.webhookUrl, {
  method:  'POST',
  headers: { 'ngrok-skip-browser-warning': 'true' },  // ← agregar esto
  body:    formData,
  // ⚠️ NO agregar Content-Type manualmente — FormData lo gestiona solo
});
```

**Mejorar el manejo de errores** para loguear el cuerpo real de la respuesta
y saber exactamente qué devuelve n8n en el 500:

```js
if (!res.ok) {
  const errorBody = await res.text();
  console.error(`[Facturify] HTTP ${res.status} →`, errorBody);
  throw new Error(`HTTP ${res.status}: ${errorBody}`);
}
```

### Qué revisar en n8n

1. **Nodo Webhook**
   - `HTTP Method`: POST
   - `Path`: `subir-factura`
   - `Response Mode`: Respond Immediately
   - `Binary Property`: `file` ← debe coincidir con el `fd.append('file', ...)`

2. **Nodo siguiente al Webhook** (el que procesa el PDF)
   - Si es "Extract from File": input binary field debe ser `file`
   - Si es "Google Drive Upload": binary property debe ser `file`

3. **Activar el flujo en Production**
   - El toggle del flujo debe estar en **Active** (verde)
   - Usar la URL `/webhook/` no `/webhook-test/`

### Comando para ver logs de n8n en Docker

```bash
docker logs n8n-mvp --tail 50 --follow
```

Buscar líneas con `ERROR` o `Error` justo después del timestamp que coincida
con el momento del envío.

---

## 🚫 Reglas — qué NO hacer

- No agregar frameworks (React, Vue, etc.)
- No agregar `package.json` ni dependencias externas
- No definir `Content-Type` manualmente en el `fetch` — rompe el `boundary` del `FormData`
- No modificar la estructura de carpetas
- No cambiar los nombres de los módulos en `app.js` sin actualizar este archivo

---

## ✅ Checklist antes de cada deploy a Vercel

- [ ] `CONFIG.webhookUrl` apunta a la URL ngrok activa
- [ ] El flujo n8n está en modo **Active** (Production)
- [ ] ngrok está corriendo: `ngrok http 5678`
- [ ] n8n Docker está corriendo: `docker ps | grep n8n-mvp`
- [ ] El nodo Webhook en n8n tiene `Binary Property: file`

---

## ☁️ Deploy a Vercel

```bash
# CLI
vercel deploy --prod

# O drag & drop de la carpeta en vercel.com/new
```

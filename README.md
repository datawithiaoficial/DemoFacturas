# 🚀 Facturify – MVP Automatización de Facturas con n8n

Sistema automatizado para recepción, procesamiento y extracción de datos de facturas PDF usando:

- Frontend en **Vercel**
- Webhook público vía **ngrok**
- **n8n** en Docker
- Procesamiento de **PDF**
- Extracción estructurada con **LLM**
- Persistencia en **Google Sheets**

---

## 🏗️ Arquitectura del Sistema

```
Usuario
   ↓
Formulario Web (Vercel)
   ↓
Webhook público (ngrok)
   ↓
n8n (Docker local)
   ↓
Google Drive (almacenamiento)
   ↓
Extracción PDF
   ↓
LLM (estructura JSON)
   ↓
Google Sheets (Base de datos)
```

---

## 📁 Estructura del Proyecto

```
facturify/
├── index.html    → Estructura HTML y marcado semántico
├── styles.css    → Tokens de diseño, componentes y animaciones
├── app.js        → Lógica JS organizada en módulos
└── README.md     → Este archivo
```

---

## 📦 Stack Tecnológico

| Capa | Tecnología |
|---|---|
| Frontend | HTML + JS Vanilla |
| Hosting Frontend | Vercel |
| Orquestación | n8n |
| Infraestructura local | Docker |
| Exposición pública | ngrok |
| Almacenamiento | Google Drive |
| Base de datos | Google Sheets |
| IA | LLM para extracción estructurada |

---

## ⚙️ Configuración del Entorno

### 1️⃣ Iniciar ngrok

```bash
ngrok http 5678
```

Copiar la URL HTTPS generada, por ejemplo:

```
https://xxxxx.ngrok-free.dev
```

---

### 2️⃣ Levantar n8n en Docker

```bash
docker run -it \
  --name n8n-mvp \
  -p 5678:5678 \
  -e N8N_HOST=xxxxx.ngrok-free.dev \
  -e N8N_PROTOCOL=https \
  -e WEBHOOK_URL=https://xxxxx.ngrok-free.dev \
  -e N8N_CORS_ALLOW_ORIGIN=* \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n
```

> ⚠️ **Importante:**
> - `N8N_HOST` → sin `https://`
> - `WEBHOOK_URL` → con `https://`
> - No usar `--rm` para mantener el contenedor entre reinicios
> - El volumen `-v ~/.n8n:/home/node/.n8n` persiste credenciales y flujos

---

## 🔗 Configuración del Webhook en n8n

| Parámetro | Valor |
|---|---|
| HTTP Method | `POST` |
| Path | `subir-factura` |
| Response Mode | `Respond Immediately` |
| Binary Property | `file` |

**Production URL esperada:**

```
https://xxxxx.ngrok-free.dev/webhook/subir-factura
```

---

## 🌐 Configuración del Frontend

Editar el objeto `CONFIG` en `app.js`:

```js
const CONFIG = {
  webhookUrl:     'https://xxxxx.ngrok-free.dev/webhook/subir-factura',
  maxFilesPerDay: 10,
  maxFileSizeMB:  10,
  storageKey:     'facturify_quota',
};
```

El envío se realiza con `FormData` sin definir `Content-Type` manualmente:

```js
await fetch(CONFIG.webhookUrl, {
  method: 'POST',
  body: formData   // el navegador asigna multipart/form-data automáticamente
});
```

> ⚠️ **No definir `Content-Type` manualmente** al usar `FormData` — el navegador
> incluye el `boundary` necesario de forma automática. Definirlo manualmente rompe el envío.

---

## 📂 Flujo Interno en n8n

### 1️⃣ Recepción del archivo
El nodo **Webhook** recibe el PDF como binario junto con los metadatos del formulario.

---

### 2️⃣ Crear carpeta mensual dinámica en Google Drive

Estructura de carpetas generada automáticamente:

```
Lectura_de_Facturas_DEMO/
└── 2026/
    └── Febrero/
```

Se crea la carpeta si no existe antes de guardar el archivo.

---

### 3️⃣ Guardar PDF en Google Drive
El binario se sube a la carpeta mensual correspondiente conservando el nombre original del archivo.

---

### 4️⃣ Extracción de texto del PDF
Para el MVP se usa extracción directa de texto del PDF.

> 📌 Si el PDF es una imagen escaneada → mejora futura con **OCR** (ej. Google Vision API o Textract).

---

### 5️⃣ LLM – Extracción estructurada

El modelo recibe el texto extraído y devuelve un JSON normalizado:

```json
{
  "ruc_emisor":      "20611317141",
  "razon_social":    "DC PHARMA S.A.C.",
  "numero_factura":  "F001-000235",
  "fecha_emision":   "15-07-2025",
  "moneda":          "PEN",
  "total":           "4180.00",
  "igv":             "637.63"
}
```

---

### 6️⃣ Code Node – Limpieza y normalización

El nodo de código realiza:

- Limpia bloques de código ` ```json ``` ` si el LLM los incluye
- Parsea el JSON de forma segura
- Normaliza el formato de fechas
- Genera la **clave única** compuesta para deduplicación:

```js
const claveUnica = `${data.ruc_emisor}-${data.numero_factura}`;
```

---

### 7️⃣ Google Sheets – Inserción con control de duplicados

Antes de insertar, se verifica si la clave compuesta ya existe en la hoja.  
Solo se inserta el registro si **no existe previamente**.

---

## 🛡️ Control de Duplicados

**Llave única propuesta:**

```
ruc_emisor + numero_factura
```

Esto previene que el mismo documento subido con diferente nombre de archivo
genere registros duplicados en Google Sheets.

---

## 📊 Control de Cuota Diaria (Frontend)

Implementado en `app.js` mediante el módulo `Quota` con persistencia en `localStorage`.

| Regla | Valor |
|---|---|
| Máximo archivos por día | 10 |
| Tamaño máximo por archivo | 10 MB |
| Tipos permitidos | Solo `.pdf` |
| Control de duplicados | Por nombre + tamaño |
| Persistencia | `localStorage` (se reinicia a medianoche) |

---

## ☁️ Despliegue del Frontend en Vercel

```bash
# Opción 1 – CLI
npm i -g vercel
vercel deploy

# Opción 2 – Drag & Drop
# Arrastra la carpeta facturify/ en vercel.com/new
```

> Recuerda actualizar `CONFIG.webhookUrl` en `app.js` con la URL de ngrok
> cada vez que reinicies el túnel (a menos que uses un dominio estático gratuito).

---

## 🧩 Módulos de `app.js`

| Módulo | Responsabilidad |
|---|---|
| `CONFIG` | Constantes configurables (URL, límites) |
| `state` | Estado mutable compartido (lista de archivos) |
| `Quota` | Cuota diaria con persistencia en localStorage |
| `FileUtils` | Formateo y validación de archivos |
| `FileUI` | Renderizado y estados visuales de la lista |
| `DropZone` | Eventos de drag-and-drop y selector de archivos |
| `Uploader` | Construcción del FormData y envío al webhook |
| `Toast` | Notificaciones emergentes temporales |

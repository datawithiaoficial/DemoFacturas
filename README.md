# 📄 Facturify — Formulario de Carga de Facturas PDF

Formulario web estático para subir facturas PDF hacia un webhook de **n8n**.

---

## 📁 Estructura del proyecto

```
facturify/
├── index.html    → Estructura HTML y marcado semántico
├── styles.css    → Tokens de diseño, componentes y animaciones
├── app.js        → Lógica JS organizada en módulos
└── README.md     → Este archivo
```

---

## ⚙️ Configuración

Abre `app.js` y edita el objeto `CONFIG` al inicio del archivo:

```js
const CONFIG = {
  webhookUrl:     'https://TU-URL-NGROK.ngrok-free.app/webhook/facturas',
  maxFilesPerDay: 10,   // límite diario de archivos
  maxFileSizeMB:  10,   // tamaño máximo por archivo
  storageKey:     'facturify_quota',
};
```

---

## 🚀 Uso con ngrok + n8n local

```bash
# 1. Levantar n8n
n8n start

# 2. Exponer con ngrok (dominio estático recomendado)
ngrok http --domain=tu-subdominio.ngrok-free.app 5678

# 3. Pegar la URL en CONFIG.webhookUrl de app.js
```

---

## ☁️ Despliegue en la nube (recomendado)

| Plataforma     | Pasos |
|----------------|-------|
| **Netlify**    | Arrastra la carpeta al dashboard de netlify.com |
| **GitHub Pages** | Sube el repo y activa Pages en Settings |
| **Vercel**     | `vercel deploy` desde la carpeta |

---

## 📦 Datos enviados al webhook n8n

Cada archivo se envía como `multipart/form-data` con los siguientes campos:

| Campo        | Descripción                        |
|--------------|------------------------------------|
| `file`       | Binario del PDF                    |
| `fileName`   | Nombre del archivo                 |
| `fileSize`   | Tamaño en bytes                    |
| `email`      | Correo del remitente               |
| `category`   | `factura_compra` o `factura_venta` |
| `notes`      | Notas adicionales (opcional)       |
| `uploadDate` | ISO timestamp del envío            |
| `fileIndex`  | Índice del archivo en el lote      |
| `totalFiles` | Total de archivos en el lote       |

---

## 🧩 Módulos de `app.js`

| Módulo      | Responsabilidad                              |
|-------------|----------------------------------------------|
| `CONFIG`    | Constantes configurables                     |
| `state`     | Estado mutable compartido (lista de archivos)|
| `Quota`     | Cuota diaria con persistencia en localStorage|
| `FileUtils` | Formateo y validación de archivos            |
| `FileUI`    | Renderizado y estados visuales de la lista   |
| `DropZone`  | Eventos de drag-and-drop y selector          |
| `Uploader`  | Envío al webhook, construcción de FormData   |
| `Toast`     | Notificaciones temporales                    |

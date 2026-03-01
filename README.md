# Verificador de Billetes — Bolivia 🇧🇴

Herramienta web gratuita para verificar si un billete boliviano de la **Serie B** (Bs10, Bs20, Bs50) fue invalidado por el Banco Central de Bolivia (BCB) tras el accidente aéreo del 27 de febrero de 2026.

## ✨ Características

- 📷 **Escaneo con cámara** — Usa la cámara del celular para capturar el número de serie
- ✏️ **Ingreso manual** — Ingresa el número de serie manualmente
- 🔍 **OCR integrado** — Reconocimiento óptico de caracteres con Tesseract.js
- 📱 **PWA** — Se puede instalar como app en el celular
- 🌙 **Modo oscuro** — Soporte automático para dark mode
- 🔒 **100% cliente** — No se envían datos a ningún servidor
- 🆓 **Gratuito y sin publicidad**

## 🚀 Cómo usarla

### Opción 1: Visitar el sitio web
👉 **[https://marbusjim.github.io/banknote-validator-bo/](https://marbusjim.github.io/banknote-validator-bo/)**

### Opción 2: Ejecutar localmente
1. Clona este repositorio
2. Abre `index.html` en un navegador (o usa un servidor local)

```bash
# Con Python
python -m http.server 8000

# Con Node.js
npx serve .
```

## 📋 Cómo actualizar la lista de billetes invalidados

Cuando el BCB publique la lista oficial de numeraciones invalidadas:

1. Abre el archivo `js/invalid-serials.js`
2. Agrega los números de serie en el Set correspondiente:

```javascript
"10": new Set([
  "B0012345678",
  "B0012345679",
  // ... más números
]),
```

3. Actualiza `lastUpdated` con la fecha de la publicación
4. Haz commit y push a GitHub — ¡los cambios se publicarán automáticamente!

### Actualización remota (opcional)

También puedes crear un archivo JSON en `data/invalid-serials.json`:

```json
{
  "lastUpdated": "2026-03-02T12:00:00Z",
  "10": ["B0012345678", "B0012345679"],
  "20": ["B0023456789"],
  "50": ["B0034567890"]
}
```

Y configurar la URL en `js/app.js` → `REMOTE_SERIALS_URL`.

## 🏗️ Estructura del proyecto

```
banknote-validator-bo/
├── index.html              # Página principal
├── manifest.json           # PWA manifest
├── css/
│   └── styles.css          # Estilos (mobile-first)
├── js/
│   ├── app.js              # Lógica principal de la app
│   ├── camera.js           # Módulo de cámara
│   ├── validator.js        # Motor de validación
│   └── invalid-serials.js  # Base de datos de billetes invalidados
├── icons/
│   └── icon.svg            # Ícono de la app
└── README.md
```

## 🌐 Despliegue gratuito en GitHub Pages

1. Sube el código a un repositorio de GitHub
2. Ve a **Settings** → **Pages**
3. En "Source" selecciona **Deploy from a branch**
4. Selecciona la rama `main` y carpeta `/ (root)`
5. ¡Listo! Tu app estará disponible en `https://marbusjim.github.io/banknote-validator-bo/`

## ⚖️ Aviso legal

Esta es una herramienta comunitaria de uso libre. La información oficial sobre los billetes invalidados proviene exclusivamente del [Banco Central de Bolivia](https://www.bcb.gob.bo). Esta herramienta no tiene afiliación con el BCB.

## 📄 Licencia

MIT — Usa, modifica y comparte libremente.

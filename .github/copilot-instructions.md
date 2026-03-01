# Copilot Instructions — Banknote Validator Bolivia

## Project Overview

This is a **free, ad-free, client-side web application** that helps Bolivian citizens verify whether their banknotes (Serie B — Bs10, Bs20, Bs50) were invalidated by the **Banco Central de Bolivia (BCB)** after an airplane accident on **February 27, 2026**. The BCB declared certain serial number ranges of Serie B banknotes to have no legal value.

**Live site:** https://marbusjim.github.io/banknote-validator-bo/

## Tech Stack

- **Pure HTML/CSS/JS** — No frameworks, no build tools, no bundlers.
- **Tesseract.js v5** (CDN) — OCR engine for reading serial numbers from camera captures.
- **PWA** — Installable on mobile via `manifest.json`.
- **GitHub Pages** — Free HTTPS hosting (required for camera access).
- All processing is **100% client-side** — no data ever leaves the user's device.

## Architecture

| File | Purpose |
|------|---------|
| `index.html` | Single-page app shell. All UI in Spanish. |
| `css/styles.css` | Mobile-first responsive styles, dark mode support, CSS variables for banknote colors. |
| `js/app.js` | Main orchestration — camera lifecycle, OCR pipeline, UI state management, result display. |
| `js/camera.js` | `CameraModule` IIFE — camera access, frame capture, image enhancement for OCR, flashlight toggle. |
| `js/validator.js` | `BanknoteValidator` IIFE — OCR text parsing, strip extraction, serial validation against ranges. |
| `js/invalid-serials.js` | `INVALID_SERIALS` object — BCB official invalid serial number **ranges** as `[from, to]` arrays. Also exports `isSerialInvalid()`, `getTotalInvalidCount()`, `getDenominationInvalidCount()`. |
| `manifest.json` | PWA manifest (lang: es, theme: #1a237e). |
| `icons/icon.svg` | App icon with Bolivian flag colors. |

## How Scanning Works

The app reads the **bottom strip of the banknote**, which contains three pieces of information arranged horizontally:

```
┌─────────────────────────────────────────────────┐
│  50          102086675                        A  │
│  ↑ denom     ↑ serial number        series ↑    │
└─────────────────────────────────────────────────┘
```

1. **Camera captures** a wide horizontal strip (92% width × 22% height of video frame).
2. **Image enhancement** converts to grayscale with contrast boost for better OCR.
3. **Tesseract.js** runs OCR on the enhanced image.
4. **`extractFromStrip()`** in `validator.js` parses the OCR text using 4 strategies:
   - Full pattern: `50 102086675 A` (denomination + serial + series letter)
   - Partial: `102086675 A` (serial + letter, no denomination)
   - Reversed: `A 102086675` (letter + serial)
   - Fallback: just a long number `102086675`
5. **OCR character correction** fixes common misreads (`O→0`, `I→1`, `Z→2`, `G→6`).
6. **Series check**: if the letter ≠ B, the bill is **not affected** (only Serie B was invalidated).
7. **Range validation**: the numeric serial is checked against `INVALID_SERIALS[denomination]` ranges.

## Validation Logic

- Serials are stored as **integer ranges** `[from, to]` (inclusive), not individual numbers (there are millions of invalidated bills).
- The `validate()` function accepts `(denomination, serialNumber, seriesLetter)`.
- `autoValidate(ocrText)` is the camera flow entry point — extracts all data from OCR text automatically.
- Results have `status`: `"valid"`, `"invalid"`, `"not-applicable"`, `"not-found"`, or `"error"`.

## Invalid Serial Ranges (BCB Data)

- **Bs50**: 10 ranges covering serials from 67,250,001 to 92,250,000
- **Bs20**: 16 ranges covering serials from 87,280,145 to 120,950,000
- **Bs10**: 12 ranges covering serials from 77,100,001 to 109,850,000

Data source: Official BCB publication — "NÚMEROS DE SERIE DE LOS BILLETES DE LA SERIE B QUE NO TIENEN VALOR LEGAL"

## UI/UX Details

- **Language**: All UI text is in **Spanish** (Bolivian). Code and comments are in **English**.
- **Banknote colors** (matching real bills):
  - Bs10 → Blue (`#1565c0`)
  - Bs20 → Orange (`#e65100`)
  - Bs50 → Violet (`#6a1b9a`)
- **Two input modes**: Camera scan (default) and Manual entry.
- **Manual form** has: denomination selector (Bs10/20/50), series letter selector (A/B/C/D), and numeric serial input.
- **Camera overlay** shows a thin horizontal strip guide with the expected format.
- **Results** show a color-coded mini banknote visual with the detected serial info.

## Camera Module Details

- Prefers rear camera (`facingMode: "environment"`).
- Supports camera switching and flashlight (torch) toggle.
- Returns structured `{ success, error }` objects with classified error types:
  `permission-denied`, `insecure-context`, `no-camera`, `camera-in-use`, `not-supported`.
- Camera stays active after showing results (not stopped until switching to manual mode or page hidden).
- Re-acquires DOM elements if they were disconnected.

## Development Guidelines

- Keep it **zero-dependency** (only Tesseract.js from CDN).
- All modules use the **IIFE revealing module pattern** (no ES modules, for direct browser loading).
- Maintain **mobile-first** responsive design.
- Camera requires **HTTPS** — test via GitHub Pages or `localhost`.
- When editing `invalid-serials.js`, keep the `[from, to]` range format and update `lastUpdated`.
- Dark mode is handled via `@media (prefers-color-scheme: dark)` and CSS variables.

## Deployment

```bash
git add -A && git commit -m "description" && git push origin main
```

GitHub Pages auto-deploys from the `main` branch root.

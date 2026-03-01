/**
 * Main Application Module
 * Orchestrates camera, OCR, validation, and UI interactions.
 */

(() => {
  "use strict";

  // ── DOM References ─────────────────────────────────────────────────
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => document.querySelectorAll(sel);

  // Tabs
  const tabCamera = $("#tabCamera");
  const tabManual = $("#tabManual");
  const cameraSection = $("#cameraSection");
  const manualSection = $("#manualSection");

  // Camera
  const cameraContainer = $("#cameraContainer");
  const cameraFeed = $("#cameraFeed");
  const captureCanvas = $("#captureCanvas");
  const btnCapture = $("#btnCapture");
  const btnSwitchCamera = $("#btnSwitchCamera");
  const btnFlash = $("#btnFlash");
  const ocrStatus = $("#ocrStatus");
  const ocrResult = $("#ocrResult");
  const ocrText = $("#ocrText");
  const btnUseOcr = $("#btnUseOcr");
  const btnRetry = $("#btnRetry");

  // Manual form
  const denomBtns = $$(".denom-btn");
  const serialInput = $("#serialInput");
  const btnValidate = $("#btnValidate");

  // Results
  const resultSection = $("#resultSection");
  const resultValid = $("#resultValid");
  const resultInvalid = $("#resultInvalid");
  const resultNA = $("#resultNA");
  const validDetail = $("#validDetail");
  const invalidDetail = $("#invalidDetail");
  const naMessage = $("#naMessage");
  const btnNewCheck = $("#btnNewCheck");

  // Info banner
  const infoBanner = $("#infoBanner");
  const infoBannerClose = $("#infoBannerClose");

  // Data status
  const dataStatusText = $("#dataStatusText");

  // ── State ──────────────────────────────────────────────────────────
  let selectedDenomination = null;
  let currentMode = "camera"; // "camera" | "manual"
  let ocrWorker = null;

  // ── URL for remote serial numbers (optional) ───────────────────────
  // Set this to your hosted JSON file URL when available.
  // Example: "https://marbusjim.github.io/banknote-validator-bo/data/invalid-serials.json"
  const REMOTE_SERIALS_URL = null;

  // ── Initialization ─────────────────────────────────────────────────
  async function init() {
    setupEventListeners();
    updateDataStatus();

    // Try to load remote serials if URL is configured
    if (REMOTE_SERIALS_URL) {
      const loaded = await loadRemoteSerials(REMOTE_SERIALS_URL);
      if (loaded) {
        updateDataStatus();
      }
    }

    // Initialize camera module
    CameraModule.init(cameraFeed, captureCanvas);

    // Start camera if supported and in camera mode
    if (CameraModule.isSupported() && currentMode === "camera") {
      const result = await CameraModule.start();
      if (!result.success) {
        showCameraError(result.error);
      }
    } else if (!CameraModule.isSupported()) {
      showCameraError("not-supported");
    }
  }

  // ── Event Listeners ────────────────────────────────────────────────
  function setupEventListeners() {
    // Tab switching
    tabCamera.addEventListener("click", () => switchMode("camera"));
    tabManual.addEventListener("click", () => switchMode("manual"));

    // Camera controls
    btnCapture.addEventListener("click", handleCapture);
    btnSwitchCamera.addEventListener("click", handleSwitchCamera);
    btnFlash.addEventListener("click", handleFlashToggle);

    // OCR result actions
    btnUseOcr.addEventListener("click", handleUseOcrResult);
    btnRetry.addEventListener("click", handleRetry);

    // Denomination buttons
    denomBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        selectDenomination(btn.dataset.value);
      });
    });

    // Serial input
    serialInput.addEventListener("input", handleSerialInput);
    serialInput.addEventListener("keypress", (e) => {
      if (e.key === "Enter" && !btnValidate.disabled) {
        handleValidate();
      }
    });

    // Validate button
    btnValidate.addEventListener("click", handleValidate);

    // New check
    btnNewCheck.addEventListener("click", handleNewCheck);

    // Info banner close
    infoBannerClose.addEventListener("click", () => {
      infoBanner.classList.add("hidden");
      localStorage.setItem("infoBannerClosed", "true");
    });

    // Restore banner state
    if (localStorage.getItem("infoBannerClosed") === "true") {
      infoBanner.classList.add("hidden");
    }

    // Handle page visibility (stop camera when tab hidden)
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && currentMode === "camera") {
        CameraModule.stop();
      } else if (!document.hidden && currentMode === "camera") {
        CameraModule.start();
      }
    });
  }

  // ── Mode Switching ─────────────────────────────────────────────────
  async function switchMode(mode) {
    currentMode = mode;

    // Update tabs
    tabCamera.classList.toggle("active", mode === "camera");
    tabManual.classList.toggle("active", mode === "manual");

    // Update sections
    cameraSection.classList.toggle("active", mode === "camera");
    manualSection.classList.toggle("active", mode === "manual");

    // Handle camera lifecycle
    if (mode === "camera") {
      if (CameraModule.isSupported()) {
        const result = await CameraModule.start();
        if (!result.success) {
          showCameraError(result.error);
        }
      }
    } else {
      CameraModule.stop();
    }

    // Hide results when switching modes
    hideResults();
  }

  // ── Denomination Selection ─────────────────────────────────────────
  function selectDenomination(value) {
    selectedDenomination = value;

    denomBtns.forEach((btn) => {
      btn.classList.toggle("active", btn.dataset.value === value);
    });

    updateValidateButton();
  }

  // ── Serial Input Handling ──────────────────────────────────────────
  function handleSerialInput() {
    updateValidateButton();
  }

  function updateValidateButton() {
    const hasSerial = serialInput.value.trim().length > 0;
    const hasDenom = selectedDenomination !== null;
    btnValidate.disabled = !(hasSerial && hasDenom);
  }

  // ── Validation ─────────────────────────────────────────────────────
  function handleValidate() {
    const serial = serialInput.value.trim();

    if (!selectedDenomination || !serial) return;

    const result = BanknoteValidator.validate(selectedDenomination, serial);
    showResult(result);
  }

  // ── Camera Capture & OCR ───────────────────────────────────────────
  async function handleCapture() {
    if (!CameraModule.isActive()) {
      const result = await CameraModule.start();
      if (!result.success) {
        showCameraError(result.error);
        return;
      }
    }

    const imageDataURL = CameraModule.getCapturedImageDataURL();
    if (!imageDataURL) return;

    // Show processing status
    ocrStatus.style.display = "flex";
    ocrResult.style.display = "none";
    btnCapture.disabled = true;

    try {
      const text = await performOCR(imageDataURL);

      ocrStatus.style.display = "none";
      btnCapture.disabled = false;

      if (text && text.trim()) {
        // Try to extract a serial number
        const extracted = BanknoteValidator.extractSerial(text);
        ocrText.textContent = extracted || text.trim();
        ocrResult.style.display = "block";
      } else {
        showOCRError();
      }
    } catch (err) {
      console.error("OCR Error:", err);
      ocrStatus.style.display = "none";
      btnCapture.disabled = false;
      showOCRError();
    }
  }

  /**
   * Perform OCR using Tesseract.js
   * @param {string} imageDataURL - Base64 image data URL
   * @returns {Promise<string>} Recognized text
   */
  async function performOCR(imageDataURL) {
    // Check if Tesseract is available
    if (typeof Tesseract === "undefined") {
      console.error("Tesseract.js is not loaded");
      throw new Error("OCR library not available");
    }

    try {
      const result = await Tesseract.recognize(imageDataURL, "eng", {
        logger: (info) => {
          if (info.status === "recognizing text") {
            // Could update a progress bar here
            console.log(`OCR progress: ${Math.round(info.progress * 100)}%`);
          }
        },
      });

      return result.data.text;
    } catch (err) {
      console.error("Tesseract error:", err);
      throw err;
    }
  }

  function showOCRError() {
    ocrText.textContent = "No se pudo leer el texto. Intenta de nuevo o usa el ingreso manual.";
    ocrResult.style.display = "block";
    btnUseOcr.style.display = "none";
  }

  function handleUseOcrResult() {
    const detectedText = ocrText.textContent;
    if (!detectedText) return;

    // Switch to manual mode with the detected serial
    switchMode("manual");
    serialInput.value = detectedText;

    // Auto-detect denomination if possible (not reliable from OCR alone)
    updateValidateButton();

    // Hide OCR result
    ocrResult.style.display = "none";
    btnUseOcr.style.display = "inline-flex";
  }

  function handleRetry() {
    ocrResult.style.display = "none";
    btnUseOcr.style.display = "inline-flex";
  }

  // ── Camera Controls ────────────────────────────────────────────────
  async function handleSwitchCamera() {
    btnSwitchCamera.disabled = true;
    await CameraModule.switchCamera();
    btnSwitchCamera.disabled = false;
  }

  async function handleFlashToggle() {
    const flashState = await CameraModule.toggleFlash();
    btnFlash.classList.toggle("active", flashState);
  }

  function showCameraError(errorType) {
    const messages = {
      "permission-denied": {
        title: "Permiso de cámara denegado",
        body: `Para usar la cámara necesitas otorgar permiso:
          <ol style="text-align:left;margin:8px 0;padding-left:20px;font-size:0.8rem;line-height:1.8">
            <li>Toca el ícono 🔒 en la barra de direcciones</li>
            <li>Busca <strong>"Cámara"</strong> y cámbialo a <strong>"Permitir"</strong></li>
            <li>Recarga la página</li>
          </ol>
          <span style="font-size:0.75rem">O puedes usar el <strong>ingreso manual</strong> abajo.</span>`,
      },
      "insecure-context": {
        title: "Se requiere conexión segura (HTTPS)",
        body: `La cámara solo funciona con HTTPS. Si estás probando localmente, usa <strong>localhost</strong>.<br><br>
          <span style="font-size:0.75rem">Puedes usar el <strong>ingreso manual</strong> sin problemas.</span>`,
      },
      "no-camera": {
        title: "No se detectó cámara",
        body: "No se encontró una cámara en tu dispositivo. Usa el <strong>ingreso manual</strong> para verificar tu billete.",
      },
      "camera-in-use": {
        title: "Cámara en uso",
        body: "La cámara está siendo usada por otra aplicación. Cierra las otras apps y recarga la página.",
      },
      "not-supported": {
        title: "Cámara no soportada",
        body: "Tu navegador no soporta acceso a la cámara. Usa un navegador actualizado como <strong>Chrome</strong> o <strong>Safari</strong>, o usa el <strong>ingreso manual</strong>.",
      },
    };

    const msg = messages[errorType] || {
      title: "Error de cámara",
      body: "No se pudo acceder a la cámara. Verifica los permisos o usa el <strong>ingreso manual</strong>.",
    };

    cameraContainer.innerHTML = `
      <div class="camera-error">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 1l22 22M21 21H3a2 2 0 01-2-2V8a2 2 0 012-2h3l2-3h6"/>
          <path d="M18.5 14.5A4 4 0 0014 11"/>
        </svg>
        <p style="font-weight:600;font-size:1rem;margin-bottom:4px">${msg.title}</p>
        <div style="font-size:0.85rem;opacity:0.9">${msg.body}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-small" onclick="location.reload()">🔄 Reintentar</button>
          <button class="btn btn-small btn-outline" id="btnGoManual">✏️ Ingreso Manual</button>
        </div>
      </div>
    `;

    // Add listener for "go to manual" button
    const btnGoManual = document.getElementById("btnGoManual");
    if (btnGoManual) {
      btnGoManual.addEventListener("click", () => switchMode("manual"));
    }
  }

  // ── Result Display ─────────────────────────────────────────────────
  function showResult(result) {
    hideResults();
    resultSection.style.display = "block";

    const detailText = `Corte: Bs${result.denomination} | Serie: B | N°: ${result.normalized}`;

    switch (result.status) {
      case "valid":
        resultValid.style.display = "block";
        validDetail.textContent = detailText;
        break;

      case "invalid":
        resultInvalid.style.display = "block";
        invalidDetail.textContent = detailText;
        break;

      case "not-applicable":
        resultNA.style.display = "block";
        naMessage.textContent = result.message;
        break;

      case "error":
        resultNA.style.display = "block";
        naMessage.textContent = result.message;
        break;
    }

    // Scroll to result
    resultSection.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function hideResults() {
    resultSection.style.display = "none";
    resultValid.style.display = "none";
    resultInvalid.style.display = "none";
    resultNA.style.display = "none";
  }

  function handleNewCheck() {
    hideResults();

    // Reset form
    serialInput.value = "";
    selectedDenomination = null;
    denomBtns.forEach((btn) => btn.classList.remove("active"));
    btnValidate.disabled = true;

    // Reset OCR display
    ocrResult.style.display = "none";
    ocrStatus.style.display = "none";
    btnUseOcr.style.display = "inline-flex";

    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Restart camera if in camera mode
    if (currentMode === "camera" && CameraModule.isSupported()) {
      CameraModule.start();
    }
  }

  // ── Data Status ────────────────────────────────────────────────────
  function updateDataStatus() {
    const dbStatus = BanknoteValidator.getDatabaseStatus();

    if (dbStatus.lastUpdated) {
      const date = new Date(dbStatus.lastUpdated);
      const formatted = date.toLocaleDateString("es-BO", {
        day: "numeric",
        month: "long",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
      dataStatusText.textContent =
        `Datos actualizados: ${formatted} — ${dbStatus.totalCount} billetes registrados`;
    } else {
      dataStatusText.textContent =
        "⏳ Datos: Pendiente de publicación oficial del BCB";
    }
  }

  // ── Start the app ──────────────────────────────────────────────────
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();

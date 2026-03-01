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
  const ocrStatusText = $("#ocrStatusText");
  const scanError = $("#scanError");
  const scanErrorText = $("#scanErrorText");
  const btnRetryCapture = $("#btnRetryCapture");
  const btnGoManualFromScan = $("#btnGoManualFromScan");

  // Debug OCR output
  const ocrDebug = $("#ocrDebug");
  const ocrDebugText = $("#ocrDebugText");
  const ocrDebugParsed = $("#ocrDebugParsed");

  // Manual form
  const denomBtns = $$(".denom-btn");
  const seriesBtns = $$(".series-btn");
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
  let selectedSeries = null;
  let currentMode = "camera"; // "camera" | "manual"

  // ── Initialization ─────────────────────────────────────────────────
  async function init() {
    setupEventListeners();
    updateDataStatus();

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

    // Scan error actions
    btnRetryCapture.addEventListener("click", handleRetryScan);
    btnGoManualFromScan.addEventListener("click", () => switchMode("manual"));

    // Denomination buttons
    denomBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        selectDenomination(btn.dataset.value);
      });
    });

    // Series letter buttons
    seriesBtns.forEach((btn) => {
      btn.addEventListener("click", () => {
        selectSeries(btn.dataset.value);
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

  // ── Series Letter Selection ────────────────────────────────────────
  function selectSeries(value) {
    selectedSeries = value;

    seriesBtns.forEach((btn) => {
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
    const hasSeries = selectedSeries !== null;
    btnValidate.disabled = !(hasSerial && hasDenom && hasSeries);
  }

  // ── Validation ─────────────────────────────────────────────────────
  function handleValidate() {
    const serial = serialInput.value.trim();

    if (!selectedDenomination || !serial || !selectedSeries) return;

    const result = BanknoteValidator.validate(selectedDenomination, serial, selectedSeries);
    showResult(result);
  }

  // ── Camera Capture & Direct Validation ─────────────────────────────
  async function handleCapture() {
    if (!CameraModule.isActive()) {
      const result = await CameraModule.start();
      if (!result.success) {
        showCameraError(result.error);
        return;
      }
    }

    // Get multiple processed versions of the same frame
    const captures = CameraModule.getMultiPassCaptures();
    if (!captures || captures.length === 0) return;

    // Show scanning status
    ocrStatus.style.display = "flex";
    scanError.style.display = "none";
    hideResults();
    btnCapture.disabled = true;
    ocrStatusText.textContent = "Escaneando billete...";

    try {
      // Run OCR on all preprocessed versions
      const ocrResults = [];
      for (let i = 0; i < captures.length; i++) {
        ocrStatusText.textContent = `Analizando imagen ${i + 1} de ${captures.length}...`;
        const text = await performOCR(captures[i].dataURL);
        if (text && text.trim()) {
          ocrResults.push({ mode: captures[i].mode, text: text.trim() });
        }
      }

      ocrStatus.style.display = "none";
      btnCapture.disabled = false;

      if (ocrResults.length === 0) {
        showScanError("No se pudo leer el billete. Asegúrate de enfocar bien el número de serie e intenta de nuevo.");
        return;
      }

      // Try to extract and validate from each OCR result, pick the best
      let bestResult = null;
      let bestExtracted = null;
      let bestScore = -1;
      const allTexts = [];

      for (const ocr of ocrResults) {
        allTexts.push(`[${ocr.mode}] ${ocr.text}`);
        const extracted = BanknoteValidator.extractFromStrip(ocr.text);
        if (!extracted) continue;

        const result = BanknoteValidator.autoValidate(ocr.text);

        // Score: prefer results where more fields were detected
        const score = (extracted.denomination ? 2 : 0)
                    + (extracted.serialNumber ? 3 : 0)
                    + (extracted.seriesLetter ? 1 : 0);

        if (score > bestScore) {
          bestScore = score;
          bestResult = result;
          bestExtracted = extracted;
        }
      }

      // Show debug info with all OCR attempts
      ocrDebugText.value = allTexts.join("\n\n");
      ocrDebugParsed.textContent = bestExtracted
        ? `Corte: ${bestExtracted.denomination || '?'} | Serial: ${bestExtracted.serialNumber || '?'} | Serie: ${bestExtracted.seriesLetter || '?'}`
        : 'No se pudo extraer datos de ninguna imagen';
      ocrDebug.style.display = "block";

      if (bestResult && bestResult.status !== "not-found") {
        showResult(bestResult);
      } else {
        showScanError("No se pudo detectar el número de serie. Intenta enfocar mejor la parte inferior del billete.");
      }
    } catch (err) {
      console.error("OCR Error:", err);
      ocrStatus.style.display = "none";
      btnCapture.disabled = false;
      showScanError("Error al procesar la imagen. Intenta de nuevo o usa el ingreso manual.");
    }
  }

  /**
   * Perform OCR using Tesseract.js with optimized settings.
   * @param {string} imageDataURL - Base64 image data URL
   * @returns {Promise<string>} Recognized text
   */
  async function performOCR(imageDataURL) {
    if (typeof Tesseract === "undefined") {
      console.error("Tesseract.js is not loaded");
      throw new Error("OCR library not available");
    }

    const result = await Tesseract.recognize(imageDataURL, "eng", {
      logger: (info) => {
        if (info.status === "recognizing text") {
          const pct = Math.round(info.progress * 100);
          ocrStatusText.textContent = `Leyendo número de serie... ${pct}%`;
        }
      },
      // Restrict character set to digits + series letters for better accuracy
      tessedit_char_whitelist: "0123456789ABCDabcd .,",
      // PSM 7 = treat image as a single text line
      tessedit_pageseg_mode: "7",
    });

    return result.data.text;
  }

  /**
   * Show scan error with retry options.
   */
  function showScanError(message) {
    scanErrorText.textContent = message;
    scanError.style.display = "block";
  }

  function handleRetryScan() {
    scanError.style.display = "none";
    ocrDebug.style.display = "none";
    hideResults();
    // Restart camera if it was stopped
    if (!CameraModule.isActive() && CameraModule.isSupported()) {
      CameraModule.start();
    }
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

  // ── Banknote Colors Map ─────────────────────────────────────────────
  const BILL_COLORS = {
    "10": { name: "Azul", css: "bs10", label: "Bs 10" },
    "20": { name: "Naranja", css: "bs20", label: "Bs 20" },
    "50": { name: "Violeta", css: "bs50", label: "Bs 50" },
    "100": { name: "Rojo", css: "bs100", label: "Bs 100" },
    "200": { name: "Marrón", css: "bs200", label: "Bs 200" },
  };

  /**
   * Generate the mini banknote visual HTML.
   * @param {string} denomination
   * @param {string} serial - Serial number
   * @param {string} seriesLetter - Series letter (A, B, C, etc.)
   * @returns {string} HTML string
   */
  function buildBanknoteVisual(denomination, serial, seriesLetter) {
    const bill = BILL_COLORS[denomination];
    if (!bill) return "";

    const series = seriesLetter || "?";
    const displaySerial = serial || "--------";

    return `
      <div class="banknote-mini ${bill.css}">
        <span class="bill-serie">${displaySerial} ${series}</span>
        <span class="bill-value">${bill.label}</span>
        <span class="bill-serie-bottom">${displaySerial} ${series}</span>
      </div>
      <div class="banknote-info">
        <div class="bill-name">Billete de ${bill.label} — Serie ${series}</div>
        <div>Color: <strong>${bill.name}</strong></div>
        <div class="bill-serial-display">N°: ${displaySerial}</div>
      </div>
    `;
  }

  // ── Result Display ─────────────────────────────────────────────────
  function showResult(result) {
    hideResults();
    resultSection.style.display = "block";

    const seriesLabel = result.seriesLetter || "?";
    const detailText = `Corte: Bs${result.denomination} | Serie: ${seriesLabel} | N°: ${result.normalized}`;
    const banknoteHTML = buildBanknoteVisual(result.denomination, result.normalized, result.seriesLetter);

    switch (result.status) {
      case "valid":
        resultValid.style.display = "block";
        validDetail.textContent = detailText;
        document.getElementById("validBanknote").innerHTML = banknoteHTML;
        break;

      case "invalid":
        resultInvalid.style.display = "block";
        invalidDetail.textContent = detailText;
        document.getElementById("invalidBanknote").innerHTML = banknoteHTML;
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
    selectedSeries = null;
    denomBtns.forEach((btn) => btn.classList.remove("active"));
    seriesBtns.forEach((btn) => btn.classList.remove("active"));
    btnValidate.disabled = true;

    // Reset scan displays
    scanError.style.display = "none";
    ocrStatus.style.display = "none";

    // Scroll to top
    window.scrollTo({ top: 0, behavior: "smooth" });

    // Restart camera if in camera mode and not already active
    if (currentMode === "camera" && CameraModule.isSupported() && !CameraModule.isActive()) {
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
      });
      const total = dbStatus.totalCount.toLocaleString("es-BO");
      dataStatusText.textContent =
        `✅ Datos BCB (${formatted}) — ${total} billetes invalidados`;
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

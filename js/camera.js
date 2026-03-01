/**
 * Camera Module
 * Handles camera access, capture, and flashlight for banknote scanning.
 */

// eslint-disable-next-line no-unused-vars
const CameraModule = (() => {
  "use strict";

  let stream = null;
  let currentFacingMode = "environment"; // rear camera by default
  let flashOn = false;
  let videoElement = null;
  let canvasElement = null;

  /**
   * Initialize the camera module with DOM elements.
   * @param {HTMLVideoElement} video - The video element for the camera feed
   * @param {HTMLCanvasElement} canvas - The canvas element for capturing frames
   */
  function init(video, canvas) {
    videoElement = video;
    canvasElement = canvas;
  }

  /**
   * Start the camera stream.
   * @returns {Promise<boolean>} True if camera started successfully
   */
  async function start() {
    try {
      // Stop any existing stream first (only if one is active)
      if (stream) {
        stop();
      }

      // Re-acquire video element in case DOM was rebuilt
      if (!videoElement || !videoElement.isConnected) {
        videoElement = document.getElementById("cameraFeed");
        canvasElement = document.getElementById("captureCanvas");
      }

      if (!videoElement) {
        return { success: false, error: "not-supported" };
      }

      // Check if we're on a secure context (HTTPS or localhost)
      if (!window.isSecureContext) {
        return { success: false, error: "insecure-context" };
      }

      // Check if getUserMedia is available
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        return { success: false, error: "not-supported" };
      }

      const constraints = {
        video: {
          facingMode: currentFacingMode,
          width: { ideal: 3840, min: 1280 },
          height: { ideal: 2160, min: 720 },
          focusMode: { ideal: "continuous" },
          exposureMode: { ideal: "continuous" },
          whiteBalanceMode: { ideal: "continuous" },
        },
        audio: false,
      };

      stream = await navigator.mediaDevices.getUserMedia(constraints);
      videoElement.srcObject = stream;

      return new Promise((resolve) => {
        videoElement.onloadedmetadata = () => {
          videoElement.play();
          resolve({ success: true });
        };
      });
    } catch (err) {
      console.error("Camera start error:", err);

      // Classify the error for better UX
      if (err.name === "NotAllowedError" || err.name === "PermissionDeniedError") {
        return { success: false, error: "permission-denied" };
      }
      if (err.name === "NotFoundError" || err.name === "DevicesNotFoundError") {
        return { success: false, error: "no-camera" };
      }
      if (err.name === "NotReadableError" || err.name === "TrackStartError") {
        return { success: false, error: "camera-in-use" };
      }
      if (err.name === "OverconstrainedError") {
        // Try again with simpler constraints
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          videoElement.srcObject = stream;
          return new Promise((resolve) => {
            videoElement.onloadedmetadata = () => {
              videoElement.play();
              resolve({ success: true });
            };
          });
        } catch (retryErr) {
          return { success: false, error: "unknown", detail: retryErr.message };
        }
      }

      return { success: false, error: "unknown", detail: err.message };
    }
  }

  /**
   * Stop the camera stream and release resources.
   */
  function stop() {
    if (stream) {
      stream.getTracks().forEach((track) => track.stop());
      stream = null;
    }
    if (videoElement) {
      videoElement.srcObject = null;
    }
    flashOn = false;
  }

  /**
   * Switch between front and rear cameras.
   * @returns {Promise<boolean>} True if switch was successful
   */
  async function switchCamera() {
    currentFacingMode =
      currentFacingMode === "environment" ? "user" : "environment";
    const result = await start();
    // If failed with new facing mode, try reverting
    if (!result.success) {
      currentFacingMode =
        currentFacingMode === "environment" ? "user" : "environment";
    }
    return result;
  }

  /**
   * Toggle the flashlight (torch mode).
   * @returns {Promise<boolean>} New flash state
   */
  async function toggleFlash() {
    if (!stream) return false;

    const track = stream.getVideoTracks()[0];
    if (!track) return false;

    try {
      const capabilities = track.getCapabilities();
      if (!capabilities.torch) {
        console.warn("Torch not supported on this device");
        return false;
      }

      flashOn = !flashOn;
      await track.applyConstraints({
        advanced: [{ torch: flashOn }],
      });
      return flashOn;
    } catch (err) {
      console.warn("Flash toggle error:", err);
      return false;
    }
  }

  // Scale factor to upscale the narrow strip for better OCR
  const OCR_UPSCALE = 3;

  /**
   * Capture a frame from the video feed.
   * Crops a narrow strip at the very bottom of the frame where the serial is.
   * Upscales 3× so Tesseract gets enough pixel data to read digits.
   * @param {string} [enhanceMode="binarize"] - Processing mode
   * @returns {HTMLCanvasElement|null} Canvas with captured frame
   */
  function captureFrame(enhanceMode) {
    if (!videoElement || !canvasElement || !stream) return null;

    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;

    if (!vw || !vh) return null;

    // Narrow strip: 92% width × 10% height at the very bottom of the frame
    const regionW = Math.floor(vw * 0.92);
    const regionH = Math.floor(vh * 0.10);
    const regionX = Math.floor((vw - regionW) / 2);
    const regionY = Math.floor(vh * 0.88); // very bottom

    // Upscale for better OCR accuracy
    const outW = regionW * OCR_UPSCALE;
    const outH = regionH * OCR_UPSCALE;

    canvasElement.width = outW;
    canvasElement.height = outH;

    const ctx = canvasElement.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // Draw the cropped region upscaled
    ctx.drawImage(
      videoElement,
      regionX, regionY, regionW, regionH,
      0, 0, outW, outH
    );

    // Apply image processing for better OCR
    enhanceForOCR(ctx, outW, outH, enhanceMode || "binarize");

    return canvasElement;
  }

  /**
   * Get multiple processed versions of the captured frame.
   * Uses 2 strategies: binarize (Otsu) and high-contrast stretch.
   * @returns {Array<{mode: string, dataURL: string}>}
   */
  function getMultiPassCaptures() {
    const modes = ["binarize", "highContrast"];
    const captures = [];

    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;
    if (!vw || !vh) return captures;

    // Same narrow strip as captureFrame
    const regionW = Math.floor(vw * 0.92);
    const regionH = Math.floor(vh * 0.10);
    const regionX = Math.floor((vw - regionW) / 2);
    const regionY = Math.floor(vh * 0.88);

    const outW = regionW * OCR_UPSCALE;
    const outH = regionH * OCR_UPSCALE;

    for (const mode of modes) {
      const tmpCanvas = document.createElement("canvas");
      tmpCanvas.width = outW;
      tmpCanvas.height = outH;
      const ctx = tmpCanvas.getContext("2d");
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = "high";

      ctx.drawImage(
        videoElement,
        regionX, regionY, regionW, regionH,
        0, 0, outW, outH
      );

      enhanceForOCR(ctx, outW, outH, mode);
      captures.push({ mode, dataURL: tmpCanvas.toDataURL("image/png") });
    }

    return captures;
  }

  /**
   * Enhance the captured image for better OCR results.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {number} height
   * @param {string} [mode="binarize"] - Processing mode: "binarize", "highContrast", "invert"
   */
  function enhanceForOCR(ctx, width, height, mode) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Step 1: Convert to grayscale
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }

    if (mode === "highContrast") {
      // Step 2a: Aggressive contrast stretch
      let min = 255, max = 0;
      for (let i = 0; i < data.length; i += 4) {
        if (data[i] < min) min = data[i];
        if (data[i] > max) max = data[i];
      }
      const range = max - min || 1;
      for (let i = 0; i < data.length; i += 4) {
        const stretched = ((data[i] - min) / range) * 255;
        const v = Math.max(0, Math.min(255, stretched));
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
      }
    } else if (mode === "invert") {
      // Step 2b: Invert (for dark backgrounds)
      for (let i = 0; i < data.length; i += 4) {
        data[i] = 255 - data[i];
        data[i + 1] = 255 - data[i + 1];
        data[i + 2] = 255 - data[i + 2];
      }
    } else {
      // Step 2c: Default — adaptive binarization (Otsu-like threshold)
      // Calculate histogram
      const hist = new Array(256).fill(0);
      for (let i = 0; i < data.length; i += 4) {
        hist[Math.round(data[i])]++;
      }
      // Otsu's method to find optimal threshold
      const totalPixels = width * height;
      let sum = 0;
      for (let i = 0; i < 256; i++) sum += i * hist[i];
      let sumB = 0, wB = 0, wF = 0;
      let maxVariance = 0, threshold = 128;
      for (let t = 0; t < 256; t++) {
        wB += hist[t];
        if (wB === 0) continue;
        wF = totalPixels - wB;
        if (wF === 0) break;
        sumB += t * hist[t];
        const mB = sumB / wB;
        const mF = (sum - sumB) / wF;
        const variance = wB * wF * (mB - mF) * (mB - mF);
        if (variance > maxVariance) {
          maxVariance = variance;
          threshold = t;
        }
      }
      // Apply binarization with the computed threshold
      for (let i = 0; i < data.length; i += 4) {
        const v = data[i] > threshold ? 255 : 0;
        data[i] = v;
        data[i + 1] = v;
        data[i + 2] = v;
      }
    }

    ctx.putImageData(imageData, 0, 0);
  }

  /**
   * Get a data URL of the captured frame for OCR processing.
   * @returns {string|null} Base64 data URL of the image
   */
  function getCapturedImageDataURL() {
    const canvas = captureFrame();
    if (!canvas) return null;
    return canvas.toDataURL("image/png");
  }

  /**
   * Check if the camera is currently active.
   * @returns {boolean}
   */
  function isActive() {
    return stream !== null && stream.active;
  }

  /**
   * Check if camera API is supported.
   * @returns {boolean}
   */
  function isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /**
   * Get flash state.
   * @returns {boolean}
   */
  function isFlashOn() {
    return flashOn;
  }

  // Public API
  return {
    init,
    start,
    stop,
    switchCamera,
    toggleFlash,
    captureFrame,
    getCapturedImageDataURL,
    getMultiPassCaptures,
    isActive,
    isSupported,
    isFlashOn,
  };
})();

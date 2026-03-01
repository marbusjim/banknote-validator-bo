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

  /**
   * Map overlay-relative coordinates to actual video frame coordinates.
   * Accounts for object-fit:cover which may crop the video differently
   * depending on video vs container aspect ratio.
   *
   * @param {number} relX - overlay-relative X (0–1)
   * @param {number} relY - overlay-relative Y (0–1)
   * @param {number} relW - overlay-relative width (0–1)
   * @param {number} relH - overlay-relative height (0–1)
   * @returns {{x:number, y:number, w:number, h:number}} video-frame pixel coords
   */
  function mapOverlayToVideo(relX, relY, relW, relH) {
    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;
    const cw = videoElement.clientWidth || 1;
    const ch = videoElement.clientHeight || 1;

    const videoAspect = vw / vh;
    const containerAspect = cw / ch;

    let visibleX, visibleY, visibleW, visibleH;

    if (videoAspect > containerAspect) {
      // Video is wider → full height visible, sides cropped
      visibleH = vh;
      visibleW = vh * containerAspect;
      visibleX = (vw - visibleW) / 2;
      visibleY = 0;
    } else {
      // Video is taller → full width visible, top/bottom cropped
      visibleW = vw;
      visibleH = vw / containerAspect;
      visibleX = 0;
      visibleY = (vh - visibleH) / 2;
    }

    return {
      x: Math.floor(visibleX + relX * visibleW),
      y: Math.floor(visibleY + relY * visibleH),
      w: Math.floor(relW * visibleW),
      h: Math.floor(relH * visibleH),
    };
  }

  /**
   * Capture a frame from the video feed.
   * Reads the scan-region element's actual position on screen,
   * maps those coordinates into the video frame, and crops+upscales.
   * @returns {HTMLCanvasElement|null} Canvas with captured frame
   */
  function captureFrame() {
    if (!videoElement || !canvasElement || !stream) return null;

    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;
    if (!vw || !vh) return null;

    // Read the scan-region element's actual position relative to the video
    const scanEl = document.querySelector(".scan-region");
    if (!scanEl || !videoElement.parentElement) return null;

    const containerRect = videoElement.getBoundingClientRect();
    const scanRect = scanEl.getBoundingClientRect();

    // Convert scan-region position to container-relative fractions (0–1)
    const relX = (scanRect.left - containerRect.left) / containerRect.width;
    const relY = (scanRect.top - containerRect.top) / containerRect.height;
    const relW = scanRect.width / containerRect.width;
    const relH = scanRect.height / containerRect.height;

    // Map to video pixel coordinates (accounts for object-fit:cover)
    const region = mapOverlayToVideo(relX, relY, relW, relH);

    // Clamp to video bounds
    const sx = Math.max(0, region.x);
    const sy = Math.max(0, region.y);
    const sw = Math.min(region.w, vw - sx);
    const sh = Math.min(region.h, vh - sy);

    if (sw <= 0 || sh <= 0) return null;

    // Upscale 2× for better OCR on small text
    const scale = 2;
    const outW = sw * scale;
    const outH = sh * scale;

    canvasElement.width = outW;
    canvasElement.height = outH;

    const ctx = canvasElement.getContext("2d");
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    ctx.drawImage(videoElement, sx, sy, sw, sh, 0, 0, outW, outH);

    // Apply Otsu binarization for clean black/white text
    enhanceForOCR(ctx, outW, outH);

    return canvasElement;
  }

  /**
   * Enhance the captured image for OCR using Otsu binarization.
   * Converts to grayscale then applies adaptive threshold to get
   * clean black text on white background.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {number} height
   */
  function enhanceForOCR(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    // Step 1: Convert to grayscale
    for (let i = 0; i < data.length; i += 4) {
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      data[i] = gray;
      data[i + 1] = gray;
      data[i + 2] = gray;
    }

    // Step 2: Otsu's method — find optimal binarization threshold
    const hist = new Array(256).fill(0);
    for (let i = 0; i < data.length; i += 4) {
      hist[Math.round(data[i])]++;
    }
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

    // Step 3: Apply binarization — black text on white background
    for (let i = 0; i < data.length; i += 4) {
      const v = data[i] > threshold ? 255 : 0;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
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
    isActive,
    isSupported,
    isFlashOn,
  };
})();

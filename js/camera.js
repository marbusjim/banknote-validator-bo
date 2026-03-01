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
      // Stop any existing stream first
      stop();

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
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          focusMode: { ideal: "continuous" },
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
   * Capture a frame from the video feed.
   * Returns the canvas with the captured image.
   * @returns {HTMLCanvasElement|null} Canvas with captured frame
   */
  function captureFrame() {
    if (!videoElement || !canvasElement || !stream) return null;

    const vw = videoElement.videoWidth;
    const vh = videoElement.videoHeight;

    if (!vw || !vh) return null;

    // Capture the center region (where the scan overlay is)
    // The scan region is 80% width, 35% height, centered
    const regionW = Math.floor(vw * 0.8);
    const regionH = Math.floor(vh * 0.35);
    const regionX = Math.floor((vw - regionW) / 2);
    const regionY = Math.floor((vh - regionH) / 2);

    canvasElement.width = regionW;
    canvasElement.height = regionH;

    const ctx = canvasElement.getContext("2d");

    // Draw the cropped region
    ctx.drawImage(
      videoElement,
      regionX,
      regionY,
      regionW,
      regionH,
      0,
      0,
      regionW,
      regionH
    );

    // Apply image processing for better OCR
    enhanceForOCR(ctx, regionW, regionH);

    return canvasElement;
  }

  /**
   * Enhance the captured image for better OCR results.
   * Applies grayscale, contrast boost, and sharpening.
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} width
   * @param {number} height
   */
  function enhanceForOCR(ctx, width, height) {
    const imageData = ctx.getImageData(0, 0, width, height);
    const data = imageData.data;

    for (let i = 0; i < data.length; i += 4) {
      // Convert to grayscale
      const gray = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];

      // Increase contrast
      const contrast = 1.5;
      const factor = (259 * (contrast * 128 + 255)) / (255 * (259 - contrast * 128));
      const adjusted = factor * (gray - 128) + 128;

      // Clamp to 0-255
      const value = Math.max(0, Math.min(255, adjusted));

      data[i] = value;     // R
      data[i + 1] = value; // G
      data[i + 2] = value; // B
      // Alpha stays the same
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

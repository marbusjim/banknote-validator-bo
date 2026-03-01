/**
 * Banknote Validator Module
 * Validates Bolivian banknotes (Serie B) against the invalid serials database.
 */

// eslint-disable-next-line no-unused-vars
const BanknoteValidator = (() => {
  "use strict";

  // Valid denominations affected by the BCB measure
  const VALID_DENOMINATIONS = ["10", "20", "50"];

  // Regex to extract a Serie B serial number
  // Matches patterns like: B 001 2345678, B0012345678, B-001-2345678, etc.
  const SERIAL_REGEX = /\b(B)\s*[-.]?\s*(\d[\d\s\-.]*\d)\b/i;

  /**
   * Normalize a serial number string:
   * - Convert to uppercase
   * - Remove all spaces, hyphens, dots
   * - Ensure it starts with "B"
   * @param {string} raw - Raw serial input
   * @returns {string} Normalized serial
   */
  function normalizeSerial(raw) {
    if (!raw) return "";
    return raw.toUpperCase().replace(/[\s\-.,]+/g, "");
  }

  /**
   * Extract a serial number from arbitrary text (e.g., OCR output).
   * @param {string} text - Text that may contain a serial number
   * @returns {string|null} Extracted serial or null
   */
  function extractSerial(text) {
    if (!text) return null;

    const match = text.match(SERIAL_REGEX);
    if (match) {
      const letter = match[1].toUpperCase();
      const digits = match[2].replace(/[\s\-.]+/g, "");
      return letter + digits;
    }

    return null;
  }

  /**
   * Check if a serial looks like a valid Serie B format.
   * @param {string} serial - Normalized serial
   * @returns {boolean}
   */
  function isValidFormat(serial) {
    if (!serial) return false;
    // Must start with B followed by digits (typically 7-12 digits)
    return /^B\d{7,12}$/.test(serial);
  }

  /**
   * Check if the serial belongs to Serie B.
   * @param {string} serial - Normalized serial
   * @returns {boolean}
   */
  function isSerieB(serial) {
    return serial && serial.charAt(0) === "B";
  }

  /**
   * Validate a banknote.
   * @param {string} denomination - "10", "20", or "50"
   * @param {string} serialRaw - Raw serial number input
   * @returns {{
   *   status: "valid"|"invalid"|"not-applicable"|"error",
   *   message: string,
   *   denomination: string,
   *   serial: string,
   *   normalized: string
   * }}
   */
  function validate(denomination, serialRaw) {
    const normalized = normalizeSerial(serialRaw);

    // Check denomination
    if (!VALID_DENOMINATIONS.includes(denomination)) {
      return {
        status: "not-applicable",
        message: "Solo se verifican billetes de Bs10, Bs20 y Bs50 de la Serie B.",
        denomination,
        serial: serialRaw,
        normalized,
      };
    }

    // Check if it looks like a serial number
    if (!normalized) {
      return {
        status: "error",
        message: "Por favor ingresa un número de serie.",
        denomination,
        serial: serialRaw,
        normalized,
      };
    }

    // Check if it's Serie B
    if (!isSerieB(normalized)) {
      return {
        status: "not-applicable",
        message: "Este billete no pertenece a la Serie B. Solo la Serie B fue afectada.",
        denomination,
        serial: serialRaw,
        normalized,
      };
    }

    // Check format validity
    if (!isValidFormat(normalized)) {
      return {
        status: "error",
        message: "El formato del número de serie no parece válido. Debe iniciar con B seguido de 7 a 12 dígitos.",
        denomination,
        serial: serialRaw,
        normalized,
      };
    }

    // Look up in the invalid serials database
    const denomSet = INVALID_SERIALS[denomination];

    if (!denomSet) {
      return {
        status: "error",
        message: "Error interno: base de datos no disponible.",
        denomination,
        serial: serialRaw,
        normalized,
      };
    }

    if (denomSet.has(normalized)) {
      return {
        status: "invalid",
        message: "Este billete se encuentra en la lista de billetes invalidados por el BCB.",
        denomination,
        serial: serialRaw,
        normalized,
      };
    }

    return {
      status: "valid",
      message: "Este billete NO se encuentra en la lista de billetes invalidados.",
      denomination,
      serial: serialRaw,
      normalized,
    };
  }

  /**
   * Get database status information.
   * @returns {{ lastUpdated: string|null, totalCount: number, hasDenomination: object }}
   */
  function getDatabaseStatus() {
    return {
      lastUpdated: INVALID_SERIALS.lastUpdated,
      totalCount:
        INVALID_SERIALS["10"].size +
        INVALID_SERIALS["20"].size +
        INVALID_SERIALS["50"].size,
      counts: {
        "10": INVALID_SERIALS["10"].size,
        "20": INVALID_SERIALS["20"].size,
        "50": INVALID_SERIALS["50"].size,
      },
      source: INVALID_SERIALS.source,
    };
  }

  // Public API
  return {
    validate,
    normalizeSerial,
    extractSerial,
    isValidFormat,
    isSerieB,
    getDatabaseStatus,
    VALID_DENOMINATIONS,
  };
})();

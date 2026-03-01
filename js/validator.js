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

    // Look up in the invalid serials database using range check
    const ranges = INVALID_SERIALS[denomination];

    if (!ranges) {
      return {
        status: "error",
        message: "Error interno: base de datos no disponible.",
        denomination,
        serial: serialRaw,
        normalized,
      };
    }

    // Extract the numeric portion (strip "B" prefix) and convert to number
    const numericPart = parseInt(normalized.substring(1), 10);

    if (isNaN(numericPart)) {
      return {
        status: "error",
        message: "No se pudo interpretar el número de serie.",
        denomination,
        serial: serialRaw,
        normalized,
      };
    }

    // Check if the number falls within any invalid range
    if (isSerialInvalid(denomination, numericPart)) {
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
   * @returns {{ lastUpdated: string|null, totalCount: number, counts: object }}
   */
  function getDatabaseStatus() {
    return {
      lastUpdated: INVALID_SERIALS.lastUpdated,
      totalCount: getTotalInvalidCount(),
      counts: {
        "10": getDenominationInvalidCount("10"),
        "20": getDenominationInvalidCount("20"),
        "50": getDenominationInvalidCount("50"),
      },
      source: INVALID_SERIALS.source,
    };
  }

  /**
   * Extract ALL possible serial numbers from OCR text.
   * Looks for patterns with digits near a B letter.
   * @param {string} text
   * @returns {string[]} Array of possible normalized serials
   */
  function extractAllSerials(text) {
    if (!text) return [];
    const results = [];

    // Pattern 1: B followed by digits (B0012345678)
    const pattern1 = /B\s*[-.]?\s*(\d[\d\s\-.]{5,}\d)/gi;
    let match;
    while ((match = pattern1.exec(text)) !== null) {
      const digits = match[1].replace(/[\s\-.]+/g, "");
      if (digits.length >= 7 && digits.length <= 12) {
        results.push("B" + digits);
      }
    }

    // Pattern 2: digits followed by B (0012345678 B) — as seen on Bolivian bills
    const pattern2 = /(\d[\d\s\-.]{5,}\d)\s*B/gi;
    while ((match = pattern2.exec(text)) !== null) {
      const digits = match[1].replace(/[\s\-.]+/g, "");
      if (digits.length >= 7 && digits.length <= 12) {
        results.push("B" + digits);
      }
    }

    // Deduplicate
    return [...new Set(results)];
  }

  /**
   * Auto-validate: given raw OCR text, extract serials and try all denominations.
   * Returns the first definitive result found (invalid first, then valid).
   * @param {string} ocrText - Raw text from OCR
   * @returns {{
   *   status: "valid"|"invalid"|"not-found"|"error",
   *   message: string,
   *   denomination: string|null,
   *   serial: string|null,
   *   normalized: string|null,
   *   allExtracted: string[]
   * }}
   */
  function autoValidate(ocrText) {
    const serials = extractAllSerials(ocrText);

    if (serials.length === 0) {
      // Try the single extract as fallback
      const single = extractSerial(ocrText);
      if (single) serials.push(single);
    }

    if (serials.length === 0) {
      return {
        status: "not-found",
        message: "No se pudo detectar un número de serie en la imagen. Intenta de nuevo o usa el ingreso manual.",
        denomination: null,
        serial: null,
        normalized: null,
        allExtracted: [],
      };
    }

    // Check each serial against all denominations
    // Priority: find invalid first (more important to flag)
    let bestValid = null;

    for (const serial of serials) {
      for (const denom of VALID_DENOMINATIONS) {
        const result = validate(denom, serial);

        if (result.status === "invalid") {
          // Immediately return invalid — critical finding
          return { ...result, allExtracted: serials };
        }

        if (result.status === "valid" && !bestValid) {
          bestValid = { ...result, allExtracted: serials };
        }
      }
    }

    // If we found a valid result, return it
    if (bestValid) {
      return bestValid;
    }

    // Serial was found but couldn't validate (format issues, etc.)
    return {
      status: "not-found",
      message: "Se detectó texto pero no se pudo verificar como número de serie válido. Intenta de nuevo o usa el ingreso manual.",
      denomination: null,
      serial: serials[0],
      normalized: normalizeSerial(serials[0]),
      allExtracted: serials,
    };
  }

  // Public API
  return {
    validate,
    autoValidate,
    normalizeSerial,
    extractSerial,
    extractAllSerials,
    isValidFormat,
    isSerieB,
    getDatabaseStatus,
    VALID_DENOMINATIONS,
  };
})();

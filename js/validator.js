/**
 * Banknote Validator Module
 * Validates Bolivian banknotes (Serie B) against the invalid serials database.
 */

// eslint-disable-next-line no-unused-vars
const BanknoteValidator = (() => {
  "use strict";

  // Valid denominations affected by the BCB measure
  const VALID_DENOMINATIONS = ["10", "20", "50"];

  /**
   * Fix common OCR character misreads in numeric context.
   * @param {string} str - String that should be numeric
   * @returns {string} Corrected string
   */
  function fixOcrDigits(str) {
    return str
      .replace(/[OoQD]/g, "0")
      .replace(/[IilL|]/g, "1")
      .replace(/[Zz]/g, "2")
      .replace(/[G]/g, "6");
  }

  /**
   * Extract denomination, serial number, and series letter from OCR text.
   * Expected format on bottom strip of banknote: "50 102086675 A"
   * @param {string} text - Raw OCR text
   * @returns {{ denomination: string|null, serialNumber: string|null, seriesLetter: string|null }|null}
   */
  function extractFromStrip(text) {
    if (!text) return null;

    const cleaned = text.toUpperCase().replace(/\n/g, " ").replace(/\s+/g, " ").trim();

    let denomination = null;
    let serialNumber = null;
    let seriesLetter = null;

    // Strategy 1: Full pattern — denom + serial + letter
    // e.g. "50 102086675 A"
    const fullMatch = cleaned.match(
      /\b(10|20|50)\b[\s.,;:]+?(\d[\d\s]{5,})\s+([A-Z])\b/
    );
    if (fullMatch) {
      denomination = fullMatch[1];
      serialNumber = fixOcrDigits(fullMatch[2]).replace(/\s/g, "");
      seriesLetter = fullMatch[3];
    }

    // Strategy 2: serial + letter (no denomination detected)
    // e.g. "102086675 A"
    if (!serialNumber) {
      const slMatch = cleaned.match(/(\d[\d\s]{6,})\s+([A-Z])\b/);
      if (slMatch) {
        serialNumber = fixOcrDigits(slMatch[1]).replace(/\s/g, "");
        seriesLetter = slMatch[2];
      }
    }

    // Strategy 3: letter + serial — "B 102086675"
    if (!serialNumber) {
      const lsMatch = cleaned.match(/\b([A-Z])\s+(\d{7,12})\b/);
      if (lsMatch) {
        seriesLetter = lsMatch[1];
        serialNumber = lsMatch[2];
      }
    }

    // Strategy 4: just a big number (fallback)
    if (!serialNumber) {
      const numMatch = cleaned.match(/(\d{7,12})/);
      if (numMatch) {
        serialNumber = numMatch[1];
      }
    }

    // Try to find denomination if not yet found
    if (!denomination && serialNumber) {
      const denomMatch = cleaned.match(/\b(50|20|10)\b/);
      if (denomMatch && denomMatch[1] !== serialNumber) {
        denomination = denomMatch[1];
      }
    }

    // Validate serial is numeric and reasonable length
    if (serialNumber) {
      serialNumber = serialNumber.replace(/\D/g, "");
      if (serialNumber.length < 7 || serialNumber.length > 12) {
        serialNumber = null;
      }
    }

    if (!serialNumber) return null;

    return { denomination, serialNumber, seriesLetter };
  }

  /**
   * Validate a banknote.
   * @param {string} denomination - "10", "20", or "50"
   * @param {string} serialRaw - Serial number (digits only)
   * @param {string} [seriesLetter="B"] - Series letter from the banknote
   * @returns {object} Validation result
   */
  function validate(denomination, serialRaw, seriesLetter) {
    const numeric = (serialRaw || "").replace(/\D/g, "");
    const series = (seriesLetter || "B").toUpperCase();

    // Check denomination
    if (!VALID_DENOMINATIONS.includes(denomination)) {
      return {
        status: "not-applicable",
        message: "Solo se verifican billetes de Bs10, Bs20 y Bs50.",
        denomination,
        serial: serialRaw,
        normalized: numeric,
        seriesLetter: series,
      };
    }

    // Check if serial number was provided
    if (!numeric || numeric.length < 7) {
      return {
        status: "error",
        message: "Por favor ingresa un número de serie válido (mínimo 7 dígitos).",
        denomination,
        serial: serialRaw,
        normalized: numeric,
        seriesLetter: series,
      };
    }

    // If not Serie B, not affected by the BCB measure
    if (series !== "B") {
      return {
        status: "not-applicable",
        message: `Este billete pertenece a la Serie ${series}. Solo la Serie B fue afectada por la medida del BCB.`,
        denomination,
        serial: serialRaw,
        normalized: numeric,
        seriesLetter: series,
      };
    }

    const numericPart = parseInt(numeric, 10);

    if (isNaN(numericPart)) {
      return {
        status: "error",
        message: "No se pudo interpretar el número de serie.",
        denomination,
        serial: serialRaw,
        normalized: numeric,
        seriesLetter: series,
      };
    }

    // Check if the number falls within any invalid range
    if (isSerialInvalid(denomination, numericPart)) {
      return {
        status: "invalid",
        message: "Este billete se encuentra en la lista de billetes invalidados por el BCB.",
        denomination,
        serial: serialRaw,
        normalized: numeric,
        seriesLetter: series,
      };
    }

    return {
      status: "valid",
      message: "Este billete NO se encuentra en la lista de billetes invalidados.",
      denomination,
      serial: serialRaw,
      normalized: numeric,
      seriesLetter: series,
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
   * Auto-validate from OCR text (camera scan).
   * Extracts denomination, serial number, and series letter automatically
   * from the bottom strip of the banknote.
   * @param {string} ocrText - Raw text from OCR
   * @returns {object} Validation result
   */
  function autoValidate(ocrText) {
    const extracted = extractFromStrip(ocrText);

    if (!extracted || !extracted.serialNumber) {
      return {
        status: "not-found",
        message: "No se pudo detectar el número de serie. Enfoca bien la parte inferior del billete e intenta de nuevo.",
        denomination: null,
        serial: null,
        normalized: null,
        seriesLetter: null,
      };
    }

    const { denomination, serialNumber, seriesLetter } = extracted;

    // If series letter is detected and NOT B, immediately respond
    if (seriesLetter && seriesLetter !== "B") {
      return {
        status: "not-applicable",
        message: `Este billete pertenece a la Serie ${seriesLetter}. Solo la Serie B fue afectada por la medida del BCB.`,
        denomination: denomination || null,
        serial: serialNumber,
        normalized: serialNumber,
        seriesLetter: seriesLetter,
      };
    }

    // Series is B or unknown — validate against invalid ranges
    const series = seriesLetter || "B";

    if (denomination) {
      // Denomination known — validate directly
      return validate(denomination, serialNumber, series);
    }

    // Denomination unknown — try all 3 (invalid is priority)
    const numericPart = parseInt(serialNumber, 10);

    for (const denom of VALID_DENOMINATIONS) {
      if (isSerialInvalid(denom, numericPart)) {
        return {
          status: "invalid",
          message: "Este billete se encuentra en la lista de billetes invalidados por el BCB.",
          denomination: denom,
          serial: serialNumber,
          normalized: serialNumber,
          seriesLetter: series,
        };
      }
    }

    // Not in any invalid range
    return {
      status: "valid",
      message: "Este billete NO se encuentra en la lista de billetes invalidados.",
      denomination: denomination || "?",
      serial: serialNumber,
      normalized: serialNumber,
      seriesLetter: series,
    };
  }

  // Public API
  return {
    validate,
    autoValidate,
    extractFromStrip,
    getDatabaseStatus,
    VALID_DENOMINATIONS,
  };
})();

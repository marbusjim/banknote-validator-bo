/**
 * Banknote Validator Module
 * Validates Bolivian banknotes (Serie B) against the invalid serials database.
 */

// eslint-disable-next-line no-unused-vars
const BanknoteValidator = (() => {
  "use strict";

  // Denominations affected by the BCB invalidation measure
  const AFFECTED_DENOMINATIONS = ["10", "20", "50"];

  // All known Bolivian banknote denominations
  const ALL_DENOMINATIONS = ["10", "20", "50", "100", "200"];

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
      .replace(/[G]/g, "6")
      .replace(/[S]/g, "5")
      .replace(/[B]/g, "8");
  }

  /**
   * Extract denomination, serial number, and series letter from OCR text.
   * Expected format on bottom strip: "[denom] serial_number [series_letter]"
   * OCR may add extra characters, so we use flexible regex matching.
   * @param {string} text - Raw OCR text
   * @returns {{ denomination: string|null, serialNumber: string|null, seriesLetter: string|null }|null}
   */
  function extractFromStrip(text) {
    if (!text) return null;

    // Clean: uppercase, single line, collapse whitespace
    const cleaned = text.toUpperCase().replace(/[\n\r]/g, " ").replace(/\s+/g, " ").trim();

    let denomination = null;
    let serialNumber = null;
    let seriesLetter = null;

    // --- Core regex: match pattern [optional denom] [digits] [single letter] ---
    // Handles OCR noise: allows junk chars between groups
    // e.g. "50 102086675 A", "50.102086675.A", "J50 102086675 A PRE"
    // Pattern: optional(10|20|50|100|200) + digits(7-12) + single letter(A-D)

    // Strategy 1: denom + serial + series letter
    const fullPattern = /(?:^|\D)(10|20|50|100|200)\D{0,5}(\d[\d\s.,]{5,})\s*([A-D])(?:\s|$|\W)/;
    const fullMatch = cleaned.match(fullPattern);
    if (fullMatch) {
      denomination = fullMatch[1];
      serialNumber = fixOcrDigits(fullMatch[2]).replace(/[\s.,]/g, "");
      seriesLetter = fullMatch[3];
    }

    // Strategy 2: serial + series letter (no denomination)
    // e.g. "102086675 B", "102086675B"
    if (!serialNumber) {
      const slPattern = /(\d[\d\s.,]{6,})\s*([A-D])(?:\s|$|\W)/;
      const slMatch = cleaned.match(slPattern);
      if (slMatch) {
        serialNumber = fixOcrDigits(slMatch[1]).replace(/[\s.,]/g, "");
        seriesLetter = slMatch[2];
      }
    }

    // Strategy 3: series letter + serial (reversed layout)
    // e.g. "B 102086675"
    if (!serialNumber) {
      const lsPattern = /(?:^|\W)([A-D])\s+(\d{7,12})(?:\s|$|\W)/;
      const lsMatch = cleaned.match(lsPattern);
      if (lsMatch) {
        seriesLetter = lsMatch[1];
        serialNumber = lsMatch[2];
      }
    }

    // Strategy 4: just a long number (last resort)
    if (!serialNumber) {
      const numPattern = /(\d{7,12})/;
      const numMatch = cleaned.match(numPattern);
      if (numMatch) {
        serialNumber = numMatch[1];
      }
    }

    // Try to find denomination if not yet found
    if (!denomination && serialNumber) {
      const denomPattern = /(?:^|\D)(200|100|50|20|10)(?:\D|$)/;
      const denomMatch = cleaned.match(denomPattern);
      if (denomMatch) {
        denomination = denomMatch[1];
      }
    }

    // Clean serial: digits only, validate length
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

    // Bs100 and Bs200 are NOT affected — always valid
    if (denomination === "100" || denomination === "200") {
      return {
        status: "valid",
        message: `Los billetes de Bs${denomination} no fueron afectados por la medida del BCB. Este billete es válido.`,
        denomination,
        serial: serialRaw,
        normalized: numeric,
        seriesLetter: series,
      };
    }

    // Check denomination is one of the affected ones
    if (!AFFECTED_DENOMINATIONS.includes(denomination)) {
      return {
        status: "valid",
        message: "Este corte de billete no fue afectado por la medida del BCB.",
        denomination,
        serial: serialRaw,
        normalized: numeric,
        seriesLetter: series,
      };
    }

    // If not Serie B — the bill is VALID (only Serie B was affected)
    if (series !== "B") {
      return {
        status: "valid",
        message: `Este billete pertenece a la Serie ${series}. Solo la Serie B fue afectada por la medida del BCB. Tu billete es válido.`,
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

    // If series letter is detected and NOT B, the bill is VALID
    if (seriesLetter && seriesLetter !== "B") {
      return {
        status: "valid",
        message: `Este billete pertenece a la Serie ${seriesLetter}. Solo la Serie B fue afectada. Tu billete es válido.`,
        denomination: denomination || null,
        serial: serialNumber,
        normalized: serialNumber,
        seriesLetter: seriesLetter,
      };
    }

    // If denomination is 100 or 200, always valid
    if (denomination === "100" || denomination === "200") {
      return {
        status: "valid",
        message: `Los billetes de Bs${denomination} no fueron afectados por la medida del BCB. Tu billete es válido.`,
        denomination,
        serial: serialNumber,
        normalized: serialNumber,
        seriesLetter: seriesLetter || "?",
      };
    }

    // Series is B or unknown — validate against invalid ranges
    const series = seriesLetter || "B";

    if (denomination) {
      // Denomination known — validate directly
      return validate(denomination, serialNumber, series);
    }

    // Denomination unknown — try all affected denominations (invalid is priority)
    const numericPart = parseInt(serialNumber, 10);

    for (const denom of AFFECTED_DENOMINATIONS) {
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
    AFFECTED_DENOMINATIONS,
    ALL_DENOMINATIONS,
  };
})();

/**
 * Invalid Serials Database — Range-based
 * Contains the serial number RANGES of banknotes invalidated by the BCB
 * after the airplane accident on February 27, 2026.
 *
 * Data source: Official BCB publication
 * "NÚMEROS DE SERIE DE LOS BILLETES DE LA SERIE B QUE NO TIENEN VALOR LEGAL"
 *
 * Structure:
 *   Each denomination has an array of [from, to] ranges (inclusive).
 *   The numbers are the numeric portion of the serial (without the "B" prefix).
 *
 * To check: strip "B" prefix → parse as integer → check if it falls in any range.
 */

// eslint-disable-next-line no-unused-vars
const INVALID_SERIALS = {
  lastUpdated: "2026-03-01T00:00:00Z",
  source: "https://www.bcb.gob.bo",

  /**
   * Bs 50 — Serie B invalid serial number ranges [desde, hasta]
   * 10 ranges
   */
  "50": [
    [67250001, 67700000],
    [69050001, 69500000],
    [69500001, 69950000],
    [69950001, 70400000],
    [70400001, 70850000],
    [70850001, 71300000],
    [76310012, 85139995],
    [86400001, 86850000],
    [90900001, 91350000],
    [91800001, 92250000],
  ],

  /**
   * Bs 20 — Serie B invalid serial number ranges [desde, hasta]
   * 16 ranges
   */
  "20": [
    [87280145,  91646549],
    [96650001,  97100000],
    [99800001, 100250000],
    [100250001, 100700000],
    [109250001, 109700000],
    [110600001, 111050000],
    [111050001, 111500000],
    [111950001, 112400000],
    [112400001, 112850000],
    [112850001, 113300000],
    [114200001, 114650000],
    [114650001, 115100000],
    [115100001, 115550000],
    [118700001, 119150000],
    [119150001, 119600000],
    [120500001, 120950000],
  ],

  /**
   * Bs 10 — Serie B invalid serial number ranges [desde, hasta]
   * 12 ranges
   */
  "10": [
    [77100001,  77550000],
    [78000001,  78450000],
    [78900001,  96350000],
    [96350001,  96800000],
    [96800001,  97250000],
    [98150001,  98600000],
    [104900001, 105350000],
    [105350001, 105800000],
    [106700001, 107150000],
    [107600001, 108050000],
    [108050001, 108500000],
    [109400001, 109850000],
  ],
};

/**
 * Check if a numeric serial falls within any invalid range for a denomination.
 * @param {string} denomination - "10", "20", or "50"
 * @param {number} serialNumber - The numeric portion of the serial
 * @returns {boolean} True if the serial is in an invalid range
 */
// eslint-disable-next-line no-unused-vars
function isSerialInvalid(denomination, serialNumber) {
  const ranges = INVALID_SERIALS[denomination];
  if (!ranges) return false;

  for (const [from, to] of ranges) {
    if (serialNumber >= from && serialNumber <= to) {
      return true;
    }
  }
  return false;
}

/**
 * Get the total count of invalid bills across all denominations.
 * @returns {number}
 */
// eslint-disable-next-line no-unused-vars
function getTotalInvalidCount() {
  let total = 0;
  ["10", "20", "50"].forEach((denom) => {
    const ranges = INVALID_SERIALS[denom];
    if (ranges) {
      ranges.forEach(([from, to]) => {
        total += (to - from + 1);
      });
    }
  });
  return total;
}

/**
 * Get count of invalid bills for a specific denomination.
 * @param {string} denomination
 * @returns {number}
 */
// eslint-disable-next-line no-unused-vars
function getDenominationInvalidCount(denomination) {
  const ranges = INVALID_SERIALS[denomination];
  if (!ranges) return 0;
  let count = 0;
  ranges.forEach(([from, to]) => {
    count += (to - from + 1);
  });
  return count;
}

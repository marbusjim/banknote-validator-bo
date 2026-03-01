/**
 * Invalid Serials Database
 * Contains the serial numbers of banknotes invalidated by the BCB
 * after the airplane accident on February 27, 2026.
 *
 * Structure:
 *   INVALID_SERIALS = {
 *     "10": Set of serial strings for Bs10,
 *     "20": Set of serial strings for Bs20,
 *     "50": Set of serial strings for Bs50,
 *   }
 *
 * HOW TO UPDATE:
 *   When the BCB publishes the official list, add the serial numbers
 *   to the corresponding Set below. Serial numbers should be stored
 *   in uppercase, without spaces. Example: "B0012345678"
 *
 * The app normalizes user input before lookup, so storing them
 * consistently here is enough.
 */

// eslint-disable-next-line no-unused-vars
const INVALID_SERIALS = {
  // Last updated: pending official BCB publication
  lastUpdated: null, // ISO date string, e.g. "2026-03-02T12:00:00Z"
  source: "https://www.bcb.gob.bo",
  totalCount: 0,

  /**
   * Bs 10 — Serie B invalid serial numbers
   * Add entries like: "B0012345678"
   */
  "10": new Set([
    // Example (remove when real data is available):
    // "B0000000001",
    // "B0000000002",
  ]),

  /**
   * Bs 20 — Serie B invalid serial numbers
   */
  "20": new Set([
    // "B0000000001",
  ]),

  /**
   * Bs 50 — Serie B invalid serial numbers
   */
  "50": new Set([
    // "B0000000001",
  ]),
};

/**
 * Remote data loader (optional).
 * If a remote JSON endpoint is available, this function fetches it
 * and merges the serial numbers into the local sets.
 *
 * Expected JSON format:
 * {
 *   "lastUpdated": "2026-03-02T12:00:00Z",
 *   "10": ["B0012345678", ...],
 *   "20": [...],
 *   "50": [...]
 * }
 */
// eslint-disable-next-line no-unused-vars
async function loadRemoteSerials(url) {
  try {
    const response = await fetch(url, { cache: "no-cache" });
    if (!response.ok) return false;

    const data = await response.json();

    ["10", "20", "50"].forEach((denom) => {
      if (Array.isArray(data[denom])) {
        data[denom].forEach((serial) => {
          INVALID_SERIALS[denom].add(serial.toUpperCase().replace(/\s+/g, ""));
        });
      }
    });

    if (data.lastUpdated) {
      INVALID_SERIALS.lastUpdated = data.lastUpdated;
    }

    INVALID_SERIALS.totalCount =
      INVALID_SERIALS["10"].size +
      INVALID_SERIALS["20"].size +
      INVALID_SERIALS["50"].size;

    return true;
  } catch (err) {
    console.warn("Could not load remote serials:", err.message);
    return false;
  }
}

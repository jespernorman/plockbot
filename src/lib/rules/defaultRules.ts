import type { PlockbotRules } from './types';

/**
 * Grundregler enligt kundens spec. Används varje gång om inga sparade regler finns.
 *
 * GLAS (BA) 16 à BA:
 * - Små ≤16: ≤12 exakt, 13–16 → 1 hel back (16)
 * - Säkerhetsmarginal: 17–49 +0, 50–149 +3, 150–299 +5, 300–499 +8, 500+ avrunda upp till hel back
 * - 50 %-regel: rest ≥ 50 % av back → ta extra hel back
 *
 * PORSLIN (KA) 10 à KA:
 * - Små ≤10: plocka exakt antal tallrikar
 * - Säkerhetsmarginal: 11–49 +0, 50–149 +3, 150–299 +5, 300–499 +8, 500+ avrunda upp till hel kassett
 * - 50 %-regel: rest ≥ 50 % av kassett → ta extra hel kassett
 *
 * BESTICK:
 * - ≤50 exakt, 51–150 +3, 151–300 +5, 301+ +10
 */
export const defaultPlockbotRules: PlockbotRules = {
  ka: {
    defaultQuantityPerCassette: 10,
    smallOrderExactMax: 10,
    smallOrderOneCassetteUpTo: 10,
    margins: [
      { maxOrdered: 49, extra: 0 },
      { maxOrdered: 149, extra: 3 },
      { maxOrdered: 299, extra: 5 },
      { maxOrdered: 499, extra: 8 },
    ],
    largeOrderRoundUpFrom: 500,
    largeOrderExtraUnits: 0,
    restPercentFullCassetteThreshold: 50,
    thresholds: [
      {
        quantityInCassette: 10,
        pickFullCassetteIfOrderedAtLeast: 11,
        smallOrderExactMax: 10,
        restPercentFullCassetteThreshold: 50,
      },
    ],
  },
  ba: {
    defaultQuantityPerCrate: 16,
    smallOrderExactMax: 12,
    smallOrderOneCrateUpTo: 16,
    margins: [
      { maxOrdered: 49, extra: 0 },
      { maxOrdered: 149, extra: 3 },
      { maxOrdered: 299, extra: 5 },
      { maxOrdered: 499, extra: 8 },
    ],
    largeOrderRoundUpFrom: 500,
    largeOrderExtraUnits: 0,
    restPercentFullCrateThreshold: 50,
    thresholds: [
      {
        quantityInCrate: 16,
        pickFullCrateIfOrderedAtLeast: 13,
        smallOrderExactMax: 12,
        restPercentFullCrateThreshold: 50,
      },
    ],
  },
  bestick: {
    exactBelow: 50,
    ranges: [
      { minOrdered: 51, maxOrdered: 150, extra: 3 },
      { minOrdered: 151, maxOrdered: 300, extra: 5 },
      { minOrdered: 301, maxOrdered: Infinity, extra: 10 },
    ],
  },
};

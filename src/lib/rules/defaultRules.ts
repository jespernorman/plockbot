import type { PlockbotRules } from './types';

/**
 * Grundregler enligt spec. Används varje gång om inga sparade regler finns.
 * Dessa regler tillämpas alltid vid skapande av plocklista och vid test i Regler.
 *
 * GLAS (BA) 16 à BA:
 * - Små beställningar ≤16: ≤12 glas → exakt antal; 13–16 → 1 hel back (16).
 * - Säkerhetsmarginal >16: 17–49 +0, 50–149 +3, 150–299 +5, 300–499 +8, 500+ avrunda upp till hel back.
 * - 50 %-regel: rest ÷ 16 × 100; om ≥ 50 % → ta extra hel back, annars lösa glas.
 *
 * PORSLIN (KA) 10 à KA:
 * - Små beställningar ≤10: plocka exakt antal tallrikar.
 * - Säkerhetsmarginal >10: 11–49 +0, 50–149 +3, 150–299 +5, 300–499 +8, 500+ avrunda upp till hel kassett.
 * - 50 %-regel: rest ÷ 10 × 100; om ≥ 50 % → ta extra hel kassett, annars lösa tallrikar.
 *
 * BESTICK:
 * - ≤50 → exakt antal; 51–150 → +3; 151–300 → +5; 301+ → +10.
 */
export const defaultPlockbotRules: PlockbotRules = {
  ka: {
    defaultQuantityPerCassette: 10,
    smallOrderExactMax: 10,
    smallOrderOneCassetteUpTo: 10,
    margins: [
      { maxOrdered: 49, extra: 0, extraUnits: 0 },
      { maxOrdered: 149, extra: 3, extraUnits: 0 },
      { maxOrdered: 299, extra: 5, extraUnits: 0 },
      { maxOrdered: 499, extra: 8, extraUnits: 0 },
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
      { maxOrdered: 49, extra: 0, extraUnits: 0 },
      { maxOrdered: 149, extra: 3, extraUnits: 0 },
      { maxOrdered: 299, extra: 5, extraUnits: 0 },
      { maxOrdered: 499, extra: 8, extraUnits: 0 },
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

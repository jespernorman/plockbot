import type { PlockbotRules } from './types';

/**
 * Standardregler enligt kundens spec.
 * Porslin: 10/15/20/25/30 à KA med småbeställning, 1 kassett-intervall, säkerhetsmarginaler, rest-%-regel.
 * Glas: 16/25/36/49/64/98 à BA, samma logik.
 * Bestick: ≤50 exakt, 51–150 +3, 151–300 +5, 301+ +10.
 */
export const defaultPlockbotRules: PlockbotRules = {
  ka: {
    defaultQuantityPerCassette: 25,
    smallOrderExactMax: 20,
    smallOrderOneCassetteUpTo: 25,
    margins: [
      { maxOrdered: 49, extra: 0 },
      { maxOrdered: 149, extra: 3 },
      { maxOrdered: 299, extra: 5 },
      { maxOrdered: 499, extra: 8 },
    ],
    largeOrderRoundUpFrom: 500,
    largeOrderExtraUnits: 0,
    restPercentFullCassetteThreshold: 80,
    thresholds: [
      { quantityInCassette: 10, pickFullCassetteIfOrderedAtLeast: 11, smallOrderExactMax: 10, restPercentFullCassetteThreshold: 50 },
      { quantityInCassette: 15, pickFullCassetteIfOrderedAtLeast: 11, smallOrderExactMax: 10, restPercentFullCassetteThreshold: 60 },
      { quantityInCassette: 20, pickFullCassetteIfOrderedAtLeast: 17, smallOrderExactMax: 16, restPercentFullCassetteThreshold: 70 },
      { quantityInCassette: 25, pickFullCassetteIfOrderedAtLeast: 21, smallOrderExactMax: 20, restPercentFullCassetteThreshold: 80 },
      { quantityInCassette: 30, pickFullCassetteIfOrderedAtLeast: 26, smallOrderExactMax: 25, restPercentFullCassetteThreshold: 90 },
    ],
  },
  ba: {
    defaultQuantityPerCrate: 25,
    smallOrderExactMax: 20,
    smallOrderOneCrateUpTo: 25,
    margins: [
      { maxOrdered: 49, extra: 0 },
      { maxOrdered: 149, extra: 3 },
      { maxOrdered: 299, extra: 5 },
      { maxOrdered: 499, extra: 8 },
    ],
    largeOrderRoundUpFrom: 500,
    largeOrderExtraUnits: 0,
    restPercentFullCrateThreshold: 90,
    thresholds: [
      { quantityInCrate: 16, pickFullCrateIfOrderedAtLeast: 13, smallOrderExactMax: 12, restPercentFullCrateThreshold: 50 },
      { quantityInCrate: 25, pickFullCrateIfOrderedAtLeast: 21, smallOrderExactMax: 20, restPercentFullCrateThreshold: 80 },
      { quantityInCrate: 36, pickFullCrateIfOrderedAtLeast: 31, smallOrderExactMax: 30, restPercentFullCrateThreshold: 90 },
      { quantityInCrate: 49, pickFullCrateIfOrderedAtLeast: 41, smallOrderExactMax: 40, restPercentFullCrateThreshold: 90 },
      { quantityInCrate: 64, pickFullCrateIfOrderedAtLeast: 56, smallOrderExactMax: 55, restPercentFullCrateThreshold: 90 },
      { quantityInCrate: 98, pickFullCrateIfOrderedAtLeast: 86, smallOrderExactMax: 85, restPercentFullCrateThreshold: 90 },
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

import type { PlockbotRules } from './types';

/**
 * Standardregler enligt kundens beskrivning.
 * Tallrikar 25 à KA, säkerhetsmarginaler, 80%-regeln.
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
      { quantityInCassette: 10, pickFullCassetteIfOrderedAtLeast: 8 },
      { quantityInCassette: 15, pickFullCassetteIfOrderedAtLeast: 8 },
      { quantityInCassette: 20, pickFullCassetteIfOrderedAtLeast: 10 },
      { quantityInCassette: 25, pickFullCassetteIfOrderedAtLeast: 13 },
      { quantityInCassette: 30, pickFullCassetteIfOrderedAtLeast: 15 },
    ],
  },
  ba: {
    defaultQuantityPerCrate: 25,
    smallOrderExactMax: 15,
    smallOrderOneCrateUpTo: 25,
    margins: [
      { maxOrdered: 49, extra: 0 },
      { maxOrdered: 149, extra: 3 },
      { maxOrdered: 299, extra: 5 },
      { maxOrdered: 499, extra: 8 },
    ],
    largeOrderRoundUpFrom: 500,
    largeOrderExtraUnits: 0,
    restPercentFullCrateThreshold: 80,
    thresholds: [
      { quantityInCrate: 16, pickFullCrateIfOrderedAtLeast: 8 },
      { quantityInCrate: 25, pickFullCrateIfOrderedAtLeast: 13 },
      { quantityInCrate: 36, pickFullCrateIfOrderedAtLeast: 18 },
      { quantityInCrate: 49, pickFullCrateIfOrderedAtLeast: 25 },
      { quantityInCrate: 64, pickFullCrateIfOrderedAtLeast: 32 },
      { quantityInCrate: 98, pickFullCrateIfOrderedAtLeast: 49 },
    ],
  },
  bestick: {
    exactBelow: 50,
    ranges: [
      { minOrdered: 50, maxOrdered: 150, extra: 3 },
      { minOrdered: 150, maxOrdered: 300, extra: 5 },
      { minOrdered: 300, maxOrdered: Infinity, extra: 10 },
    ],
  },
};

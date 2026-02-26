/**
 * Tester för att verifiera att plockreglerna verkligen används i beräkningen.
 * Kör: npm run test
 */
import { describe, it, expect } from 'vitest';
import { computePickPlan } from './pickPlanEngine';
import type { Article, PlockbotRules } from './types';

const defaultRules: PlockbotRules = {
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
    restPercentFullCassetteThreshold: 50,
    thresholds: [{ quantityInCassette: 10, pickFullCassetteIfOrderedAtLeast: 11, smallOrderExactMax: 10, restPercentFullCassetteThreshold: 50 }],
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
      { maxOrdered: 500, extra: 0, extraUnits: 5 },
    ],
    largeOrderRoundUpFrom: 500,
    restPercentFullCrateThreshold: 50,
    thresholds: [{ quantityInCrate: 16, pickFullCrateIfOrderedAtLeast: 13, smallOrderExactMax: 12, restPercentFullCrateThreshold: 50 }],
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

const articleBA: Article = { id: 'GLAS01', name: 'Glas', category: 'GLAS', ba: 16 };
const articleKA: Article = { id: 'KA01', name: 'Tallrik', category: 'PORSLIN', ka: 10 };
const articleBestick: Article = { id: 'BESTICK01', name: 'Bestick', category: 'BESTICK' };

describe('computePickPlan – reglerna används i beräkningen', () => {
  it('501 glas (BA): rad "till 500" med 5 extra backar ger 37 backar (32+5)', () => {
    const plan = computePickPlan(articleBA, 501, defaultRules);
    expect(plan.unitType).toBe('BA');
    expect(plan.unitSize).toBe(16);
    // 501 / 16 = 31.31 → 32 backar bas, + 5 extra backar från margin-raden "till 500"
    expect(plan.fullUnitsCount).toBe(32 + 5);
    expect(plan.fullUnitsCount).toBe(37);
    expect(plan.pickQtyTotal).toBe(37 * 16);
    expect(plan.noteText).toBe('32 BA + 5 extra backar (totalt 37 BA)');
  });

  it('500 glas (BA): samma rad ger 32+5 = 37 backar, visar "+ 5 extra backar"', () => {
    const plan = computePickPlan(articleBA, 500, defaultRules);
    expect(plan.fullUnitsCount).toBe(37);
    expect(plan.pickQtyTotal).toBe(37 * 16);
    expect(plan.noteText).toContain('5 extra backar');
  });

  it('499 glas (BA): margin-path, inte large-order – följer marginal + 50%-regel, plus 0 extra backar (rad 499 har extraUnits 0)', () => {
    const plan = computePickPlan(articleBA, 499, defaultRules);
    expect(plan.unitType).toBe('BA');
    // 499 + 8 = 507, 507/16 = 31.68 → 31 full, rest 11, 11/16 = 68.75% ≥ 50% → 32 backar + 0 extra backar
    expect(plan.fullUnitsCount).toBe(32);
    expect(plan.pickQtyTotal).toBe(32 * 16);
  });

  it('100 glas (BA): margin 149 ger +3 glas, inga extra backar', () => {
    const plan = computePickPlan(articleBA, 100, defaultRules);
    expect(plan.unitType).toBe('BA');
    // 100+3 = 103, 103/16 = 6.43 → 6 full, rest 7, 7/16 = 43.75% < 50% → 6 BA + 7 lösa
    expect(plan.pickQtyTotal).toBe(6 * 16 + 7);
    expect(plan.noteText).toMatch(/6 BA \+ 7 lösa/);
  });

  it('Bestick: 100 st ger exakt + 3 extra (intervall 51–150)', () => {
    const plan = computePickPlan(articleBestick, 100, defaultRules);
    expect(plan.pickQtyTotal).toBe(100 + 3);
    expect(plan.noteText).toBe('103 st');
  });

  it('Bestick: 50 st ger exakt (exactBelow 50)', () => {
    const plan = computePickPlan(articleBestick, 50, defaultRules);
    expect(plan.pickQtyTotal).toBe(50);
    expect(plan.noteText).toBe('50 st');
  });

  it('Porslin (KA): 501 tallrikar med regel "5 extra kassetter" för stora beställningar används', () => {
    const rulesWithExtraKA: PlockbotRules = {
      ...defaultRules,
      ka: {
        ...defaultRules.ka,
        margins: [
          { maxOrdered: 49, extra: 0, extraUnits: 0 },
          { maxOrdered: 149, extra: 3, extraUnits: 0 },
          { maxOrdered: 499, extra: 8, extraUnits: 0 },
          { maxOrdered: 500, extra: 0, extraUnits: 5 },
        ],
      },
    };
    const plan = computePickPlan(articleKA, 501, rulesWithExtraKA);
    expect(plan.unitType).toBe('KA');
    expect(plan.unitSize).toBe(10);
    // 501/10 = 50.1 → 51 kassetter bas, + 5 extra = 56
    expect(plan.fullUnitsCount).toBe(51 + 5);
    expect(plan.pickQtyTotal).toBe(56 * 10);
    expect(plan.noteText).toContain('5 extra kassetter');
    expect(plan.noteText).toContain('totalt 56 KA');
  });
});

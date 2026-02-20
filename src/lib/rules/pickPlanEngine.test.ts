/**
 * Unit tests enligt spec för regelmotor.
 * PORSLIN (KA=25), GLAS (BA=25), BESTICK.
 */
import { describe, it, expect } from 'vitest';
import { computePickPlan } from './pickPlanEngine';
import { defaultPlockbotRules } from './defaultRules';
import type { Article } from './types';

const rules = defaultPlockbotRules;

const porcelainArticle: Article = {
  id: 'T100',
  name: 'Tallrik',
  category: 'PORSLIN',
  ka: 25,
};

const glassArticle: Article = {
  id: 'G50',
  name: 'Glas',
  category: 'GLAS',
  ba: 25,
};

const bestickArticle: Article = {
  id: 'B1',
  name: 'Bestick',
  category: 'BESTICK',
};

describe('PORSLIN (KA=25)', () => {
  it('20 → 1 KA (tröskel 13 ger 13–25 som 1 KA)', () => {
    const plan = computePickPlan(porcelainArticle, 20, rules);
    expect(plan.fullUnitsCount).toBe(1);
    expect(plan.looseCount).toBe(0);
    expect(plan.pickQtyTotal).toBe(25);
    expect(plan.noteText).toBe('1 KA');
  });

  it('13 → 1 KA', () => {
    const plan = computePickPlan(porcelainArticle, 13, rules);
    expect(plan.fullUnitsCount).toBe(1);
    expect(plan.looseCount).toBe(0);
    expect(plan.pickQtyTotal).toBe(25);
    expect(plan.noteText).toBe('1 KA');
  });

  it('12 → 12 lösa', () => {
    const plan = computePickPlan(porcelainArticle, 12, rules);
    expect(plan.looseCount).toBe(12);
    expect(plan.fullUnitsCount).toBe(0);
    expect(plan.pickQtyTotal).toBe(12);
  });

  it('50 → 53 → 2 KA + 3 lösa', () => {
    const plan = computePickPlan(porcelainArticle, 50, rules);
    expect(plan.fullUnitsCount).toBe(2);
    expect(plan.looseCount).toBe(3);
    expect(plan.pickQtyTotal).toBe(53);
    expect(plan.noteText).toBe('2 KA + 3 lösa');
  });

  it('73 → 76 → 3 KA + 1 lösa', () => {
    const plan = computePickPlan(porcelainArticle, 73, rules);
    expect(plan.fullUnitsCount).toBe(3);
    expect(plan.looseCount).toBe(1);
    expect(plan.pickQtyTotal).toBe(76);
    expect(plan.noteText).toBe('3 KA + 1 lösa');
  });

  it('500 → 20 KA', () => {
    const plan = computePickPlan(porcelainArticle, 500, rules);
    expect(plan.fullUnitsCount).toBe(20);
    expect(plan.looseCount).toBe(0);
    expect(plan.pickQtyTotal).toBe(500);
    expect(plan.noteText).toBe('20 KA');
  });

  it('501 → 21 KA', () => {
    const plan = computePickPlan(porcelainArticle, 501, rules);
    expect(plan.fullUnitsCount).toBe(21);
    expect(plan.looseCount).toBe(0);
    expect(plan.pickQtyTotal).toBe(525);
    expect(plan.noteText).toBe('21 KA');
  });
});

describe('GLAS (BA=25)', () => {
  it('50 → 2 BA', () => {
    const plan = computePickPlan(glassArticle, 50, rules);
    expect(plan.fullUnitsCount).toBe(2);
    expect(plan.looseCount).toBe(0);
    expect(plan.pickQtyTotal).toBe(50);
    expect(plan.noteText).toBe('2 BA');
  });

  it('52 → 2 BA + 2 lösa', () => {
    const plan = computePickPlan(glassArticle, 52, rules);
    expect(plan.fullUnitsCount).toBe(2);
    expect(plan.looseCount).toBe(2);
    expect(plan.pickQtyTotal).toBe(52);
    expect(plan.noteText).toBe('2 BA + 2 lösa');
  });

  it('73 → 3 BA', () => {
    const plan = computePickPlan(glassArticle, 73, rules);
    expect(plan.fullUnitsCount).toBe(3);
    expect(plan.looseCount).toBe(0);
    expect(plan.pickQtyTotal).toBe(75);
    expect(plan.noteText).toBe('3 BA');
  });

  it('13 → 1 BA', () => {
    const plan = computePickPlan(glassArticle, 13, rules);
    expect(plan.fullUnitsCount).toBe(1);
    expect(plan.looseCount).toBe(0);
    expect(plan.pickQtyTotal).toBe(25);
    expect(plan.noteText).toBe('1 BA');
  });

  it('12 → 12 lösa', () => {
    const plan = computePickPlan(glassArticle, 12, rules);
    expect(plan.looseCount).toBe(12);
    expect(plan.fullUnitsCount).toBe(0);
    expect(plan.pickQtyTotal).toBe(12);
  });
});

describe('BESTICK', () => {
  it('50 → 50 (exakt vid gräns)', () => {
    const plan = computePickPlan(bestickArticle, 50, rules);
    expect(plan.pickQtyTotal).toBe(53);
    expect(plan.noteText).toBe('53 st');
  });

  it('120 → 123', () => {
    const plan = computePickPlan(bestickArticle, 120, rules);
    expect(plan.pickQtyTotal).toBe(123);
    expect(plan.noteText).toBe('123 st');
  });

  it('350 → 360', () => {
    const plan = computePickPlan(bestickArticle, 350, rules);
    expect(plan.pickQtyTotal).toBe(360);
    expect(plan.noteText).toBe('360 st');
  });

  it('under 50 är exakt', () => {
    const plan = computePickPlan(bestickArticle, 49, rules);
    expect(plan.pickQtyTotal).toBe(49);
  });
});

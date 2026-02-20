/**
 * Test som verifierar att appen RÄKNAR (KA/BA/BESTICK) och tar reglerna i hänsyn.
 * Om detta test faller visar appen bara "X st" istället för kassetter/backar.
 */
import { describe, it, expect } from 'vitest';
import type { Article, Order, OrderLineWithPickPlan } from './types';
import { defaultPlockbotRules } from './defaultRules';
import { applyRulesToOrders } from './pickPlanEngine';
import { articlesByCodeMap } from '../masterdata';

describe('Appen räknar och följer reglerna', () => {
  it('matchar artiklar, tillämpar regler och ger KA/BA (inte bara styck)', () => {
    const articles: Article[] = [
      { id: 'P202', name: 'Mattallrik Ø 24', category: 'PORSLIN', ka: 25 },
      { id: 'G110', name: 'Vinglas 31 cl', category: 'GLAS', ba: 25 },
      { id: 'B100', name: 'Matgaffel rostfri', category: 'BESTICK' },
      { id: 'B101', name: 'Matkniv rostfri', category: 'BESTICK' },
    ];

    const orders: Order[] = [
      {
        orderId: '109310',
        lines: [
          { articleCode: 'P202', description: 'Mattallrik Ø 24', orderedQty: 45 },
          { articleCode: 'G110', description: 'Vinglas 31 cl', orderedQty: 45 },
          { articleCode: 'B100', description: 'Matgaffel rostfri', orderedQty: 45 },
          { articleCode: 'B101', description: 'Matkniv rostfri', orderedQty: 45 },
        ],
      },
    ];

    const articlesByCode = articlesByCodeMap(articles);
    const rules = defaultPlockbotRules;
    const result = applyRulesToOrders(orders, articlesByCode, rules);

    expect(result).toHaveLength(1);
    const lines: OrderLineWithPickPlan[] = result[0].lines;
    expect(lines).toHaveLength(4);

    const p202 = lines.find(l => l.articleCode === 'P202');
    const g110 = lines.find(l => l.articleCode === 'G110');

    expect(p202, 'P202 (tallrik) ska finnas').toBeDefined();
    expect(g110, 'G110 (glas) ska finnas').toBeDefined();

    expect(p202!.noteText, 'Tallrikar (P202) ska räknas som KA/kassetter, inte bara "45 st"').toMatch(/KA/);
    expect(g110!.noteText, 'Glas (G110) ska räknas som BA/backar, inte bara "45 st"').toMatch(/BA/);

    const onlyStyck = lines.every(l => /^\d+ st$/.test(l.noteText ?? ''));
    expect(onlyStyck, 'Alla rader får inte vara bara "X st" – minst KA eller BA ska användas').toBe(false);

    const withCalculation = lines.filter(l => /KA|BA|lösa/.test(l.noteText ?? ''));
    expect(withCalculation.length, 'Minst en rad ska ha beräkning (KA/BA/lösa)').toBeGreaterThanOrEqual(1);
  });

  it('visar exakt hur det räknar (loggas vid körning)', () => {
    const articles: Article[] = [
      { id: 'P202', name: 'Mattallrik Ø 24', category: 'PORSLIN', ka: 25 },
      { id: 'G110', name: 'Vinglas 31 cl', category: 'GLAS', ba: 25 },
      { id: 'B100', name: 'Matgaffel rostfri', category: 'BESTICK' },
    ];
    const orders: Order[] = [
      {
        orderId: '109310',
        lines: [
          { articleCode: 'P202', description: 'Mattallrik Ø 24', orderedQty: 45 },
          { articleCode: 'G110', description: 'Vinglas 31 cl', orderedQty: 45 },
          { articleCode: 'B100', description: 'Matgaffel rostfri', orderedQty: 45 },
        ],
      },
    ];
    const result = applyRulesToOrders(orders, articlesByCodeMap(articles), defaultPlockbotRules);
    const lines: OrderLineWithPickPlan[] = result[0].lines;

    console.log('\n--- Så räknar reglerna (Best → LEV. ANTAL) ---');
    lines.forEach(l => {
      console.log(`  ${l.articleCode} ${l.description?.slice(0, 20) ?? ''}: Best ${l.orderedQty} → "${l.noteText}" (totalt plock: ${l.pickQtyTotal})`);
    });
    console.log('---\n');

    expect(lines[0].noteText).toMatch(/KA/);
    expect(lines[1].noteText).toMatch(/BA/);
  });

  it('ger förutsägbara KA/BA-resultat enligt reglerna (45 tallrikar → 1 KA + 20 lösa eller 2 KA)', () => {
    const articles: Article[] = [
      { id: 'P202', name: 'Mattallrik', category: 'PORSLIN', ka: 25 },
    ];
    const orders: Order[] = [
      { orderId: '1', lines: [{ articleCode: 'P202', description: 'Tallrik', orderedQty: 45 }] },
    ];
    const result = applyRulesToOrders(orders, articlesByCodeMap(articles), defaultPlockbotRules);
    const note = result[0].lines[0].noteText;

    expect(note).toMatch(/KA/);
    expect(note, '45 beställt med 25 per KA ska ge antingen "1 KA + 20 lösa" eller "2 KA"').toMatch(/(\d+ KA|lösa)/);
  });

  it('matchar artikelkod även med mellanslag och bindestreck (P 202, P-202)', () => {
    const articles: Article[] = [
      { id: 'P202', name: 'Mattallrik', category: 'PORSLIN', ka: 25 },
    ];
    const orders: Order[] = [
      { orderId: '1', lines: [{ articleCode: 'P-202', description: 'Tallrik', orderedQty: 30 }] },
    ];
    const result = applyRulesToOrders(orders, articlesByCodeMap(articles), defaultPlockbotRules);
    expect(result[0].lines[0].noteText).toMatch(/KA/);
  });
});

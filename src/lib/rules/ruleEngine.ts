import type { Article, PlockbotRules, OrderLineWithInstruction } from './types';
import type { Order } from './types';

/**
 * Beräknar plockinstruktion för en rad enligt artikeltyp och regler.
 */
export function computeInstruction(
  article: Article | undefined,
  orderedQty: number,
  rules: PlockbotRules
): string {
  if (!article) return String(orderedQty);

  if (article.isGroupHeader) return '';

  const quantityPerUnit = article.ka ?? article.ba;

  switch (article.category) {
    case 'ANNAT':
      return String(orderedQty);
    case 'PORSLIN':
      return computeKA(orderedQty, quantityPerUnit ?? rules.ka.defaultQuantityPerCassette, rules.ka);
    case 'GLAS':
      return computeBA(orderedQty, quantityPerUnit ?? rules.ba.defaultQuantityPerCrate, rules.ba);
    case 'BESTICK':
      return computeBESTICK(orderedQty, rules.bestick);
    default:
      return String(orderedQty);
  }
}

function computeKA(
  ordered: number,
  perCassette: number,
  ka: PlockbotRules['ka']
): string {
  const threshold = ka.thresholds?.find(t => t.quantityInCassette === perCassette);
  const pickFullIfAtLeast = threshold?.pickFullCassetteIfOrderedAtLeast ?? Math.ceil(perCassette * 0.5);

  if (ordered <= ka.smallOrderExactMax) return String(ordered);
  if (ordered <= ka.smallOrderOneCassetteUpTo && ordered >= pickFullIfAtLeast) return `1 KA`;

  if (ordered >= ka.largeOrderRoundUpFrom) {
    const fullCassettes = Math.ceil(ordered / perCassette);
    return `${fullCassettes} KA`;
  }

  let total = ordered;
  for (const m of ka.margins) {
    if (ordered <= m.maxOrdered) {
      total = ordered + m.extra;
      break;
    }
  }
  if (ordered > ka.margins[ka.margins.length - 1].maxOrdered) {
    total = ordered + ka.margins[ka.margins.length - 1].extra;
  }

  const fullCassettes = Math.floor(total / perCassette);
  const rest = total % perCassette;
  const restPercent = perCassette > 0 ? (rest / perCassette) * 100 : 0;
  const useExtraCassette = restPercent >= ka.restPercentFullCassetteThreshold;

  if (fullCassettes === 0 && !useExtraCassette) return String(rest);
  if (useExtraCassette && rest > 0) {
    const cassettes = fullCassettes + 1;
    return `${cassettes} KA`;
  }
  if (rest === 0) return `${fullCassettes} KA`;
  return `${fullCassettes} KA + ${rest} lösa`;
}

function computeBA(
  ordered: number,
  perCrate: number,
  ba: PlockbotRules['ba']
): string {
  const threshold = ba.thresholds?.find(t => t.quantityInCrate === perCrate);
  const pickFullIfAtLeast = threshold?.pickFullCrateIfOrderedAtLeast ?? Math.ceil(perCrate * 0.5);

  if (ordered <= ba.smallOrderExactMax) return String(ordered);
  if (ordered <= ba.smallOrderOneCrateUpTo && ordered >= pickFullIfAtLeast) return `1 BA`;

  if (ordered >= ba.largeOrderRoundUpFrom) {
    const fullCrates = Math.ceil(ordered / perCrate);
    return `${fullCrates} BA`;
  }

  let total = ordered;
  for (const m of ba.margins) {
    if (ordered <= m.maxOrdered) {
      total = ordered + m.extra;
      break;
    }
  }
  if (ordered > ba.margins[ba.margins.length - 1].maxOrdered) {
    total = ordered + ba.margins[ba.margins.length - 1].extra;
  }

  const fullCrates = Math.floor(total / perCrate);
  const rest = total % perCrate;
  const restPercent = perCrate > 0 ? (rest / perCrate) * 100 : 0;
  const useExtraCrate = restPercent >= ba.restPercentFullCrateThreshold;

  if (fullCrates === 0 && !useExtraCrate) return String(rest);
  if (useExtraCrate && rest > 0) return `${fullCrates + 1} BA`;
  if (rest === 0) return `${fullCrates} BA`;
  return `${fullCrates} BA + ${rest} lösa`;
}

function computeBESTICK(ordered: number, bestick: PlockbotRules['bestick']): string {
  if (ordered < bestick.exactBelow) return String(ordered);
  for (const r of bestick.ranges) {
    if (ordered >= r.minOrdered && ordered <= r.maxOrdered) {
      return String(ordered + r.extra);
    }
  }
  return String(ordered);
}

/**
 * Applicerar regler på alla rader i en order. Kräver artikel-lista (artikelkod → artikel).
 */
export function applyRulesToOrder(
  order: Order,
  articlesByCode: Map<string, Article>,
  rules: PlockbotRules
): OrderLineWithInstruction[] {
  return order.lines.map(line => {
    const article = articlesByCode.get(
      (line.articleCode || '').trim().toUpperCase().replace(/\s+/g, '')
    );
    const instruction = computeInstruction(article, line.orderedQty, rules);
    return { ...line, instruction: instruction || String(line.orderedQty) };
  });
}

export function applyRulesToOrders(
  orders: Order[],
  articlesByCode: Map<string, Article>,
  rules: PlockbotRules
): Array<Order & { lines: OrderLineWithInstruction[] }> {
  return orders.map(order => ({
    ...order,
    lines: applyRulesToOrder(order, articlesByCode, rules),
  }));
}

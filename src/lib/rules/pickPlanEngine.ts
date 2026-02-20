/**
 * Regelmotor – deterministisk computePickPlan() enligt spec.
 * PORSLIN (KA), GLAS (BA), BESTICK, GRUPPARTIKEL.
 */
import type { Article, Order, OrderLine, OrderLineWithPickPlan, PickPlan, PlockbotRules } from './types';
import { normalizeArticleCode } from '../masterdata';

const TRANSPORT_ARTICLE_IDS = ['TR100'];

export function computePickPlan(
  article: Article | undefined,
  orderedQty: number,
  rules: PlockbotRules
): PickPlan {
  if (!article) {
    return {
      articleId: '',
      orderedQty,
      fullUnitsCount: 0,
      looseCount: orderedQty,
      pickQtyTotal: orderedQty,
      noteText: `${orderedQty} st`,
    };
  }

  if (article.isGroupHeader) {
    return {
      articleId: article.id,
      orderedQty,
      fullUnitsCount: 0,
      looseCount: 0,
      pickQtyTotal: 0,
      noteText: '—',
    };
  }
  if (TRANSPORT_ARTICLE_IDS.some(tid => normalizeArticleCode(article.id) === normalizeArticleCode(tid))) {
    return {
      articleId: article.id,
      orderedQty,
      fullUnitsCount: 0,
      looseCount: 0,
      pickQtyTotal: 0,
      noteText: '—',
    };
  }

  switch (article.category) {
    case 'PORSLIN':
      return computeKA(orderedQty, article.ka ?? rules.ka.defaultQuantityPerCassette, rules.ka, article.id);
    case 'GLAS':
      return computeBA(orderedQty, article.ba ?? rules.ba.defaultQuantityPerCrate, rules.ba, article.id);
    case 'BESTICK':
      return computeBESTICK(orderedQty, rules.bestick, article.id);
    case 'ANNAT':
    default:
      return {
        articleId: article.id,
        orderedQty,
        fullUnitsCount: 0,
        looseCount: orderedQty,
        pickQtyTotal: orderedQty,
        noteText: `${orderedQty} st`,
      };
  }
}

function computeKA(
  ordered: number,
  unitSize: number,
  ka: PlockbotRules['ka'],
  articleId: string
): PickPlan {
  const threshold = ka.thresholds?.find(t => t.quantityInCassette === unitSize);
  const pickFullIfAtLeast = threshold?.pickFullCassetteIfOrderedAtLeast ?? 13;

  if (ordered <= 0) {
    return { articleId, orderedQty: ordered, fullUnitsCount: 0, looseCount: 0, pickQtyTotal: 0, noteText: '0 st' };
  }

  // A) orderedQty ≤ unitSize: först tröskel (≥ threshold → 1 KA), annars exakt upp till smallOrderExactMax
  if (ordered <= unitSize) {
    if (ordered >= pickFullIfAtLeast) {
      return {
        articleId,
        orderedQty: ordered,
        unitType: 'KA',
        unitSize,
        fullUnitsCount: 1,
        looseCount: 0,
        pickQtyTotal: unitSize,
        noteText: '1 KA',
      };
    }
    if (ordered <= ka.smallOrderExactMax) {
      return {
        articleId,
        orderedQty: ordered,
        unitType: 'KA',
        unitSize,
        fullUnitsCount: 0,
        looseCount: ordered,
        pickQtyTotal: ordered,
        noteText: String(ordered),
      };
    }
    return {
      articleId,
      orderedQty: ordered,
      unitType: 'KA',
      unitSize,
      fullUnitsCount: 0,
      looseCount: ordered,
      pickQtyTotal: ordered,
      noteText: String(ordered),
    };
  }

  // C) Stora beställningar: avrunda upp till hel kassett + valfritt antal extra kassetter
  if (ordered >= ka.largeOrderRoundUpFrom) {
    const baseUnits = Math.ceil(ordered / unitSize);
    const extraUnits = ka.largeOrderExtraUnits ?? 0;
    const fullUnitsCount = baseUnits + extraUnits;
    return {
      articleId,
      orderedQty: ordered,
      unitType: 'KA',
      unitSize,
      fullUnitsCount,
      looseCount: 0,
      pickQtyTotal: fullUnitsCount * unitSize,
      noteText: `${fullUnitsCount} KA`,
    };
  }

  // B) Marginal
  let pickBase = ordered;
  for (const m of ka.margins) {
    if (ordered <= m.maxOrdered) {
      pickBase = ordered + m.extra;
      break;
    }
  }

  // D) 80%-regel
  let fullUnitsCount = Math.floor(pickBase / unitSize);
  let rest = pickBase % unitSize;
  const restPercent = unitSize > 0 ? (rest / unitSize) * 100 : 0;
  if (restPercent >= ka.restPercentFullCassetteThreshold && rest > 0) {
    fullUnitsCount += 1;
    rest = 0;
  }
  const pickQtyTotal = fullUnitsCount * unitSize + rest;
  const noteText = rest > 0 ? `${fullUnitsCount} KA + ${rest} lösa` : `${fullUnitsCount} KA`;

  return {
    articleId,
    orderedQty: ordered,
    unitType: 'KA',
    unitSize,
    fullUnitsCount,
    looseCount: rest,
    pickQtyTotal,
    noteText,
  };
}

function computeBA(
  ordered: number,
  unitSize: number,
  ba: PlockbotRules['ba'],
  articleId: string
): PickPlan {
  const threshold = ba.thresholds?.find(t => t.quantityInCrate === unitSize);
  const pickFullIfAtLeast = threshold?.pickFullCrateIfOrderedAtLeast ?? 13;

  if (ordered <= 0) {
    return { articleId, orderedQty: ordered, fullUnitsCount: 0, looseCount: 0, pickQtyTotal: 0, noteText: '0 st' };
  }

  if (ordered <= unitSize) {
    if (ordered >= pickFullIfAtLeast) {
      return {
        articleId,
        orderedQty: ordered,
        unitType: 'BA',
        unitSize,
        fullUnitsCount: 1,
        looseCount: 0,
        pickQtyTotal: unitSize,
        noteText: '1 BA',
      };
    }
    if (ordered <= ba.smallOrderExactMax) {
      return {
        articleId,
        orderedQty: ordered,
        unitType: 'BA',
        unitSize,
        fullUnitsCount: 0,
        looseCount: ordered,
        pickQtyTotal: ordered,
        noteText: String(ordered),
      };
    }
    return {
      articleId,
      orderedQty: ordered,
      unitType: 'BA',
      unitSize,
      fullUnitsCount: 0,
      looseCount: ordered,
      pickQtyTotal: ordered,
      noteText: String(ordered),
    };
  }

  if (ordered >= ba.largeOrderRoundUpFrom) {
    const baseUnits = Math.ceil(ordered / unitSize);
    const extraUnits = ba.largeOrderExtraUnits ?? 0;
    const fullUnitsCount = baseUnits + extraUnits;
    return {
      articleId,
      orderedQty: ordered,
      unitType: 'BA',
      unitSize,
      fullUnitsCount,
      looseCount: 0,
      pickQtyTotal: fullUnitsCount * unitSize,
      noteText: `${fullUnitsCount} BA`,
    };
  }

  // BA: marginal per beställningsstorlek (samma logik som KA)
  let pickBase = ordered;
  for (const m of ba.margins) {
    if (ordered <= m.maxOrdered) {
      pickBase = ordered + m.extra;
      break;
    }
  }
  let fullUnitsCount = Math.floor(pickBase / unitSize);
  let rest = pickBase % unitSize;
  const restPercent = unitSize > 0 ? (rest / unitSize) * 100 : 0;
  if (restPercent >= ba.restPercentFullCrateThreshold && rest > 0) {
    fullUnitsCount += 1;
    rest = 0;
  }
  const pickQtyTotal = fullUnitsCount * unitSize + rest;
  const noteText = rest > 0 ? `${fullUnitsCount} BA + ${rest} lösa` : `${fullUnitsCount} BA`;

  return {
    articleId,
    orderedQty: ordered,
    unitType: 'BA',
    unitSize,
    fullUnitsCount,
    looseCount: rest,
    pickQtyTotal,
    noteText,
  };
}

function computeBESTICK(
  ordered: number,
  bestick: PlockbotRules['bestick'],
  articleId: string
): PickPlan {
  let pickQtyTotal = ordered;
  if (ordered < bestick.exactBelow) {
    // exakt
  } else {
    for (const r of bestick.ranges) {
      if (ordered >= r.minOrdered && ordered <= r.maxOrdered) {
        pickQtyTotal = ordered + r.extra;
        break;
      }
    }
  }
  return {
    articleId,
    orderedQty: ordered,
    fullUnitsCount: 0,
    looseCount: pickQtyTotal,
    pickQtyTotal,
    noteText: `${pickQtyTotal} st`,
  };
}

/**
 * Applicerar regelmotor på en order. Returnerar rader med PickPlan och noteText (Plockas som).
 */
export function applyRulesToOrder(
  order: Order,
  articlesByCode: Map<string, Article>,
  rules: PlockbotRules
): OrderLineWithPickPlan[] {
  return order.lines.map(line => {
    const article = articlesByCode.get(normalizeArticleCode(line.articleCode));
    const pickPlan = computePickPlan(article, line.orderedQty, rules);
    return {
      ...line,
      pickPlan,
      noteText: pickPlan.noteText,
      pickQtyTotal: pickPlan.pickQtyTotal,
      checked: false,
    };
  });
}

export function applyRulesToOrders(
  orders: Order[],
  articlesByCode: Map<string, Article>,
  rules: PlockbotRules
): Array<Order & { lines: OrderLineWithPickPlan[] }> {
  return orders.map(order => ({
    ...order,
    lines: applyRulesToOrder(order, articlesByCode, rules),
  }));
}

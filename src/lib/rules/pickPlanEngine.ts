/**
 * Regelmotor – deterministisk computePickPlan() enligt spec.
 * PORSLIN (KA), GLAS (BA), BESTICK, GRUPPARTIKEL.
 */
import type { Article, Order, OrderLineWithPickPlan, PickPlan, PlockbotRules } from './types';
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
  const exactMax = threshold?.smallOrderExactMax ?? ka.smallOrderExactMax;
  const restPercentThreshold = threshold?.restPercentFullCassetteThreshold ?? ka.restPercentFullCassetteThreshold;

  if (ordered <= 0) {
    return { articleId, orderedQty: ordered, fullUnitsCount: 0, looseCount: 0, pickQtyTotal: 0, noteText: '0 st' };
  }

  // A) orderedQty ≤ unitSize: först tröskel (≥ threshold → 1 KA), annars exakt upp till exactMax
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
    if (ordered <= exactMax) {
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
    const sortedByMaxDesc = [...(ka.margins ?? [])].sort((a, b) => b.maxOrdered - a.maxOrdered);
    const marginForLarge = sortedByMaxDesc.find(m => m.maxOrdered <= ordered);
    const extraUnitsFromMargin = marginForLarge?.extraUnits ?? 0;
    // Om en margin-rad gäller, använd bara den radens extra kassetter – inte global largeOrderExtraUnits också
    const extraUnits = marginForLarge ? extraUnitsFromMargin : (ka.largeOrderExtraUnits ?? 0);
    const fullUnitsCount = baseUnits + extraUnits;
    const noteText = extraUnits > 0
      ? `${baseUnits} KA + ${extraUnits} extra kassetter (totalt ${fullUnitsCount} KA)`
      : `${fullUnitsCount} KA`;
    return {
      articleId,
      orderedQty: ordered,
      unitType: 'KA',
      unitSize,
      fullUnitsCount,
      looseCount: 0,
      pickQtyTotal: fullUnitsCount * unitSize,
      noteText,
    };
  }

  // B) Säkerhetsmarginal: välj rätt intervall (sorterat på maxOrdered så lägsta träff gäller)
  let pickBase = ordered;
  let extraUnitsFromMargin = 0;
  const sortedMargins = [...(ka.margins ?? [])].sort((a, b) => a.maxOrdered - b.maxOrdered);
  for (const m of sortedMargins) {
    if (ordered <= m.maxOrdered) {
      pickBase = ordered + m.extra;
      extraUnitsFromMargin = m.extraUnits ?? 0;
      break;
    }
  }

  // D) Rest-%-regel: ta hel kassett om rest ≥ tröskel
  let fullUnitsCount = Math.floor(pickBase / unitSize);
  let rest = pickBase % unitSize;
  const restPercent = unitSize > 0 ? (rest / unitSize) * 100 : 0;
  if (restPercent >= restPercentThreshold && rest > 0) {
    fullUnitsCount += 1;
    rest = 0;
  }
  fullUnitsCount += extraUnitsFromMargin;
  const pickQtyTotal = fullUnitsCount * unitSize + rest;
  const extraPart = extraUnitsFromMargin > 0 ? ` (${fullUnitsCount - extraUnitsFromMargin} + ${extraUnitsFromMargin} extra kassetter)` : '';
  const noteText = rest > 0
    ? `${fullUnitsCount} KA + ${rest} lösa${extraPart}`
    : `${fullUnitsCount} KA${extraPart}`;

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
  const exactMax = threshold?.smallOrderExactMax ?? ba.smallOrderExactMax;
  const restPercentThreshold = threshold?.restPercentFullCrateThreshold ?? ba.restPercentFullCrateThreshold;

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
    if (ordered <= exactMax) {
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
    // För beställningar >= largeOrderRoundUpFrom: använd margin-rad med störst maxOrdered ≤ ordered (t.ex. rad "till 500" gäller för 501+)
    const sortedByMaxDesc = [...(ba.margins ?? [])].sort((a, b) => b.maxOrdered - a.maxOrdered);
    const marginForLarge = sortedByMaxDesc.find(m => m.maxOrdered <= ordered);
    const extraUnitsFromMargin = marginForLarge?.extraUnits ?? 0;
    // Om en margin-rad gäller, använd bara den radens extra backar – lägg inte på global largeOrderExtraUnits (annars blir det dubbelt)
    const extraUnits = marginForLarge ? extraUnitsFromMargin : (ba.largeOrderExtraUnits ?? 0);
    const fullUnitsCount = baseUnits + extraUnits;
    const noteText = extraUnits > 0
      ? `${baseUnits} BA + ${extraUnits} extra backar (totalt ${fullUnitsCount} BA)`
      : `${fullUnitsCount} BA`;
    return {
      articleId,
      orderedQty: ordered,
      unitType: 'BA',
      unitSize,
      fullUnitsCount,
      looseCount: 0,
      pickQtyTotal: fullUnitsCount * unitSize,
      noteText,
    };
  }

  // BA: säkerhetsmarginal (sorterat på maxOrdered)
  let pickBase = ordered;
  let extraUnitsFromMargin = 0;
  const sortedMargins = [...(ba.margins ?? [])].sort((a, b) => a.maxOrdered - b.maxOrdered);
  for (const m of sortedMargins) {
    if (ordered <= m.maxOrdered) {
      pickBase = ordered + m.extra;
      extraUnitsFromMargin = m.extraUnits ?? 0;
      break;
    }
  }
  let fullUnitsCount = Math.floor(pickBase / unitSize);
  let rest = pickBase % unitSize;
  const restPercent = unitSize > 0 ? (rest / unitSize) * 100 : 0;
  if (restPercent >= restPercentThreshold && rest > 0) {
    fullUnitsCount += 1;
    rest = 0;
  }
  fullUnitsCount += extraUnitsFromMargin;
  const pickQtyTotal = fullUnitsCount * unitSize + rest;
  const extraPart = extraUnitsFromMargin > 0 ? ` (${fullUnitsCount - extraUnitsFromMargin} + ${extraUnitsFromMargin} extra backar)` : '';
  const noteText = rest > 0
    ? `${fullUnitsCount} BA + ${rest} lösa${extraPart}`
    : `${fullUnitsCount} BA${extraPart}`;

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
  if (ordered <= bestick.exactBelow) {
    // exakt (50 eller färre enligt spec)
  } else {
    for (const r of bestick.ranges) {
      const max = r.maxOrdered == null ? Infinity : r.maxOrdered;
      if (ordered >= r.minOrdered && ordered <= max) {
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

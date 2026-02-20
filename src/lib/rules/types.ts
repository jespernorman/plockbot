/**
 * Typer för Plockbot – enligt spec.
 * Masterdata: Article med category (PORSLIN/GLAS/BESTICK/ANNAT), KA/BA, gruppartiklar.
 * Regelmotor returnerar PickPlan.
 */

export type ArticleCategory = 'PORSLIN' | 'GLAS' | 'BESTICK' | 'ANNAT';

/** Masterdata: en artikel från Excel (utökad internt). */
export interface Article {
  id: string;
  name: string;
  category: ArticleCategory;
  /** Antal per kassett (PORSLIN). */
  ka?: number;
  /** Antal per back (GLAS). */
  ba?: number;
  isGroupHeader?: boolean;
  groupId?: string;
  /** Faktor för paketmedlem (gruppartikel). */
  memberFactor?: number;
}

/** Kompatibilitet: artikelkod/namn för lookup och visning. */
export function articleCode(a: Article): string {
  return a.id;
}
export function articleName(a: Article): string {
  return a.name;
}

/** Tröskel: plocka full enhet om beställt >= X. */
export interface KAThreshold {
  quantityInCassette: number;
  pickFullCassetteIfOrderedAtLeast: number;
}

export interface KARules {
  defaultQuantityPerCassette: number;
  smallOrderExactMax: number;
  smallOrderOneCassetteUpTo: number;
  /** Per beställningsstorlek: om beställt ≤ maxOrdered, lägg på extra st. */
  margins: { maxOrdered: number; extra: number }[];
  largeOrderRoundUpFrom: number;
  /** Vid beställning ≥ largeOrderRoundUpFrom: plocka denna antal extra kassetter. */
  largeOrderExtraUnits?: number;
  restPercentFullCassetteThreshold: number;
  thresholds?: KAThreshold[];
}

export interface BAThreshold {
  quantityInCrate: number;
  pickFullCrateIfOrderedAtLeast: number;
}

export interface BARules {
  defaultQuantityPerCrate: number;
  smallOrderExactMax: number;
  smallOrderOneCrateUpTo: number;
  /** Per beställningsstorlek: om beställt ≤ maxOrdered, lägg på extra st. */
  margins: { maxOrdered: number; extra: number }[];
  largeOrderRoundUpFrom: number;
  /** Vid beställning ≥ largeOrderRoundUpFrom: plocka denna antal extra backar. */
  largeOrderExtraUnits?: number;
  restPercentFullCrateThreshold: number;
  thresholds?: BAThreshold[];
}

/** Intervall: om beställt mellan minOrdered och maxOrdered, plocka ordered + extra. */
export interface BESTICKRule {
  minOrdered: number;
  maxOrdered: number;
  extra: number;
}

export interface BESTICKRules {
  /** Under denna gräns plockas exakt beställt antal. */
  exactBelow: number;
  /** Olika extra per beställningsstorlek. */
  ranges: BESTICKRule[];
}

export interface PlockbotRules {
  ka: KARules;
  ba: BARules;
  bestick: BESTICKRules;
}

/** Resultat från regelmotor – hur artikeln ska plockas. */
export interface PickPlan {
  articleId: string;
  orderedQty: number;
  unitType?: 'KA' | 'BA';
  unitSize?: number;
  fullUnitsCount: number;
  looseCount: number;
  pickQtyTotal: number;
  noteText: string;
}

export interface OrderLine {
  articleCode: string;
  description: string;
  orderedQty: number;
}

export interface Order {
  orderId?: string;
  date?: string;
  customerId?: string;
  deliveryAddress?: string;
  lines: OrderLine[];
}

/** Orderrad med beräknad plockplan (för UI och export). */
export interface OrderLineWithPickPlan extends OrderLine {
  pickPlan: PickPlan | null;
  /** "Plockas som" – samma som pickPlan.noteText eller antal. */
  noteText: string;
  /** Totalt antal att plocka. */
  pickQtyTotal: number;
  checked?: boolean;
}

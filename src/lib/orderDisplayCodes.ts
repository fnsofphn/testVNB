import { normalizeOrderCodeFragment, type OrderRow } from '@/services/vcontent';

type ProductIdLike = { id: string } | { productId: string };

function readOrderMeta(order: { stage_sla_overrides?: Record<string, unknown> | null }) {
  const raw = order.stage_sla_overrides;
  if (!raw || typeof raw !== 'object') return {} as Record<string, unknown>;
  const orderMeta = (raw as { order_meta?: Record<string, unknown> }).order_meta;
  if (!orderMeta || typeof orderMeta !== 'object') return {} as Record<string, unknown>;
  return orderMeta;
}

function getProductRefId(product: ProductIdLike) {
  return 'id' in product ? String(product.id || '') : String(product.productId || '');
}

export function getDisplayOrderCode(order: OrderRow) {
  const orderMeta = readOrderMeta(order);
  const displayCode = String(orderMeta.display_order_code || '').trim();
  return displayCode || String(order.id || '').trim();
}

export function buildDisplayProductCodeMap(orderCode: string, products: ProductIdLike[]) {
  const baseCode = normalizeOrderCodeFragment(orderCode).toUpperCase();
  return new Map(
    products.map((product, index) => {
      const productId = getProductRefId(product);
      return [productId, baseCode ? `${baseCode}_${String(index + 1).padStart(2, '0')}` : productId];
    }),
  );
}

'use strict';

const ITEMS = Object.freeze([
  'MALE_POLO',
  'FEMALE_BLOUSE',
  'MALE_PANTS',
  'FEMALE_SKIRT',
  'T_SHIRT',
  'PE_UNIFORM'
]);

const SIZES = Object.freeze(['XS', 'S', 'M', 'L', 'XL', 'XXL']);
const MAX_QUANTITY = 30;

function statusFor(quantity) {
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > MAX_QUANTITY) {
    throw new RangeError('quantity must be a whole number from 0 to 30');
  }
  if (quantity === 0) return 'OUT_OF_STOCK';
  if (quantity <= 3) return 'LOW_STOCK';
  return 'AVAILABLE';
}

function isKnownItem(item) {
  return typeof item === 'string' && ITEMS.includes(item);
}

function isKnownSize(size) {
  return typeof size === 'string' && SIZES.includes(size);
}

function parseQuantity(value) {
  const text = String(value ?? '');
  if (!/^\d+$/.test(text)) throw new RangeError('BAD_QUANTITY');
  const quantity = Number(text);
  if (!Number.isSafeInteger(quantity) || quantity > MAX_QUANTITY) {
    throw new RangeError('BAD_QUANTITY');
  }
  return quantity;
}

class InventoryModel {
  constructor(initialQuantity = 0) {
    const safeInitial = parseQuantity(initialQuantity);
    this.quantities = ITEMS.map(() => SIZES.map(() => safeInitial));
  }

  indexes(item, size) {
    const itemIndex = ITEMS.indexOf(item);
    if (itemIndex < 0) throw new RangeError('UNKNOWN_ITEM');
    const sizeIndex = SIZES.indexOf(size);
    if (sizeIndex < 0) throw new RangeError('UNKNOWN_SIZE');
    return { itemIndex, sizeIndex };
  }

  check(item, size) {
    const { itemIndex, sizeIndex } = this.indexes(item, size);
    const quantity = this.quantities[itemIndex][sizeIndex];
    return { item, size, quantity, status: statusFor(quantity) };
  }

  overview(item) {
    if (!isKnownItem(item)) throw new RangeError('UNKNOWN_ITEM');
    return {
      item,
      maxQuantity: MAX_QUANTITY,
      sizes: SIZES.map((size) => this.check(item, size))
    };
  }

  update(item, size, rawQuantity) {
    const { itemIndex, sizeIndex } = this.indexes(item, size);
    const quantity = parseQuantity(rawQuantity);
    this.quantities[itemIndex][sizeIndex] = quantity;
    return { item, size, quantity, status: statusFor(quantity) };
  }

  snapshot() {
    return this.quantities.map((row) => row.slice());
  }
}

module.exports = {
  InventoryModel,
  ITEMS,
  SIZES,
  MAX_QUANTITY,
  isKnownItem,
  isKnownSize,
  parseQuantity,
  statusFor
};

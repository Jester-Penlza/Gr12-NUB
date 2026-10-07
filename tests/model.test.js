'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { InventoryModel, ITEMS, SIZES, parseQuantity, statusFor } = require('../simulator/model');

test('inventory contains exactly six items by six sizes', () => {
  assert.equal(ITEMS.length, 6);
  assert.deepEqual(SIZES, ['XS', 'S', 'M', 'L', 'XL', 'XXL']);
  const model = new InventoryModel(0);
  assert.equal(model.snapshot().flat().length, 36);
});

test('all 36 combinations are addressable and checks are read-only', () => {
  const model = new InventoryModel(4);
  const before = model.snapshot();
  for (const item of ITEMS) {
    for (const size of SIZES) {
      assert.deepEqual(model.check(item, size), { item, size, quantity: 4, status: 'AVAILABLE' });
    }
  }
  assert.deepEqual(model.snapshot(), before);
});

test('stock thresholds exactly match the specification', () => {
  assert.equal(statusFor(0), 'OUT_OF_STOCK');
  assert.equal(statusFor(1), 'LOW_STOCK');
  assert.equal(statusFor(3), 'LOW_STOCK');
  assert.equal(statusFor(4), 'AVAILABLE');
  assert.equal(statusFor(30), 'AVAILABLE');
  assert.throws(() => statusFor(31), /0 to 30/);
});

test('updates replace one quantity and keep all others unchanged', () => {
  const model = new InventoryModel(0);
  const result = model.update('T_SHIRT', 'M', '15');
  assert.equal(result.quantity, 15);
  assert.equal(model.check('T_SHIRT', 'M').quantity, 15);
  assert.equal(model.check('T_SHIRT', 'S').quantity, 0);
  assert.equal(model.check('PE_UNIFORM', 'M').quantity, 0);
});

test('blank, negative, decimal, oversized, and malformed quantities are rejected', () => {
  for (const value of ['', ' ', '-1', '1.5', '31', '255', '12x', null, undefined]) {
    assert.throws(() => parseQuantity(value), /BAD_QUANTITY/);
  }
});

test('overview returns every size with the 30-unit maximum', () => {
  const model = new InventoryModel(10);
  const overview = model.overview('MALE_POLO');
  assert.equal(overview.maxQuantity, 30);
  assert.equal(overview.sizes.length, 6);
  assert.deepEqual(overview.sizes.map(({ size, quantity, status }) => ({ size, quantity, status })),
    SIZES.map((size) => ({ size, quantity: 10, status: 'AVAILABLE' })));
});

test('unknown items and sizes are rejected without changing stock', () => {
  const model = new InventoryModel(7);
  const before = model.snapshot();
  assert.throws(() => model.update('UNKNOWN', 'M', 2), /UNKNOWN_ITEM/);
  assert.throws(() => model.update('T_SHIRT', 'XXXL', 2), /UNKNOWN_SIZE/);
  assert.deepEqual(model.snapshot(), before);
});

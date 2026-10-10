const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMarkupPercent,
  calculateWeightedAverageCost,
  calculateMarkupPriceCents
} = require('../src/pricing');

test('custo médio ponderado combina saldo existente e nova entrada', () => {
  assert.deepEqual(calculateWeightedAverageCost({
    currentQuantity: 2,
    currentCostCents: 1000,
    receivedQuantity: 3,
    unitCostCents: 1200
  }), { totalQuantity: 5, entryTotalCostCents: '3600', averageCostCents: 1120 });
});

test('estoque zerado usa o custo da nova compra como custo médio', () => {
  assert.equal(calculateWeightedAverageCost({
    currentQuantity: 0,
    currentCostCents: 850,
    receivedQuantity: 2,
    unitCostCents: 1234
  }).averageCostCents, 1234);
});

test('custo médio arredonda para o centavo mais próximo', () => {
  assert.equal(calculateWeightedAverageCost({
    currentQuantity: 1,
    currentCostCents: 100,
    receivedQuantity: 1,
    unitCostCents: 101
  }).averageCostCents, 101);
});

test('markup percentual produz sugestão de preço em centavos', () => {
  assert.equal(parseMarkupPercent('50.25'), 50.25);
  assert.equal(calculateMarkupPriceCents(1120, 50), 1680);
  assert.equal(calculateMarkupPriceCents(100, 12.5), 113);
});

test('valida quantidade, custo e markup fora da faixa', () => {
  assert.throws(() => calculateWeightedAverageCost({
    currentQuantity: 0,
    currentCostCents: 0,
    receivedQuantity: 0,
    unitCostCents: 100
  }), { status: 400 });
  assert.throws(() => calculateWeightedAverageCost({
    currentQuantity: 0,
    currentCostCents: 0,
    receivedQuantity: 1,
    unitCostCents: 0
  }), { status: 400 });
  assert.throws(() => parseMarkupPercent(1001), { status: 400 });
});

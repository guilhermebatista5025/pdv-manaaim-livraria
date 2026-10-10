const MAX_INTEGER = 2_147_483_647;

function parseMarkupPercent(value, field = 'Markup') {
  const percent = Number(value);
  if (!Number.isFinite(percent) || percent < 0 || percent > 1000) {
    throw Object.assign(new Error(`${field} deve ficar entre 0% e 1000%.`), { status: 400 });
  }
  return Math.round(percent * 100) / 100;
}

function calculateWeightedAverageCost({ currentQuantity, currentCostCents, receivedQuantity, unitCostCents }) {
  const validInteger = (value) => Number.isSafeInteger(value) && value >= 0 && value <= MAX_INTEGER;
  if (!validInteger(currentQuantity) || !validInteger(currentCostCents)) {
    throw Object.assign(new Error('Estoque ou custo médio atual inválido.'), { status: 409 });
  }
  if (!Number.isSafeInteger(receivedQuantity) || receivedQuantity < 1 || receivedQuantity > MAX_INTEGER) {
    throw Object.assign(new Error('A quantidade recebida deve ser um inteiro positivo.'), { status: 400 });
  }
  if (!Number.isSafeInteger(unitCostCents) || unitCostCents < 1 || unitCostCents > MAX_INTEGER) {
    throw Object.assign(new Error('O custo unitário deve ser maior que zero e válido.'), { status: 400 });
  }

  const totalQuantity = currentQuantity + receivedQuantity;
  if (totalQuantity > MAX_INTEGER) {
    throw Object.assign(new Error('A entrada ultrapassa o limite de estoque suportado.'), { status: 400 });
  }

  const inventoryValueCents = (BigInt(currentQuantity) * BigInt(currentCostCents))
    + (BigInt(receivedQuantity) * BigInt(unitCostCents));
  const entryTotalCostCents = BigInt(receivedQuantity) * BigInt(unitCostCents);
  const averageCostCents = Number((inventoryValueCents + BigInt(totalQuantity) / 2n) / BigInt(totalQuantity));
  if (averageCostCents > MAX_INTEGER) {
    throw Object.assign(new Error('O custo médio ultrapassa o limite suportado.'), { status: 400 });
  }

  return { totalQuantity, entryTotalCostCents: entryTotalCostCents.toString(), averageCostCents };
}

function calculateMarkupPriceCents(costCents, markupPercent) {
  if (!Number.isSafeInteger(costCents) || costCents < 0 || costCents > MAX_INTEGER) {
    throw Object.assign(new Error('O custo do produto é inválido.'), { status: 400 });
  }
  const percent = parseMarkupPercent(markupPercent);
  const basisPoints = BigInt(Math.round(percent * 100));
  const suggestedPriceCents = Number((BigInt(costCents) * (10000n + basisPoints) + 5000n) / 10000n);
  if (suggestedPriceCents > MAX_INTEGER) {
    throw Object.assign(new Error('O preço sugerido ultrapassa o limite suportado.'), { status: 400 });
  }
  return suggestedPriceCents;
}

module.exports = { parseMarkupPercent, calculateWeightedAverageCost, calculateMarkupPriceCents };

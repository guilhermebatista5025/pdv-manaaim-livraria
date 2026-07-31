const state = {
  user: null,
  currentView: 'dashboard',
  products: [],
  cancellations: [],
  cashSession: null,
  cart: new Map()
};

const elements = {
  loginScreen: document.querySelector('#loginScreen'),
  appScreen: document.querySelector('#appScreen'),
  loginForm: document.querySelector('#loginForm'),
  loginButton: document.querySelector('#loginButton'),
  password: document.querySelector('#password'),
  sidebar: document.querySelector('#sidebar'),
  pageTitle: document.querySelector('#pageTitle'),
  pageEyebrow: document.querySelector('#pageEyebrow'),
  productSearch: document.querySelector('#productSearch')
};

const viewMeta = {
  dashboard: ['Visão geral', 'Resumo do negócio'],
  pos: ['Nova venda', 'Frente de caixa'],
  cash: ['Controle de caixa', 'Abertura e fechamento'],
  products: ['Produtos', 'Catálogo da livraria'],
  stock: ['Estoque', 'Controle de movimentações'],
  sales: ['Vendas', 'Histórico de atendimentos'],
  cancellations: ['Cancelamentos', 'Estornos e correções'],
  reports: ['Relatórios', 'Indicadores do negócio']
};

async function api(path, options = {}) {
  const isFormData = options.body instanceof FormData;
  const response = await fetch(path, {
    credentials: 'include',
    ...options,
    headers: {
      ...(options.body && !isFormData ? { 'Content-Type': 'application/json' } : {}),
      ...options.headers
    }
  });

  const data = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401 && path !== '/api/auth/login') showLogin();
    throw new Error(data?.error || 'Não foi possível concluir a operação.');
  }
  return data;
}

function formatMoney(cents = 0) {
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(cents / 100);
}

function escapeHtml(value) {
  const element = document.createElement('span');
  element.textContent = String(value ?? '');
  return element.innerHTML;
}

function showToast(message, type = 'default') {
  const toast = document.createElement('div');
  toast.className = `toast${type === 'error' ? ' toast--error' : ''}`;
  toast.textContent = message;
  document.querySelector('#toastContainer').append(toast);
  setTimeout(() => toast.remove(), 3500);
}

function showLogin() {
  state.user = null;
  elements.appScreen.hidden = true;
  elements.loginScreen.hidden = false;
  showAuthView('login');
}

function showAuthView(view) {
  document.querySelectorAll('.auth-view').forEach((section) => {
    section.hidden = section.id !== `${view}View`;
  });
}

function showApp(user) {
  state.user = user;
  elements.loginScreen.hidden = true;
  elements.appScreen.hidden = false;

  const firstName = user.name.trim().split(/\s+/)[0];
  document.querySelector('#welcomeName').textContent = firstName;
  document.querySelector('#sidebarUserName').textContent = user.name;
  document.querySelector('#sidebarUserRole').textContent = {
    admin: 'Administrador',
    owner: 'Proprietário',
    cashier: 'Operador de caixa'
  }[user.role] || user.role;
  document.querySelector('#userAvatar').textContent = user.name.charAt(0).toUpperCase();

  document.querySelectorAll('.nav-item--restricted').forEach((item) => {
    item.hidden = !['admin', 'owner'].includes(user.role);
  });
  document.querySelector('#newProductButton').hidden = !['admin', 'owner'].includes(user.role);
  document.querySelector('#newStockButton').hidden = !['admin', 'owner'].includes(user.role);
  navigate('pos');
  checkCashStatus({ prompt: true });
}

async function loadDashboard() {
  if (!['admin', 'owner'].includes(state.user.role)) return;
  try {
    const data = await api('/api/reports/summary?period=today&scope=current');
    document.querySelector('#metricRevenue').textContent = formatMoney(data.summary.revenue_cents);
    document.querySelector('#metricSales').textContent = data.summary.sales_count;
    document.querySelector('#metricItems').textContent = data.summary.items_sold;
    document.querySelector('#metricProfit').textContent = formatMoney(data.summary.gross_profit_cents);
    renderTopProducts(data.topProducts);
    renderLowStock(data.lowStock);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function renderTopProducts(products) {
  const container = document.querySelector('#topProducts');
  if (!products.length) {
    container.innerHTML = '<div class="empty-state"><span><i class="fa-solid fa-chart-simple"></i></span><p>Nenhuma venda registrada hoje.</p></div>';
    return;
  }
  container.innerHTML = products.slice(0, 5).map((product, index) => `
    <div class="rank-row">
      <span class="rank-number">${index + 1}</span>
      <div class="rank-info">
        <strong>${escapeHtml(product.product_name)}</strong>
        <small>${product.quantity} ${product.quantity === 1 ? 'unidade' : 'unidades'}</small>
      </div>
      <span class="rank-total">${formatMoney(product.revenue_cents)}</span>
    </div>
  `).join('');
}

function renderLowStock(products) {
  const container = document.querySelector('#lowStockList');
  document.querySelector('#lowStockCount').textContent = products.length;
  if (!products.length) {
    container.innerHTML = '<div class="empty-state empty-state--success"><span><i class="fa-solid fa-check"></i></span><p>Estoque em dia!</p></div>';
    return;
  }
  container.innerHTML = products.slice(0, 5).map((product) => `
    <div class="stock-row">
      <span class="rank-number"><i class="fa-solid fa-triangle-exclamation"></i></span>
      <div class="stock-info">
        <strong>${escapeHtml(product.name)}</strong>
        <small>Mínimo: ${product.minimum_stock}</small>
      </div>
      <span class="stock-level">${product.stock_quantity} un.</span>
    </div>
  `).join('');
}

async function loadProducts(search = '') {
  try {
    const data = await api(`/api/products?search=${encodeURIComponent(search)}`);
    state.products = data.products;
    const table = document.querySelector('#productsTable');
    if (!data.products.length) {
      table.innerHTML = '<tr><td colspan="6" class="table-empty">Nenhum produto encontrado.</td></tr>';
      return;
    }
    table.innerHTML = data.products.map((product) => {
      const low = product.stock_quantity <= product.minimum_stock;
      return `
        <tr>
          <td><div class="product-table-name">${product.image_path ? `<img src="${escapeHtml(product.image_path)}" alt="">` : '<span><i class="fa-solid fa-book"></i></span>'}<div><strong>${escapeHtml(product.name)}</strong><br><small>${escapeHtml(product.sku || 'Sem SKU')}</small></div></div></td>
          <td>${escapeHtml(product.category || '—')}</td>
          <td>${formatMoney(product.price_cents)}</td>
          <td>${product.stock_quantity} un.</td>
          <td><span class="status-pill${low ? ' status-pill--danger' : ''}">${low ? 'Estoque baixo' : 'Disponível'}</span></td>
          <td><button class="table-action" data-edit-product="${product.id}" title="Editar"><i class="fa-solid fa-pen"></i></button></td>
        </tr>
      `;
    }).join('');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadPosProducts(search = '') {
  try {
    const data = await api(`/api/products?search=${encodeURIComponent(search)}`);
    const categoryFilter = document.querySelector('#posCategoryFilter').value;
    const stockFilter = document.querySelector('#posStockFilter').value;
    if (!search && !categoryFilter) {
      const categories = [...new Set(data.products.map((product) => product.category).filter(Boolean))]
        .sort((a, b) => a.localeCompare(b, 'pt-BR'));
      const select = document.querySelector('#posCategoryFilter');
      const selected = select.value;
      select.innerHTML = '<option value="">Todas as categorias</option>' + categories.map(
        (category) => `<option value="${escapeHtml(category)}">${escapeHtml(category)}</option>`
      ).join('');
      select.value = selected;
    }
    const products = data.products.filter((product) => {
      if (!product.active) return false;
      if (categoryFilter && product.category !== categoryFilter) return false;
      if (stockFilter === 'available' && product.stock_quantity <= 0) return false;
      if (stockFilter === 'low' && product.stock_quantity > product.minimum_stock) return false;
      if (stockFilter === 'out' && product.stock_quantity !== 0) return false;
      return true;
    });
    document.querySelector('#posProductCount').textContent = products.length;
    const container = document.querySelector('#posProducts');
    if (!products.length) {
      container.innerHTML = '<div class="empty-state"><span><i class="fa-solid fa-book-open"></i></span><p>Nenhum produto encontrado.</p></div>';
      return;
    }
    container.innerHTML = products.map((product) => `
      <button class="product-card" data-add-product="${product.id}" ${product.stock_quantity <= 0 || !state.cashSession ? 'disabled' : ''}>
        <span class="product-card__image">${product.image_path ? `<img src="${escapeHtml(product.image_path)}" alt="">` : '<i class="fa-solid fa-book-open"></i>'}</span>
        <span class="product-card__content">
          <strong>${escapeHtml(product.name)}</strong>
          <small>${escapeHtml(product.category || product.sku || 'Livro')}</small>
          <span class="product-card__bottom"><b>${formatMoney(product.price_cents)}</b><span>${product.stock_quantity} em estoque</span></span>
        </span>
      </button>
    `).join('');
    state.products = data.products;
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function cartTotals() {
  const subtotalCents = [...state.cart.values()].reduce(
    (sum, item) => sum + item.product.price_cents * item.quantity, 0
  );
  const discountValue = Math.max(0, Number(document.querySelector('#saleDiscount').value || 0));
  const discountType = document.querySelector('[data-discount-type].is-active')?.dataset.discountType || 'percent';
  const discountCents = Math.min(
    subtotalCents,
    discountType === 'percent'
      ? Math.round(subtotalCents * Math.min(discountValue, 100) / 100)
      : Math.round(discountValue * 100)
  );
  return { subtotalCents, discountCents, totalCents: Math.max(0, subtotalCents - discountCents) };
}

function renderCart() {
  const container = document.querySelector('#cartList');
  const entries = [...state.cart.values()];
  const itemCount = entries.reduce((sum, item) => sum + item.quantity, 0);
  document.querySelector('#cartItemsCount').textContent = `${itemCount} ${itemCount === 1 ? 'item' : 'itens'}`;
  if (!entries.length) {
    container.innerHTML = '<div class="empty-state"><span><i class="fa-solid fa-cart-shopping"></i></span><p>Seu carrinho está vazio.</p></div>';
  } else {
    container.innerHTML = entries.map(({ product, quantity }) => `
      <div class="cart-row">
        <div class="cart-row__name"><strong>${escapeHtml(product.name)}</strong><small>${formatMoney(product.price_cents * quantity)}</small></div>
        <div class="cart-controls">
          <button data-cart-change="${product.id}" data-delta="-1"><i class="fa-solid fa-minus"></i></button>
          <span>${quantity}</span>
          <button data-cart-change="${product.id}" data-delta="1" ${quantity >= product.stock_quantity ? 'disabled' : ''}><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>
    `).join('');
  }
  updatePayment();
}

function updatePayment() {
  const totals = cartTotals();
  document.querySelector('#cartPreviewTotal').textContent = formatMoney(totals.subtotalCents);
  document.querySelector('#cartSubtotal').textContent = formatMoney(totals.subtotalCents);
  document.querySelector('#cartTotal').textContent = formatMoney(totals.totalCents);
  document.querySelector('#checkoutDiscount').textContent = `- ${formatMoney(totals.discountCents)}`;
  const received = Math.max(0, Math.round(Number(document.querySelector('#amountReceived').value || 0) * 100));
  document.querySelector('#changeAmount').textContent = formatMoney(Math.max(0, received - totals.totalCents));
}

function changeCart(productId, delta) {
  if (!state.cashSession) return showToast('Abra o caixa antes de iniciar uma venda.', 'error');
  const current = state.cart.get(productId);
  const product = current?.product || state.products.find((item) => item.id === productId);
  if (!product) return;
  const quantity = (current?.quantity || 0) + delta;
  if (quantity <= 0) state.cart.delete(productId);
  else if (quantity <= product.stock_quantity) state.cart.set(productId, { product, quantity });
  else showToast('Quantidade maior que o estoque disponível.', 'error');
  renderCart();
}

function openProductDialog(product = null) {
  document.querySelector('#productForm').reset();
  document.querySelector('#productId').value = product?.id || '';
  document.querySelector('#productDialogTitle').textContent = product ? 'Editar produto' : 'Novo produto';
  document.querySelector('#initialStockField').hidden = Boolean(product);
  document.querySelector('#productName').value = product?.name || '';
  document.querySelector('#productSku').value = product?.sku || '';
  document.querySelector('#productBarcode').value = product?.barcode || '';
  document.querySelector('#productCategory').value = product?.category || '';
  document.querySelector('#productMinimumStock').value = product?.minimum_stock ?? 0;
  document.querySelector('#productCost').value = ((product?.cost_cents || 0) / 100).toFixed(2);
  document.querySelector('#productPrice').value = product ? (product.price_cents / 100).toFixed(2) : '';
  document.querySelector('#productInitialStock').value = 0;
  document.querySelector('#productDescription').value = product?.description || '';
  document.querySelector('#productImage').value = '';
  const preview = document.querySelector('#productImagePreview');
  preview.innerHTML = product?.image_path
    ? `<img src="${escapeHtml(product.image_path)}" alt="Imagem atual do produto">`
    : '<i class="fa-solid fa-image"></i>';
  document.querySelector('#productDialog').showModal();
}

async function saveProduct(event) {
  event.preventDefault();
  const id = Number(document.querySelector('#productId').value) || null;
  const payload = {
    name: document.querySelector('#productName').value,
    sku: document.querySelector('#productSku').value,
    barcode: document.querySelector('#productBarcode').value,
    category: document.querySelector('#productCategory').value,
    description: document.querySelector('#productDescription').value,
    minimumStock: Number(document.querySelector('#productMinimumStock').value),
    costCents: Math.round(Number(document.querySelector('#productCost').value) * 100),
    priceCents: Math.round(Number(document.querySelector('#productPrice').value) * 100)
  };
  if (!id) payload.initialStock = Number(document.querySelector('#productInitialStock').value);
  try {
    const result = await api(id ? `/api/products/${id}` : '/api/products', {
      method: id ? 'PATCH' : 'POST',
      body: JSON.stringify(payload)
    });
    const image = document.querySelector('#productImage').files[0];
    if (image) {
      const formData = new FormData();
      formData.append('image', image);
      await api(`/api/products/${result.product.id}/image`, {
        method: 'POST',
        body: formData
      });
    }
    document.querySelector('#productDialog').close();
    showToast(id ? 'Produto atualizado.' : 'Produto cadastrado.');
    await loadProducts(elements.productSearch.value);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadStock() {
  try {
    const [productsData, movementsData] = await Promise.all([
      api('/api/products'),
      api('/api/stock/movements?limit=100')
    ]);
    state.products = productsData.products;
    const selector = document.querySelector('#stockProduct');
    selector.innerHTML = '<option value="">Selecione...</option>' + productsData.products.map(
      (product) => `<option value="${product.id}">${escapeHtml(product.name)} (${product.stock_quantity} un.)</option>`
    ).join('');
    const typeLabels = {
      initial: 'Estoque inicial', purchase: 'Entrada', adjustment: 'Ajuste',
      sale: 'Venda', sale_reversal: 'Cancelamento'
    };
    const table = document.querySelector('#stockTable');
    table.innerHTML = movementsData.movements.length ? movementsData.movements.map((movement) => `
      <tr>
        <td>${formatDateTime(movement.created_at)}</td>
        <td><strong>${escapeHtml(movement.product_name)}</strong><br><small>${escapeHtml(movement.sku || '')}</small></td>
        <td>${typeLabels[movement.type] || movement.type}</td>
        <td><strong style="color:${movement.quantity > 0 ? 'var(--success)' : 'var(--danger)'}">${movement.quantity > 0 ? '+' : ''}${movement.quantity}</strong></td>
        <td>${escapeHtml(movement.reason || '—')}</td>
        <td>${escapeHtml(movement.user_name || 'Sistema')}</td>
      </tr>
    `).join('') : '<tr><td colspan="6" class="table-empty">Nenhuma movimentação registrada.</td></tr>';

    if (['admin', 'owner'].includes(state.user.role)) {
      const { summary } = await api('/api/stock/summary');
      document.querySelector('#stockProductsCount').textContent = summary.products_count;
      document.querySelector('#stockUnitsCount').textContent = summary.total_units;
      document.querySelector('#stockCostValue').textContent = formatMoney(summary.inventory_cost_cents);
      document.querySelector('#stockLowCount').textContent = summary.low_stock_count;
    }
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function saveStockMovement(event) {
  event.preventDefault();
  const productId = Number(document.querySelector('#stockProduct').value);
  try {
    await api(`/api/products/${productId}/stock`, {
      method: 'POST',
      body: JSON.stringify({
        quantity: Number(document.querySelector('#stockQuantity').value),
        reason: document.querySelector('#stockReason').value
      })
    });
    document.querySelector('#stockDialog').close();
    document.querySelector('#stockForm').reset();
    showToast('Estoque atualizado.');
    await loadStock();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function formatDateTime(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short', timeStyle: 'short'
  }).format(new Date(`${value.replace(' ', 'T')}Z`));
}

function setCheckoutReadOnly(readOnly) {
  const dialog = document.querySelector('#checkoutDialog');
  dialog.classList.toggle('is-readonly', readOnly);
  dialog.querySelectorAll('input, select, textarea, [data-discount-type]').forEach((control) => {
    control.disabled = readOnly;
  });
  document.querySelector('#checkoutSubmitButton').hidden = readOnly;
  document.querySelector('#checkoutCancelButton').textContent = readOnly ? 'Fechar' : 'Cancelar e fechar';
  document.querySelector('#saleItemsDetails').hidden = !readOnly;
  document.querySelector('#checkoutEyebrow').textContent = readOnly ? 'Venda registrada' : 'Conclusão do atendimento';
  document.querySelector('#checkoutTitle').textContent = readOnly ? 'Detalhes da venda' : 'Finalizar venda';
  document.querySelector('#checkoutSubtitle').textContent = readOnly
    ? 'Informações somente para visualização.'
    : 'Revise os dados antes de confirmar.';
}

async function openSaleDetails(saleId) {
  try {
    const { sale } = await api(`/api/sales/${saleId}`);
    setCheckoutReadOnly(false);
    document.querySelector('#sellerName').value = sale.seller_name || sale.user_name || '';
    document.querySelector('#saleNotes').value = sale.notes || '';

    document.querySelectorAll('[data-discount-type]').forEach((button) => {
      button.classList.toggle('is-active', button.dataset.discountType === 'fixed');
    });
    document.querySelector('#discountPrefix').textContent = 'R$';
    document.querySelector('#discountValueLabel').textContent = 'Desconto em reais';
    document.querySelector('#saleDiscount').value = (sale.discount_cents / 100).toFixed(2);

    const displayedMethod = ['credit_card', 'debit_card'].includes(sale.payment_method)
      ? 'credit_card'
      : sale.payment_method;
    const paymentInput = document.querySelector(`input[name="paymentMethod"][value="${displayedMethod}"]`);
    if (paymentInput) paymentInput.checked = true;
    document.querySelector('#cashFields').hidden = displayedMethod !== 'cash';
    document.querySelector('#cardFields').hidden = displayedMethod !== 'credit_card';
    document.querySelector('#amountReceived').value = sale.amount_received_cents == null
      ? ''
      : (sale.amount_received_cents / 100).toFixed(2);
    document.querySelector('#changeAmount').textContent = formatMoney(sale.change_cents);
    document.querySelector('#cardBrand').value = sale.card_brand || 'other';
    document.querySelector('#cardType').value = ['credit_card', 'debit_card'].includes(sale.payment_method)
      ? sale.payment_method
      : '';

    document.querySelector('#cartSubtotal').textContent = formatMoney(sale.subtotal_cents);
    document.querySelector('#checkoutDiscount').textContent = `- ${formatMoney(sale.discount_cents)}`;
    document.querySelector('#cartTotal').textContent = formatMoney(sale.total_cents);
    document.querySelector('#checkoutTitle').textContent = `Detalhes da venda #${sale.id}`;
    document.querySelector('#saleItemsDetailsList').innerHTML = sale.items.map((item) => `
      <div class="sale-item-detail">
        <div><strong>${escapeHtml(item.product_name)}</strong><span> ${item.quantity} × ${formatMoney(item.unit_price_cents)}</span></div>
        <strong>${formatMoney(item.total_cents)}</strong>
      </div>
    `).join('');

    setCheckoutReadOnly(true);
    document.querySelector('#checkoutTitle').textContent = `Detalhes da venda #${sale.id}`;
    document.querySelector('#checkoutDialog').showModal();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadSales() {
  try {
    const { sales } = await api('/api/sales?limit=100');
    const paymentLabels = {
      cash: 'Dinheiro', pix: 'Pix', credit_card: 'Crédito',
      debit_card: 'Débito', other: 'Outro'
    };
    const table = document.querySelector('#salesTable');
    table.innerHTML = sales.length ? sales.map((sale) => `
      <tr>
        <td><strong>#${sale.id}</strong></td>
        <td>${formatDateTime(sale.created_at)}</td>
        <td>${escapeHtml(sale.user_name)}</td>
        <td>${paymentLabels[sale.payment_method] || sale.payment_method}</td>
        <td><strong>${formatMoney(sale.total_cents)}</strong></td>
        <td><span class="status-pill ${sale.status === 'cancelled' ? 'status-pill--muted' : ''}">${sale.status === 'cancelled' ? 'Cancelada' : 'Concluída'}</span></td>
        <td><button class="button button--secondary sale-details-button" data-sale-details="${sale.id}"><i class="fa-solid fa-eye"></i> Detalhes</button></td>
      </tr>
    `).join('') : '<tr><td colspan="7" class="table-empty">Nenhuma venda registrada.</td></tr>';
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function paymentLabel(method) {
  return {
    cash: 'Dinheiro', pix: 'Pix', credit_card: 'Crédito',
    debit_card: 'Débito', other: 'Outro'
  }[method] || method;
}

function renderCancellations(search = '') {
  const normalizedSearch = search.trim().toLowerCase();
  const sales = state.cancellations.filter((sale) => (
    !normalizedSearch
    || String(sale.id).includes(normalizedSearch)
    || sale.user_name.toLowerCase().includes(normalizedSearch)
  ));
  const table = document.querySelector('#cancellationsTable');
  table.innerHTML = sales.length ? sales.map((sale) => `
    <tr>
      <td><strong>#${sale.id}</strong></td>
      <td>${formatDateTime(sale.created_at)}</td>
      <td>${escapeHtml(sale.user_name)}</td>
      <td>${paymentLabel(sale.payment_method)}</td>
      <td><strong>${formatMoney(sale.total_cents)}</strong></td>
      <td>
        <span class="status-pill ${sale.status === 'cancelled' ? 'status-pill--muted' : ''}">${sale.status === 'cancelled' ? 'Cancelada' : 'Concluída'}</span>
        ${sale.cancel_reason ? `<small class="cancelled-details">${escapeHtml(sale.cancel_reason)}</small>` : ''}
      </td>
      <td>${sale.status === 'completed' ? `<button class="button button--danger cancellation-button" data-open-cancellation="${sale.id}"><i class="fa-solid fa-rotate-left"></i> Estornar</button>` : '<span class="muted-action">Estornada</span>'}</td>
    </tr>
  `).join('') : '<tr><td colspan="7" class="table-empty">Nenhuma venda encontrada.</td></tr>';
}

async function loadCancellations() {
  try {
    const { sales } = await api('/api/sales?limit=200');
    state.cancellations = sales;
    renderCancellations(document.querySelector('#cancellationSearch').value);
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function openCancellation(saleId) {
  const sale = state.cancellations.find((item) => item.id === saleId);
  if (!sale || sale.status !== 'completed') return;
  document.querySelector('#cancelForm').reset();
  document.querySelector('#cancelSaleId').value = sale.id;
  document.querySelector('#cancelSaleNumber').textContent = `#${sale.id}`;
  document.querySelector('#cancelDialog').showModal();
}

async function submitCancellation(event) {
  event.preventDefault();
  const saleId = document.querySelector('#cancelSaleId').value;
  try {
    await api(`/api/sales/${saleId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason: document.querySelector('#cancelReason').value })
    });
    document.querySelector('#cancelDialog').close();
    showToast(`Venda #${saleId} estornada. Os itens voltaram ao estoque.`);
    await loadCancellations();
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function loadReports() {
  try {
    const period = document.querySelector('#reportPeriod').value;
    const data = await api(`/api/reports/summary?period=${period}`);
    document.querySelector('#reportRevenue').textContent = formatMoney(data.summary.revenue_cents);
    document.querySelector('#reportSales').textContent = data.summary.sales_count;
    document.querySelector('#reportItems').textContent = data.summary.items_sold;
    document.querySelector('#reportProfit').textContent = formatMoney(data.summary.gross_profit_cents);
    const top = document.querySelector('#reportTopProducts');
    top.innerHTML = data.topProducts.length ? data.topProducts.map((product, index) => `
      <div class="rank-row"><span class="rank-number">${index + 1}</span><div class="rank-info"><strong>${escapeHtml(product.product_name)}</strong><small>${product.quantity} unidades</small></div><span class="rank-total">${formatMoney(product.revenue_cents)}</span></div>
    `).join('') : '<div class="empty-state"><span><i class="fa-solid fa-chart-simple"></i></span><p>Sem vendas neste período.</p></div>';
    const low = document.querySelector('#reportLowStock');
    low.innerHTML = data.lowStock.length ? data.lowStock.map((product) => `
      <div class="stock-row"><span class="rank-number">!</span><div class="stock-info"><strong>${escapeHtml(product.name)}</strong><small>Mínimo: ${product.minimum_stock}</small></div><span class="stock-level">${product.stock_quantity} un.</span></div>
    `).join('') : '<div class="empty-state empty-state--success"><span><i class="fa-solid fa-check"></i></span><p>Estoque em dia.</p></div>';
  } catch (error) {
    showToast(error.message, 'error');
  }
}

function updateCashInterface() {
  const isOpen = Boolean(state.cashSession);
  const statusButton = document.querySelector('#cashStatusButton');
  statusButton.classList.toggle('cash-status--closed', !isOpen);
  statusButton.classList.toggle('cash-status--open', isOpen);
  statusButton.innerHTML = isOpen
    ? `<i class="fa-solid fa-lock-open"></i><span>Caixa #${state.cashSession.id} aberto</span>`
    : '<i class="fa-solid fa-lock"></i><span>Caixa fechado</span>';

  const badge = document.querySelector('#posCashBadge');
  badge.classList.toggle('live-badge--closed', !isOpen);
  badge.innerHTML = isOpen
    ? '<i class="fa-solid fa-circle"></i> Caixa online'
    : '<i class="fa-solid fa-lock"></i> Caixa fechado';

  document.querySelector('#openCashButton').hidden = isOpen;
  document.querySelector('#closeCashButton').hidden = !isOpen;
  const card = document.querySelector('#cashCurrentCard');
  card.classList.toggle('cash-current-card--closed', !isOpen);
  document.querySelector('#cashCurrentTitle').textContent = isOpen
    ? `Caixa #${state.cashSession.id} aberto`
    : 'Caixa fechado';
  document.querySelector('#cashCurrentDetails').textContent = isOpen
    ? `Aberto por ${state.cashSession.opened_by_name} em ${formatDateTime(state.cashSession.opened_at)}`
    : 'Abra um novo caixa para começar a vender.';
}

async function checkCashStatus({ prompt = false } = {}) {
  try {
    const data = await api('/api/cash/status');
    state.cashSession = data.session;
    updateCashInterface();
    if (state.currentView === 'pos') loadPosProducts(document.querySelector('#posSearch').value);

    if (prompt && ['admin', 'owner'].includes(state.user.role)) {
      if (!data.isOpen) {
        document.querySelector('#openCashDialog').showModal();
      } else if (data.session.is_stale) {
        openCloseCashDialog(true);
      }
    }
    return data;
  } catch (error) {
    showToast(error.message, 'error');
    return null;
  }
}

function openCloseCashDialog(stale = false) {
  if (!state.cashSession) return;
  document.querySelector('#closeCashForm').reset();
  document.querySelector('#closingCashNumber').textContent = `#${state.cashSession.id}`;
  document.querySelector('#staleCashWarning').hidden = !stale;
  document.querySelector('#closeCashDialog').showModal();
}

async function loadCashHistory() {
  try {
    await checkCashStatus();
    const { sessions } = await api('/api/cash/history');
    const table = document.querySelector('#cashHistoryTable');
    table.innerHTML = sessions.length ? sessions.map((session) => `
      <tr>
        <td><strong>#${session.id}</strong><br><small>${escapeHtml(session.opened_by_name)}</small></td>
        <td>${formatDateTime(session.opened_at)}</td>
        <td>${session.closed_at ? formatDateTime(session.closed_at) : '—'}</td>
        <td>${session.sales_count}</td>
        <td><strong>${formatMoney(session.revenue_cents)}</strong></td>
        <td><span class="status-pill ${session.status === 'closed' ? 'status-pill--muted' : ''}">${session.status === 'open' ? 'Aberto' : 'Fechado'}</span></td>
        <td>${session.report_path ? `<a class="report-download" href="/api/cash/${session.id}/report"><i class="fa-solid fa-file-pdf"></i> PDF</a>` : '—'}</td>
      </tr>
    `).join('') : '<tr><td colspan="7" class="table-empty">Nenhum caixa registrado.</td></tr>';
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function openCash(event) {
  event.preventDefault();
  try {
    const { session } = await api('/api/cash/open', {
      method: 'POST',
      body: JSON.stringify({
        openingAmountCents: Math.round(Number(document.querySelector('#openingAmount').value || 0) * 100)
      })
    });
    state.cashSession = session;
    document.querySelector('#openCashDialog').close();
    updateCashInterface();
    showToast(`Caixa #${session.id} aberto. Boas vendas!`);
    navigate('pos');
  } catch (error) {
    showToast(error.message, 'error');
  }
}

async function closeCash(event) {
  event.preventDefault();
  const logoutAfterClose = document.querySelector('#logoutAfterClose').checked;
  const submitButton = event.submitter;
  submitButton.disabled = true;
  try {
    const result = await api('/api/cash/close', {
      method: 'POST',
      body: JSON.stringify({ notes: document.querySelector('#closingNotes').value })
    });
    state.cashSession = null;
    state.cart.clear();
    renderCart();
    document.querySelector('#closeCashDialog').close();
    updateCashInterface();
    const download = document.createElement('a');
    download.href = result.reportUrl;
    download.download = '';
    document.body.append(download);
    download.click();
    download.remove();
    showToast(`Caixa #${result.session.id} fechado e PDF gerado.`);
    if (logoutAfterClose) {
      await api('/api/auth/logout', { method: 'POST' });
      showLogin();
    } else {
      navigate('cash');
    }
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
}

function navigate(view) {
  if (!viewMeta[view]) return;
  state.currentView = view;
  document.querySelectorAll('.view').forEach((section) => section.classList.remove('is-visible'));
  document.querySelector(`#view-${view}`).classList.add('is-visible');
  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.view === view);
  });
  elements.pageTitle.textContent = viewMeta[view][0];
  elements.pageEyebrow.textContent = viewMeta[view][1];
  elements.sidebar.classList.remove('is-open');

  if (view === 'dashboard') loadDashboard();
  if (view === 'products') loadProducts();
  if (view === 'pos') loadPosProducts();
  if (view === 'cash') loadCashHistory();
  if (view === 'stock') loadStock();
  if (view === 'sales') loadSales();
  if (view === 'cancellations') loadCancellations();
  if (view === 'reports') loadReports();
}

elements.loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  elements.loginButton.disabled = true;
  elements.loginButton.querySelector('span').textContent = 'Entrando...';
  try {
    const data = await api('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({
        email: elements.loginForm.email.value,
        password: elements.loginForm.password.value
      })
    });
    elements.loginForm.reset();
    showApp(data.user);
    showToast('Login realizado com sucesso.');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    elements.loginButton.disabled = false;
    elements.loginButton.querySelector('span').textContent = 'Entrar no sistema';
  }
});

document.querySelectorAll('[data-auth-view]').forEach((button) => {
  button.addEventListener('click', () => showAuthView(button.dataset.authView));
});

document.querySelector('#registerForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const password = document.querySelector('#registerPassword').value;
  const confirmation = document.querySelector('#registerPasswordConfirm').value;
  if (password !== confirmation) return showToast('As senhas não coincidem.', 'error');

  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    const { user } = await api('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({
        name: document.querySelector('#registerName').value,
        email: document.querySelector('#registerEmail').value,
        password
      })
    });
    form.reset();
    showAuthView('login');
    elements.loginForm.email.value = user.email;
    showToast('Conta criada. Agora você já pode entrar.');
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector('#forgotForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const password = document.querySelector('#forgotPassword').value;
  const confirmation = document.querySelector('#forgotPasswordConfirm').value;
  if (password !== confirmation) return showToast('As senhas não coincidem.', 'error');

  const submitButton = form.querySelector('[type="submit"]');
  submitButton.disabled = true;
  try {
    const email = document.querySelector('#forgotEmail').value.trim();
    const { message } = await api('/api/auth/reset-password', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    form.reset();
    showAuthView('login');
    elements.loginForm.email.value = email;
    showToast(message);
  } catch (error) {
    showToast(error.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
});

document.querySelector('#togglePassword').addEventListener('click', () => {
  const visible = elements.password.type === 'text';
  elements.password.type = visible ? 'password' : 'text';
  const icon = document.querySelector('#togglePasswordIcon');
  if (icon) {
    icon.className = visible ? 'fa-solid fa-eye' : 'fa-solid fa-eye-slash';
  }
});

document.querySelector('#logoutButton').addEventListener('click', async () => {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    // A sessão já pode ter expirado; a tela de login continua sendo o destino correto.
  }
  showLogin();
});

document.querySelectorAll('[data-view]').forEach((button) => {
  button.addEventListener('click', () => navigate(button.dataset.view));
});

document.querySelectorAll('[data-go-view]').forEach((button) => {
  button.addEventListener('click', () => navigate(button.dataset.goView));
});

document.querySelector('#menuButton').addEventListener('click', () => elements.sidebar.classList.add('is-open'));
document.querySelector('#sidebarBackdrop').addEventListener('click', () => elements.sidebar.classList.remove('is-open'));

let searchTimer;
elements.productSearch.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadProducts(elements.productSearch.value), 250);
});

document.querySelector('#posSearch').addEventListener('input', (event) => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => loadPosProducts(event.target.value), 220);
});
document.querySelector('#posCategoryFilter').addEventListener('change', () => loadPosProducts(document.querySelector('#posSearch').value));
document.querySelector('#posStockFilter').addEventListener('change', () => loadPosProducts(document.querySelector('#posSearch').value));

document.querySelector('#posProducts').addEventListener('click', (event) => {
  const button = event.target.closest('[data-add-product]');
  if (button) changeCart(Number(button.dataset.addProduct), 1);
});

document.querySelector('#cartList').addEventListener('click', (event) => {
  const button = event.target.closest('[data-cart-change]');
  if (button) changeCart(Number(button.dataset.cartChange), Number(button.dataset.delta));
});

document.querySelector('#clearCartButton').addEventListener('click', () => {
  state.cart.clear();
  renderCart();
});

document.querySelector('#saleDiscount').addEventListener('input', updatePayment);
document.querySelector('#amountReceived').addEventListener('input', updatePayment);
document.querySelectorAll('[data-discount-type]').forEach((button) => {
  button.addEventListener('click', () => {
    document.querySelectorAll('[data-discount-type]').forEach((item) => item.classList.toggle('is-active', item === button));
    const percent = button.dataset.discountType === 'percent';
    document.querySelector('#discountPrefix').textContent = percent ? '%' : 'R$';
    document.querySelector('#discountValueLabel').textContent = percent ? 'Desconto em porcentagem' : 'Desconto em reais';
    document.querySelector('#saleDiscount').max = percent ? '100' : '';
    document.querySelector('#saleDiscount').value = '0';
    updatePayment();
  });
});
document.querySelectorAll('input[name="paymentMethod"]').forEach((input) => input.addEventListener('change', (event) => {
  document.querySelector('#cashFields').hidden = event.target.value !== 'cash';
  document.querySelector('#cardFields').hidden = event.target.value !== 'credit_card';
  document.querySelector('#cardBrand').required = event.target.value === 'credit_card';
  document.querySelector('#cardType').required = event.target.value === 'credit_card';
  updatePayment();
}));

document.querySelector('#finishSaleButton').addEventListener('click', () => {
  if (!state.cashSession) {
    showToast('O caixa está fechado. Abra um caixa antes de vender.', 'error');
    if (['admin', 'owner'].includes(state.user.role)) document.querySelector('#openCashDialog').showModal();
    return;
  }
  if (!state.cart.size) return showToast('Adicione produtos ao carrinho.', 'error');
  setCheckoutReadOnly(false);
  document.querySelector('input[name="paymentMethod"][value="pix"]').checked = true;
  document.querySelector('#cashFields').hidden = true;
  document.querySelector('#cardFields').hidden = true;
  document.querySelector('#cardBrand').required = false;
  document.querySelector('#cardType').required = false;
  document.querySelector('#cardBrand').value = '';
  document.querySelector('#cardType').value = '';
  document.querySelector('#sellerName').value ||= state.user.name || '';
  updatePayment();
  document.querySelector('#checkoutDialog').showModal();
});

document.querySelector('#checkoutForm').addEventListener('submit', async (event) => {
  event.preventDefault();
  const totals = cartTotals();
  const selectedPaymentMethod = document.querySelector('input[name="paymentMethod"]:checked').value;
  const paymentMethod = selectedPaymentMethod === 'credit_card'
    ? document.querySelector('#cardType').value
    : selectedPaymentMethod;
  const payload = {
    items: [...state.cart.values()].map(({ product, quantity }) => ({ productId: product.id, quantity })),
    paymentMethod,
    discountCents: totals.discountCents,
    sellerName: document.querySelector('#sellerName').value.trim(),
    notes: document.querySelector('#saleNotes').value.trim(),
    cardBrand: ['credit_card', 'debit_card'].includes(paymentMethod) ? document.querySelector('#cardBrand').value : null
  };
  if (paymentMethod === 'cash') {
    payload.amountReceivedCents = Math.round(Number(document.querySelector('#amountReceived').value || 0) * 100);
  }
  try {
    const { sale } = await api('/api/sales', { method: 'POST', body: JSON.stringify(payload) });
    state.cart.clear();
    document.querySelector('#saleDiscount').value = '0';
    document.querySelector('#amountReceived').value = '';
    document.querySelector('#cardBrand').value = '';
    document.querySelector('#cardType').value = '';
    document.querySelector('#saleNotes').value = '';
    document.querySelector('#checkoutDialog').close();
    renderCart();
    await loadPosProducts(document.querySelector('#posSearch').value);
    showToast(`Venda #${sale.id} finalizada: ${formatMoney(sale.total_cents)}.`);
  } catch (error) {
    showToast(error.message, 'error');
  }
});

document.querySelector('#salesTable').addEventListener('click', (event) => {
  const button = event.target.closest('[data-sale-details]');
  if (button) openSaleDetails(Number(button.dataset.saleDetails));
});

document.querySelector('#newProductButton').addEventListener('click', () => openProductDialog());
document.querySelector('#productForm').addEventListener('submit', saveProduct);
document.querySelector('#productImage').addEventListener('change', (event) => {
  const file = event.target.files[0];
  const preview = document.querySelector('#productImagePreview');
  if (!file) {
    preview.innerHTML = '<i class="fa-solid fa-image"></i>';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    event.target.value = '';
    preview.innerHTML = '<i class="fa-solid fa-image"></i>';
    return showToast('A imagem deve ter no máximo 5 MB.', 'error');
  }
  const reader = new FileReader();
  reader.addEventListener('load', () => {
    preview.innerHTML = `<img src="${reader.result}" alt="Prévia da imagem">`;
  }, { once: true });
  reader.readAsDataURL(file);
});
document.querySelector('#productsTable').addEventListener('click', (event) => {
  const button = event.target.closest('[data-edit-product]');
  if (button) openProductDialog(state.products.find((product) => product.id === Number(button.dataset.editProduct)));
});

document.querySelector('#newStockButton').addEventListener('click', async () => {
  if (!state.products.length) await loadStock();
  document.querySelector('#stockDialog').showModal();
});
document.querySelector('#stockForm').addEventListener('submit', saveStockMovement);

document.querySelector('#refreshSalesButton').addEventListener('click', loadSales);
document.querySelector('#refreshCancellationsButton').addEventListener('click', loadCancellations);
document.querySelector('#cancellationSearch').addEventListener('input', (event) => renderCancellations(event.target.value));
document.querySelector('#cancellationsTable').addEventListener('click', (event) => {
  const button = event.target.closest('[data-open-cancellation]');
  if (button) openCancellation(Number(button.dataset.openCancellation));
});
document.querySelector('#cancelForm').addEventListener('submit', submitCancellation);

document.querySelector('#reportPeriod').addEventListener('change', loadReports);
document.querySelector('#printReportButton').addEventListener('click', () => window.print());
document.querySelector('#cashStatusButton').addEventListener('click', () => {
  if (['admin', 'owner'].includes(state.user.role)) navigate('cash');
});
document.querySelector('#openCashButton').addEventListener('click', () => document.querySelector('#openCashDialog').showModal());
document.querySelector('#closeCashButton').addEventListener('click', () => openCloseCashDialog(Boolean(state.cashSession?.is_stale)));
document.querySelector('#refreshCashButton').addEventListener('click', loadCashHistory);
document.querySelector('#openCashForm').addEventListener('submit', openCash);
document.querySelector('#closeCashForm').addEventListener('submit', closeCash);

document.querySelectorAll('[data-close-dialog]').forEach((button) => {
  button.addEventListener('click', () => document.querySelector(`#${button.dataset.closeDialog}`).close());
});

document.querySelector('#todayDate').textContent = new Intl.DateTimeFormat('pt-BR', {
  day: '2-digit',
  month: 'long',
  year: 'numeric'
}).format(new Date());

api('/api/auth/me')
  .then(({ user }) => showApp(user))
  .catch(() => showLogin());

const defaultProducts = [
  { id: 1, barcode: '615123450001', name: 'Bottled Water', category: 'Drinks', price: 50, icon: '💧' },
  { id: 2, barcode: '615123450002', name: 'Soda 500ml', category: 'Drinks', price: 100, icon: '🥤' },
  { id: 3, barcode: '615123450003', name: 'Mango Juice', category: 'Drinks', price: 150, icon: '🧃' },
  { id: 4, barcode: '615123450004', name: 'White Bread', category: 'Bakery', price: 75, icon: '🍞' },
  { id: 5, barcode: '615123450005', name: 'Doughnut', category: 'Bakery', price: 60, icon: '🍩' },
  { id: 6, barcode: '615123450006', name: 'Crisps', category: 'Snacks', price: 80, icon: '🍟' },
  { id: 7, barcode: '615123450007', name: 'Chocolate Bar', category: 'Snacks', price: 120, icon: '🍫' },
  { id: 8, barcode: '615123450008', name: 'Milk 500ml', category: 'Dairy', price: 70, icon: '🥛' },
  { id: 9, barcode: '615123450009', name: 'Yoghurt', category: 'Dairy', price: 95, icon: '🍶' },
  { id: 10, barcode: '615123450010', name: 'Coffee', category: 'Hot drinks', price: 180, icon: '☕' },
  { id: 11, barcode: '615123450011', name: 'Tea', category: 'Hot drinks', price: 100, icon: '🍵' },
  { id: 12, barcode: '615123450012', name: 'Hand Soap', category: 'Household', price: 130, icon: '🧼' }
];

const savedProducts = JSON.parse(localStorage.getItem('vyro-products') || 'null');
let products = (savedProducts || defaultProducts).map(product => ({ ...product, barcode: product.barcode || `61512345${String(product.id).padStart(4, '0')}` }));
let cart = [];
let category = 'All';
const money = value => `KSh ${Number(value).toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const qs = selector => document.querySelector(selector);
const subtotal = () => cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
const totals = () => ({ subtotal: subtotal(), tax: subtotal() * .16, total: subtotal() * 1.16 });

function renderProducts() {
  const query = qs('#search').value.trim().toLowerCase();
  const categories = ['All', ...new Set(products.map(product => product.category))];
  qs('#categories').innerHTML = categories.map(item => `<button class="category ${item === category ? 'active' : ''}" data-category="${item}">${item}</button>`).join('');
  const filtered = products.filter(product => (category === 'All' || product.category === category) && `${product.name} ${product.category}`.toLowerCase().includes(query));
  qs('#products').innerHTML = filtered.length ? filtered.map(product => `<button class="product" data-id="${product.id}"><span class="product-icon">${product.icon}</span><span class="product-name">${product.name}</span><span class="product-category">${product.category}</span><span class="product-price">${money(product.price)}</span></button>`).join('') : '<p>No products found.</p>';
}

function populateProductCategories() {
  const categories = [...new Set(products.map(product => product.category))].sort();
  qs('#productCategory').innerHTML = categories.map(item => `<option value="${item}">${item}</option>`).join('') + '<option value="__new__">＋ Add a new category</option>';
}

function renderCart() {
  const cartEl = qs('#cart');
  cartEl.innerHTML = cart.length ? cart.map(item => `<div class="cart-item"><div><strong>${item.name}</strong><br><small>${money(item.price)} each</small></div><span class="item-total">${money(item.price * item.quantity)}</span><div class="item-actions"><div class="quantity"><button data-action="decrease" data-id="${item.id}">−</button><span>${item.quantity}</span><button data-action="increase" data-id="${item.id}">+</button></div><button class="link-button" data-action="remove" data-id="${item.id}">Remove</button></div></div>`).join('') : '<div class="empty-cart">Your cart is empty.<br><small>Add products to begin a sale.</small></div>';
  const value = totals();
  qs('#subtotal').textContent = money(value.subtotal);
  qs('#tax').textContent = money(value.tax);
  qs('#total').textContent = money(value.total);
  qs('#checkoutTotal').textContent = money(value.total);
  qs('#checkoutButton').disabled = !cart.length;
}

function addToCart(id) {
  const product = products.find(item => item.id === id);
  const existing = cart.find(item => item.id === id);
  existing ? existing.quantity++ : cart.push({ ...product, quantity: 1 });
  renderCart();
}

function notify(message) {
  const toast = qs('#toast'); toast.textContent = message; toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2500);
}

function saveSale() {
  const value = totals();
  const sales = JSON.parse(localStorage.getItem('vyro-sales') || '[]');
  sales.unshift({ id: Date.now(), date: new Date().toLocaleString('en-KE'), customer: qs('#customer').value.trim() || 'Walk-in customer', method: qs('#paymentMethod').value, total: value.total, items: cart.map(item => ({ name: item.name, quantity: item.quantity })) });
  localStorage.setItem('vyro-sales', JSON.stringify(sales));
}

qs('#today').textContent = new Date().toLocaleDateString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
renderProducts(); renderCart(); populateProductCategories();
qs('#search').addEventListener('input', renderProducts);
qs('#search').addEventListener('keydown', event => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const barcode = event.target.value.trim();
  const product = products.find(item => String(item.barcode) === barcode);
  if (!product) return notify(`No product found for barcode ${barcode || '—'}.`);
  addToCart(product.id);
  event.target.value = '';
  renderProducts();
  notify(`${product.name} added to cart.`);
});
qs('#categories').addEventListener('click', event => { if (event.target.dataset.category) { category = event.target.dataset.category; renderProducts(); } });
qs('#products').addEventListener('click', event => { const button = event.target.closest('[data-id]'); if (button) addToCart(Number(button.dataset.id)); });
qs('#cart').addEventListener('click', event => { const { action, id } = event.target.dataset; if (!action) return; const item = cart.find(entry => entry.id === Number(id)); if (action === 'increase') item.quantity++; if (action === 'decrease') item.quantity--; if (action === 'remove' || item.quantity <= 0) cart = cart.filter(entry => entry.id !== Number(id)); renderCart(); });
qs('#clearButton').addEventListener('click', () => { cart = []; renderCart(); });
qs('#checkoutButton').addEventListener('click', () => { const value = totals().total; qs('#dialogTotal').textContent = money(value); qs('#amountReceived').value = value.toFixed(2); qs('#change').textContent = ''; qs('#paymentDialog').showModal(); });
qs('#amountReceived').addEventListener('input', event => { const diff = Number(event.target.value) - totals().total; qs('#change').textContent = diff >= 0 ? `Change: ${money(diff)}` : `Balance due: ${money(Math.abs(diff))}`; });
qs('#paymentForm').addEventListener('submit', event => { if (event.submitter?.value === 'cancel') return; event.preventDefault(); if (Number(qs('#amountReceived').value) < totals().total) return notify('Payment amount is below the total.'); saveSale(); qs('#paymentDialog').close(); cart = []; qs('#customer').value = ''; renderCart(); notify('Sale completed successfully.'); });
qs('#newProductButton').addEventListener('click', () => { populateProductCategories(); qs('#productDialog').showModal(); });
qs('#productCategory').addEventListener('change', event => { const isNew = event.target.value === '__new__'; qs('#newCategoryRow').hidden = !isNew; qs('#newCategory').required = isNew; if (isNew) qs('#newCategory').focus(); });
qs('#productForm').addEventListener('submit', event => { if (event.submitter?.value === 'cancel') return; event.preventDefault(); const name = qs('#productName').value.trim(), selectedCategory = qs('#productCategory').value, productCategory = selectedCategory === '__new__' ? qs('#newCategory').value.trim() : selectedCategory, barcode = qs('#productBarcode').value.trim(), price = Number(qs('#productPrice').value); if (!name || !productCategory || !barcode || !price) return; if (products.some(product => String(product.barcode) === barcode)) return notify('That barcode is already assigned to a product.'); products.push({ id: Date.now(), barcode, name, category: productCategory, price, icon: '🏷️' }); localStorage.setItem('vyro-products', JSON.stringify(products)); qs('#productDialog').close(); event.target.reset(); qs('#newCategoryRow').hidden = true; qs('#newCategory').required = false; renderProducts(); notify('Product added.'); });
qs('#historyButton').addEventListener('click', () => { const sales = JSON.parse(localStorage.getItem('vyro-sales') || '[]'); qs('#history').innerHTML = sales.length ? sales.map(sale => `<div class="sale"><div><strong>${sale.customer}</strong><br><small>${sale.date} · ${sale.method}<br>${sale.items.map(item => `${item.quantity}× ${item.name}`).join(', ')}</small></div><strong>${money(sale.total)}</strong></div>`).join('') : '<p class="empty-cart">No completed sales yet.</p>'; qs('#historyDialog').showModal(); });

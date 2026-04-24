/**
 * =============================================
 * RATU NGEMIL — POS SYSTEM FRONTEND LOGIC
 * =============================================
 */

// ==================== STATE ====================
const state = {
    cart: [],               // { product: {...}, quantity: N }
    products: [],
    categories: [],
    activeCategory: 'Semua',
    activeTab: 'pos',
    storeConfig: {
        name: 'Ratu Ngemil',
        address: '',
        phone: '',
        branch: 'Pusat',
        taxRate: 0          // 0 to 1 (e.g., 0.11 for 11%)
    },
    authToken: localStorage.getItem('ratu_ngemil_token') || '',
    username: localStorage.getItem('ratu_ngemil_user') || '',
    selectedImageFile: null,
    previewObjectUrl: null
};

// ==================== HELPERS ====================

const API = {
    getHeaders() {
        const headers = {};
        if (state.authToken) {
            headers.Authorization = `Bearer ${state.authToken}`;
        }
        return headers;
    },
    async get(url) {
        const res = await fetch(url, { headers: API.getHeaders() });
        if (!res.ok) {
            if (res.status === 401 && state.authToken) {
                handleLogout();
            }
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Request failed: ${res.status}`);
        }
        return res.json();
    },
    async post(url, data) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...API.getHeaders() },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            if (res.status === 401 && state.authToken) {
                handleLogout();
            }
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Request failed: ${res.status}`);
        }
        return res.json();
    },
    async postForm(url, formData) {
        const res = await fetch(url, {
            method: 'POST',
            headers: { ...API.getHeaders() },
            body: formData
        });
        if (!res.ok) {
            if (res.status === 401 && state.authToken) {
                handleLogout();
            }
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Request failed: ${res.status}`);
        }
        return res.json();
    },
    async put(url, data) {
        const res = await fetch(url, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...API.getHeaders() },
            body: JSON.stringify(data)
        });
        if (!res.ok) {
            if (res.status === 401 && state.authToken) {
                handleLogout();
            }
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Request failed: ${res.status}`);
        }
        return res.json();
    },
    async del(url) {
        const res = await fetch(url, { method: 'DELETE', headers: API.getHeaders() });
        if (!res.ok) {
            if (res.status === 401 && state.authToken) {
                handleLogout();
            }
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || `Request failed: ${res.status}`);
        }
        return res.json();
    }
};

function formatRupiah(num) {
    return 'Rp ' + Math.round(num).toLocaleString('id-ID');
}

function $(selector) {
    return document.querySelector(selector);
}

function $$(selector) {
    return document.querySelectorAll(selector);
}

function showToast(message, type = 'info') {
    const container = $('#toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const icons = { success: '✅', error: '❌', info: 'ℹ️' };
    toast.innerHTML = `<span>${icons[type] || ''}</span> ${message}`;
    container.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function openModal(id) {
    const modal = $(`#${id}`);
    if (modal) modal.classList.add('active');
}

function closeModal(id) {
    const modal = $(`#${id}`);
    if (modal) modal.classList.remove('active');
}

function setProductPreview(src) {
    const preview = $('#product-image-preview');
    if (!preview) return;
    preview.src = src || '/static/assets/logo.png';
}

function cleanupPreviewObjectUrl() {
    if (state.previewObjectUrl) {
        URL.revokeObjectURL(state.previewObjectUrl);
        state.previewObjectUrl = null;
    }
}

function setSelectedImageFile(file) {
    state.selectedImageFile = file || null;
    cleanupPreviewObjectUrl();

    if (!file) {
        setProductPreview($('#input-product-image').value.trim() || '/static/assets/logo.png');
        return;
    }

    const objectUrl = URL.createObjectURL(file);
    state.previewObjectUrl = objectUrl;
    setProductPreview(objectUrl);
}

async function compressImageFile(file, maxWidth = 900, quality = 0.82) {
    if (!file || !file.type.startsWith('image/')) return file;
    const imageBitmap = await createImageBitmap(file);

    let targetWidth = imageBitmap.width;
    let targetHeight = imageBitmap.height;
    if (targetWidth > maxWidth) {
        const ratio = maxWidth / targetWidth;
        targetWidth = Math.round(targetWidth * ratio);
        targetHeight = Math.round(targetHeight * ratio);
    }

    const canvas = document.createElement('canvas');
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(imageBitmap, 0, 0, targetWidth, targetHeight);

    const blob = await new Promise((resolve) => {
        canvas.toBlob(resolve, 'image/jpeg', quality);
    });
    if (!blob) return file;

    const fileName = (file.name || 'produk').replace(/\.[^.]+$/, '') + '.jpg';
    return new File([blob], fileName, { type: 'image/jpeg' });
}

// ==================== CLOCK ====================

function updateClock() {
    const el = $('#header-clock');
    if (!el) return;
    const now = new Date();
    const opts = { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false };
    el.textContent = now.toLocaleDateString('id-ID', opts);
}

// ==================== TAB NAVIGATION ====================

function switchTab(tab) {
    state.activeTab = tab;
    $$('.nav-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.tab === tab));
    $$('.tab-content').forEach(section => section.classList.toggle('active', section.id === `tab-${tab}`));
    
    // Load tab-specific data
    if (tab === 'products') loadProductTable();
    if (tab === 'reports') loadReports();
    if (tab === 'settings') loadSheetsStatus();
}

// ==================== PRODUCT LOADING (POS) ====================

async function loadProducts() {
    try {
        state.products = await API.get('/api/products');
        localStorage.setItem('ratu_ngemil_products_cache', JSON.stringify(state.products));
        renderProductGrid();
    } catch (e) {
        if (e.message === 'Unauthorized') return;
        const cached = localStorage.getItem('ratu_ngemil_products_cache');
        if (cached) {
            state.products = JSON.parse(cached);
            renderProductGrid();
            showToast('Offline: produk dimuat dari cache lokal', 'info');
            return;
        }
        showToast('Gagal memuat produk: ' + e.message, 'error');
    }
}

async function loadCategories() {
    try {
        state.categories = await API.get('/api/products/categories');
        renderCategories();
    } catch (e) {
        if (e.message === 'Unauthorized') return;
        console.error('Categories load error:', e);
    }
}

function renderCategories() {
    const container = $('#pos-categories');
    container.innerHTML = state.categories.map(cat => `
        <button class="category-chip ${cat === state.activeCategory ? 'active' : ''}" data-category="${cat}">
            ${cat}
        </button>
    `).join('');

    container.querySelectorAll('.category-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            state.activeCategory = chip.dataset.category;
            $$('.category-chip').forEach(c => c.classList.toggle('active', c.dataset.category === state.activeCategory));
            renderProductGrid();
        });
    });
}

function renderProductGrid() {
    const container = $('#pos-product-grid');
    const search = $('#pos-search').value.toLowerCase();
    
    let filtered = state.products;
    if (state.activeCategory !== 'Semua') {
        filtered = filtered.filter(p => p.category === state.activeCategory);
    }
    if (search) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(search));
    }

    if (filtered.length === 0) {
        container.innerHTML = `
            <div class="empty-state" style="grid-column: 1/-1;">
                <span>🔍</span>
                <p>Produk tidak ditemukan</p>
            </div>
        `;
        return;
    }

    container.innerHTML = filtered.map(p => {
        let stockClass = '';
        let stockText = `Stok: ${p.stock}`;
        if (p.stock <= 0) { stockClass = 'empty'; stockText = 'Habis'; }
        else if (p.stock <= 5) { stockClass = 'low'; stockText = `Stok: ${p.stock} (rendah)`; }

        return `
            <div class="product-card ${p.stock <= 0 ? 'out-of-stock' : ''}" data-id="${p.id}">
                <div class="product-card-image-wrap">
                    <img src="${p.image_url || '/static/assets/logo.png'}" alt="${p.name}" class="product-card-image">
                </div>
                <span class="product-card-category">${p.category}</span>
                <div class="product-card-name">${p.name}</div>
                <div class="product-card-price">${formatRupiah(p.price)}</div>
                <div class="product-card-stock ${stockClass}">${stockText}</div>
            </div>
        `;
    }).join('');

    container.querySelectorAll('.product-card:not(.out-of-stock)').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.id);
            const product = state.products.find(p => p.id === id);
            if (product) addToCart(product);
        });
    });
}

// ==================== CART ====================

function addToCart(product) {
    const existing = state.cart.find(item => item.product.id === product.id);
    if (existing) {
        if (existing.quantity >= product.stock) {
            showToast(`Stok ${product.name} tidak cukup!`, 'error');
            return;
        }
        existing.quantity++;
    } else {
        if (product.stock <= 0) {
            showToast(`${product.name} sudah habis!`, 'error');
            return;
        }
        state.cart.push({ product, quantity: 1 });
    }
    renderCart();
    showToast(`${product.name} ditambahkan`, 'success');
}

function updateCartQty(productId, delta) {
    const item = state.cart.find(i => i.product.id === productId);
    if (!item) return;

    item.quantity += delta;
    if (item.quantity <= 0) {
        state.cart = state.cart.filter(i => i.product.id !== productId);
    } else if (item.quantity > item.product.stock) {
        item.quantity = item.product.stock;
        showToast('Melebihi stok tersedia!', 'error');
    }
    renderCart();
}

function removeFromCart(productId) {
    state.cart = state.cart.filter(i => i.product.id !== productId);
    renderCart();
}

function clearCart() {
    if (state.cart.length === 0) return;
    state.cart = [];
    renderCart();
    showToast('Keranjang dikosongkan', 'info');
}

function getCartTotals() {
    const subtotal = state.cart.reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
    const tax = subtotal * state.storeConfig.taxRate;
    const total = subtotal + tax;
    return { subtotal, tax, total };
}

function renderCart() {
    const container = $('#cart-items');
    const emptyEl = $('#cart-empty');
    const { subtotal, tax, total } = getCartTotals();

    if (state.cart.length === 0) {
        container.innerHTML = '';
        container.appendChild(emptyEl);
        emptyEl.style.display = 'flex';
    } else {
        if (emptyEl) emptyEl.style.display = 'none';
        container.innerHTML = state.cart.map(item => `
            <div class="cart-item">
                <div class="cart-item-info">
                    <div class="cart-item-name">${item.product.name}</div>
                    <div class="cart-item-price">${formatRupiah(item.product.price)}</div>
                </div>
                <div class="cart-item-qty">
                    <button onclick="updateCartQty(${item.product.id}, -1)">−</button>
                    <span>${item.quantity}</span>
                    <button onclick="updateCartQty(${item.product.id}, 1)">+</button>
                </div>
                <div class="cart-item-subtotal">${formatRupiah(item.product.price * item.quantity)}</div>
                <button class="cart-item-remove" onclick="removeFromCart(${item.product.id})">✕</button>
            </div>
        `).join('');
    }

    // Update totals
    $('#cart-subtotal').textContent = formatRupiah(subtotal);
    $('#cart-tax').textContent = formatRupiah(tax);
    $('#cart-total').textContent = formatRupiah(total);
    $('#tax-rate-label').textContent = Math.round(state.storeConfig.taxRate * 100);

    // Enable/disable pay button
    $('#btn-pay').disabled = state.cart.length === 0;

    // Mobile: expand cart indicator
    const posCart = document.querySelector('.pos-cart');
    if (posCart && window.innerWidth <= 768) {
        if (state.cart.length > 0) {
            posCart.classList.add('has-items');
        } else {
            posCart.classList.remove('has-items');
        }
    }
}

// ==================== PAYMENT ====================

function openPayment() {
    if (state.cart.length === 0) return;
    const { total } = getCartTotals();
    
    $('#payment-total-display').textContent = formatRupiah(total);
    $('#input-payment').value = '';
    $('#payment-change-wrap').style.display = 'none';
    $('#btn-confirm-pay').disabled = true;
    
    openModal('modal-payment');
    setTimeout(() => $('#input-payment').focus(), 100);
}

function handlePaymentInput() {
    const { total } = getCartTotals();
    const payment = parseFloat($('#input-payment').value) || 0;
    const change = payment - total;
    
    const changeWrap = $('#payment-change-wrap');
    const confirmBtn = $('#btn-confirm-pay');

    if (payment >= total) {
        changeWrap.style.display = 'block';
        $('#payment-change-display').textContent = formatRupiah(change);
        confirmBtn.disabled = false;
    } else {
        changeWrap.style.display = 'none';
        confirmBtn.disabled = true;
    }
}

function setupQuickPayButtons() {
    $$('.btn-quick-pay').forEach(btn => {
        btn.addEventListener('click', () => {
            const amount = btn.dataset.amount;
            const input = $('#input-payment');
            const { total } = getCartTotals();
            
            if (amount === 'exact') {
                input.value = Math.ceil(total);
            } else {
                const current = parseFloat(input.value) || 0;
                input.value = current + parseInt(amount);
            }
            handlePaymentInput();
        });
    });
}

async function confirmPayment() {
    const { total } = getCartTotals();
    const payment = parseFloat($('#input-payment').value) || 0;
    
    if (payment < total) {
        showToast('Pembayaran kurang!', 'error');
        return;
    }

    try {
        const data = {
            items: state.cart.map(item => ({
                product_id: item.product.id,
                quantity: item.quantity
            })),
            payment: payment,
            tax_rate: state.storeConfig.taxRate,
            branch: state.storeConfig.branch || 'Pusat'
        };

        const result = await API.post('/api/transactions', data);
        
        closeModal('modal-payment');
        showReceipt(result);
        showToast('Transaksi berhasil! 🎉', 'success');

        // Try auto-sync to Google Sheets
        try {
            const sheetsStatus = await API.get('/api/sheets/status');
            if (sheetsStatus.configured && sheetsStatus.enabled) {
                await API.post(`/api/sheets/sync/${result.id}`, {});
                showToast('Disinkronkan ke Google Sheets ✓', 'success');
            }
        } catch (e) {
            console.log('Google Sheets sync skipped:', e.message);
        }

        // Reset cart & reload products (stock updated)
        state.cart = [];
        renderCart();
        await loadProducts();

    } catch (e) {
        showToast('Gagal memproses: ' + e.message, 'error');
    }
}

// ==================== RECEIPT ====================

function showReceipt(transaction) {
    const receipt = $('#receipt-content');
    const store = state.storeConfig;
    
    const itemsHtml = transaction.items.map(item => `
        <div class="receipt-item">
            <span>${item.product_name}</span>
        </div>
        <div class="receipt-item-detail">
            ${item.quantity} x ${formatRupiah(item.price_each)} = ${formatRupiah(item.subtotal)}
        </div>
    `).join('');

    const timestamp = new Date(transaction.timestamp);
    const dateStr = timestamp.toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const timeStr = timestamp.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

    receipt.innerHTML = `
        <div class="receipt-header">
            <div class="receipt-store">${store.name || 'Ratu Ngemil'}</div>
            ${store.address ? `<div class="receipt-address">${store.address}</div>` : ''}
            ${store.phone ? `<div class="receipt-address">${store.phone}</div>` : ''}
        </div>
        <hr class="receipt-divider">
        <div class="receipt-meta">
            <div>No: TRX-${String(transaction.id).padStart(4, '0')}</div>
            <div>${dateStr} ${timeStr}</div>
        </div>
        <hr class="receipt-divider">
        <div class="receipt-items">
            ${itemsHtml}
        </div>
        <hr class="receipt-divider">
        <div class="receipt-totals">
            <div class="receipt-row"><span>Subtotal</span><span>${formatRupiah(transaction.subtotal)}</span></div>
            ${transaction.tax > 0 ? `<div class="receipt-row"><span>PPN</span><span>${formatRupiah(transaction.tax)}</span></div>` : ''}
            <div class="receipt-row total-row"><span>TOTAL</span><span>${formatRupiah(transaction.total)}</span></div>
            <div class="receipt-row"><span>Bayar</span><span>${formatRupiah(transaction.payment)}</span></div>
            <div class="receipt-row"><span>Kembali</span><span>${formatRupiah(transaction.change_amount)}</span></div>
        </div>
        <hr class="receipt-divider">
        <div class="receipt-footer">
            <div class="receipt-thank">Terima Kasih! 🙏</div>
            <div>Selamat Menikmati</div>
        </div>
    `;

    // Store for printing
    state.lastReceipt = receipt.innerHTML;
    state.lastTransactionId = transaction.id;
    
    openModal('modal-receipt');
}

function printReceipt() {
    if (!state.lastReceipt) return;
    
    const printArea = $('#print-area');
    printArea.innerHTML = state.lastReceipt;
    window.print();
}

// ==================== PRODUCT MANAGEMENT ====================

async function loadProductTable() {
    try {
        state.products = await API.get('/api/products');
        renderProductTable();
    } catch (e) {
        showToast('Gagal memuat produk', 'error');
    }
}

function renderProductTable() {
    const tbody = $('#product-table-body');
    const emptyEl = $('#product-empty');
    const search = $('#product-search')?.value?.toLowerCase() || '';

    let filtered = state.products;
    if (search) {
        filtered = filtered.filter(p => p.name.toLowerCase().includes(search));
    }

    if (filtered.length === 0) {
        tbody.innerHTML = '';
        emptyEl.style.display = 'block';
        return;
    }

    emptyEl.style.display = 'none';
    tbody.innerHTML = filtered.map(p => {
        let stockClass = '';
        if (p.stock <= 0) stockClass = 'empty';
        else if (p.stock <= 5) stockClass = 'low';

        return `
            <tr>
                <td><img src="${p.image_url || '/static/assets/logo.png'}" alt="${p.name}" class="product-table-image"></td>
                <td><strong>${p.name}</strong></td>
                <td>${p.category}</td>
                <td class="price-cell">${formatRupiah(p.price)}</td>
                <td class="stock-cell ${stockClass}">${p.stock}</td>
                <td>
                    <div class="action-buttons">
                        <button class="btn-icon" onclick="editProduct(${p.id})" title="Edit">✏️</button>
                        <button class="btn-icon danger" onclick="deleteProduct(${p.id}, '${p.name.replace(/'/g, "\\'")}')" title="Hapus">🗑️</button>
                    </div>
                </td>
            </tr>
        `;
    }).join('');
}

function openAddProduct() {
    $('#modal-product-title').textContent = 'Tambah Produk';
    $('#edit-product-id').value = '';
    $('#input-product-name').value = '';
    $('#input-product-category').value = '';
    $('#input-product-price').value = '';
    $('#input-product-stock').value = '';
    $('#input-product-image').value = '';
    $('#input-product-image-file').value = '';
    state.selectedImageFile = null;
    cleanupPreviewObjectUrl();
    setProductPreview('/static/assets/logo.png');
    
    // Populate category datalist
    updateCategoryDatalist();
    
    openModal('modal-product');
    setTimeout(() => $('#input-product-name').focus(), 100);
}

function updateCategoryDatalist() {
    const datalist = $('#category-list');
    const uniqueCats = [...new Set(state.products.map(p => p.category))];
    datalist.innerHTML = uniqueCats.map(c => `<option value="${c}">`).join('');
}

function editProduct(id) {
    const product = state.products.find(p => p.id === id);
    if (!product) return;

    $('#modal-product-title').textContent = 'Edit Produk';
    $('#edit-product-id').value = id;
    $('#input-product-name').value = product.name;
    $('#input-product-category').value = product.category;
    $('#input-product-price').value = product.price;
    $('#input-product-stock').value = product.stock;
    $('#input-product-image').value = product.image_url || '';
    $('#input-product-image-file').value = '';
    state.selectedImageFile = null;
    cleanupPreviewObjectUrl();
    setProductPreview(product.image_url || '/static/assets/logo.png');
    
    updateCategoryDatalist();
    openModal('modal-product');
}

async function saveProduct() {
    const id = $('#edit-product-id').value;
    const imageFile = state.selectedImageFile;
    const data = {
        name: $('#input-product-name').value.trim(),
        category: $('#input-product-category').value.trim() || 'Umum',
        price: parseFloat($('#input-product-price').value) || 0,
        stock: parseInt($('#input-product-stock').value) || 0,
        image_url: $('#input-product-image').value.trim() || null
    };

    if (!data.name) {
        showToast('Nama produk harus diisi!', 'error');
        return;
    }
    if (data.price <= 0) {
        showToast('Harga harus lebih dari 0!', 'error');
        return;
    }

    try {
        if (imageFile) {
            const compressedImage = await compressImageFile(imageFile);
            const uploadResult = await uploadProductImage(compressedImage);
            data.image_url = uploadResult.image_url;
            $('#input-product-image').value = uploadResult.image_url;
        }

        if (id) {
            await API.put(`/api/products/${id}`, data);
            showToast('Produk berhasil diperbarui ✓', 'success');
        } else {
            await API.post('/api/products', data);
            showToast('Produk berhasil ditambahkan ✓', 'success');
        }

        closeModal('modal-product');
        state.selectedImageFile = null;
        cleanupPreviewObjectUrl();
        await loadProducts();
        await loadCategories();
        if (state.activeTab === 'products') renderProductTable();

    } catch (e) {
        showToast('Gagal menyimpan: ' + e.message, 'error');
    }
}

async function uploadProductImage(file) {
    const formData = new FormData();
    formData.append('file', file);
    return API.postForm('/api/products/upload-image', formData);
}

async function deleteProduct(id, name) {
    if (!confirm(`Hapus produk "${name}"? Aksi ini tidak bisa dibatalkan.`)) return;

    try {
        await API.del(`/api/products/${id}`);
        showToast(`${name} berhasil dihapus`, 'success');
        await loadProducts();
        await loadCategories();
        if (state.activeTab === 'products') renderProductTable();
    } catch (e) {
        showToast('Gagal menghapus: ' + e.message, 'error');
    }
}

// ==================== REPORTS ====================

async function loadReports() {
    await Promise.all([
        loadSummary(),
        loadDailyChart(),
        loadTransactionHistory()
    ]);
}

async function loadSummary(dateFrom, dateTo) {
    try {
        let url = '/api/reports/summary';
        const params = new URLSearchParams();
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);
        if (params.toString()) url += '?' + params.toString();

        const data = await API.get(url);
        $('#summary-revenue').textContent = formatRupiah(data.total_revenue);
        $('#summary-transactions').textContent = data.total_transactions;
        $('#summary-items').textContent = data.total_items_sold;
        $('#summary-avg').textContent = formatRupiah(data.average_transaction);
    } catch (e) {
        console.error('Summary load error:', e);
    }
}

async function loadDailyChart() {
    try {
        const data = await API.get('/api/reports/daily?days=7');
        const container = $('#daily-chart');
        
        if (!data || data.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted); text-align:center; width:100%;">Belum ada data</p>';
            return;
        }

        const maxRevenue = Math.max(...data.map(d => d.revenue), 1);
        const dayNames = { Monday: 'Sen', Tuesday: 'Sel', Wednesday: 'Rab', Thursday: 'Kam', Friday: 'Jum', Saturday: 'Sab', Sunday: 'Min' };

        container.innerHTML = data.map(d => {
            const height = Math.max((d.revenue / maxRevenue) * 140, 4);
            const dayLabel = dayNames[d.day_name] || d.day_name.substring(0, 3);
            const revenueText = d.revenue >= 1000000
                ? `${(d.revenue / 1000000).toFixed(1)}jt`
                : d.revenue >= 1000
                    ? `${(d.revenue / 1000).toFixed(0)}rb`
                    : d.revenue > 0
                        ? formatRupiah(d.revenue)
                        : '-';

            return `
                <div class="bar-col">
                    <div class="bar-value">${revenueText}</div>
                    <div class="bar-fill" style="height: ${height}px;" title="${formatRupiah(d.revenue)} — ${d.transactions} transaksi"></div>
                    <div class="bar-label">${dayLabel}<br><span style="font-size:0.55rem">${d.date.substring(5)}</span></div>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error('Chart load error:', e);
    }
}

async function loadTransactionHistory(dateFrom, dateTo) {
    try {
        let url = '/api/transactions?limit=50';
        if (dateFrom) url += `&date_from=${dateFrom}`;
        if (dateTo) url += `&date_to=${dateTo}`;

        const transactions = await API.get(url);
        const container = $('#transaction-list');

        if (transactions.length === 0) {
            container.innerHTML = '<p style="color: var(--text-muted); text-align:center; padding: 2rem;">Belum ada transaksi</p>';
            return;
        }

        container.innerHTML = transactions.map(t => {
            const date = new Date(t.timestamp);
            const dateStr = date.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' });
            const timeStr = date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
            const itemCount = t.items ? t.items.length : 0;

            return `
                <div class="tx-item">
                    <div class="tx-info">
                        <span class="tx-id" onclick="viewTransaction(${t.id})">TRX-${String(t.id).padStart(4, '0')}</span>
                        <span class="tx-time">${dateStr} ${timeStr}</span>
                        <span class="tx-items-count">${itemCount} item</span>
                        <span class="tx-items-count">Cabang: ${t.branch || 'Pusat'}</span>
                    </div>
                    <div class="tx-actions">
                        <span class="tx-total">${formatRupiah(t.total)}</span>
                        <button class="btn-icon danger" onclick="deleteTransaction(${t.id})" title="Hapus transaksi">🗑️</button>
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error('Transaction history error:', e);
    }
}

async function viewTransaction(id) {
    try {
        const tx = await API.get(`/api/transactions/${id}`);
        showReceipt(tx);
    } catch (e) {
        showToast('Gagal memuat transaksi', 'error');
    }
}

async function deleteTransaction(id) {
    if (!confirm(`Hapus transaksi TRX-${String(id).padStart(4, '0')}? Stok produk akan dikembalikan.`)) return;
    try {
        await API.del(`/api/transactions/${id}`);
        showToast('Transaksi berhasil dihapus', 'success');
        await loadProducts();
        await loadReports();
    } catch (e) {
        showToast('Gagal menghapus transaksi: ' + e.message, 'error');
    }
}

function filterReports() {
    const dateFrom = $('#report-date-from').value;
    const dateTo = $('#report-date-to').value;
    loadSummary(dateFrom, dateTo);
    loadTransactionHistory(dateFrom, dateTo);
}

async function exportExcel() {
    try {
        const dateFrom = $('#report-date-from').value;
        const dateTo = $('#report-date-to').value;
        
        let url = '/api/reports/excel';
        const params = new URLSearchParams();
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);
        if (params.toString()) url += '?' + params.toString();

        showToast('Menyiapkan file Excel...', 'info');
        
        const res = await fetch(url, { headers: API.getHeaders() });
        if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            throw new Error(err.detail || 'Download gagal');
        }

        const blob = await res.blob();
        const link = document.createElement('a');
        link.href = URL.createObjectURL(blob);
        link.download = `Laporan_Ratu_Ngemil_${new Date().toISOString().slice(0,10)}.xlsx`;
        link.click();
        URL.revokeObjectURL(link.href);

        showToast('File Excel berhasil diunduh! 📥', 'success');

    } catch (e) {
        showToast('Gagal export: ' + e.message, 'error');
    }
}

async function syncGoogleSheets() {
    try {
        const dateFrom = $('#report-date-from').value;
        const dateTo = $('#report-date-to').value;
        
        let url = '/api/sheets/sync-all';
        const params = new URLSearchParams();
        if (dateFrom) params.set('date_from', dateFrom);
        if (dateTo) params.set('date_to', dateTo);
        if (params.toString()) url += '?' + params.toString();

        showToast('Menyinkronkan ke Google Sheets...', 'info');
        
        const result = await API.post(url, {});
        showToast(result.message || 'Berhasil sync!', 'success');

    } catch (e) {
        showToast('Sync gagal: ' + e.message, 'error');
    }
}

// ==================== SETTINGS ====================

function loadStoreConfig() {
    const saved = localStorage.getItem('ratu_ngemil_store_config');
    if (saved) {
        try {
            Object.assign(state.storeConfig, JSON.parse(saved));
        } catch (e) {
            console.error('Config load error:', e);
        }
    }

    // Populate form
    $('#store-name').value = state.storeConfig.name || 'Ratu Ngemil';
    $('#store-address').value = state.storeConfig.address || '';
    $('#store-phone').value = state.storeConfig.phone || '';
    $('#store-branch').value = state.storeConfig.branch || 'Pusat';
    $('#tax-rate-input').value = Math.round(state.storeConfig.taxRate * 100);
}

function saveStoreConfig() {
    state.storeConfig.name = $('#store-name').value.trim() || 'Ratu Ngemil';
    state.storeConfig.address = $('#store-address').value.trim();
    state.storeConfig.phone = $('#store-phone').value.trim();
    state.storeConfig.branch = $('#store-branch').value.trim() || 'Pusat';
    state.storeConfig.taxRate = (parseInt($('#tax-rate-input').value) || 0) / 100;

    localStorage.setItem('ratu_ngemil_store_config', JSON.stringify(state.storeConfig));
    renderCart(); // Update tax display
    showToast('Pengaturan toko berhasil disimpan ✓', 'success');
}

async function loadSheetsStatus() {
    try {
        const status = await API.get('/api/sheets/status');
        const statusEl = $('#sheets-status');
        const credStatus = $('#credential-status');

        if (status.configured) {
            statusEl.innerHTML = '<span class="status-dot status-on"></span> <span>Terhubung & aktif</span>';
        } else if (status.has_credentials) {
            statusEl.innerHTML = '<span class="status-dot status-off"></span> <span>Credentials ada, belum dikonfigurasi</span>';
        } else {
            statusEl.innerHTML = '<span class="status-dot status-off"></span> <span>Belum dikonfigurasi</span>';
        }

        credStatus.textContent = status.has_credentials ? '✅ File credentials ditemukan' : '❌ File credentials belum ada';
        
        $('#spreadsheet-id').value = status.spreadsheet_id || '';
        $('#sheets-enabled').checked = status.enabled || false;

    } catch (e) {
        console.error('Sheets status error:', e);
    }
}

async function saveSheetsConfig() {
    try {
        const config = {
            spreadsheet_id: $('#spreadsheet-id').value.trim(),
            enabled: $('#sheets-enabled').checked
        };

        if (!config.spreadsheet_id) {
            showToast('Spreadsheet ID harus diisi!', 'error');
            return;
        }

        await API.post('/api/sheets/config', config);
        showToast('Konfigurasi Google Sheets berhasil disimpan ✓', 'success');
        await loadSheetsStatus();

    } catch (e) {
        showToast('Gagal menyimpan: ' + e.message, 'error');
    }
}

// ==================== EVENT LISTENERS ====================

function initEventListeners() {
    // Tab Navigation
    $$('.nav-btn').forEach(btn => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    // POS Search
    $('#pos-search').addEventListener('input', renderProductGrid);

    // Product Search (management)
    $('#product-search')?.addEventListener('input', renderProductTable);

    // Cart
    $('#btn-clear-cart').addEventListener('click', clearCart);
    $('#btn-pay').addEventListener('click', openPayment);

    // Payment
    $('#input-payment').addEventListener('input', handlePaymentInput);
    $('#btn-confirm-pay').addEventListener('click', confirmPayment);
    setupQuickPayButtons();

    // Receipt
    $('#btn-print-receipt').addEventListener('click', printReceipt);
    $('#btn-new-transaction').addEventListener('click', () => {
        closeModal('modal-receipt');
    });

    // Product CRUD
    $('#btn-add-product').addEventListener('click', openAddProduct);
    $('#btn-save-product').addEventListener('click', saveProduct);
    $('#input-product-image').addEventListener('input', (e) => {
        if (!state.selectedImageFile) {
            setProductPreview(e.target.value.trim() || '/static/assets/logo.png');
        }
    });
    $('#input-product-image-file').addEventListener('change', () => {
        const file = $('#input-product-image-file').files[0];
        setSelectedImageFile(file);
    });

    const dropzone = $('#image-dropzone');
    ['dragenter', 'dragover'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.add('drag-over');
        });
    });
    ['dragleave', 'drop'].forEach((eventName) => {
        dropzone.addEventListener(eventName, (e) => {
            e.preventDefault();
            e.stopPropagation();
            dropzone.classList.remove('drag-over');
        });
    });
    dropzone.addEventListener('drop', (e) => {
        const file = e.dataTransfer?.files?.[0];
        if (!file) return;
        const input = $('#input-product-image-file');
        const dt = new DataTransfer();
        dt.items.add(file);
        input.files = dt.files;
        setSelectedImageFile(file);
    });

    // Reports
    $('#btn-filter-reports').addEventListener('click', filterReports);
    $('#btn-export-excel').addEventListener('click', exportExcel);
    $('#btn-sync-sheets').addEventListener('click', syncGoogleSheets);

    // Settings
    $('#btn-save-store').addEventListener('click', saveStoreConfig);
    $('#btn-save-sheets').addEventListener('click', saveSheetsConfig);
    $('#btn-login').addEventListener('click', handleLogin);
    $('#btn-logout').addEventListener('click', handleLogout);
    $('#login-password').addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleLogin();
    });

    // Modal close buttons
    $$('[data-close]').forEach(btn => {
        btn.addEventListener('click', () => closeModal(btn.dataset.close));
    });

    // Close modal on overlay click
    $$('.modal-overlay').forEach(overlay => {
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) overlay.classList.remove('active');
        });
    });

    // Mobile: toggle cart expansion
    if (window.innerWidth <= 768) {
        $('.cart-header')?.addEventListener('click', () => {
            $('.pos-cart')?.classList.toggle('expanded');
        });
    }

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
        // ESC to close modals
        if (e.key === 'Escape') {
            $$('.modal-overlay.active').forEach(m => m.classList.remove('active'));
        }
        // F2 to open payment
        if (e.key === 'F2' && state.cart.length > 0) {
            e.preventDefault();
            openPayment();
        }
    });

    // Set default date filters to today
    const today = new Date().toISOString().split('T')[0];
    $('#report-date-from').value = today;
    $('#report-date-to').value = today;
}

// ==================== INIT ====================

async function init() {
    console.log('🧾 Ratu Ngemil POS System initializing...');
    
    loadStoreConfig();
    initEventListeners();
    setupConnectivityListeners();
    
    // Start clock
    updateClock();
    setInterval(updateClock, 1000);

    if (!state.authToken) {
        showLogin();
        return;
    }

    // Load data
    await Promise.all([
        loadProducts(),
        loadCategories()
    ]);

    renderCart();
    
    console.log('✅ POS System ready!');
}

// Start when DOM is ready
document.addEventListener('DOMContentLoaded', init);

function showLogin() {
    $('#login-overlay').classList.add('active');
    $('#login-username').focus();
}

function hideLogin() {
    $('#login-overlay').classList.remove('active');
}

async function handleLogin() {
    const username = $('#login-username').value.trim();
    const password = $('#login-password').value;
    if (!username || !password) {
        showToast('Username dan password wajib diisi', 'error');
        return;
    }

    try {
        const result = await API.post('/api/auth/login', { username, password });
        state.authToken = result.token;
        state.username = result.username;
        localStorage.setItem('ratu_ngemil_token', state.authToken);
        localStorage.setItem('ratu_ngemil_user', state.username);
        hideLogin();
        await Promise.all([loadProducts(), loadCategories()]);
        renderCart();
        showToast(`Login berhasil. Halo ${state.username}!`, 'success');
    } catch (e) {
        showToast(e.message, 'error');
    }
}

function handleLogout() {
    state.authToken = '';
    state.username = '';
    localStorage.removeItem('ratu_ngemil_token');
    localStorage.removeItem('ratu_ngemil_user');
    showLogin();
}

function setupConnectivityListeners() {
    window.addEventListener('offline', () => {
        showToast('Koneksi internet terputus. Mode cache lokal aktif.', 'info');
    });
    window.addEventListener('online', () => {
        showToast('Koneksi kembali normal', 'success');
    });
}

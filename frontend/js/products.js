let productsList = [];

document.addEventListener('DOMContentLoaded', async () => {
    loadProducts();

    document.getElementById('addProductForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const product = {
            product_name: document.getElementById('pName').value,
            sku_code: document.getElementById('pSku').value,
            category: document.getElementById('pCategory').value,
            purchase_price: parseFloat(document.getElementById('pBuy').value),
            selling_price: parseFloat(document.getElementById('pSell').value),
            low_stock_limit: parseInt(document.getElementById('pLimit').value),
            is_serialized: document.getElementById('pIsSerialized').checked,
            is_batch_tracked: document.getElementById('pIsBatchTracked').checked
        };

        try {
            await api.inventory.addProduct(product);
            const modal = bootstrap.Modal.getInstance(document.getElementById('addProductModal'));
            modal.hide();
            utils.showToast('Product added successfully');
            loadProducts();
            e.target.reset();
        } catch (err) {
            utils.showToast(err.message, 'error');
        }
    });

    document.getElementById('productSearch').addEventListener('input', (e) => {
        renderProducts(e.target.value);
    });

    document.getElementById('categoryFilter').addEventListener('change', (e) => {
        renderProducts(document.getElementById('productSearch').value, e.target.value);
    });

    document.getElementById('editProductForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const id = document.getElementById('editPid').value;
        const product = {
            product_name: document.getElementById('editPName').value,
            category: document.getElementById('editPCategory').value,
            purchase_price: parseFloat(document.getElementById('editPBuy').value),
            selling_price: parseFloat(document.getElementById('editPSell').value),
            low_stock_limit: parseInt(document.getElementById('editPLimit').value)
        };

        try {
            await api.inventory.updateProduct(id, product);
            const modal = bootstrap.Modal.getInstance(document.getElementById('editProductModal'));
            modal.hide();
            utils.showToast('Product updated successfully');
            loadProducts();
        } catch (err) {
            utils.showToast(err.message, 'error');
        }
    });

    setupBarcodeScanner();
});

async function loadProducts() {
    const tableBody = document.getElementById('productsTable');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted small">Loading products...</td></tr>';

    try {
        productsList = await api.inventory.getProducts();
        populateCategories(productsList);
        renderProducts();
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">${err.message}</td></tr>`;
    }
}

function populateCategories(products) {
    const filter = document.getElementById('categoryFilter');
    if (!filter) return;

    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    filter.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(c => {
        filter.innerHTML += `<option value="${c}">${c}</option>`;
    });
}

function renderProducts(search = '', category = '') {
    const tableBody = document.getElementById('productsTable');
    if (!tableBody) return;

    tableBody.innerHTML = '';

    const filtered = productsList.filter(p => {
        const matchesSearch = p.product_name.toLowerCase().includes(search.toLowerCase()) ||
            p.sku_code.toLowerCase().includes(search.toLowerCase());
        const matchesCategory = !category || p.category === category;
        return matchesSearch && matchesCategory;
    });

    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted">No products found.</td></tr>';
        return;
    }

    filtered.forEach(p => {
        const isLow = p.current_stock <= p.low_stock_limit;
        const status = isLow ?
            '<span class="badge bg-danger-subtle text-danger">Low Stock</span>' :
            '<span class="badge bg-success-subtle text-success">In Stock</span>';

        const row = document.createElement('tr');
        row.innerHTML = `
            <td class="fw-medium">${p.product_name}</td>
            <td><code class="text-secondary">${p.sku_code}</code></td>
            <td class="small text-muted">${p.category || '-'}</td>
            <td class="small">₹${p.purchase_price}</td>
            <td class="small">₹${p.selling_price}</td>
            <td class="fw-bold ${isLow ? 'text-danger' : ''}">${p.current_stock}</td>
            <td>${status}</td>

            <td>
                <div class="dropdown">
                    <button class="btn btn-sm btn-action-menu" data-bs-toggle="dropdown" data-bs-boundary="viewport">
                        <i class="fas fa-ellipsis-v"></i>
                    </button>
                    <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                        <li><a class="dropdown-item" href="#" onclick="openEditModal(${p.id})">
                            <i class="fas fa-pencil-alt text-primary"></i> Edit</a></li>
                        <li><a class="dropdown-item" href="#" onclick="generateQRCode(${p.id})">
                            <i class="fas fa-qrcode text-info"></i> QR Code</a></li>
                        <li><a class="dropdown-item" href="#" onclick="copyToClipboard('${p.sku_code}')">
                            <i class="fas fa-copy text-warning"></i> Copy SKU</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item" href="#" onclick="exportSingleProduct(${p.id})">
                            <i class="fas fa-file-export text-success"></i> Export</a></li>
                        <li><hr class="dropdown-divider"></li>
                        <li><a class="dropdown-item text-danger" href="#" onclick="deleteProduct(${p.id})">
                            <i class="fas fa-trash-alt"></i> Delete</a></li>
                    </ul>
                </div>
            </td>
        `;
        tableBody.appendChild(row);
    });
}

function openEditModal(id) {
    const p = productsList.find(item => item.id === id);
    if (!p) return;

    // Reset locks first
    const skuInput = document.getElementById('editPSku');
    const buyInput = document.getElementById('editPBuy');
    const sellInput = document.getElementById('editPSell');

    skuInput.readOnly = true;
    skuInput.classList.add('bg-light');
    skuInput.title = "SKU cannot be edited after creation";

    if (p.has_transactions) {
        buyInput.readOnly = true;
        buyInput.classList.add('bg-light');
        buyInput.title = "Price locked because transactions exist for this product";

        sellInput.readOnly = true;
        sellInput.classList.add('bg-light');
        sellInput.title = "Price locked because transactions exist for this product";

        // Add visual lock icons if they don't exist
        addLockIcon(buyInput);
        addLockIcon(sellInput);
    } else {
        buyInput.readOnly = false;
        buyInput.classList.remove('bg-light');
        buyInput.title = "";

        sellInput.readOnly = false;
        sellInput.classList.remove('bg-light');
        sellInput.title = "";

        removeLockIcon(buyInput);
        removeLockIcon(sellInput);
    }

    document.getElementById('editPid').value = p.id;
    document.getElementById('editPName').value = p.product_name;
    document.getElementById('editPSku').value = p.sku_code;
    document.getElementById('editPCategory').value = p.category || '';
    document.getElementById('editPBuy').value = p.purchase_price;
    document.getElementById('editPSell').value = p.selling_price;
    document.getElementById('editPLimit').value = p.low_stock_limit;

    const modal = new bootstrap.Modal(document.getElementById('editProductModal'));
    modal.show();

    // Load images for this product
    loadProductImages(p.id);
}

function addLockIcon(el) {
    const parent = el.closest('.input-group') || el.parentElement;
    if (!parent.querySelector('.fa-lock')) {
        const icon = document.createElement('i');
        icon.className = 'fas fa-lock position-absolute text-muted';
        icon.style.right = '10px';
        icon.style.top = '12px';
        icon.style.zIndex = '10';
        parent.style.position = 'relative';
        parent.appendChild(icon);
    }
}

function removeLockIcon(el) {
    const parent = el.closest('.input-group') || el.parentElement;
    const icon = parent.querySelector('.fa-lock');
    if (icon) icon.remove();
}

function deleteProduct(id) {
    utils.confirmModal('Delete Product', 'Are you sure you want to delete this product? This will archive the product.', async () => {
        try {
            await api.inventory.updateProduct(id, { is_active: 0 });
            utils.showToast('Product deleted successfully');
            loadProducts();
        } catch (err) {
            utils.showToast(err.message, 'error');
        }
    });
}

async function exportProducts() {
    try {
        utils.showToast('Preparing inventory export...');
        const blob = await api.reports.exportInventory();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `inventory_export_${new Date().toISOString().split('T')[0]}.xlsx`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        utils.showToast('Inventory exported successfully!');
    } catch (err) {
        utils.showToast('Export failed: ' + err.message, 'error');
    }
}

async function exportSingleProduct(id) {
    try {
        utils.showToast('Generating single product report...');
        const products = await api.inventory.getProducts();
        const product = products.find(p => p.id === id);
        if (!product) throw new Error('Product not found');

        const headers = ['ID', 'Product Name', 'SKU', 'Category', 'Purchase Price', 'Selling Price', 'Current Stock', 'Low Stock Limit'];
        const row = [
            product.id,
            product.product_name,
            product.sku_code,
            product.category || '-',
            product.purchase_price,
            product.selling_price,
            product.current_stock,
            product.low_stock_limit
        ];
        const csvContent = [headers.join(','), row.join(',')].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `product_${product.sku_code}_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);
        utils.showToast(`Product "${product.product_name}" exported!`);
    } catch (err) {
        utils.showToast('Export failed: ' + err.message, 'error');
    }
}

/* =====================================================
   PRODUCT MEDIA (IMAGES)
   ===================================================== */

async function loadProductImages(productId) {
    const container = document.getElementById('imageContainer');
    if (!container) return;

    container.innerHTML = '<div class="spinner-border spinner-border-sm text-primary"></div>';

    try {
        const images = await api.inventory.getProductImages(productId);
        container.innerHTML = '';

        if (images.length === 0) {
            container.innerHTML = '<small class="text-muted italic">No images uploaded for this product.</small>';
            return;
        }

        images.forEach(img => {
            const div = document.createElement('div');
            div.className = 'position-relative m-1 shadow-sm rounded overflow-hidden';
            div.style.width = '80px';
            div.style.height = '80px';

            // Note: Use BASE_URL from api.js to support tunnels/production
            const url = `${api.BASE_URL}/${img.file_path}`;

            div.innerHTML = `
                <img src="${url}" 
                     class="w-100 h-100 object-fit-cover pointer" 
                     alt="Product Media"
                     onclick="previewImage('${url}')"
                     onerror="this.src='data:image/svg+xml;charset=UTF-8,%3Csvg%20width%3D%2280%22%20height%3D%2280%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20viewBox%3D%220%200%2080%2080%22%20preserveAspectRatio%3D%22none%22%3E%3Cdefs%3E%3Cstyle%20type%3D%22text%2Fcss%22%3E%23holder_180%20text%20%7B%20fill%3Argba(255%2C255%2C255%2C.75)%3Bfont-weight%3Anormal%3Bfont-family%3AHelvetica%2C%20monospace%3Bfont-size%3A10pt%20%7D%20%3C%2Fstyle%3E%3C%2Fdefs%3E%3Cg%20id%3D%22holder_180%22%3E%3Crect%20width%3D%2280%22%20height%3D%2280%22%20fill%3D%22%23777%22%3E%3C%2Frect%3E%3Cg%3E%3Ctext%20x%3D%2212%22%20y%3D%2245%22%3ENo%20Image%3C%2Ftext%3E%3C%2Fg%3E%3C%2Fg%3E%3C%2Fsvg%3E'">
                ${img.is_primary ? '<span class="position-absolute top-0 end-0 badge bg-primary" style="scale: 0.7;">P</span>' : ''}
            `;
            container.appendChild(div);
        });
    } catch (err) {
        container.innerHTML = `<small class="text-danger">Error: ${err.message}</small>`;
    }
}

async function uploadImage() {
    const productId = document.getElementById('editPid').value;
    const fileInput = document.getElementById('imageInput');
    const file = fileInput.files[0];

    if (!file) return utils.showToast('Please select an image file first', 'warning');

    const formData = new FormData();
    formData.append('file', file);

    try {
        await api.inventory.uploadProductImage(productId, formData);
        utils.showToast('Image uploaded successfully!');
        fileInput.value = '';
        await loadProductImages(productId);
    } catch (err) {
        utils.showToast('Upload failed: ' + err.message, 'error');
    }
}

function previewImage(url) {
    const old = document.getElementById('previewModal');
    if (old) bootstrap.Modal.getInstance(old)?.dispose();
    if (old) old.remove();

    const html = `
        <div class="modal fade" id="previewModal" tabindex="-1">
            <div class="modal-dialog modal-lg modal-dialog-centered">
                <div class="modal-content border-0 shadow-lg bg-dark">
                    <div class="modal-header border-0 pb-0">
                        <button type="button" class="btn-close btn-close-white" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body p-4 text-center">
                        <img src="${url}" class="img-fluid rounded shadow" style="max-height: 80vh;">
                    </div>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);

    const modal = new bootstrap.Modal(document.getElementById('previewModal'));
    modal.show();
}

// FIX 7: QR Code Generation
async function generateQRCode(productId) {
    try {
        const product = productsList.find(p => p.id === productId);
        if (!product) return;

        const blob = await api.reports.downloadQRCode(productId);
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `qrcode_${product.sku_code}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        utils.showToast(`QR code for ${product.product_name} downloaded!`);
    } catch (err) {
        utils.showToast('Error: ' + err.message, 'error');
    }
}

// FIX 7: Barcode Scanner
function setupBarcodeScanner() {
    const scannerInput = document.getElementById('barcodeScanner');
    if (!scannerInput) return;

    scannerInput.addEventListener('change', async (e) => {
        const barcode = e.target.value.trim();
        if (!barcode) return;

        try {
            const product = await api.inventory.scanProduct(barcode);
            showScannedProduct(product);
            scannerInput.value = '';
        } catch (err) {
            utils.showToast('Product not found by barcode', 'error');
            scannerInput.value = '';
        }
    });
}

function showScannedProduct(product) {
    let modalHtml = `
        <div class="modal fade" id="scannedProductModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content border-0 shadow-lg">
                    <div class="modal-header border-0 bg-success-subtle">
                        <h5 class="fw-bold">Product Found!</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <div class="row mb-3">
                            <div class="col-6">
                                <small class="text-muted">Product Name</small><br>
                                <strong>${product.product_name}</strong>
                            </div>
                            <div class="col-6">
                                <small class="text-muted">SKU</small><br>
                                <code>${product.sku_code}</code>
                            </div>
                        </div>
                        <div class="row mb-3">
                            <div class="col-6">
                                <small class="text-muted">Current Stock</small><br>
                                <h5 class="text-primary">${product.current_stock}</h5>
                            </div>
                            <div class="col-6">
                                <small class="text-muted">Selling Price</small><br>
                                <h5 class="text-success">₹${product.selling_price}</h5>
                            </div>
                        </div>
                        ${product.category ? `
                            <div class="mb-3">
                                <small class="text-muted">Category</small><br>
                                <span class="badge bg-light text-dark">${product.category}</span>
                            </div>
                        ` : ''}
                        <div class="alert alert-success" role="alert">
                            <i class="fas fa-check-circle me-2"></i>
                            Product scanned successfully
                        </div>
                    </div>
                    <div class="modal-footer">
                        <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                        <button type="button" class="btn btn-primary" data-bs-dismiss="modal" 
                                onclick="openEditModal(${product.id})">Edit</button>
                    </div>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div.firstElementChild);

    const modal = new bootstrap.Modal(document.getElementById('scannedProductModal'));
    modal.show();
}

function copyToClipboard(text) {
    navigator.clipboard.writeText(text).then(() => {
        utils.showToast('Copied to clipboard!');
    });
}
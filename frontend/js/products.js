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
            low_stock_limit: parseInt(document.getElementById('pLimit').value)
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
});

let productsList = [];

async function loadProducts() {
    const tableBody = document.getElementById('productsTable');
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
    const categories = [...new Set(products.map(p => p.category).filter(Boolean))];
    filter.innerHTML = '<option value="">All Categories</option>';
    categories.forEach(c => {
        filter.innerHTML += `<option value="${c}">${c}</option>`;
    });
}

function renderProducts(search = '', category = '') {
    const tableBody = document.getElementById('productsTable');
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

        const row = `
            <tr>
                <td class="fw-medium">${p.product_name}</td>
                <td><code class="text-secondary">${p.sku_code}</code></td>
                <td class="small text-muted">${p.category || '-'}</td>
                <td class="small">₹${p.purchase_price}</td>
                <td class="small">₹${p.selling_price}</td>
                <td class="fw-bold ${isLow ? 'text-danger' : ''}">${p.current_stock}</td>
                <td>${status}</td>
                <td>
                    <div class="dropdown">
                        <button class="btn btn-action-menu" data-bs-toggle="dropdown">
                            <i class="fas fa-ellipsis-v"></i>
                        </button>
                        <ul class="dropdown-menu dropdown-menu-end shadow-sm border-0">
                            <li><a class="dropdown-item" href="#" onclick="openEditModal(${p.id})"><i class="fas fa-pencil-alt text-primary"></i> Edit</a></li>
                            <li><a class="dropdown-item" href="#" onclick="exportSingleProduct(${p.id})"><i class="fas fa-file-export text-success"></i> Export</a></li>
                            <li><hr class="dropdown-divider"></li>
                            <li><a class="dropdown-item text-danger" href="#" onclick="deleteProduct(${p.id})"><i class="fas fa-trash-alt"></i> Delete</a></li>
                        </ul>
                    </div>
                </td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });
}
function openEditModal(id) {
    const p = productsList.find(item => item.id === id);
    if (!p) return;

    document.getElementById('editPid').value = p.id;
    document.getElementById('editPName').value = p.product_name;
    document.getElementById('editPSku').value = p.sku_code;
    document.getElementById('editPCategory').value = p.category || '';
    document.getElementById('editPBuy').value = p.purchase_price;
    document.getElementById('editPSell').value = p.selling_price;
    document.getElementById('editPLimit').value = p.low_stock_limit;

    const modal = new bootstrap.Modal(document.getElementById('editProductModal'));
    modal.show();
}
function deleteProduct(id) {
    utils.confirmModal('Delete Product', 'Are you sure you want to delete this product? This will archived the product.', async () => {
        try {
            await api.inventory.updateProduct(id, { is_active: 0 });
            utils.showToast('Product deleted successfully');
            loadProducts();
        } catch (err) {
            utils.showToast(err.message, 'error');
        }
    });
}

function exportProducts() {
    utils.showToast('Exporting all products...');
    window.open(`${api.API_URL}/reports/export/inventory?token=${localStorage.getItem('token')}`, '_blank');
}

function exportSingleProduct(id) {
    utils.showToast('Generating product data...');
    // Real implementation could be a specific route
}

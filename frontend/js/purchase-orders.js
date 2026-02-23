let productsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    loadProducts();
    loadSuppliers();
    loadPurchaseOrders();

    document.getElementById('poForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorDiv = document.getElementById('poError');
        errorDiv.classList.add('d-none');

        const items = [];
        document.querySelectorAll('.po-item-row').forEach(row => {
            items.push({
                product_id: parseInt(row.querySelector('.po-product').value),
                quantity: parseInt(row.querySelector('.po-qty').value),
                unit_price: parseFloat(row.querySelector('.po-price').value)
            });
        });

        const poData = {
            po_number: document.getElementById('poNumber').value,
            supplier_name: document.getElementById('poSupplier').value,
            expected_delivery_date: document.getElementById('poDeliveryDate').value || null,
            notes: document.getElementById('poNotes').value || '',
            items: items
        };

        try {
            await api.inventory.createPurchaseOrder(poData);
            utils.showToast('Purchase Order created successfully');
            bootstrap.Modal.getInstance(document.getElementById('poModal')).hide();
            loadPurchaseOrders();
            e.target.reset();
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.classList.remove('d-none');
        }
    });
});

async function loadProducts() {
    productsCache = await api.inventory.getProducts();
    renderPORows();
}

async function loadSuppliers() {
    try {
        const clients = await api.inventory.getClients();
        const list = document.getElementById('supplierList');
        if (list) {
            list.innerHTML = '';
            clients.forEach(c => {
                const opt = document.createElement('option');
                opt.value = c.company_name;
                list.appendChild(opt);
            });
        }
    } catch (err) {
        console.warn('Suppliers load failed:', err);
    }
}

function renderPORows() {
    const selects = document.querySelectorAll('.po-product');
    selects.forEach(select => {
        if (select.innerHTML === "") {
            select.innerHTML = '<option value="">Select Product...</option>';
            productsCache.forEach(p => {
                select.innerHTML += `<option value="${p.id}">${p.product_name} (${p.sku_code})</option>`;
            });
            // Add change listener to auto-fill price
            select.addEventListener('change', (e) => handleProductChange(e.target));
        }
    });
}

function handleProductChange(select) {
    const row = select.closest('.po-item-row');
    const productId = parseInt(select.value);
    const product = productsCache.find(p => p.id === productId);

    if (product) {
        const priceInput = row.querySelector('.po-price');
        // Users can override, but we pre-fill with purchase price
        priceInput.value = product.purchase_price || 0;
    }
}

function addPORow() {
    const container = document.getElementById('poItemsContainer');
    const row = document.createElement('div');
    row.className = 'row g-2 mb-2 po-item-row';
    row.innerHTML = `
        <div class="col-md-6">
            <select class="form-select po-product" required></select>
        </div>
        <div class="col-md-2">
            <input type="number" class="form-control po-qty" placeholder="Qty" required min="1">
        </div>
        <div class="col-md-3">
            <input type="number" class="form-control po-price" placeholder="Price" step="0.01" required>
        </div>
        <div class="col-md-1">
            <button type="button" class="btn btn-outline-danger w-100" onclick="removePORow(this)"><i class="fas fa-times"></i></button>
        </div>
    `;
    container.appendChild(row);
    renderPORows();
}

function removePORow(btn) {
    const rows = document.querySelectorAll('.po-item-row');
    if (rows.length > 1) {
        btn.closest('.po-item-row').remove();
    } else {
        alert("At least one item is required.");
    }
}

async function loadPurchaseOrders() {
    const table = document.getElementById('poTable');
    table.innerHTML = '<tr><td colspan="7" class="text-center py-4 text-muted">Loading...</td></tr>';

    try {
        const pos = await api.inventory.getPurchaseOrders();
        table.innerHTML = '';
        if (pos.length === 0) {
            table.innerHTML = '<tr><td colspan="7" class="text-center py-5">No purchase orders found.</td></tr>';
            return;
        }

        pos.forEach(po => {
            const statusClass = po.status === 'RECEIVED' ? 'bg-success' : po.status === 'OPEN' ? 'bg-primary' : 'bg-secondary';
            table.innerHTML += `
                <tr>
                    <td class="fw-bold">${po.po_number}</td>
                    <td>${po.supplier_name}</td>
                    <td>${new Date(po.created_at).toLocaleDateString()}</td>
                    <td>${po.expected_delivery_date || 'N/A'}</td>
                    <td class="fw-bold">₹${po.total_amount.toLocaleString()}</td>
                    <td><span class="badge ${statusClass}">${po.status}</span></td>
                    <td>
                        ${po.status !== 'RECEIVED' ? `
                            <button class="btn btn-sm btn-success" onclick="receivePO(${po.id})">
                                <i class="fas fa-check-circle me-1"></i> Receive Stock
                            </button>
                        ` : '<span class="text-muted small">Completed</span>'}
                    </td>
                </tr>
            `;
        });
    } catch (err) {
        table.innerHTML = `<tr><td colspan="7" class="text-center text-danger">${err.message}</td></tr>`;
    }
}

async function receivePO(id) {
    if (!confirm("Are you sure you want to receive this shipment? This will update inventory stock.")) return;
    try {
        await api.inventory.receivePurchaseOrder(id);
        utils.showToast('Stock received and inventory updated!');
        loadPurchaseOrders();
    } catch (err) {
        utils.showToast(err.message, 'error');
    }
}

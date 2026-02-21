document.addEventListener('DOMContentLoaded', async () => {
    try {
        const stats = await api.inventory.getDashboard();

        // Update Stats
        document.getElementById('totalProducts').textContent = stats.total_products;
        document.getElementById('totalInventory').textContent = stats.total_inventory;
        document.getElementById('lowStockAlerts').textContent = stats.low_stock_count;
        document.getElementById('inventoryValue').textContent = `₹${stats.inventory_value.toLocaleString()}`;

        // New Sensor Stats
        document.getElementById('installedSensors').textContent = stats.installed_count || 0;
        document.getElementById('returnedSensors').textContent = stats.returned_count || 0;
        document.getElementById('damagedSensors').textContent = stats.damaged_count || 0;

        // Populate Recent Transactions
        const tableBody = document.getElementById('recentTransactionsTable');
        tableBody.innerHTML = '';

        stats.recent_transactions.forEach(t => {
            const date = new Date(t.created_at).toLocaleDateString();
            const typeClass = t.transaction_type === 'SALE' || t.transaction_type === 'SUPPLIER_RETURN' ? 'text-danger' : 'text-success';
            const statusColor = t.status === 'INSTALLED' ? 'bg-info-subtle text-info' :
                (t.status === 'DAMAGED' ? 'bg-danger-subtle text-danger' : 'bg-light text-muted');

            const row = `
                <tr>
                    <td class="small text-muted">${date}</td>
                    <td class="fw-medium">${t.product_name}</td>
                    <td class="small fw-semibold ${typeClass}">${t.transaction_type}</td>
                    <td class="fw-bold">${t.quantity}</td>
                    <td>
                        <span class="badge rounded-pill ${statusColor}">${t.status || t.transaction_type}</span>
                        ${t.issued_to_company ? `<div class="x-small text-muted">${t.issued_to_company}</div>` : ''}
                    </td>
                </tr>
            `;
            tableBody.innerHTML += row;
        });

        if (stats.total_products > 0) {
            loadProductsDropdown();
        }

    } catch (error) {
        console.error('Dashboard Load Error:', error);
    }

    // Transaction form submission
    document.getElementById('transForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorDiv = document.getElementById('transError');
        errorDiv.classList.add('d-none');

        const transaction = {
            product_id: parseInt(document.getElementById('tProduct').value),
            transaction_type: document.getElementById('tType').value,
            quantity: parseInt(document.getElementById('tQty').value),
            status: document.getElementById('tStatus').value,
            issued_to_company: document.getElementById('tCompany').value,
            issued_location: document.getElementById('tLocation').value,
            reference_number: document.getElementById('tRef').value,
            notes: document.getElementById('tNotes').value
        };

        try {
            await api.inventory.addTransaction(transaction);
            const modalEl = document.getElementById('transModal');
            const modal = bootstrap.Modal.getInstance(modalEl);
            modal.hide();
            utils.showToast('Transaction recorded successfully!');
            setTimeout(() => location.reload(), 1000);
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.classList.remove('d-none');
        }
    });
});

async function loadProductsDropdown() {
    try {
        const products = await api.inventory.getProducts();
        const select = document.getElementById('tProduct');
        if (!select) return;
        select.innerHTML = '<option value="">Select a product...</option>';
        products.forEach(p => {
            select.innerHTML += `<option value="${p.id}">${p.product_name} (${p.sku_code}) - Stock: ${p.current_stock}</option>`;
        });
    } catch (err) {
        console.error('Dropdown load error:', err);
    }
}

function setTransType(type) {
    const title = document.getElementById('modalTitle');
    const btn = document.getElementById('submitTransBtn');
    const sensorFields = document.getElementById('sensorFields');
    const tStatus = document.getElementById('tStatus');
    if (!title || !btn) return;

    document.getElementById('tType').value = type;
    title.textContent = type === 'PURCHASE' ? 'Stock In (Purchase)' : 'Stock Out (Sale)';
    btn.className = type === 'PURCHASE' ? 'btn btn-success w-100 py-2' : 'btn btn-danger w-100 py-2';

    if (type === 'SALE') {
        sensorFields.classList.remove('d-none');
        tStatus.value = 'INSTALLED';
    } else {
        sensorFields.classList.add('d-none');
        tStatus.value = 'AVAILABLE';
    }
}

document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    window.location.href = 'login.html';
});

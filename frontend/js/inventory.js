let productsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    loadTransactions();
    loadProductsDropdown();

    document.getElementById('transSearch').addEventListener('input', (e) => renderTransactions());
    document.getElementById('statusFilter').addEventListener('change', (e) => renderTransactions());
    document.getElementById('dateFilter').addEventListener('change', (e) => renderTransactions());

    document.getElementById('transForm').addEventListener('submit', async (e) => {
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
            const modal = bootstrap.Modal.getInstance(document.getElementById('transModal'));
            modal.hide();
            utils.showToast('Transaction recorded!');
            loadTransactions();
            e.target.reset();
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.classList.remove('d-none');
            utils.showToast(err.message, 'error');
        }
    });
});

let transactionsList = [];

async function loadProductsDropdown() {
    try {
        productsCache = await api.inventory.getProducts();
        const select = document.getElementById('tProduct');
        select.innerHTML = '<option value="">Select a product...</option>';
        productsCache.forEach(p => {
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

async function loadTransactions() {
    const tableBody = document.getElementById('transactionsTable');
    tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-4 text-muted">Loading transactions...</td></tr>';

    try {
        const stats = await api.inventory.getDashboard();
        transactionsList = stats.recent_transactions;
        renderTransactions();
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="8" class="text-center text-danger">${err.message}</td></tr>`;
    }
}

function renderTransactions() {
    const tableBody = document.getElementById('transactionsTable');
    const search = document.getElementById('transSearch').value.toLowerCase();
    const status = document.getElementById('statusFilter').value;
    const date = document.getElementById('dateFilter').value;

    const filtered = transactionsList.filter(t => {
        const matchesSearch = t.product_name.toLowerCase().includes(search) ||
            (t.issued_to_company || '').toLowerCase().includes(search);
        const matchesStatus = !status || t.status === status;
        const matchesDate = !date || t.created_at.startsWith(date);
        return matchesSearch && matchesStatus && matchesDate;
    });

    tableBody.innerHTML = '';
    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="8" class="text-center py-5 text-muted">No transactions found.</td></tr>';
        return;
    }

    filtered.forEach(t => {
        const dateStr = new Date(t.created_at).toLocaleString();
        const typeBadge = t.transaction_type === 'PURCHASE' || t.transaction_type === 'CUSTOMER_RETURN' ? 'text-success' : 'text-danger';
        const statusColor = t.status === 'INSTALLED' ? 'bg-info-subtle text-info' :
            (t.status === 'DAMAGED' ? 'bg-danger-subtle text-danger' : 'bg-light text-muted');

        const row = `
            <tr>
                <td class="small text-muted">${dateStr}</td>
                <td class="fw-medium">${t.product_name}</td>
                <td class="small fw-bold ${typeBadge}">${t.transaction_type}</td>
                <td class="fw-bold">${t.quantity}</td>
                <td><span class="badge rounded-pill ${statusColor}">${t.status || '-'}</span></td>
                <td class="small">${t.issued_to_company || '-'}</td>
                <td class="small">${t.issued_location || '-'}</td>
                <td class="small text-secondary x-small">${t.reference_number || '-'}</td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });
}

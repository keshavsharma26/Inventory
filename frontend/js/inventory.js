let productsCache = [];
let clientsCache = [];
let transactionsList = [];

document.addEventListener('DOMContentLoaded', async () => {
    loadTransactions();
    loadProductsDropdown();
    loadClients();

    document.getElementById('transSearch').addEventListener('input', () => renderTransactions());
    document.getElementById('statusFilter').addEventListener('change', () => renderTransactions());
    document.getElementById('typeFilter').addEventListener('change', () => renderTransactions());
    document.getElementById('dateFilter').addEventListener('change', () => renderTransactions());

    const clientFilter = document.getElementById('clientFilter');
    if (clientFilter) {
        clientFilter.addEventListener('change', () => renderTransactions());
    }

    document.getElementById('transForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorDiv = document.getElementById('transError');
        errorDiv.classList.add('d-none');

        const serialsRaw = document.getElementById('tSerials').value;
        const serial_numbers = serialsRaw ? serialsRaw.split('\n').map(s => s.trim()).filter(s => s) : null;

        const transaction = {
            product_id: parseInt(document.getElementById('tProduct').value),
            transaction_type: document.getElementById('tType').value,
            quantity: parseInt(document.getElementById('tQty').value),
            status: document.getElementById('tStatus').value,
            reference_number: document.getElementById('tRef').value || '',
            notes: document.getElementById('tNotes').value || '',
            client_id: parseInt(document.getElementById('tClientId')?.value) || null,
            batch_id: parseInt(document.getElementById('tBatchId')?.value) || null,
            serial_numbers: serial_numbers,
            source_location: document.getElementById('tSource').value || '',
            destination_location: document.getElementById('tDest').value || ''
        };

        try {
            await api.inventory.addTransaction(transaction);
            const modal = bootstrap.Modal.getInstance(document.getElementById('transModal'));
            modal.hide();
            utils.showToast('Transaction recorded!');
            await loadTransactions();
            e.target.reset();
            // Reset visibility
            document.getElementById('serialField').classList.add('d-none');
            document.getElementById('transferFields').classList.add('d-none');
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.classList.remove('d-none');
        }
    });

    // NEW: Handle Edit Transaction Form
    const editForm = document.getElementById('editTransForm');
    if (editForm) {
        editForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const errorDiv = document.getElementById('editTransError');
            errorDiv.classList.add('d-none');

            const transId = document.getElementById('editTId').value;
            const updateData = {
                quantity: parseInt(document.getElementById('editTQty').value),
                status: document.getElementById('editTStatus').value,
                issued_to_company: document.getElementById('editTCompany').value || '',
                issued_location: document.getElementById('editTLocation').value || '',
                edit_reason: document.getElementById('editTReason').value
            };

            try {
                await api.inventory.editTransaction(transId, updateData);
                const modal = bootstrap.Modal.getInstance(document.getElementById('editTransModal'));
                modal.hide();
                utils.showToast('Transaction updated successfully');
                await loadTransactions();
            } catch (err) {
                errorDiv.textContent = err.message;
                errorDiv.classList.remove('d-none');
            }
        });
    }
});

async function loadClients() {
    try {
        clientsCache = await api.inventory.getClients();

        const clientSelect = document.getElementById('tClientId');
        if (clientSelect) {
            clientSelect.innerHTML = '<option value="">-- No Client (Generic) --</option>';
            clientsCache.forEach(c => {
                clientSelect.innerHTML += `<option value="${c.id}">${c.company_name} (${c.location || 'N/A'})</option>`;
            });
        }

        const clientFilter = document.getElementById('clientFilter');
        if (clientFilter) {
            clientFilter.innerHTML = '<option value="">All Clients</option>';
            clientsCache.forEach(c => {
                clientFilter.innerHTML += `<option value="${c.id}">${c.company_name}</option>`;
            });
        }
    } catch (err) {
        console.error('Failed to load clients:', err);
    }
}

async function loadProductsDropdown() {
    try {
        productsCache = await api.inventory.getProducts();
        const select = document.getElementById('tProduct');
        select.innerHTML = '<option value="">Select a product...</option>';
        productsCache.forEach(p => {
            select.innerHTML += `<option value="${p.id}">${p.product_name} (${p.sku_code}) - Stock: ${p.current_stock}</option>`;
        });

        // Dynamic Field Logic
        select.addEventListener('change', async (e) => {
            const productId = parseInt(e.target.value);
            const product = productsCache.find(p => p.id === productId);
            if (!product) return;

            // Show/Hide serial field
            const serialField = document.getElementById('serialField');
            if (product.is_serialized) {
                serialField.classList.remove('d-none');
            } else {
                serialField.classList.add('d-none');
            }

            // Load Batches
            const batchSelect = document.getElementById('tBatchId');
            batchSelect.innerHTML = '<option value="">Loading batches...</option>';
            try {
                const batches = await api.inventory.getBatches(productId);
                batchSelect.innerHTML = '<option value="">-- No Batch --</option>';
                batches.forEach(b => {
                    batchSelect.innerHTML += `<option value="${b.id}">${b.batch_number} (Exp: ${b.expiry_date || 'N/A'})</option>`;
                });
            } catch (err) {
                batchSelect.innerHTML = '<option value="">Failed to load batches</option>';
            }
        });

    } catch (err) {
        console.error('Dropdown load error:', err);
    }
}

function setTransType(type) {
    const title = document.getElementById('modalTitle');
    const btn = document.getElementById('submitTransBtn');
    const transferFields = document.getElementById('transferFields');
    const tStatus = document.getElementById('tStatus');

    document.getElementById('tType').value = type;

    if (type === 'STOCK_TRANSFER') {
        title.textContent = 'Internal Stock Transfer';
        btn.innerHTML = '<i class="fas fa-truck me-2"></i> Record Transfer';
        btn.className = 'btn btn-warning w-100 py-2 text-dark fw-bold';
        transferFields.classList.remove('d-none');
        document.getElementById('tSource').value = 'Main Warehouse';
    } else {
        title.textContent = type === 'PURCHASE' ? 'Stock In (Purchase)' : 'Stock Out (Sale)';
        btn.innerHTML = 'Record Transaction';
        btn.className = type === 'PURCHASE' ? 'btn btn-success w-100 py-2' : 'btn btn-danger w-100 py-2';
        transferFields.classList.add('d-none');
    }

    tStatus.value = (type === 'PURCHASE') ? 'AVAILABLE' : 'INSTALLED';
}

async function loadTransactions() {
    const tableBody = document.getElementById('transactionsTable');
    if (!tableBody) return;

    tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-4 text-muted"><span class="spinner-border spinner-border-sm me-2"></span>Loading...</td></tr>';

    try {
        transactionsList = await api.inventory.getTransactions();
        renderTransactions();
    } catch (err) {
        tableBody.innerHTML = `<tr><td colspan="9" class="text-center text-danger">${err.message}</td></tr>`;
    }
}

function renderTransactions() {
    const tableBody = document.getElementById('transactionsTable');
    if (!tableBody) return;

    const search = document.getElementById('transSearch').value.toLowerCase();
    const status = document.getElementById('statusFilter').value;
    const type = document.getElementById('typeFilter').value;
    const date = document.getElementById('dateFilter').value;
    const clientId = document.getElementById('clientFilter')?.value;

    // FIX: Search includes SKU
    const filtered = transactionsList.filter(t => {
        const matchesSearch = (t.product_name || '').toLowerCase().includes(search) ||
            (t.sku_code || '').toLowerCase().includes(search) ||
            (t.issued_to_company || '').toLowerCase().includes(search) ||
            (t.issued_location || '').toLowerCase().includes(search);
        const matchesStatus = !status || t.status === status;
        const matchesType = !type || t.transaction_type === type;
        const matchesDate = !date || (t.created_at && t.created_at.startsWith(date));
        const matchesClient = !clientId || t.client_id === parseInt(clientId);
        return matchesSearch && matchesStatus && matchesType && matchesDate && matchesClient;
    });

    tableBody.innerHTML = '';
    if (filtered.length === 0) {
        tableBody.innerHTML = '<tr><td colspan="9" class="text-center py-5 text-muted">No transactions found.</td></tr>';
        return;
    }

    filtered.forEach(t => {
        const dateStr = t.created_at ? new Date(t.created_at).toLocaleString('en-IN') : '-';
        const isInbound = ['PURCHASE', 'CUSTOMER_RETURN'].includes(t.transaction_type);
        const typeBadgeClass = isInbound ? 'bg-success-subtle text-success' : 'bg-danger-subtle text-danger';
        const typeIcon = isInbound ? 'fa-arrow-down' : 'fa-arrow-up';

        const statusColors = {
            'INSTALLED': 'bg-info-subtle text-info',
            'DAMAGED': 'bg-danger-subtle text-danger',
            'RETURNED': 'bg-warning-subtle text-warning',
            'AVAILABLE': 'bg-success-subtle text-success'
        };
        const statusClass = statusColors[t.status] || 'bg-light text-muted';

        // 2. Row & 3. Historical Protection UI Logic
        const isLocked = t.is_locked;
        const lockReason = t.lifecycle_status === 'INSTALLED' || t.lifecycle_status === 'DAMAGED'
            ? `Protected Transaction: Status is ${t.lifecycle_status}`
            : "Historical Lock: Transaction is read-only";

        const row = `
            <tr class="${isLocked ? 'table-light text-muted' : ''}">
                <td class="small text-muted">
                    ${isLocked ? `<i class="fas fa-lock me-1 text-secondary" title="${lockReason}"></i>` : ''}
                    ${dateStr}
                </td>
                <td class="fw-medium">${t.product_name || '-'}</td>
                <td><span class="badge rounded-pill ${typeBadgeClass}"><i class="fas ${typeIcon} me-1"></i>${t.transaction_type}</span></td>
                <td class="fw-bold">${t.quantity}</td>
                <td><span class="badge rounded-pill ${statusClass}">${t.status || '-'}</span></td>
                <td class="small">${t.issued_to_company || '-'}</td>
                <td class="small">${t.issued_location || '-'}</td>
                <td class="small text-secondary">${t.reference_number || '-'}</td>
                <td>
                    <div class="btn-group btn-group-sm" role="group">
                        <button type="button" class="btn btn-outline-primary" 
                                onclick="editTransaction(${t.transaction_id})"
                                ${isLocked ? 'disabled title="' + lockReason + '"' : ''}>
                            <i class="fas fa-edit"></i>
                        </button>
                        <button type="button" class="btn btn-outline-danger" 
                                onclick="deleteTransaction(${t.transaction_id})"
                                ${isLocked ? 'disabled title="' + lockReason + '"' : ''}>
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </td>
            </tr>
        `;
        tableBody.innerHTML += row;
    });
}

// NEW: Modal-based Edit Transaction
async function editTransaction(transId) {
    const t = transactionsList.find(item => item.transaction_id === transId);
    if (!t) return;

    document.getElementById('editTId').value = t.transaction_id;
    document.getElementById('editTProductName').value = t.product_name;
    document.getElementById('editTQty').value = t.quantity;
    document.getElementById('editTStatus').value = t.status || 'AVAILABLE';
    document.getElementById('editTCompany').value = t.issued_to_company || '';
    document.getElementById('editTLocation').value = t.issued_location || '';
    document.getElementById('editTReason').value = ''; // Reset reason

    document.getElementById('editTransError').classList.add('d-none');

    const modal = new bootstrap.Modal(document.getElementById('editTransModal'));
    modal.show();
}

// FIX: Delete transaction with refresh
async function deleteTransaction(transId) {
    const reason = prompt('Reason for deletion:', 'Data correction - invalid entry');
    if (!reason) return;

    utils.confirmModal('Delete Transaction',
        'This will soft-delete the transaction (data preserved for audit). Continue?',
        async () => {
            try {
                await api.inventory.deleteTransaction(transId, reason);
                utils.showToast('Transaction deleted (soft delete - data preserved)');
                await loadTransactions();
            } catch (err) {
                utils.showToast('Error: ' + err.message, 'error');
            }
        }
    );
}

function openClientModal() {
    const modal = new bootstrap.Modal(document.getElementById('clientModal') || createClientModal());
    modal.show();
}

function createClientModal() {
    const modalHtml = `
        <div class="modal fade" id="clientModal" tabindex="-1">
            <div class="modal-dialog">
                <div class="modal-content border-0 shadow-lg" style="border-radius: 20px;">
                    <div class="modal-header border-0">
                        <h5 class="fw-bold">Add Client</h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body">
                        <form id="clientForm">
                            <div class="mb-3">
                                <label class="form-label small fw-bold">Company Name</label>
                                <input type="text" id="cCompanyName" class="form-control" required>
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">Location</label>
                                <input type="text" id="cLocation" class="form-control" placeholder="e.g. Mumbai Office">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">Contact Person</label>
                                <input type="text" id="cContact" class="form-control">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">Email</label>
                                <input type="email" id="cEmail" class="form-control">
                            </div>
                            <div class="mb-3">
                                <label class="form-label small fw-bold">Phone</label>
                                <input type="tel" id="cPhone" class="form-control">
                            </div>
                            <button type="submit" class="btn btn-primary w-100">Add Client</button>
                        </form>
                    </div>
                </div>
            </div>
        </div>
    `;

    const div = document.createElement('div');
    div.innerHTML = modalHtml;
    document.body.appendChild(div.firstElementChild);

    document.getElementById('clientForm').addEventListener('submit', async (e) => {
        e.preventDefault();

        try {
            await api.inventory.addClient({
                company_name: document.getElementById('cCompanyName').value,
                location: document.getElementById('cLocation').value,
                contact_person: document.getElementById('cContact').value,
                email: document.getElementById('cEmail').value,
                phone: document.getElementById('cPhone').value
            });

            utils.showToast('Client added successfully');
            bootstrap.Modal.getInstance(document.getElementById('clientModal')).hide();
            await loadClients();
        } catch (err) {
            utils.showToast('Error: ' + err.message, 'error');
        }
    });

    return document.getElementById('clientModal');
}

async function viewAssetTimeline(sku) {
    try {
        const timeline = await api.inventory.getAssetTimeline(sku);

        let modalHtml = `
            <div class="modal fade" id="timelineModal" tabindex="-1">
                <div class="modal-dialog modal-lg">
                    <div class="modal-content border-0 shadow-lg">
                        <div class="modal-header border-0">
                            <h5 class="fw-bold">${timeline.product_name} (${timeline.sku}) - Lifecycle Timeline</h5>
                            <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                        </div>
                        <div class="modal-body">
                            <div class="timeline">
        `;

        timeline.timeline.forEach((item, idx) => {
            const icon = item.transaction_type === 'PURCHASE' ? 'fa-inbox' :
                item.transaction_type === 'SALE' ? 'fa-arrow-right' :
                    item.transaction_type === 'CUSTOMER_RETURN' ? 'fa-undo' : 'fa-exclamation';

            modalHtml += `
                <div class="row mb-3">
                    <div class="col-1 text-center">
                        <i class="fas ${icon} text-primary"></i>
                    </div>
                    <div class="col-11">
                        <strong>${item.transaction_type}</strong><br>
                        <small class="text-muted">
                            ${new Date(item.timestamp).toLocaleString()} | Qty: ${item.quantity}
                        </small><br>
                        ${item.client_name ? `<small>Client: <strong>${item.client_name}</strong></small><br>` : ''}
                        ${item.location ? `<small>Location: <strong>${item.location}</strong></small><br>` : ''}
                        Status: <span class="badge bg-info-subtle text-info">${item.lifecycle_status}</span>
                    </div>
                </div>
            `;
        });

        modalHtml += `
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;

        const div = document.createElement('div');
        div.innerHTML = modalHtml;
        document.body.appendChild(div.firstElementChild);

        const modal = new bootstrap.Modal(document.getElementById('timelineModal'));
        modal.show();
    } catch (err) {
        utils.showToast('Error: ' + err.message, 'error');
    }
}
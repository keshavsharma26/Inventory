let productsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    loadProducts();
    loadBatches();

    document.getElementById('batchForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorDiv = document.getElementById('batchError');
        errorDiv.classList.add('d-none');

        const batchData = {
            product_id: parseInt(document.getElementById('bProduct').value),
            batch_number: document.getElementById('bNumber').value,
            mfg_date: document.getElementById('bMfg').value || null,
            expiry_date: document.getElementById('bExpiry').value || null,
            notes: document.getElementById('bNotes').value || ''
        };

        try {
            await api.inventory.addBatch(batchData);
            utils.showToast('Batch registered successfully');
            bootstrap.Modal.getInstance(document.getElementById('batchModal')).hide();
            loadBatches();
            e.target.reset();
        } catch (err) {
            errorDiv.textContent = err.message;
            errorDiv.classList.remove('d-none');
        }
    });
});

async function loadProducts() {
    try {
        productsCache = await api.inventory.getProducts();
        const select = document.getElementById('bProduct');
        select.innerHTML = '<option value="">Select a product...</option>';
        productsCache.forEach(p => {
            const trackingType = p.is_batch_tracked ? ' (Batch Tracked)' : '';
            select.innerHTML += `<option value="${p.id}">${p.product_name} (${p.sku_code})${trackingType}</option>`;
        });
    } catch (err) {
        console.error('Products load error:', err);
    }
}

async function loadBatches() {
    const table = document.getElementById('batchTable');
    table.innerHTML = '<tr><td colspan="6" class="text-center py-4 text-muted">Loading batches...</td></tr>';

    try {
        const batches = await api.inventory.getBatches();
        table.innerHTML = '';
        if (batches.length === 0) {
            table.innerHTML = '<tr><td colspan="6" class="text-center py-5">No batches registered.</td></tr>';
            return;
        }

        batches.forEach(b => {
            const product = productsCache.find(p => p.id === b.product_id);
            table.innerHTML += `
                <tr>
                    <td class="fw-bold text-primary">${b.batch_number}</td>
                    <td>${product ? product.product_name : 'Unknown Product'}</td>
                    <td>${b.mfg_date || '-'}</td>
                    <td>${b.expiry_date || '-'}</td>
                    <td class="small text-muted">${b.notes || '-'}</td>
                    <td class="small">${new Date(b.created_at).toLocaleDateString()}</td>
                </tr>
            `;
        });
    } catch (err) {
        table.innerHTML = `<tr><td colspan="6" class="text-center text-danger">${err.message}</td></tr>`;
    }
}

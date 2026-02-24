document.addEventListener('DOMContentLoaded', async () => {
    console.log('[DASHBOARD] Page loaded - DOMContentLoaded fired');
    console.log('[DASHBOARD] Current URL:', window.location.href);
    console.log('[DASHBOARD] Token exists?', !!localStorage.getItem('token'));
    console.log('[DASHBOARD] Token value (first 20 chars):', localStorage.getItem('token')?.substring(0, 20) || 'MISSING');
    console.log('Dashboard JS loaded - starting API call');
    console.log('[DASHBOARD DEBUG] Script file loaded successfully');
    try {
        console.log('Token:', localStorage.getItem('token'));
        // Load enhanced dashboard with analytics
        const stats = await api.inventory.getDashboardAnalytics();
        console.log('API response:', stats);

        // Existing Stats (backward compatible)
        document.getElementById('totalProducts').textContent = stats.total_products;
        document.getElementById('totalInventory').textContent = stats.total_inventory;
        document.getElementById('lowStockAlerts').textContent = stats.low_stock_count;
        document.getElementById('inventoryValue').textContent = `₹${stats.inventory_value.toLocaleString()}`;

        // FIX 1: Sensor Stats - Use lifecycle_status_breakdown instead of separate counts
        if (stats.lifecycle_status_breakdown && Array.isArray(stats.lifecycle_status_breakdown)) {
            let installed = 0, returned = 0, damaged = 0;
            stats.lifecycle_status_breakdown.forEach(item => {
                if (item.status === 'INSTALLED') installed = item.count;
                if (item.status === 'RETURNED') returned = item.count;
                if (item.status === 'DAMAGED') damaged = item.count;
            });
            document.getElementById('installedSensors').textContent = installed || 0;
            document.getElementById('returnedSensors').textContent = returned || 0;
            document.getElementById('damagedSensors').textContent = damaged || 0;
        } else {
            // Fallback to old method
            document.getElementById('installedSensors').textContent = stats.installed_count || 0;
            document.getElementById('returnedSensors').textContent = stats.returned_count || 0;
            document.getElementById('damagedSensors').textContent = stats.damaged_count || 0;
        }

        // FIX 6: Load Chart.js library
        loadChartLibrary().then(() => {
            // FIX 6: Phase D - Analytics Charts
            if (stats.inventory_value_trend && stats.inventory_value_trend.length > 0) {
                renderInventoryTrendChart(stats.inventory_value_trend);
            }

            if (stats.stock_movement_trend && stats.stock_movement_trend.length > 0) {
                renderStockMovementChart(stats.stock_movement_trend);
            }

            if (stats.lifecycle_status_breakdown && stats.lifecycle_status_breakdown.length > 0) {
                renderLifecyclePieChart(stats.lifecycle_status_breakdown);
            }
        });

        // FIX 8: Phase F - Load Notifications on page load
        loadNotifications();

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
                        ${t.unit_price ? `<div class="x-small fw-bold text-dark mt-1">₹${t.unit_price}</div>` : ''}
                        ${t.issued_to_company ? `<div class="x-small text-muted">${t.issued_to_company}</div>` : ''}
                    </td>
                </tr>
            `;
            tableBody.innerHTML += row;
        });

        // Always load products dropdown to ensure it is ready for quick transactions
        loadProductsDropdown();

    } catch (error) {
        console.error('Dashboard Load Error:', error);
    }

    // Transaction form submission (existing)
    document.getElementById('transForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const errorDiv = document.getElementById('transError');
        errorDiv.classList.add('d-none');

        const serialsRaw = document.getElementById('tSerials')?.value || "";
        const serial_numbers = serialsRaw ? serialsRaw.split('\n').map(s => s.trim()).filter(s => s) : null;

        const transaction = {
            product_id: parseInt(document.getElementById('tProduct').value),
            transaction_type: document.getElementById('tType').value,
            quantity: parseInt(document.getElementById('tQty').value),
            status: document.getElementById('tStatus').value,
            unit_price: parseFloat(document.getElementById('tPrice')?.value) || null,
            reference_number: document.getElementById('tRef').value || '',
            notes: document.getElementById('tNotes').value || '',
            batch_id: parseInt(document.getElementById('tBatchId')?.value) || null,
            serial_numbers: serial_numbers,
            source_location: document.getElementById('tSource')?.value || '',
            destination_location: document.getElementById('tDest')?.value || ''
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

// FIX 6: Load Chart.js library dynamically
function loadChartLibrary() {
    return new Promise((resolve) => {
        if (typeof Chart !== 'undefined') {
            resolve();
            return;
        }

        const script = document.createElement('script');
        script.src = 'https://cdnjs.cloudflare.com/ajax/libs/Chart.js/3.9.1/chart.min.js';
        script.onload = resolve;
        script.onerror = () => {
            console.warn('Chart.js failed to load, using fallback');
            resolve();
        };
        document.head.appendChild(script);
    });
}

// FIX 6: Chart Functions
function renderInventoryTrendChart(data) {
    const container = document.getElementById('inventoryTrendChart');
    if (!container) {
        return;
    }

    if (typeof Chart === 'undefined') {
        renderInventoryTrendFallback(data);
        return;
    }

    const dates = data.map(d => d.date).slice(-7);
    const values = data.map(d => d.total_value).slice(-7);

    const ctx = container.getContext ? container.getContext('2d') : null;

    if (!ctx) {
        renderInventoryTrendFallback(data);
        return;
    }

    try {
        new Chart(ctx, {
            type: 'line',
            data: {
                labels: dates,
                datasets: [{
                    label: 'Inventory Value (₹)',
                    data: values,
                    borderColor: 'rgb(75, 192, 192)',
                    backgroundColor: 'rgba(75, 192, 192, 0.1)',
                    tension: 0.1,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    } catch (e) {
        renderInventoryTrendFallback(data);
    }
}

function renderInventoryTrendFallback(data) {
    const container = document.getElementById('inventoryTrendChart');
    const dates = data.map(d => d.date).slice(-7);
    const values = data.map(d => d.total_value).slice(-7);

    let chartHtml = '<small class="text-muted">Value Trend (Last 7 days):<br>';
    for (let i = 0; i < dates.length; i++) {
        const bar = '█'.repeat(Math.ceil(values[i] / 10000));
        chartHtml += `${dates[i]}: ₹${values[i].toLocaleString()}<br>`;
    }
    chartHtml += '</small>';

    if (container) {
        container.innerHTML = chartHtml;
    }
}

function renderStockMovementChart(data) {
    const container = document.getElementById('stockMovementChart');
    if (!container) {
        return;
    }

    if (typeof Chart === 'undefined') {
        renderStockMovementFallback(data);
        return;
    }

    const dates = data.map(d => d.date).slice(-7);
    const inflows = data.map(d => d.units_in).slice(-7);
    const outflows = data.map(d => d.units_out).slice(-7);

    const ctx = container.getContext ? container.getContext('2d') : null;

    if (!ctx) {
        renderStockMovementFallback(data);
        return;
    }

    try {
        new Chart(ctx, {
            type: 'bar',
            data: {
                labels: dates,
                datasets: [
                    {
                        label: 'Stock In',
                        data: inflows,
                        backgroundColor: 'rgba(75, 192, 75, 0.7)',
                    },
                    {
                        label: 'Stock Out',
                        data: outflows,
                        backgroundColor: 'rgba(255, 99, 99, 0.7)',
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: true }
                },
                scales: {
                    y: { beginAtZero: true }
                }
            }
        });
    } catch (e) {
        renderStockMovementFallback(data);
    }
}

function renderStockMovementFallback(data) {
    const container = document.getElementById('stockMovementChart');
    const dates = data.map(d => d.date).slice(-7);
    const inflows = data.map(d => d.units_in).slice(-7);
    const outflows = data.map(d => d.units_out).slice(-7);

    let chartHtml = '<small class="text-muted">Stock In/Out (Last 7 days):<br>';
    for (let i = 0; i < dates.length; i++) {
        chartHtml += `
            ${dates[i]}: 
            <span class="text-success">IN: ${inflows[i]}</span> | 
            <span class="text-danger">OUT: ${outflows[i]}</span><br>
        `;
    }
    chartHtml += '</small>';

    if (container) {
        container.innerHTML = chartHtml;
    }
}

function renderLifecyclePieChart(data) {
    const container = document.getElementById('lifecyclePieChart');
    if (!container) {
        return;
    }

    let chartHtml = '';
    data.forEach(item => {
        const color = item.status === 'INSTALLED' ? 'text-info' :
            item.status === 'RETURNED' ? 'text-warning' :
                item.status === 'DAMAGED' ? 'text-danger' : 'text-success';
        chartHtml += `
            <div class="mb-2">
                <div class="d-flex justify-content-between">
                    <span>${item.status}</span>
                    <span class="fw-bold ${color}">${item.count} (${item.percentage}%)</span>
                </div>
                <div class="progress" style="height: 20px;">
                    <div class="progress-bar ${color}" style="width: ${item.percentage}%"></div>
                </div>
            </div>
        `;
    });

    container.innerHTML = chartHtml;
}

// FIX 8: Phase F - Notifications
async function loadNotifications() {
    try {
        const response = await fetch(`${api.API_URL}/inventory/notifications?skip=0&limit=5`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        if (response.status === 401) {
            localStorage.removeItem('token');
            window.location.href = 'login.html';
            return;
        }

        if (!response.ok) {
            console.log('Notifications not available yet');
            return;
        }

        const notifications = await response.json();

        if (notifications.length > 0) {
            displayNotificationPanel(notifications);
        }
    } catch (error) {
        console.warn('Notifications feature not yet available');
    }
}

function displayNotificationPanel(notifications) {
    // Create notification bell icon in header if doesn't exist
    const header = document.querySelector('header');
    if (!document.getElementById('notificationBell')) {
        const bellHtml = `
            <div id="notificationBell" class="position-relative me-3" style="cursor: pointer;">
                <i class="fas fa-bell text-primary" style="font-size: 1.5rem;"></i>
                <span id="notificationCount" class="badge bg-danger position-absolute top-0 start-100 translate-middle">
                    ${notifications.filter(n => !n.is_read).length}
                </span>
            </div>
        `;

        const profile = header.querySelector('.user-profile');
        if (profile) {
            profile.insertAdjacentHTML('afterbegin', bellHtml);
        }

        document.getElementById('notificationBell')?.addEventListener('click', showNotifications);
    }

    const unreadCount = notifications.filter(n => !n.is_read).length;
    const badge = document.getElementById('notificationCount');
    if (badge) {
        badge.textContent = unreadCount;
        if (unreadCount === 0) badge.classList.add('d-none');
    }
}

function showNotifications() {
    const notifPanel = document.getElementById('notificationPanel');
    if (notifPanel) {
        notifPanel.classList.toggle('d-none');
        return;
    }

    const panel = document.createElement('div');
    panel.id = 'notificationPanel';
    panel.className = 'card position-absolute shadow-lg border-0 rounded-3';
    panel.style.cssText = 'right: 20px; top: 70px; width: 350px; max-height: 400px; z-index: 1000; overflow-y: auto;';

    panel.innerHTML = `
        <div class="card-header d-flex justify-content-between align-items-center">
            <h5 class="mb-0">Notifications</h5>
            <button type="button" class="btn-close" onclick="document.getElementById('notificationPanel').remove()"></button>
        </div>
        <div id="notificationsList" class="card-body p-0">
            <div class="text-center py-4 text-muted">Loading...</div>
        </div>
    `;

    document.body.appendChild(panel);
    loadNotificationsContent();
}

async function loadNotificationsContent() {
    try {
        const response = await fetch(`${api.API_URL}/inventory/notifications?skip=0&limit=20`, {
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        });

        const notifications = await response.json();
        const list = document.getElementById('notificationsList');

        if (notifications.length === 0) {
            list.innerHTML = '<div class="text-center py-4 text-muted">No notifications</div>';
            return;
        }

        list.innerHTML = notifications.map(notif => `
            <div class="border-bottom p-3 ${notif.is_read ? 'bg-light' : 'bg-white'}">
                <div class="d-flex justify-content-between">
                    <strong>${notif.title}</strong>
                    ${notif.is_read ? '' : '<span class="badge bg-primary">New</span>'}
                </div>
                <p class="small text-muted mb-2">${notif.message || ''}</p>
                <small class="text-muted">${new Date(notif.created_at).toLocaleString()}</small>
            </div>
        `).join('');
    } catch (error) {
        console.error('Failed to load notifications:', error);
    }
}

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
    const transferFields = document.getElementById('transferFields');
    const tStatus = document.getElementById('tStatus');
    if (!title || !btn) return;

    document.getElementById('tType').value = type;

    if (type === 'STOCK_TRANSFER') {
        title.textContent = 'Internal Stock Transfer';
        btn.innerHTML = '<i class="fas fa-truck me-2"></i> Record Transfer';
        btn.className = 'btn btn-warning w-100 py-2 text-dark fw-bold';
        if (transferFields) transferFields.classList.remove('d-none');
    } else {
        title.textContent = type === 'PURCHASE' ? 'Stock In (Purchase)' : 'Stock Out (Sale)';
        btn.innerHTML = 'Record Transaction';
        btn.className = type === 'PURCHASE' ? 'btn btn-success w-100 py-2' : 'btn btn-danger w-100 py-2';
        if (transferFields) transferFields.classList.add('d-none');
    }

    tStatus.value = (type === 'PURCHASE') ? 'AVAILABLE' : 'INSTALLED';
}

document.getElementById('logoutBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    localStorage.removeItem('token');
    window.location.href = 'login.html';
});

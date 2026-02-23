/* =====================================================
   REPORTS + IMPORT + FORECAST + AUDIT MODULE
   ===================================================== */

document.addEventListener('DOMContentLoaded', () => {
    setupReportDownloads();
    setupBulkImport();
    setupForecasting();
    setupAuditLog();
});

/* =====================================================
   AUDIT LOG
   ===================================================== */

function setupAuditLog() {
    const auditBtn = document.getElementById('viewAuditLog');
    if (auditBtn) auditBtn.addEventListener('click', showAuditLogModal);
}

let auditLogsCache = [];

async function showAuditLogModal() {

    const div = document.createElement('div');
    div.innerHTML = `
    <div class="modal fade" id="auditLogModal" tabindex="-1">
        <div class="modal-dialog modal-lg">
            <div class="modal-content border-0 shadow-lg">
                <div class="modal-header border-0">
                    <h5 class="fw-bold">Audit Log - Change History</h5>
                    <button class="btn-close" data-bs-dismiss="modal"></button>
                </div>
                <div class="modal-body">
                    <input id="auditSearch" class="form-control mb-3"
                        placeholder="Search user, entity, action...">
                    <div id="auditLogList" style="max-height:500px;overflow-y:auto">
                        <div class="text-center text-muted py-4">Loading...</div>
                    </div>
                </div>
            </div>
        </div>
    </div>`;

    document.body.appendChild(div.firstElementChild);

    new bootstrap.Modal(document.getElementById('auditLogModal')).show();

    await loadAuditLogs();
    document.getElementById('auditSearch')
        .addEventListener('input', filterAuditLogs);
}

async function loadAuditLogs() {
    const list = document.getElementById('auditLogList');
    list.innerHTML = '<div class="text-center text-muted py-4"><i class="fas fa-spinner fa-spin me-2"></i>Loading...</div>';

    try {
        const data = await api.inventory.getActivityFeed();
        // The API returns { items: [...], total_count: ... }
        auditLogsCache = Array.isArray(data.items) ? data.items : [];
        displayAuditLogs(auditLogsCache);
    } catch (err) {
        console.error('Audit load error:', err);
        list.innerHTML = `<p class="text-danger">Failed to load audit logs: ${err.message}</p>`;
    }
}

function displayAuditLogs(logs) {
    const list = document.getElementById('auditLogList');

    if (!Array.isArray(logs) || !logs.length) {
        list.innerHTML = `<div class="text-center text-muted py-4">No logs found</div>`;
        return;
    }

    list.innerHTML = logs.map(log => {
        const date = new Date(log.timestamp).toLocaleString('en-IN');

        const badge =
            log.action_type === 'CREATE' ? 'bg-success' :
                log.action_type === 'UPDATE' ? 'bg-warning' :
                    log.action_type === 'DELETE' ? 'bg-danger' : 'bg-info';

        return `
        <div class="card mb-2 border-0 shadow-sm">
            <div class="card-body py-3">
                <div class="d-flex justify-content-between align-items-center mb-1">
                    <span class="badge ${badge}">${log.action_type}</span>
                    <small class="text-muted">${date}</small>
                </div>
                <strong>${log.entity_type}</strong> (ID:${log.entity_id})
                <div class="small text-secondary mt-1">User: ${log.user_name || 'System'}</div>
                ${log.reason ? `<div class="small text-muted mt-1 italic">"${log.reason}"</div>` : ''}
            </div>
        </div>`;
    }).join('');
}

function filterAuditLogs() {
    const search = document.getElementById('auditSearch').value.toLowerCase();

    const filtered = auditLogsCache.filter(l =>
        (l.action_type || '').toLowerCase().includes(search) ||
        (l.entity_type || '').toLowerCase().includes(search) ||
        (l.user_name || '').toLowerCase().includes(search) ||
        (l.reason || '').toLowerCase().includes(search)
    );
    displayAuditLogs(filtered);
}

/* =====================================================
   REPORT DOWNLOADS
   ===================================================== */

function setupReportDownloads() {
    document.getElementById('downloadInstallation')
        ?.addEventListener('click', () => downloadReport('installation'));

    document.getElementById('downloadDamage')
        ?.addEventListener('click', () => downloadReport('damage'));

    document.getElementById('downloadCombined')
        ?.addEventListener('click', () => downloadReport('combined'));

    document.getElementById('generateProfitLoss')
        ?.addEventListener('click', generateProfitLossReport);

    document.getElementById('downloadSales')
        ?.addEventListener('click', () => {
            api.reports.downloadSalesReport()
                .then(blob => downloadBlob(blob, 'sales-report.pdf'))
                .catch(err => utils.showToast(err.message, 'error'));
        });
}

async function generateProfitLossReport() {
    const start = document.getElementById('reportStartDate')?.value;
    const end = document.getElementById('reportEndDate')?.value;

    if (!start || !end) {
        return utils.showToast('Please select both start and end dates', 'error');
    }

    try {
        const data = await api.reports.getProfitLoss(start, end);

        document.getElementById('plContainer').classList.remove('d-none');
        document.getElementById('plRevenue').textContent = `₹${data.total_revenue.toLocaleString()}`;
        document.getElementById('plCost').textContent = `₹${data.total_cost.toLocaleString()}`;
        document.getElementById('plProfit').textContent = `₹${data.net_profit.toLocaleString()}`;

        const marginPerc = data.total_revenue > 0 ? (data.net_profit / data.total_revenue * 100).toFixed(1) : 0;
        document.getElementById('plMargin').textContent = `${marginPerc}%`;

        const table = document.getElementById('plTable');
        table.innerHTML = '';

        data.items.forEach(item => {
            table.innerHTML += `
                <tr>
                    <td class="small fw-bold">${item.product_sku}</td>
                    <td class="small">${item.product_name}</td>
                    <td class="text-center">${item.units_sold}</td>
                    <td class="text-end">₹${item.total_revenue.toLocaleString()}</td>
                    <td class="text-end text-danger">₹${item.total_cost.toLocaleString()}</td>
                    <td class="text-end fw-bold text-success">₹${item.margin.toLocaleString()}</td>
                    <td class="text-end small text-muted">${item.margin_percentage}%</td>
                </tr>
            `;
        });

        utils.showToast('Profit & Loss Report generated');
    } catch (err) {
        utils.showToast(err.message, 'error');
    }
}

async function downloadReport(type) {
    try {
        const start = document.getElementById('reportStartDate')?.value;
        const end = document.getElementById('reportEndDate')?.value;

        let blob, filename;

        if (type === 'installation') {
            blob = await api.reports.downloadInstallationReport(start, end);
            filename = `installation_${today()}.pdf`;
        }
        if (type === 'damage') {
            blob = await api.reports.downloadDamageReport(start, end);
            filename = `damage_${today()}.pdf`;
        }
        if (type === 'combined') {
            blob = await api.reports.downloadCombinedReport();
            filename = `combined_${today()}.xlsx`;
        }

        downloadBlob(blob, filename);
        utils.showToast(`${type} report downloaded`);
    } catch (err) {
        utils.showToast(err.message, 'error');
    }
}

/* =====================================================
   BULK IMPORT
   ===================================================== */

function setupBulkImport() {
    const form = document.getElementById('importForm');
    if (!form) return;

    form.addEventListener('submit', async e => {
        e.preventDefault();

        const file = document.getElementById('excelFile').files[0];
        const fd = new FormData();
        fd.append('file', file);

        try {
            const data = await api.reports.importExcel(fd);

            document.getElementById('importResult').classList.remove('d-none');

            document.getElementById('importSummary').innerHTML =
                `✓ ${data.success} success<br>${data.failed} failed`;

            utils.showToast('Import completed!');
        } catch (err) {
            utils.showToast(err.message, 'error');
        }
    });
}

/* =====================================================
   FORECASTING
   ===================================================== */

function setupForecasting() {
    document.getElementById('generateForecast')
        ?.addEventListener('click', showForecastModal);
}

function showForecastModal() {

    const div = document.createElement('div');
    div.innerHTML = `
    <div class="modal fade" id="forecastModal">
        <div class="modal-dialog modal-lg">
            <div class="modal-content p-3">
                <h5>Stock Forecast</h5>
                <select id="forecastProductId" class="form-select mb-3"></select>
                <input id="forecastDays" type="number"
                    class="form-control mb-3" value="30">
                <button class="btn btn-primary w-100"
                    onclick="generateForecast()">Generate</button>
                <div id="forecastResults" class="mt-3 d-none">
                    <div id="forecastChart"></div>
                </div>
            </div>
        </div>
    </div>`;

    document.body.appendChild(div.firstElementChild);

    loadForecastProducts();
    new bootstrap.Modal(document.getElementById('forecastModal')).show();
}

async function loadForecastProducts() {
    const products = await api.inventory.getProducts();
    const select = document.getElementById('forecastProductId');

    select.innerHTML =
        '<option value="">Select product</option>';

    products.forEach(p => {
        select.innerHTML +=
            `<option value="${p.id}">
                ${p.product_name} (${p.current_stock})
            </option>`;
    });
}

async function generateForecast() {
    const productId =
        document.getElementById('forecastProductId').value;
    const days =
        document.getElementById('forecastDays').value;

    if (!productId)
        return utils.showToast('Select product', 'error');

    try {
        const data =
            await api.inventory.generateForecast(productId, days);

        const html = data.forecasts.map(f =>
            `<div>${f.forecast_date} → <b>${f.predicted_stock}</b></div>`
        ).join('');

        document.getElementById('forecastChart').innerHTML = html;
        document.getElementById('forecastResults')
            .classList.remove('d-none');

    } catch (err) {
        utils.showToast(err.message, 'error');
    }
}

/* =====================================================
   HELPERS
   ===================================================== */

function downloadBlob(blob, filename) {
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.URL.revokeObjectURL(url);
}

function today() {
    return new Date().toISOString().split('T')[0];
}
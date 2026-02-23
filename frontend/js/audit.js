let auditLogsCache = [];

document.addEventListener('DOMContentLoaded', async () => {
    loadAuditLogs();

    document.getElementById('auditSearch').addEventListener('input', filterAuditLogs);
    document.getElementById('actionFilter').addEventListener('change', filterAuditLogs);
    document.getElementById('entityFilter').addEventListener('change', filterAuditLogs);
    document.getElementById('dateFilter').addEventListener('change', filterAuditLogs);
});

async function loadAuditLogs() {
    const list = document.getElementById('auditLogList');
    list.innerHTML = '<div class="text-center py-5"><i class="fas fa-spinner fa-spin me-2"></i>Loading audit logs...</div>';

    try {
        const response = await fetch(`${api.API_URL}/inventory/activity-feed?skip=0&limit=50`, {
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
            throw new Error(`HTTP error! Status: ${response.status}`);
        }

        const data = await response.json();  // Full response: { items: [...], total_count: ... }

        // Store ONLY the array of logs
        auditLogsCache = Array.isArray(data.items) ? data.items : [];

        console.log('[AUDIT] Loaded', auditLogsCache.length, 'logs');  // Debug: check count

        displayAuditLogs(auditLogsCache);
    } catch (error) {
        console.error('Failed to load audit logs:', error);
        list.innerHTML = `<div class="alert alert-danger">Error loading audit logs: ${error.message}</div>`;
    }
}

function displayAuditLogs(logs) {
    const list = document.getElementById('auditLogList');


    if (!Array.isArray(logs)) {
        console.error('[AUDIT] Logs is not an array:', logs);
        list.innerHTML = '<div class="alert alert-warning">Invalid data format from server</div>';
        return;
    }

    if (!logs || logs.length === 0) {
        list.innerHTML = '<div class="text-center py-5 text-muted"><i class="fas fa-inbox me-2"></i>No audit logs found</div>';
        return;
    }

    let html = '';
    logs.forEach(log => {
        const date = new Date(log.timestamp).toLocaleString('en-IN');

        const actionColor = log.action_type === 'CREATE' ? 'bg-success' :
            log.action_type === 'UPDATE' ? 'bg-warning' :
                log.action_type === 'DELETE' ? 'bg-danger' : 'bg-info';

        const actionIcon = log.action_type === 'CREATE' ? 'fa-plus' :
            log.action_type === 'UPDATE' ? 'fa-pencil-alt' :
                log.action_type === 'DELETE' ? 'fa-trash' : 'fa-info-circle';

        html += `
            <div class="card mb-3 border-left-4 border-${actionColor === 'bg-success' ? 'success' : actionColor === 'bg-warning' ? 'warning' : actionColor === 'bg-danger' ? 'danger' : 'info'}">
                <div class="card-body">
                    <div class="row">
                        <div class="col-auto">
                            <div class="d-flex align-items-center justify-content-center ${actionColor} text-white rounded-circle" style="width: 45px; height: 45px;">
                                <i class="fas ${actionIcon}"></i>
                            </div>
                        </div>
                        <div class="col">
                            <h6 class="card-title mb-1">
                                <span class="badge ${actionColor} text-white">${log.action_type}</span>
                                <strong>${log.entity_type}</strong>
                            </h6>
                            <small class="text-muted d-block">
                                <i class="fas fa-calendar-alt me-1"></i>${date}
                            </small>
                            <small class="text-muted d-block">
                                <i class="fas fa-user me-1"></i>User: <strong>${log.user_name || 'System'}</strong>
                            </small>
                            ${log.reason ? `
                                <small class="text-secondary d-block mt-2">
                                    <i class="fas fa-comment me-1"></i><em>${log.reason}</em>
                                </small>
                            ` : ''}
                            <small class="text-muted d-block">
                                Entity ID: ${log.entity_id}
                            </small>
                        </div>
                    </div>
                    ${log.old_data || log.new_data ? `
                        <div class="mt-3 pt-3 border-top">
                            <details style="cursor: pointer;">
                                <summary class="text-muted small">
                                    <i class="fas fa-chevron-right me-1"></i>View Changes
                                </summary>
                                <div class="mt-2">
                                    ${log.old_data ? `
                                        <div class="mb-2">
                                            <small class="text-danger d-block"><strong>Before:</strong></small>
                                            <code class="small">${JSON.stringify(log.old_data, null, 2).substring(0, 200)}</code>
                                        </div>
                                    ` : ''}
                                    ${log.new_data ? `
                                        <div>
                                            <small class="text-success d-block"><strong>After:</strong></small>
                                            <code class="small">${JSON.stringify(log.new_data, null, 2).substring(0, 200)}</code>
                                        </div>
                                    ` : ''}
                                </div>
                            </details>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    });

    list.innerHTML = html;
}

function filterAuditLogs() {
    const search = document.getElementById('auditSearch').value.toLowerCase();
    const action = document.getElementById('actionFilter').value;
    const entity = document.getElementById('entityFilter').value;
    const date = document.getElementById('dateFilter').value;

    const filtered = auditLogsCache.filter(log => {
        const matchesSearch = (log.action_type || '').toLowerCase().includes(search) ||
            (log.entity_type || '').toLowerCase().includes(search) ||
            (log.user_name || '').toLowerCase().includes(search) ||
            (log.reason || '').toLowerCase().includes(search);

        const matchesAction = !action || log.action_type === action;
        const matchesEntity = !entity || log.entity_type.toLowerCase().includes(entity.toLowerCase());
        const matchesDate = !date || log.timestamp.startsWith(date);

        return matchesSearch && matchesAction && matchesEntity && matchesDate;
    });

    displayAuditLogs(filtered);
}

function exportAuditLog() {
    try {
        const headers = ['Date', 'User', 'Action', 'Entity', 'Entity ID', 'Reason'];
        const rows = auditLogsCache.map(log => [
            new Date(log.timestamp).toLocaleString('en-IN'),
            log.user_name || 'System',
            log.action_type,
            log.entity_type,
            log.entity_id,
            log.reason || '-'
        ]);

        const csvContent = [headers.join(','), ...rows.map(r => r.map(cell => `"${cell}"`).join(','))].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `audit_log_${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        window.URL.revokeObjectURL(url);

        utils.showToast('Audit log exported successfully!');
    } catch (err) {
        utils.showToast('Export failed: ' + err.message, 'error');
    }
}

const API_URL = 'https://inventory-1-vp9k.onrender.com/api';
const BASE_URL = API_URL.replace('/api', '');

const api = {
    API_URL: API_URL,
    BASE_URL: BASE_URL,

    async request(endpoint, options = {}) {
        const token = localStorage.getItem('token');
        const headers = {
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }
        const config = { ...options, headers };
        try {
            if (!options.skipLoader) utils.showLoader();
            const response = await fetch(`${API_URL}${endpoint}`, config);
            if (response.status === 401 || response.status === 403) {
                localStorage.removeItem('token');
                window.location.href = 'login.html';
                return;
            }
            const data = await response.json();
            if (!response.ok) {
                const err = new Error(data.detail || 'Something went wrong');
                err.status = response.status;
                throw err;
            }
            return data;
        } catch (error) {
            if (!error.status || error.status >= 500) console.error('SERVER ERROR:', error);
            throw error;
        } finally {
            if (!options.skipLoader) utils.hideLoader();
        }
    },

    auth: {
        login: (username, password) => {
            const params = new URLSearchParams();
            params.append('username', username);
            params.append('password', password);
            return fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: params
            }).then(res => res.json());
        },
        me: () => api.request('/auth/me')
    },

    inventory: {
        getDashboard: () => api.request('/inventory/dashboard'),
        getDashboardAnalytics: () => api.request('/inventory/dashboard/analytics?days=30'),
        getProducts: () => api.request('/inventory/products?skip=0&limit=500'),
        addProduct: (product) => api.request('/inventory/products', { method: 'POST', body: JSON.stringify(product) }),
        updateProduct: (id, product) => api.request(`/inventory/products/${id}`, { method: 'PUT', body: JSON.stringify(product) }),
        deleteProduct: (id) => api.request(`/inventory/products/${id}`, { method: 'DELETE' }),
        getProductImages: (productId) => api.request(`/inventory/products/${productId}/images`),
        uploadProductImage: (productId, formData) => {
            return fetch(`${API_URL}/inventory/products/${productId}/images`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: formData
            }).then(res => res.json());
        },
        scanProduct: (barcode) => api.request(`/inventory/products/scan/${barcode}`),
        getTransactions: (filters = {}) => {
            const params = new URLSearchParams();
            if (filters.status) params.append('status', filters.status);
            if (filters.transaction_type) params.append('transaction_type', filters.transaction_type);
            const qs = params.toString();
            return api.request(`/inventory/transactions?skip=0&limit=500${qs ? '&' + qs : ''}`);
        },
        addTransaction: (transaction) => api.request('/inventory/transactions', { method: 'POST', body: JSON.stringify(transaction) }),
        editTransaction: (id, data) => api.request(`/inventory/transactions/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
        deleteTransaction: (id, reason) => api.request(`/inventory/transactions/${id}?reason=${encodeURIComponent(reason)}`, { method: 'DELETE' }),
        getClients: () => api.request('/inventory/clients?skip=0&limit=100'),
        addClient: (client) => api.request('/inventory/clients', { method: 'POST', body: JSON.stringify(client) }),
        updateClient: (id, client) => api.request(`/inventory/clients/${id}`, { method: 'PUT', body: JSON.stringify(client) }),
        getAssetLocation: (sku) => api.request(`/inventory/assets/${sku}/location`),
        getAssetTimeline: (sku) => api.request(`/inventory/assets/${sku}/timeline`),
        getActivityFeed: () => api.request('/inventory/activity-feed?skip=0&limit=500'),
        getNotifications: () => api.request('/inventory/notifications?skip=0&limit=50'),
        markNotificationRead: (notificationIds) => api.request('/inventory/notifications/read', { method: 'PUT', body: JSON.stringify({ notification_ids: notificationIds }) }),
        generateForecast: (productId, days) => api.request(`/inventory/forecast/product/${productId}?days_ahead=${days}`, { method: 'POST', body: JSON.stringify({}) }),

        // ENTERPRISE V2
        getBatches: (productId = null) => api.request(`/inventory/batches${productId ? '?product_id=' + productId : ''}`),
        addBatch: (batch) => api.request('/inventory/batches', { method: 'POST', body: JSON.stringify(batch) }),
        getProductInstances: (productId) => api.request(`/inventory/products/${productId}/instances`),
        getPurchaseOrders: () => api.request('/inventory/purchase-orders'),
        getPurchaseOrder: (id) => api.request(`/inventory/purchase-orders/${id}`),
        createPurchaseOrder: (po) => api.request('/inventory/purchase-orders', { method: 'POST', body: JSON.stringify(po) }),
        receivePurchaseOrder: (id) => api.request(`/inventory/purchase-orders/${id}/receive`, { method: 'POST' })
    },

    reports: {
        importExcel: (formData) => {
            return fetch(`${API_URL}/reports/import`, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` },
                body: formData
            }).then(res => res.json());
        },
        getProfitLoss: (startDate, endDate) => api.request('/reports/profit-loss', { method: 'POST', body: JSON.stringify({ start_date: startDate, end_date: endDate }) }),
        exportInventory: () => {
            const token = localStorage.getItem('token');
            return fetch(`${API_URL}/reports/export/inventory`, { headers: { 'Authorization': `Bearer ${token}` } }).then(response => response.blob());
        },
        downloadInstallationReport: (startDate, endDate) => {
            let url = `${API_URL}/reports/installation-pdf`;
            const params = [];
            if (startDate) params.push(`start_date=${startDate}`);
            if (endDate) params.push(`end_date=${endDate}`);
            if (params.length) url += '?' + params.join('&');
            return fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(res => res.blob());
        },
        downloadDamageReport: (startDate, endDate) => {
            let url = `${API_URL}/reports/damage-pdf`;
            const params = [];
            if (startDate) params.push(`start_date=${startDate}`);
            if (endDate) params.push(`end_date=${endDate}`);
            if (params.length) url += '?' + params.join('&');
            return fetch(url, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(res => res.blob());
        },
        downloadProductLedger: (productId) => {
            return fetch(`${API_URL}/reports/product-ledger-pdf/${productId}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(res => res.blob());
        },
        downloadCombinedReport: () => {
            return fetch(`${API_URL}/reports/combined-xlsx`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(res => res.blob());
        },
        downloadSalesReport: () => {
            return fetch(`${API_URL}/reports/sales/pdf`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(res => res.blob());
        },
        generateQRCode: (productId) => api.request(`/reports/qrcode/${productId}`),
        downloadQRCode: (productId) => {
            return fetch(`${API_URL}/reports/qrcode/${productId}`, { headers: { 'Authorization': `Bearer ${localStorage.getItem('token')}` } }).then(res => res.blob());
        }
    }
};
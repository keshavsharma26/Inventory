const API_URL = 'http://127.0.0.1:8000/api';

const api = {
    async request(endpoint, options = {}) {
        const token = localStorage.getItem('token');
        const headers = {
            'Content-Type': 'application/json',
            ...(token && { 'Authorization': `Bearer ${token}` }),
            ...options.headers
        };

        const config = {
            ...options,
            headers
        };

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
            // Only log 500+ errors as severe console errors
            if (!error.status || error.status >= 500) {
                console.error('SERVER ERROR:', error);
            }
            throw error;
        } finally {
            if (!options.skipLoader) utils.hideLoader();
        }
    },

    auth: {
        login: (username, password) => {
            const formData = new FormData();
            formData.append('username', username);
            formData.append('password', password);
            return fetch(`${API_URL}/auth/login`, {
                method: 'POST',
                body: formData
            }).then(res => res.json());
        },
        me: () => api.request('/auth/me')
    },

    inventory: {
        getDashboard: () => api.request('/inventory/dashboard'),
        getProducts: () => api.request('/inventory/products'),
        addProduct: (product) => api.request('/inventory/products', {
            method: 'POST',
            body: JSON.stringify(product)
        }),
        addTransaction: (transaction) => api.request('/inventory/transactions', {
            method: 'POST',
            body: JSON.stringify(transaction)
        }),
        updateProduct: (id, product) => api.request(`/inventory/products/${id}`, {
            method: 'PUT',
            body: JSON.stringify(product)
        })
    },

    reports: {
        importExcel: (formData) => fetch(`${API_URL}/reports/import`, {
            method: 'POST',
            body: formData,
            headers: {
                'Authorization': `Bearer ${localStorage.getItem('token')}`
            }
        }).then(res => res.json()),
        exportInventory: () => {
            const token = localStorage.getItem('token');
            return fetch(`${API_URL}/reports/export/inventory`, {
                headers: { 'Authorization': `Bearer ${token}` }
            }).then(response => response.blob());
        }
    }
};

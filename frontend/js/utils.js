const utils = {
    showLoader() {
        let loader = document.getElementById('global-loader');
        if (!loader) {
            loader = document.createElement('div');
            loader.id = 'global-loader';
            loader.innerHTML = `
                <div class="spinner-overlay">
                    <div class="spinner-border text-primary" role="status">
                        <span class="visually-hidden">Loading...</span>
                    </div>
                </div>
            `;
            document.body.appendChild(loader);
        }
        loader.style.display = 'block';
    },

    hideLoader() {
        const loader = document.getElementById('global-loader');
        if (loader) loader.style.display = 'none';
    },

    showToast(message, type = 'success') {
        const toastContainer = document.getElementById('toast-container');
        if (!toastContainer) {
            const container = document.createElement('div');
            container.id = 'toast-container';
            container.className = 'toast-container position-fixed bottom-0 end-0 p-3';
            document.body.appendChild(container);
        }

        const id = 'toast-' + Date.now();
        const icon = type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle';
        const color = type === 'success' ? 'text-success' : 'text-danger';

        const toastHtml = `
            <div id="${id}" class="toast" role="alert" aria-live="assertive" aria-atomic="true">
                <div class="toast-header border-0">
                    <i class="fas ${icon} ${color} me-2"></i>
                    <strong class="me-auto">${type === 'success' ? 'Success' : 'Error'}</strong>
                    <button type="button" class="btn-close" data-bs-dismiss="toast" aria-label="Close"></button>
                </div>
                <div class="toast-body pt-0">
                    ${message}
                </div>
            </div>
        `;

        document.getElementById('toast-container').insertAdjacentHTML('beforeend', toastHtml);
        const toastElement = document.getElementById(id);
        const bsToast = new bootstrap.Toast(toastElement, { delay: 3000 });
        bsToast.show();

        toastElement.addEventListener('hidden.bs.toast', () => {
            toastElement.remove();
        });
    },

    confirmModal(title, message, onConfirm) {
        let modalEl = document.getElementById('confirm-modal');
        if (!modalEl) {
            const html = `
                <div class="modal fade" id="confirm-modal" tabindex="-1">
                    <div class="modal-dialog modal-sm modal-dialog-centered">
                        <div class="modal-content border-0 shadow" style="border-radius: 15px;">
                            <div class="modal-body text-center p-4">
                                <h5 class="fw-bold mb-3" id="confirm-title"></h5>
                                <p class="text-muted small mb-4" id="confirm-message"></p>
                                <div class="d-flex gap-2">
                                    <button class="btn btn-light w-100 border-0" data-bs-dismiss="modal">Cancel</button>
                                    <button id="confirm-btn" class="btn btn-danger w-100 border-0">Confirm</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', html);
            modalEl = document.getElementById('confirm-modal');
        }

        document.getElementById('confirm-title').textContent = title;
        document.getElementById('confirm-message').textContent = message;

        const confirmBtn = document.getElementById('confirm-btn');
        const newConfirmBtn = confirmBtn.cloneNode(true);
        confirmBtn.parentNode.replaceChild(newConfirmBtn, confirmBtn);

        const bsModal = new bootstrap.Modal(modalEl);

        newConfirmBtn.addEventListener('click', () => {
            onConfirm();
            bsModal.hide();
        });

        bsModal.show();
    }
};

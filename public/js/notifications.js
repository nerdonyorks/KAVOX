/**
 * Kavox Production-Level Notification & Modal System
 * Features: Stacking, Queuing, Hover-to-Pause, Accessibility, and Smooth Animations.
 */

class KavoxTimer {
    constructor(callback, delay) {
        this.callback = callback;
        this.remaining = delay;
        this.startTime = null;
        this.timerId = null;
        this.resume();
    }

    pause() {
        if (this.timerId) {
            window.clearTimeout(this.timerId);
            this.timerId = null;
            this.remaining -= Date.now() - this.startTime;
        }
    }

    resume() {
        if (!this.timerId) {
            this.startTime = Date.now();
            this.timerId = window.setTimeout(this.callback, this.remaining);
        }
    }

    clear() {
        window.clearTimeout(this.timerId);
    }
}

const KavoxNotify = {
    activeToasts: [],
    toastQueue: [],
    maxToasts: 5,
    lastMessage: null,
    isLoading: false,

    // 1. Enhanced Toast Notifications
    toast: function (message, type = 'success', duration = 4000) {
        // Prevent identical spam
        if (this.lastMessage === message + type) return;
        this.lastMessage = message + type;
        setTimeout(() => this.lastMessage = null, 1000);

        if (this.activeToasts.length >= this.maxToasts) {
            this.toastQueue.push({ message, type, duration });
            return;
        }

        let container = document.getElementById('kavox-toast-container');
        if (!container) {
            container = document.createElement('div');
            container.id = 'kavox-toast-container';
            document.body.appendChild(container);
        }

        const toast = document.createElement('div');
        toast.className = `kavox-toast kavox-toast-${type}`;

        const icon = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ');

        toast.innerHTML = `
            <div class="kavox-toast-icon">${icon}</div>
            <div class="kavox-toast-content">${message}</div>
            <button class="kavox-toast-close" aria-label="Close">&times;</button>
            <div class="kavox-toast-progress">
                <div class="kavox-toast-progress-inner" style="animation-duration: ${duration}ms"></div>
            </div>
        `;

        container.appendChild(toast);

        const toastObj = {
            id: Date.now() + Math.random(),
            el: toast,
            timer: null
        };

        const removeToast = () => {
            if (toast.classList.contains('removing')) return;
            toast.classList.add('removing');
            toastObj.timer.clear();

            setTimeout(() => {
                toast.remove();
                this.activeToasts = this.activeToasts.filter(t => t.id !== toastObj.id);
                // Process queue
                if (this.toastQueue.length > 0) {
                    const next = this.toastQueue.shift();
                    this.toast(next.message, next.type, next.duration);
                }
            }, 400);
        };

        toastObj.timer = new KavoxTimer(removeToast, duration);
        this.activeToasts.push(toastObj);

        // Events
        toast.addEventListener('mouseenter', () => toastObj.timer.pause());
        toast.addEventListener('mouseleave', () => toastObj.timer.resume());
        toast.querySelector('.kavox-toast-close').addEventListener('click', removeToast);
        toast.addEventListener('click', (e) => {
            if (!e.target.closest('.kavox-toast-close')) removeToast();
        });
    },

    // 2. Optimized Modal System
    _getOverlay: function () {
        let overlay = document.getElementById('kavox-modal-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'kavox-modal-overlay';
            document.body.appendChild(overlay);
        }
        return overlay;
    },

    alert: function (options) {
        const { title = 'Notification', text = '', icon = 'info' } = typeof options === 'string' ? { text: options } : options;
        const overlay = this._getOverlay();

        const modal = document.createElement('div');
        modal.className = 'kavox-confirm-modal';
        modal.innerHTML = `
            <div class="kavox-confirm-icon ${icon}">${icon === 'error' ? '✕' : (icon === 'success' ? '✓' : 'ℹ')}</div>
            <div class="kavox-confirm-title">${title}</div>
            <div class="kavox-confirm-text">${text}</div>
            <div class="kavox-confirm-btns">
                <button class="kavox-btn-confirm">OK</button>
            </div>
        `;

        const close = () => {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
            document.removeEventListener('keydown', escHandler);
        };

        const escHandler = (e) => { if (e.key === 'Escape') close(); };
        document.addEventListener('keydown', escHandler);

        overlay.replaceChildren(modal);
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        return new Promise((resolve) => {
            modal.querySelector('.kavox-btn-confirm').onclick = () => {
                close();
                resolve();
            };
            overlay.onclick = (e) => { if (e.target === overlay) { close(); resolve(); } };
        });
    },

    confirm: function (options) {
        const { title = 'Are you sure?', text = '', icon = 'warning', confirmText = 'Yes', cancelText = 'Cancel' } = options;
        const overlay = this._getOverlay();

        const modal = document.createElement('div');
        modal.className = 'kavox-confirm-modal';
        modal.innerHTML = `
            <div class="kavox-confirm-icon ${icon}">${icon === 'warning' ? '!' : '?'}</div>
            <div class="kavox-confirm-title">${title}</div>
            <div class="kavox-confirm-text">${text}</div>
            <div class="kavox-confirm-btns">
                <button class="kavox-btn-cancel">${cancelText}</button>
                <button class="kavox-btn-confirm">${confirmText}</button>
            </div>
        `;

        const close = () => {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
            document.removeEventListener('keydown', escHandler);
        };

        const escHandler = (e) => { if (e.key === 'Escape') { close(); resolve({ isConfirmed: false }); } };
        document.addEventListener('keydown', escHandler);

        overlay.replaceChildren(modal);
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        return new Promise((resolve) => {
            modal.querySelector('.kavox-btn-confirm').onclick = () => {
                close();
                resolve({ isConfirmed: true });
            };
            modal.querySelector('.kavox-btn-cancel').onclick = () => {
                close();
                resolve({ isConfirmed: false });
            };
            overlay.onclick = (e) => {
                if (e.target === overlay) {
                    close();
                    resolve({ isConfirmed: false });
                }
            };
        });
    },

    // 3. Robust Loading Overlay
    loading: function (message = 'Processing...') {
        let overlay = document.getElementById('kavox-loading-overlay');
        if (overlay && overlay.classList.contains('active')) return;

        this.isLoading = true; // Set active state

        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'kavox-loading-overlay';
            document.body.appendChild(overlay);
        }

        overlay.innerHTML = `
            <div class="kavox-loading-spinner"></div>
            <div class="kavox-loading-text">${message}</div>
        `;
        overlay.classList.add('active');
        document.body.style.overflow = 'hidden';

        // Auto-safety timeout (15s)
        this._loadingTimeout = setTimeout(() => this.closeLoading(), 15000);
    },

    closeLoading: function () {
        this.isLoading = false; // Reset state
        const overlay = document.getElementById('kavox-loading-overlay');
        if (overlay) {
            overlay.classList.remove('active');
            document.body.style.overflow = '';
            if (this._loadingTimeout) clearTimeout(this._loadingTimeout);
        }
    }
};

window.KavoxNotify = KavoxNotify;


// Global Loading (Shimmer)
let loadingTimer = null;
let activeRequests = 0;

function showShimmer() {
    if (document.getElementById('global-shimmer-overlay')) return;

    // Skip if an explicit loading overlay is already active from KavoxNotify
    if (window.KavoxNotify && window.KavoxNotify.isLoading) return;

    // Skip full-screen shimmer on Login page
    if (window.location.pathname.includes('/admin/login')) return;

    const overlay = document.createElement('div');
    overlay.id = 'global-shimmer-overlay';
    overlay.classList.add('is-loading-container');

    // Auto-detect Admin Theme for Dark Shimmer
    if (document.querySelector('.main-content') || document.querySelector('.sidebar') || document.body.classList.contains('admin-layout')) {
        overlay.classList.add('dark-shimmer');
    }

    // Apply fixed positioning styles to ensure it covers the entire viewport and blocks clicks
    Object.assign(overlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        right: '0',
        bottom: '0',
        zIndex: '10050',
        pointerEvents: 'auto',
        opacity: '0',
        transition: 'opacity 0.3s ease'
    });

    document.body.appendChild(overlay);

    // Force layout reflow and set opacity to 1 to trigger transition
    overlay.offsetHeight;
    overlay.style.opacity = '1';
}

function startTimer() {
    if (loadingTimer) clearTimeout(loadingTimer);
    loadingTimer = setTimeout(showShimmer, 300);
}

function clearTimer() {
    activeRequests = 0;
    if (loadingTimer) clearTimeout(loadingTimer);
    const overlay = document.getElementById('global-shimmer-overlay');
    if (overlay) {
        overlay.style.opacity = '0';
        setTimeout(() => {
            if (overlay.parentNode) {
                overlay.remove();
            }
        }, 300);
    }
}

// Global Event Listeners
document.addEventListener('DOMContentLoaded', () => {
    // Intercept link clicks for shimmer
    document.addEventListener('click', (e) => {
        const link = e.target.closest('a');
        if (!link) return;

        const href = link.getAttribute('href');
        const target = link.getAttribute('target');

        if (href &&
            !href.startsWith('#') &&
            !href.startsWith('javascript:') &&
            (!target || target === '_self') &&
            !e.ctrlKey && !e.shiftKey && !e.metaKey && !e.defaultPrevented) {
            startTimer();
        }
    });

    // Intercept form submissions
    document.addEventListener('submit', (e) => {
        if (!e.defaultPrevented) {
            startTimer();
        }
    });


    // Wrap fetch for global loading feedback
    const originalFetch = window.fetch;
    window.fetch = async function (...args) {
        // Resolve target URL string
        let urlStr = '';
        if (args[0]) {
            if (typeof args[0] === 'string') {
                urlStr = args[0];
            } else if (args[0] instanceof URL) {
                urlStr = args[0].href;
            } else if (typeof args[0] === 'object' && args[0].url) {
                urlStr = args[0].url;
            }
        }

        // Trigger for significant data requests (internal APIs, admin dashboard, or shop/orders AJAX pages)
        const isInternalRequest = urlStr && (
            urlStr.includes('/api/') ||
            urlStr.includes('/admin/') ||
            ((urlStr.startsWith('/') || urlStr.startsWith(window.location.origin)) &&
                (urlStr.includes('/shop') || urlStr.includes('/orders')) &&
                !/\.(js|css|png|jpg|jpeg|gif|svg|webp)$/i.test(urlStr))
        );

        if (isInternalRequest) {
            activeRequests++;
            if (activeRequests === 1) {
                startTimer();
            }
        }

        try {
            const response = await originalFetch(...args);
            return response;
        } finally {
            if (isInternalRequest) {
                activeRequests--;
                if (activeRequests <= 0) {
                    activeRequests = 0;
                    clearTimer();
                }
            }
        }
    };
});

// Back-forward Cache Cleanup
window.addEventListener('pageshow', clearTimer);

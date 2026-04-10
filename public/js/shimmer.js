/**
 * Kavox Global Logic & Loading Transitions
 * Consolidates shimmer loading and admin-specific interactions.
 */

// Global Loading (Shimmer)
let loadingTimer = null;

function showShimmer() {
    if (document.getElementById('global-shimmer-overlay')) return;
    
    // Skip full-screen shimmer on Login page
    if (window.location.pathname.includes('/admin/login')) return;
    
    const overlay = document.createElement('div');
    overlay.id = 'global-shimmer-overlay';
    overlay.classList.add('is-loading-container');
    
    // Auto-detect Admin Theme for Dark Shimmer
    if (document.querySelector('.main-content') || document.querySelector('.sidebar') || document.body.classList.contains('admin-layout')) {
        overlay.classList.add('dark-shimmer');
    }
    
    // Apply fixed positioning styles to ensure it covers the entire viewport
    Object.assign(overlay.style, {
        position: 'fixed',
        top: '0',
        left: '0',
        width: '100vw',
        height: '100vh',
        zIndex: '999999',
        pointerEvents: 'none',
        transition: 'opacity 0.3s ease'
    });
    
    document.body.appendChild(overlay);
}

function startTimer() {
    if (loadingTimer) clearTimeout(loadingTimer);
    loadingTimer = setTimeout(showShimmer, 300);
}

function clearTimer() {
    if (loadingTimer) clearTimeout(loadingTimer);
    const overlay = document.getElementById('global-shimmer-overlay');
    if (overlay) {
        overlay.remove();
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
    window.fetch = async function(...args) {
        // Trigger for significant data requests
        const isInternalRequest = args[0] && typeof args[0] === 'string' && 
                                (args[0].includes('/api/') || args[0].includes('/admin/'));
        
        if (isInternalRequest) startTimer();
        
        try {
            const response = await originalFetch(...args);
            return response;
        } finally {
            if (isInternalRequest) clearTimer();
        }
    };
});

// Back-forward Cache Cleanup
window.addEventListener('pageshow', clearTimer);

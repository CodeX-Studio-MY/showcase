// Auth check — redirects to login if not authenticated.
// Usage: include this script on every page EXCEPT index.html.
(function () {
    const isLogin = /(^|\/)index\.html?$/.test(location.pathname) || location.pathname.endsWith('/');
    if (!isLogin) {
        if (localStorage.getItem('agriflow_auth') !== 'true') {
            window.location.href = 'index.html';
        }
    }
})();

function logout() {
    localStorage.removeItem('agriflow_auth');
    window.location.href = 'index.html';
}

// Shared toast utility
window.showToast = function (msg, type = 'success') {
    let c = document.getElementById('toastContainer');
    if (!c) {
        c = document.createElement('div');
        c.id = 'toastContainer';
        document.body.appendChild(c);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + (type === 'error' ? 'error' : type === 'warn' ? 'warn' : '');
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 4000);
};

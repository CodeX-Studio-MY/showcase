/* Shared sidebar injector. Call AgriflowSidebar.mount('dashboard'|'scada'|'gateway'|'schedule'|'trending') */
(function () {
  const ITEMS = [
    { key: 'dashboard', label: 'Dashboard',          href: 'dashboard.html', icon: 'M3 12l9-9 9 9M5 10v10h14V10' },
    { key: 'scada',     label: 'SCADA',              href: 'scada.html',     icon: 'M4 7h16M4 12h16M4 17h10' },
    { key: 'gateway',   label: 'Gateway Management', href: 'gateway.html',   icon: 'M5 12a7 7 0 0114 0M8 12a4 4 0 018 0M11 12h2v8h-2z' },
    { key: 'schedule',  label: 'Irrigation Schedule',href: 'schedule.html',  icon: 'M7 4v3M17 4v3M4 9h16M5 7h14a1 1 0 011 1v11a1 1 0 01-1 1H5a1 1 0 01-1-1V8a1 1 0 011-1z' },
    { key: 'trending',  label: 'Trending',           href: 'trending.html',  icon: 'M3 17l6-6 4 4 8-8M14 7h7v7' }
  ];

  function html(active) {
    return `
    <aside class="fixed left-0 top-0 bottom-0 w-60 bg-slate-900 text-white flex flex-col z-40 shadow-xl">
      <div class="px-5 py-5 border-b border-slate-800 flex items-center gap-2.5">
        <img src="assets/logo.svg" alt="" class="w-9 h-9" />
        <div>
          <div class="font-bold text-lg leading-none tracking-tight">Agriflow</div>
          <div class="text-[10px] text-teal-300 mt-0.5 uppercase tracking-wider">AI Smart Irrigation</div>
        </div>
      </div>
      <nav class="flex-1 py-4 flex flex-col">
        ${ITEMS.map(i => `
          <a href="${i.href}" class="nav-item ${active === i.key ? 'active' : ''}">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="${i.icon}"/></svg>
            <span>${i.label}</span>
          </a>
        `).join('')}
      </nav>
      <div class="border-t border-slate-800 p-4 flex items-center gap-3">
        <div class="w-9 h-9 rounded-full bg-gradient-to-br from-green-500 to-teal-600 flex items-center justify-center font-bold text-sm">A</div>
        <div class="flex-1 min-w-0">
          <div class="text-sm font-medium">Admin</div>
          <div class="text-[11px] text-slate-400">Plantation Manager</div>
        </div>
        <button onclick="logout()" title="Logout"
          class="text-slate-400 hover:text-red-400 transition p-1.5 rounded hover:bg-slate-800">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 01-2-2V5a2 2 0 012-2h4M16 17l5-5-5-5M21 12H9"/></svg>
        </button>
      </div>
    </aside>
    <div id="toastContainer"></div>`;
  }

  window.AgriflowSidebar = {
    mount(active) {
      const div = document.createElement('div');
      div.innerHTML = html(active);
      while (div.firstChild) document.body.insertBefore(div.firstChild, document.body.firstChild);
    }
  };
})();

// ==========================================================
// نظام "عبق الكهرب" - المنطق البرمجي والتفاعلي الشامل (v7.0)
// ==========================================================

const state = {
  currentUser: null,
  currentTab: 'dashboard',
  dashboardDateFilter: '',
  misbahCurrentTab: 'stock',
  ownersCurrentFilter: 'all',
  customers: [],
  misbahs: [],
  availableSaleMisbahs: [],
  selectedSaleMisbah: null,
  verifiedSaleCustomer: null,
  sales: [],
  ownerItems: [],
  selectedOwnerItemIds: new Set(),
  users: [],
  currentTimelineMisbahId: null,
  parsedExcelRows: [],
  validExcelRows: [],
  settings: {
    store_name: 'عبق الكهرب',
    system_logo: 'https://k.top4top.io/p_38967jw2l0.png?utm_source=chatgpt.com',
    invoice_logo: 'https://k.top4top.io/p_38967jw2l0.png?utm_source=chatgpt.com',
    currency: 'د.ك',
    phone: '+965 99887766',
    tiktok_account: '@abaq_alkahrab',
    invoice_footer: 'شكراً لتعاملكم مع عبق الكهرب. المسابيح المباعة أصلية ومفحوصة مخبرياً.'
  },
  currentViewingSale: null,
  editingSaleId: null
};

// ==================== التهيئة عند تحميل الصفحة ====================
document.addEventListener('DOMContentLoaded', () => {
  checkAuthState();
  setupEventListeners();

  loadSettings().then(() => {
    if (state.currentUser) {
      switchTab('dashboard');
    }
  });

  setInterval(() => {
    if (state.currentUser && state.currentTab === 'dashboard') {
      loadDashboard();
    }
  }, 30000);
});

function setupEventListeners() {
  const codeSelect = document.getElementById('cust-country-code');
  if (codeSelect) {
    codeSelect.addEventListener('change', () => {
      const customInput = document.getElementById('cust-custom-country-code');
      if (codeSelect.value === 'custom') {
        customInput.classList.remove('hidden');
        customInput.focus();
      } else {
        customInput.classList.add('hidden');
        customInput.value = '';
      }
    });
  }
}

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// دالة الاتصال الموحدة مع تمرير الصلاحيات
async function fetchWithAuth(url, options = {}) {
  const headers = options.headers || {};
  if (state.currentUser) {
    headers['X-User-Role'] = state.currentUser.role;
    headers['Authorization'] = `Bearer ${state.currentUser.role}`;
  }
  options.headers = headers;

  const res = await fetch(url, options);
  if (res.status === 403) {
    const data = await res.json().catch(() => ({}));
    customAlert(data.error || 'غير مصرح لك بالوصول إلى هذا القسم.', 'صلاحية مرفوضة ⛔', 'warning');
    throw new Error('Forbidden');
  }
  return res;
}

// ==================== المصادقة وتسجيل الدخول والخروج ====================
function checkAuthState() {
  const savedUser = localStorage.getItem('abaq_user');
  const loginView = document.getElementById('login-screen-view');

  if (savedUser) {
    try {
      state.currentUser = JSON.parse(savedUser);
      if (loginView) {
        loginView.style.display = 'none';
        loginView.classList.add('hidden');
      }
      updateUserUI();
    } catch (e) {
      showLoginScreen();
    }
  } else {
    showLoginScreen();
  }
}

function showLoginScreen() {
  state.currentUser = null;
  const loginView = document.getElementById('login-screen-view');
  if (loginView) {
    loginView.style.display = 'flex';
    loginView.classList.remove('hidden');
  }
}

async function handleLogin(e) {
  if (e) e.preventDefault();
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value.trim();

  if (!username || !password) {
    customAlert('يرجى إدخال اسم المستخدم وكلمة المرور', 'تنبيه', 'warning');
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });
    const data = await res.json();
    if (res.ok && data.success) {
      state.currentUser = data.user;
      localStorage.setItem('abaq_user', JSON.stringify(data.user));
      if (data.token) localStorage.setItem('abaq_token', data.token);

      const loginView = document.getElementById('login-screen-view');
      if (loginView) {
        loginView.style.display = 'none';
        loginView.classList.add('hidden');
      }

      updateUserUI();
      showToast(`مرحباً بك، ${data.user.full_name}`);
      switchTab('dashboard');
    } else {
      customAlert(data.error || 'فشل تسجيل الدخول', 'خطأ', 'error');
    }
  } catch (err) {
    customAlert('خطأ في الاتصال بالسيرفر', 'خطأ', 'error');
  }
}

function handleLogout() {
  localStorage.removeItem('abaq_user');
  localStorage.removeItem('abaq_token');
  sessionStorage.clear();
  state.currentUser = null;
  showLoginScreen();
  showToast('تم تسجيل الخروج بنجاح');
}

function updateUserUI() {
  if (!state.currentUser) return;
  const nameEl = document.getElementById('current-user-name');
  const roleEl = document.getElementById('current-user-role');
  const avatarEl = document.getElementById('user-avatar');

  if (nameEl) nameEl.textContent = state.currentUser.full_name;
  if (roleEl) roleEl.textContent = state.currentUser.role === 'Admin' ? 'ADMIN (OWNER)' : state.currentUser.role;
  if (avatarEl) {
    const initials = state.currentUser.full_name.split(' ').map(n => n[0]).slice(0, 2).join('');
    avatarEl.textContent = initials || 'ع';
  }

  applyRolePermissions();
}

function applyRolePermissions() {
  if (!state.currentUser) return;
  const perms = state.currentUser.permissions || {};
  const isManagerOrAdmin = ['Admin', 'Manager', 'Owner'].includes(state.currentUser.role);

  // تحديث إظهار أزرار النافبار بناء على صلاحية كل صفحة
  document.querySelectorAll('.page-nav-btn').forEach(btn => {
    const page = btn.getAttribute('data-page');
    if (isManagerOrAdmin) {
      btn.style.display = '';
    } else if (perms[page] === 'none') {
      btn.style.display = 'none';
    } else {
      btn.style.display = '';
    }
  });

  // تحديث أزرار الإجراءات والتعديل الحساسة
  document.querySelectorAll('.action-btn, .action-container').forEach(el => {
    const page = el.getAttribute('data-perm-page');
    if (isManagerOrAdmin) {
      el.style.display = '';
    } else if (perms[page] === 'edit') {
      el.style.display = '';
    } else {
      el.style.display = 'none';
    }
  });
}

// ==================== نوافذ التنبيه والتأكيد المخصصة ====================
function customAlert(message, title = 'تنبيه', type = 'info') {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-custom-alert');
    const msgEl = document.getElementById('custom-alert-message');
    const titleEl = document.getElementById('custom-alert-title');
    const iconEl = document.getElementById('custom-alert-icon');
    const boxEl = document.getElementById('custom-alert-icon-box');

    if (msgEl) msgEl.textContent = message;
    if (titleEl) titleEl.textContent = title;

    if (type === 'warning' || type === 'error') {
      boxEl.className = 'w-11 h-11 mx-auto rounded-lg bg-rose-500/20 text-rose-400 flex items-center justify-center font-bold text-lg border border-rose-500/30';
      iconEl.setAttribute('data-lucide', 'alert-circle');
    } else {
      boxEl.className = 'w-11 h-11 mx-auto rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold text-lg border border-amber-500/30';
      iconEl.setAttribute('data-lucide', 'info');
    }

    refreshIcons();
    openModal('modal-custom-alert');

    const okBtn = modal.querySelector('button');
    const clickHandler = () => {
      closeModal('modal-custom-alert');
      okBtn.removeEventListener('click', clickHandler);
      resolve(true);
    };
    okBtn.addEventListener('click', clickHandler);
  });
}

function customConfirm(message, title = 'تأكيد الإجراء') {
  return new Promise((resolve) => {
    const modal = document.getElementById('modal-custom-confirm');
    const msgEl = document.getElementById('custom-confirm-message');
    const titleEl = document.getElementById('custom-confirm-title');
    const okBtn = document.getElementById('custom-confirm-ok-btn');
    const cancelBtn = document.getElementById('custom-confirm-cancel-btn');

    if (msgEl) msgEl.textContent = message;
    if (titleEl) titleEl.textContent = title;

    openModal('modal-custom-confirm');

    const onOk = () => {
      cleanup();
      closeModal('modal-custom-confirm');
      resolve(true);
    };

    const onCancel = () => {
      cleanup();
      closeModal('modal-custom-confirm');
      resolve(false);
    };

    function cleanup() {
      okBtn.removeEventListener('click', onOk);
      cancelBtn.removeEventListener('click', onCancel);
    }

    okBtn.addEventListener('click', onOk);
    cancelBtn.addEventListener('click', onCancel);
  });
}

// ==================== التنبيهات السريعة Toast ====================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  
  const bgClass = type === 'success' ? 'bg-[#18181b] text-amber-400 border border-amber-500/40' : (type === 'error' ? 'bg-red-950 text-red-300 border border-red-800' : 'bg-[#18181b] text-zinc-200 border border-zinc-700');
  const iconName = type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-circle' : 'info');

  toast.className = `p-3.5 rounded-lg shadow-xl flex items-center gap-2.5 text-xs sm:text-sm font-bold transition-all duration-300 pointer-events-auto transform translate-y-2 opacity-0 ${bgClass}`;
  toast.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4 text-amber-400"></i><span>${message}</span>`;
  
  container.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ==================== القائمة الجانبية وتغيير التبويبات ====================
function toggleMobileSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  const backdrop = document.getElementById('mobile-backdrop');
  if (!sidebar) return;

  if (sidebar.classList.contains('translate-x-full')) {
    sidebar.classList.remove('translate-x-full');
    backdrop?.classList.remove('hidden');
  } else {
    sidebar.classList.add('translate-x-full');
    backdrop?.classList.add('hidden');
  }
}

function closeMobileSidebarIfOpen() {
  const sidebar = document.getElementById('main-sidebar');
  const backdrop = document.getElementById('mobile-backdrop');
  if (window.innerWidth < 768 && sidebar) {
    sidebar.classList.add('translate-x-full');
    backdrop?.classList.add('hidden');
  }
}

function switchTab(tabId) {
  if (!state.currentUser) {
    showLoginScreen();
    return;
  }

  const perms = state.currentUser.permissions || {};
  const isManagerOrAdmin = ['Admin', 'Manager', 'Owner'].includes(state.currentUser.role);

  if (!isManagerOrAdmin && perms[tabId] === 'none') {
    customAlert('غير مصرح لك بالوصول إلى هذه الصفحة من قبل الإدارة.', 'صلاحية مرفوضة ⛔', 'warning');
    return;
  }

  state.currentTab = tabId;

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('active');
    btn.classList.add('text-zinc-300');
  });

  const activeBtn = document.getElementById(`nav-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add('active');
    activeBtn.classList.remove('text-zinc-300');
  }

  document.querySelectorAll('.tab-content').forEach(sec => sec.classList.add('hidden'));
  const targetSec = document.getElementById(`tab-${tabId}`);
  if (targetSec) targetSec.classList.remove('hidden');

  const titles = {
    dashboard: 'لوحة التحكم',
    misbahs: 'المسابيح / المخزون',
    sales: 'الطلبات والمبيعات',
    customers: 'العملاء المعتمدين',
    owners: 'أصحاب المسابيح والمستحقات',
    reports: 'التقارير المالية',
    users: 'المستخدمون والصلاحيات',
    settings: 'الهوية والإعدادات'
  };
  document.getElementById('page-title').textContent = titles[tabId] || 'عبق الكهرب';

  if (tabId === 'dashboard') loadDashboard();
  else if (tabId === 'customers') loadCustomers();
  else if (tabId === 'misbahs') loadMisbahs();
  else if (tabId === 'sales') loadSales();
  else if (tabId === 'owners') loadOwners();
  else if (tabId === 'reports') loadAllFinancialReports();
  else if (tabId === 'users') loadUsers();
  else if (tabId === 'settings') fillSettingsForm();

  refreshIcons();
}

function handleOtherOption(selectId, customInputId) {
  const selectEl = document.getElementById(selectId);
  const customInputEl = document.getElementById(customInputId);
  if (!selectEl || !customInputEl) return;

  if (selectEl.value === 'أخرى') {
    customInputEl.classList.remove('hidden');
    customInputEl.focus();
  } else {
    customInputEl.classList.add('hidden');
    customInputEl.value = '';
  }
}

function getValueWithOtherOption(selectId, customInputId) {
  const selectEl = document.getElementById(selectId);
  const customInputEl = document.getElementById(customInputId);
  if (!selectEl) return '';
  if (selectEl.value === 'أخرى') {
    return customInputEl ? customInputEl.value.trim() || 'أخرى' : 'أخرى';
  }
  return selectEl.value;
}

function setValueWithOtherOption(selectId, customInputId, value, defaultVal = '') {
  const selectEl = document.getElementById(selectId);
  const customInputEl = document.getElementById(customInputId);
  if (!selectEl) return;

  const targetVal = value || defaultVal;
  let found = false;
  for (let i = 0; i < selectEl.options.length; i++) {
    if (selectEl.options[i].value === targetVal) {
      selectEl.selectedIndex = i;
      found = true;
      break;
    }
  }

  if (!found && targetVal) {
    selectEl.value = 'أخرى';
    if (customInputEl) {
      customInputEl.classList.remove('hidden');
      customInputEl.value = targetVal;
    }
  } else {
    if (customInputEl) {
      customInputEl.classList.add('hidden');
      customInputEl.value = '';
    }
  }
}

async function refreshCurrentData() {
  const icon = document.getElementById('sync-icon');
  if (icon) icon.classList.add('animate-spin');

  if (state.currentTab === 'dashboard') await loadDashboard();
  else if (state.currentTab === 'misbahs') await loadMisbahs();
  else if (state.currentTab === 'sales') await loadSales();
  else if (state.currentTab === 'customers') await loadCustomers();
  else if (state.currentTab === 'owners') await loadOwners();
  else if (state.currentTab === 'users') await loadUsers();

  setTimeout(() => {
    if (icon) icon.classList.remove('animate-spin');
    showToast('تم تحديث البيانات');
  }, 300);
}

// ==================== 1. لوحة التحكم DASHBOARD ====================
function setDashboardDateFilter(filterName) {
  state.dashboardDateFilter = filterName;

  document.querySelectorAll('.date-filter-btn').forEach(btn => btn.classList.remove('active'));
  const activeBtn = document.getElementById(`filter-btn-${filterName || 'all'}`);
  if (activeBtn) activeBtn.classList.add('active');

  loadDashboard();
}

async function loadDashboard() {
  const params = new URLSearchParams();
  if (state.dashboardDateFilter) params.append('filter', state.dashboardDateFilter);

  try {
    const res = await fetchWithAuth(`/api/stats?${params.toString()}`);
    const data = await res.json();

    document.getElementById('kpi-current-misbahs').textContent = data.current_misbahs.toLocaleString();
    document.getElementById('kpi-sold-misbahs').textContent = data.sold_misbahs.toLocaleString();
    document.getElementById('kpi-total-sales').textContent = data.total_sales.toFixed(3);
    document.getElementById('kpi-total-profit').textContent = data.total_profit.toFixed(3);
    document.getElementById('kpi-due-to-owners').textContent = data.due_to_owners.toFixed(3);
    document.getElementById('kpi-paid-to-owners').textContent = data.paid_to_owners.toFixed(3);

    renderRecentSalesTable(data.recent_sales);
    refreshIcons();
  } catch (err) {
    console.error('Error loading dashboard stats:', err);
  }
}

function renderRecentSalesTable(sales) {
  const tbody = document.getElementById('dashboard-recent-sales-tbody');
  if (!tbody) return;

  if (!sales || sales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="py-5 text-center text-zinc-500">لا توجد مبيعات مسجلة في هذه الفترة</td></tr>`;
    return;
  }

  tbody.innerHTML = sales.map(s => `
    <tr class="hover:bg-zinc-800/30 transition">
      <td class="py-3 px-3.5 font-bold text-zinc-200">${s.sale_code}</td>
      <td class="py-3 px-3.5">
        <span class="font-bold text-amber-400 font-mono">${s.misbah_code || '-'}</span>
        <span class="text-xs text-zinc-500 block">${s.cut || ''} - ${s.material || ''}</span>
      </td>
      <td class="py-3 px-3.5 text-zinc-300 font-medium">${s.customer_name || 'عميل معتمد'}</td>
      <td class="py-3 px-3.5 font-bold text-amber-400 font-mono">${parseFloat(s.selling_price).toFixed(3)} د.ك</td>
      <td class="py-3 px-3.5">${getOrderStatusBadge(s.status)}</td>
      <td class="py-3 px-3.5">${getReceiptStatusBadge(s.receipt_status)}</td>
      <td class="py-3 px-3.5 text-zinc-400 font-mono text-xs">${s.sale_date}</td>
      <td class="py-3 px-3.5 text-center">
        <button onclick="viewInvoice(${s.id})" class="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded" title="عرض الفاتورة">
          <i data-lucide="printer" class="w-4 h-4"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

// ==================== 2. سجل المسباح التاريخي TIMELINE ====================
async function viewMisbahTimeline(misbahId, misbahCode) {
  state.currentTimelineMisbahId = misbahId;
  document.getElementById('timeline-misbah-code').textContent = misbahCode;
  document.getElementById('timeline-new-note').value = '';

  const container = document.getElementById('timeline-events-container');
  container.innerHTML = `<div class="py-4 text-center text-zinc-500">جاري تحميل السجل التاريخي...</div>`;
  openModal('modal-misbah-timeline');

  try {
    const res = await fetchWithAuth(`/api/misbahs/${misbahId}/timeline`);
    const events = await res.json();

    if (!events || events.length === 0) {
      container.innerHTML = `<div class="py-6 text-center text-zinc-500">لا توجد أحداث مسجلة لهذا المسباح بعد</div>`;
      return;
    }

    container.innerHTML = events.map(ev => `
      <div class="timeline-item">
        <div class="timeline-dot"></div>
        <div class="bg-zinc-900/90 border border-zinc-800 p-3 rounded-lg space-y-1">
          <div class="flex justify-between items-center">
            <span class="font-bold text-zinc-100 text-xs sm:text-sm">${ev.title}</span>
            <span class="text-xs text-zinc-500 font-mono">${ev.created_at || ''}</span>
          </div>
          ${ev.description ? `<p class="text-zinc-400 text-xs leading-relaxed">${ev.description}</p>` : ''}
          ${ev.employee_name ? `<span class="text-xs text-amber-500 font-semibold block">بواسطة: ${ev.employee_name}</span>` : ''}
        </div>
      </div>
    `).join('');

    refreshIcons();
  } catch (err) {
    container.innerHTML = `<div class="py-4 text-center text-rose-400">تعذر تحميل السجل</div>`;
  }
}

async function submitTimelineNote() {
  const note = document.getElementById('timeline-new-note').value.trim();
  if (!note || !state.currentTimelineMisbahId) return;

  try {
    const res = await fetchWithAuth(`/api/misbahs/${state.currentTimelineMisbahId}/timeline`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'ملاحظة',
        title: 'ملاحظة متابعة',
        description: note,
        employee_name: state.currentUser?.full_name || 'موظف النظام'
      })
    });
    if (res.ok) {
      showToast('تمت إضافة الملاحظة للسجل');
      document.getElementById('timeline-new-note').value = '';
      const code = document.getElementById('timeline-misbah-code').textContent;
      viewMisbahTimeline(state.currentTimelineMisbahId, code);
    }
  } catch (err) {
    customAlert('فشل حفظ الملاحظة', 'خطأ', 'error');
  }
}

// ==================== 3. المسابيح / المخزون ====================
function filterMisbahsByTab(tab) {
  state.misbahCurrentTab = tab;

  document.querySelectorAll('.cycle-tab-btn').forEach(btn => {
    btn.classList.remove('active', 'bg-amber-500', 'text-zinc-950');
    btn.classList.add('bg-zinc-900', 'text-zinc-300');
  });

  const activeBtn = document.getElementById(`misbah-tab-${tab}`);
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-amber-500', 'text-zinc-950');
    activeBtn.classList.remove('bg-zinc-900', 'text-zinc-300');
  }

  loadMisbahs();
}

async function loadMisbahs() {
  const search = document.getElementById('misbahs-search')?.value || '';
  const cut = document.getElementById('misbahs-cut-filter')?.value || '';

  const params = new URLSearchParams();
  params.append('tab', state.misbahCurrentTab);
  if (search) params.append('search', search);
  if (cut) params.append('cut', cut);

  try {
    const res = await fetchWithAuth(`/api/misbahs?${params.toString()}`);
    const data = await res.json();
    state.misbahs = data;
    renderMisbahsTable(data);
  } catch (err) {
    console.error('Error loading misbahs:', err);
  }
}

function renderMisbahsTable(misbahs) {
  const tbody = document.getElementById('misbahs-tbody');
  const emptyEl = document.getElementById('misbahs-empty');
  if (!tbody) return;

  if (!misbahs || misbahs.length === 0) {
    tbody.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  tbody.innerHTML = misbahs.map(m => `
    <tr class="hover:bg-zinc-800/30 transition border-b border-zinc-800/50">
      <td class="py-3 px-3.5 font-bold text-amber-400 font-mono">
        <button onclick="viewMisbahTimeline(${m.id}, '${m.code}')" class="hover:underline text-amber-400 font-bold" title="عرض السجل التاريخي">
          ${m.code}
        </button>
      </td>
      <td class="py-3 px-3.5">${getMisbahStatusBadge(m.status, m.sub_status, m.return_reason)}</td>
      <td class="py-3 px-3.5 font-bold text-zinc-100">${m.owner_name}</td>
      <td class="py-3 px-3.5 text-zinc-200">${m.cut || '-'}</td>
      <td class="py-3 px-3.5 text-zinc-400">${m.material || '-'}</td>
      <td class="py-3 px-3.5 font-mono text-zinc-300 text-xs">${m.weight_grams ? `${m.weight_grams}ج` : '-'}</td>
      <td class="py-3 px-3.5 font-mono text-zinc-300 text-xs">${m.bead_count || 33}</td>
      <td class="py-3 px-3.5 text-zinc-300 font-mono text-xs">${parseFloat(m.original_price).toFixed(3)} د.ك</td>
      <td class="py-3 px-3.5 text-amber-300 font-mono text-xs font-bold">${parseFloat(m.profit).toFixed(3)} د.ك</td>
      <td class="py-3 px-3.5 text-rose-300 font-mono text-xs font-bold">${parseFloat(m.supplier_due || (m.original_price - m.profit)).toFixed(3)} د.ك</td>
      <td class="py-3 px-3.5 font-bold text-amber-400 font-mono text-xs sm:text-sm">${parseFloat(m.selling_price).toFixed(3)} د.ك</td>
      <td class="py-3 px-3.5 text-center no-print whitespace-nowrap">
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="viewMisbahTimeline(${m.id}, '${m.code}')" class="px-2.5 py-1 bg-zinc-800 hover:bg-zinc-700 text-amber-400 font-bold rounded text-xs transition" title="السجل التاريخي">
            السجل
          </button>
          <button onclick="editMisbahModal(${m.id})" class="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded" title="تعديل بيانات المسباح">
            <i data-lucide="edit-3" class="w-4 h-4"></i>
          </button>
          <button onclick="deleteMisbah(${m.id})" class="p-1.5 bg-red-950/40 hover:bg-red-900 text-red-400 rounded" title="حذف">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  applyRolePermissions();
  refreshIcons();
}

function calculateLivePricing() {
  const origPriceInput = document.getElementById('msb-orig-price');
  const profitInput = document.getElementById('msb-profit');
  const supplierDueInput = document.getElementById('msb-supplier-due');
  const sellingPriceInput = document.getElementById('msb-selling-price');

  const orig = parseFloat(origPriceInput.value) || 0;
  let profit = 0;
  if (orig <= 100) {
    profit = orig > 0 ? 5.0 : 0.0;
  } else {
    profit = orig * 0.05;
  }

  const supplierDue = Math.max(0, orig - profit);

  profitInput.value = profit.toFixed(3);
  supplierDueInput.value = supplierDue.toFixed(3);
  sellingPriceInput.value = orig.toFixed(3);
}

function searchSuppliersForMisbah() {
  const q = document.getElementById('msb-owner-search')?.value.toLowerCase().trim() || '';
  const container = document.getElementById('msb-supplier-results');
  if (!container) return;

  const matches = state.customers.filter(c => 
    c.name.toLowerCase().includes(q) ||
    (c.phone && c.phone.includes(q)) ||
    (c.tiktok_username && c.tiktok_username.toLowerCase().includes(q))
  );

  if (matches.length === 0) {
    container.innerHTML = `<div class="p-2 text-center text-zinc-500 text-xs">لا يوجد شخص مطابق في العملاء المعتمدين</div>`;
    return;
  }

  container.innerHTML = matches.map(c => `
    <div onclick="selectSupplierForMisbah(${c.id}, '${c.name.replace(/'/g, "\\'")}', '${c.phone || ''}', '${c.country_code || '+965'}')" class="p-2 bg-zinc-900 hover:bg-zinc-800 rounded cursor-pointer flex justify-between items-center">
      <div>
        <span class="font-bold text-zinc-200 text-xs sm:text-sm">${c.name}</span>
        <span class="text-xs text-zinc-400 font-mono block">${c.country_code || '+965'} ${c.phone || '-'}</span>
      </div>
      <span class="text-xs text-amber-400 font-bold">اختيار</span>
    </div>
  `).join('');
}

function selectSupplierForMisbah(id, name, phone, code) {
  document.getElementById('msb-owner-id').value = id;
  document.getElementById('msb-owner-name').value = name;
  document.getElementById('msb-owner-phone').value = `${code} ${phone}`.trim();

  document.getElementById('msb-sel-owner-name').textContent = name;
  document.getElementById('msb-sel-owner-phone').textContent = `${code} ${phone}`.trim();
  document.getElementById('msb-selected-supplier-card').classList.remove('hidden');
}

async function openNewMisbahModal() {
  document.getElementById('misbah-form').reset();
  document.getElementById('misbah-id').value = '';
  document.getElementById('msb-owner-id').value = '';
  document.getElementById('msb-selected-supplier-card').classList.add('hidden');
  setValueWithOtherOption('msb-cut-select', 'msb-cut-custom', 'برميلي');
  setValueWithOtherOption('msb-mat-select', 'msb-mat-custom', 'كهرمان بولندي قديم');
  document.getElementById('msb-bead-count').value = '33';
  calculateLivePricing();

  if (state.customers.length === 0) {
    await loadCustomers();
  }
  searchSuppliersForMisbah();
  openModal('modal-misbah');
}

async function saveMisbah(e) {
  e.preventDefault();

  const owner_name = document.getElementById('msb-owner-name').value.trim();
  if (!owner_name) {
    customAlert('يرجى اختيار صاحب المسباح / المورد من قائمة العملاء المعتمدين', 'حقل إلزامي', 'warning');
    return;
  }

  const payload = {
    owner_id: document.getElementById('msb-owner-id').value || null,
    owner_name: owner_name,
    owner_phone: document.getElementById('msb-owner-phone').value.trim(),
    cut: getValueWithOtherOption('msb-cut-select', 'msb-cut-custom'),
    material: getValueWithOtherOption('msb-mat-select', 'msb-mat-custom'),
    weight_grams: document.getElementById('msb-weight').value,
    bead_count: document.getElementById('msb-bead-count').value,
    original_price: document.getElementById('msb-orig-price').value,
    notes: document.getElementById('msb-notes').value.trim(),
    created_by: state.currentUser?.full_name || 'موظف النظام'
  };

  try {
    const res = await fetchWithAuth('/api/misbahs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast('تمت إضافة المسباح للمخزون وسجله التاريخي');
      closeModal('modal-misbah');
      loadMisbahs();
      loadDashboard();
    } else {
      const err = await res.json();
      customAlert(err.error || 'خطأ أثناء الحفظ', 'خطأ', 'error');
    }
  } catch (err) {
    customAlert('خطأ في الاتصال بالسيرفر', 'خطأ', 'error');
  }
}

function editMisbahModal(id) {
  const m = state.misbahs.find(item => item.id == id);
  if (!m) return;

  document.getElementById('edit-msb-id').value = m.id;
  document.getElementById('edit-msb-code-display').textContent = m.code;

  // عرض المورد الحالي (مقفول)
  document.getElementById('edit-msb-owner-name').value = m.owner_name || '';
  document.getElementById('edit-msb-owner-phone').value = m.owner_phone || '';
  document.getElementById('edit-msb-owner-name-display').textContent = m.owner_name || '—';
  document.getElementById('edit-msb-owner-phone-display').textContent = m.owner_phone || '—';

  document.getElementById('edit-msb-cut').value = m.cut || 'برميلي';
  document.getElementById('edit-msb-material').value = m.material || '';
  document.getElementById('edit-msb-weight').value = m.weight_grams || 0;
  document.getElementById('edit-msb-beads').value = m.bead_count || 33;
  document.getElementById('edit-msb-price').value = m.original_price || 0;
  document.getElementById('edit-msb-status').value = m.status === 'مسترجع' ? 'مسترجع' : 'حالي';
  document.getElementById('edit-msb-return-reason').value = m.return_reason || '';
  document.getElementById('edit-msb-notes').value = m.notes || '';

  // إخفاء picker عند فتح النافذة
  document.getElementById('owner-picker-dropdown').classList.add('hidden');

  // تحميل قائمة العملاء في الخلفية
  loadOwnerPickerList();

  onEditMisbahStatusChange();
  openModal('modal-edit-misbah');
}

// تحميل قائمة العملاء المعتمدين للـ picker
async function loadOwnerPickerList() {
  try {
    const res = await fetchWithAuth('/api/customers');
    const data = await res.json();
    state.ownerPickerCustomers = data;
    renderOwnerPickerList(data);
  } catch (e) {
    state.ownerPickerCustomers = [];
  }
}

function renderOwnerPickerList(customers) {
  const list = document.getElementById('owner-picker-list');
  if (!list) return;
  if (!customers || customers.length === 0) {
    list.innerHTML = `<div class="text-center text-zinc-500 text-xs py-3">لا يوجد عملاء معتمدين</div>`;
    return;
  }
  list.innerHTML = customers.map(c => `
    <button type="button" onclick="selectOwnerFromPicker(${JSON.stringify(c.id)}, ${JSON.stringify(c.name || '')}, ${JSON.stringify(c.phone || '')})"
      class="w-full text-right px-3 py-2 rounded hover:bg-amber-500/15 transition flex items-center gap-2.5 group">
      <div class="w-7 h-7 rounded-full bg-zinc-800 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-500/20">
        <i data-lucide="user" class="w-3.5 h-3.5 text-zinc-400 group-hover:text-amber-400"></i>
      </div>
      <div class="flex-1 min-w-0">
        <div class="font-bold text-zinc-100 text-xs truncate">${c.name || '—'}</div>
        <div class="text-zinc-500 font-mono text-[10px]">${c.phone || ''} ${c.tiktok_username ? '· ' + c.tiktok_username : ''}</div>
      </div>
    </button>
  `).join('');
  refreshIcons();
}

function openOwnerPicker() {
  const picker = document.getElementById('owner-picker-dropdown');
  picker.classList.toggle('hidden');
  if (!picker.classList.contains('hidden')) {
    document.getElementById('owner-picker-search').value = '';
    renderOwnerPickerList(state.ownerPickerCustomers || []);
    document.getElementById('owner-picker-search').focus();
  }
}

function filterOwnerPicker() {
  const q = document.getElementById('owner-picker-search').value.toLowerCase().trim();
  const all = state.ownerPickerCustomers || [];
  const filtered = q
    ? all.filter(c =>
        (c.name || '').toLowerCase().includes(q) ||
        (c.phone || '').includes(q) ||
        (c.tiktok_username || '').toLowerCase().includes(q)
      )
    : all;
  renderOwnerPickerList(filtered);
}

function selectOwnerFromPicker(customerId, name, phone) {
  document.getElementById('edit-msb-owner-name').value = name;
  document.getElementById('edit-msb-owner-phone').value = phone;
  document.getElementById('edit-msb-owner-name-display').textContent = name || '—';
  document.getElementById('edit-msb-owner-phone-display').textContent = phone || '—';
  document.getElementById('owner-picker-dropdown').classList.add('hidden');
  showToast(`تم اختيار: ${name}`);
}

function onEditMisbahStatusChange() {
  const st = document.getElementById('edit-msb-status').value;
  const reasonContainer = document.getElementById('edit-msb-return-reason-container');
  if (st === 'مسترجع') {
    reasonContainer.classList.remove('hidden');
    document.getElementById('edit-msb-return-reason').required = true;
  } else {
    reasonContainer.classList.add('hidden');
    document.getElementById('edit-msb-return-reason').required = false;
  }
}

async function saveEditedMisbah(e) {
  e.preventDefault();
  const mid = document.getElementById('edit-msb-id').value;
  const status_val = document.getElementById('edit-msb-status').value;
  const return_reason = document.getElementById('edit-msb-return-reason').value.trim();

  if (status_val === 'مسترجع' && !return_reason) {
    customAlert('سبب الاسترجاع مطلوب وإلزامي عند اختيار حالة مسترجع', 'حقل إلزامي', 'warning');
    return;
  }

  const payload = {
    owner_name: document.getElementById('edit-msb-owner-name').value.trim(),
    owner_phone: document.getElementById('edit-msb-owner-phone').value.trim(),
    cut: document.getElementById('edit-msb-cut').value,
    material: document.getElementById('edit-msb-material').value.trim(),
    weight_grams: parseFloat(document.getElementById('edit-msb-weight').value) || 0,
    bead_count: parseInt(document.getElementById('edit-msb-beads').value) || 33,
    original_price: parseFloat(document.getElementById('edit-msb-price').value) || 0,
    status: status_val,
    return_reason: return_reason,
    notes: document.getElementById('edit-msb-notes').value.trim(),
    employee_name: state.currentUser?.full_name || 'موظف النظام'
  };

  try {
    const res = await fetchWithAuth(`/api/misbahs/${mid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast('تم تحديث بيانات المسباح بنجاح');
      closeModal('modal-edit-misbah');
      loadMisbahs();
      loadDashboard();
    }
  } catch (err) {
    customAlert('خطأ في الاتصال بالسيرفر', 'خطأ', 'error');
  }
}

async function deleteMisbah(id) {
  const confirmed = await customConfirm('هل أنت متأكد من حذف هذا المسباح وسجله؟', 'تأكيد الحذف');
  if (!confirmed) return;

  try {
    const res = await fetchWithAuth(`/api/misbahs/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      showToast('تم حذف المسباح بنجاح');
      loadMisbahs();
      loadDashboard();
    } else {
      customAlert(data.error || 'فشل حذف المسباح', 'تنبيه', 'warning');
    }
  } catch (err) {
    customAlert('خطأ في الاتصال بالسيرفر', 'خطأ', 'error');
  }
}

// ==================== 4. الطلبات والمبيعات وإدارة الإدارة الشاملة ====================
async function loadSales() {
  const search = document.getElementById('sales-search')?.value || '';
  const status_filter = document.getElementById('sales-status-filter')?.value || '';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (status_filter) params.append('status', status_filter);

  try {
    const res = await fetchWithAuth(`/api/sales?${params.toString()}`);
    const data = await res.json();
    state.sales = data;
    renderSalesTable(data);
  } catch (err) {
    console.error('Error loading sales:', err);
  }
}

function renderSalesTable(sales) {
  const tbody = document.getElementById('sales-tbody');
  const emptyEl = document.getElementById('sales-empty');
  if (!tbody) return;

  if (!sales || sales.length === 0) {
    tbody.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  tbody.innerHTML = sales.map(s => `
    <tr class="hover:bg-zinc-800/30 transition border-b border-zinc-800/50">
      <td class="py-3 px-3.5">
        <span class="font-bold text-amber-400 font-mono block">${s.misbah_code || '-'}</span>
        <span class="text-xs text-zinc-500 font-mono">${s.invoice_created ? s.sale_code : 'محجوز (بدون فاتورة)'}</span>
      </td>
      <td class="py-3 px-3.5">${getOrderStatusBadge(s.status)}</td>
      <td class="py-3 px-3.5 font-bold text-zinc-100">${s.customer_name || '-'}</td>
      <td class="py-3 px-3.5 text-zinc-300">
        <span>${s.cut || ''} - ${s.material || ''}</span>
      </td>
      <td class="py-3 px-3.5 font-bold text-amber-400 font-mono text-xs sm:text-sm">${parseFloat(s.selling_price).toFixed(3)} د.ك</td>
      <td class="py-3 px-3.5 text-zinc-300">${s.payment_method}</td>
      <td class="py-3 px-3.5">
        <button onclick="toggleReceiptStatus(${s.id}, '${s.receipt_status || 'لم يتم الاستلام'}')" class="hover:scale-105 transition" title="اضغط لتغيير حالة الاستلام">
          ${getReceiptStatusBadge(s.receipt_status)}
        </button>
      </td>
      <td class="py-3 px-3.5 text-zinc-400 font-mono text-xs">${s.sale_date}</td>
      <td class="py-3 px-3.5 text-center no-print whitespace-nowrap">
        <div class="flex items-center justify-center gap-1.5">
          
          <!-- أزرار الإدارة والتعديل الشامل -->
          <button onclick="openAdminEditSaleModal(${s.id})" class="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500 text-amber-400 hover:text-zinc-950 font-bold rounded text-xs transition border border-amber-500/30 flex items-center gap-1" title="تعديل الطلب والحالة الشاملة">
            <i data-lucide="edit" class="w-3.5 h-3.5"></i>
            <span>تعديل الطلب</span>
          </button>

          <!-- زر السجل التاريخي للمسباح -->
          ${s.misbah_id ? `
            <button onclick="viewMisbahTimeline(${s.misbah_id}, '${s.misbah_code || ''}')" class="p-1.5 bg-zinc-800/70 hover:bg-amber-500/20 text-zinc-400 hover:text-amber-400 rounded transition border border-zinc-700/50 hover:border-amber-500/40" title="السجل التاريخي للمسباح">
              <i data-lucide="clock" class="w-4 h-4"></i>
            </button>
          ` : ''}

          <button onclick="deleteSaleDirectly(${s.id})" class="p-1.5 bg-red-950/40 hover:bg-red-900 text-red-400 rounded transition" title="حذف الطلب نهائياً">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>

          ${s.status === 'محجوز / غير مدفوع' ? `
            <button onclick="openPayReservedModal(${s.id})" class="px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-xs" title="تسجيل الدفع">
              دفع
            </button>
          ` : ''}

          ${s.invoice_created ? `
            <button onclick="viewInvoice(${s.id})" class="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded" title="عرض الفاتورة">
              <i data-lucide="printer" class="w-4 h-4"></i>
            </button>
          ` : ''}
        </div>
      </td>
    </tr>
  `).join('');

  applyRolePermissions();
  refreshIcons();
}

// نافذة تعديل وحذف الطلب للإدارة
function openAdminEditSaleModal(saleId) {
  const sale = state.sales.find(s => s.id === saleId);
  if (!sale) return;

  state.editingSaleId = saleId;
  document.getElementById('admin-edit-sale-id').value = sale.id;
  document.getElementById('admin-sale-code-display').textContent = `${sale.misbah_code || ''} (${sale.sale_code || ''})`;
  document.getElementById('admin-sale-status').value = sale.status || 'محجوز / غير مدفوع';
  document.getElementById('admin-sale-receipt-status').value = sale.receipt_status || 'لم يتم الاستلام';
  document.getElementById('admin-sale-cust-name').value = sale.customer_name || '';
  document.getElementById('admin-sale-price').value = sale.selling_price || 0;
  document.getElementById('admin-sale-pay-method').value = sale.payment_method || 'كي نت';
  document.getElementById('admin-sale-recipient').value = sale.recipient_name || '';
  document.getElementById('admin-sale-notes').value = sale.notes || '';

  openModal('modal-admin-edit-sale');
}

async function saveAdminEditedSale(e) {
  e.preventDefault();
  const sid = document.getElementById('admin-edit-sale-id').value;

  const payload = {
    status: document.getElementById('admin-sale-status').value,
    receipt_status: document.getElementById('admin-sale-receipt-status').value,
    customer_name: document.getElementById('admin-sale-cust-name').value.trim(),
    selling_price: parseFloat(document.getElementById('admin-sale-price').value) || 0,
    payment_method: document.getElementById('admin-sale-pay-method').value,
    recipient_name: document.getElementById('admin-sale-recipient').value.trim(),
    notes: document.getElementById('admin-sale-notes').value.trim(),
    employee_name: state.currentUser?.full_name || 'الإدارة'
  };

  try {
    const res = await fetchWithAuth(`/api/sales/${sid}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast('تم تعديل الطلب وحالته بالنظام بنجاح');
      closeModal('modal-admin-edit-sale');
      loadSales();
      loadMisbahs();
      loadDashboard();
    }
  } catch (err) {
    customAlert('فشل تعديل الطلب', 'خطأ', 'error');
  }
}

async function deleteSaleDirectly(saleId = null) {
  const sid = saleId || document.getElementById('admin-edit-sale-id').value;
  if (!sid) return;

  const confirmed = await customConfirm('هل أنت متأكد من حذف هذا الطلب نهائياً وإعادة المسباح للمخزون كمتوفر؟', 'تأكيد حذف الطلب');
  if (!confirmed) return;

  try {
    const res = await fetchWithAuth(`/api/sales/${sid}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('تم حذف الطلب وإعادة المسباح للمخزون بنجاح');
      closeModal('modal-admin-edit-sale');
      loadSales();
      loadMisbahs();
      loadDashboard();
    }
  } catch (err) {
    customAlert('فشل حذف الطلب', 'خطأ', 'error');
  }
}

async function toggleReceiptStatus(saleId, currentStatus) {
  const newStatus = currentStatus === 'تم الاستلام' ? 'لم يتم الاستلام' : 'تم الاستلام';
  try {
    const res = await fetchWithAuth(`/api/sales/${saleId}/receipt-status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        receipt_status: newStatus,
        employee_name: state.currentUser?.full_name || 'موظف النظام'
      })
    });
    if (res.ok) {
      showToast(`تم تغيير حالة الاستلام إلى: ${newStatus}`);
      loadSales();
      loadDashboard();
    }
  } catch (err) {
    customAlert('فشل تحديث حالة الاستلام', 'خطأ', 'error');
  }
}

function onSalePaymentStatusChange() {
  const status = document.getElementById('sale-payment-status').value;
  const notice = document.getElementById('sale-unpaid-notice');
  const details = document.getElementById('sale-paid-details-container');

  if (status === 'غير مدفوع') {
    notice.classList.remove('hidden');
    details.classList.add('opacity-40');
  } else {
    notice.classList.add('hidden');
    details.classList.remove('opacity-40');
  }
}

async function openNewSaleModal() {
  document.getElementById('sale-form').reset();
  document.getElementById('selected-sale-misbah-id').value = '';
  document.getElementById('sale-selected-misbah-card').classList.add('hidden');
  document.getElementById('sale-cust-info-card').classList.add('hidden');
  document.getElementById('sale-cust-lookup-status').textContent = '';

  // الديفولت في الطلب الجديد هو محجوز بالمخزون / غير مدفوع
  document.getElementById('sale-payment-status').value = 'غير مدفوع';
  onSalePaymentStatusChange();

  state.verifiedSaleCustomer = null;
  state.selectedSaleMisbah = null;

  setValueWithOtherOption('sale-payment-method-select', 'sale-payment-method-custom', 'كي نت');
  setValueWithOtherOption('sale-delivery-country-select', 'sale-delivery-country-custom', 'الكويت 🇰🇼');

  try {
    const res = await fetchWithAuth('/api/misbahs?tab=stock');
    const items = await res.json();
    state.availableSaleMisbahs = items.filter(m => m.sub_status !== 'محجوز');
    filterSaleMisbahs();
  } catch (e) {
    state.availableSaleMisbahs = [];
  }

  openModal('modal-sale');
}

function filterSaleMisbahs() {
  const query = document.getElementById('sale-misbah-search')?.value.toLowerCase().trim() || '';
  const container = document.getElementById('sale-misbah-results');
  if (!container) return;

  const matches = state.availableSaleMisbahs.filter(m => {
    return (m.code && m.code.toLowerCase().includes(query)) ||
           (m.cut && m.cut.toLowerCase().includes(query)) ||
           (m.material && m.material.toLowerCase().includes(query)) ||
           (m.owner_name && m.owner_name.toLowerCase().includes(query));
  });

  if (matches.length === 0) {
    container.innerHTML = `<div class="p-2 text-center text-zinc-500 text-xs">لا توجد مسابيح متوفرة مطابقة</div>`;
    return;
  }

  container.innerHTML = matches.map(m => `
    <div onclick="selectMisbahForSale(${m.id})" class="p-2 bg-zinc-900 hover:bg-zinc-800 rounded cursor-pointer flex justify-between items-center ${state.selectedSaleMisbah?.id === m.id ? 'border border-amber-500' : ''}">
      <div>
        <span class="font-bold text-amber-400 font-mono text-xs sm:text-sm">${m.code}</span>
        <span class="text-zinc-300 text-xs"> - ${m.cut || ''} (${m.material || ''})</span>
      </div>
      <span class="font-bold text-amber-400 text-xs sm:text-sm font-mono">${parseFloat(m.selling_price).toFixed(3)} د.ك</span>
    </div>
  `).join('');
}

function selectMisbahForSale(misbahId) {
  const misbah = state.availableSaleMisbahs.find(m => m.id === misbahId);
  if (!misbah) return;

  state.selectedSaleMisbah = misbah;
  document.getElementById('selected-sale-misbah-id').value = misbah.id;

  document.getElementById('sale-sel-code').textContent = misbah.code;
  document.getElementById('sale-sel-desc').textContent = `${misbah.cut || ''} - ${misbah.material || ''} (المورد: ${misbah.owner_name})`;
  document.getElementById('sale-sel-price').textContent = parseFloat(misbah.selling_price).toFixed(3);
  document.getElementById('sale-selected-misbah-card').classList.remove('hidden');
  filterSaleMisbahs();
}

let saleCustLookupTimer = null;
function lookupSaleCustomer(isManualBtn = false) {
  clearTimeout(saleCustLookupTimer);
  const identifier = document.getElementById('sale-cust-identifier').value.trim();
  const statusEl = document.getElementById('sale-cust-lookup-status');
  const card = document.getElementById('sale-cust-info-card');

  if (identifier.length < 3) {
    statusEl.textContent = '';
    card.classList.add('hidden');
    state.verifiedSaleCustomer = null;
    return;
  }

  statusEl.textContent = 'جاري التحقق...';

  saleCustLookupTimer = setTimeout(async () => {
    try {
      const res = await fetchWithAuth(`/api/customers/lookup?query=${encodeURIComponent(identifier)}`);
      const data = await res.json();

      if (data.found && data.customer) {
        const cust = data.customer;
        if (cust.reliability !== 'معتمد') {
          state.verifiedSaleCustomer = null;
          card.classList.add('hidden');
          statusEl.innerHTML = `<span class="text-rose-400 font-bold">هذا العميل محظور ⛔</span>`;
          if (isManualBtn) customAlert('هذا الشخص محظور', 'تنبيه', 'warning');
          return;
        }

        state.verifiedSaleCustomer = cust;
        statusEl.innerHTML = `<span class="text-emerald-400 font-bold">تم التحقق: عميل معتمد ✅</span>`;

        document.getElementById('sale-verified-cust-name').textContent = cust.name;
        document.getElementById('sale-verified-cust-phone').textContent = `${cust.country_code || '+965'} ${cust.phone || '-'}`;
        card.classList.remove('hidden');
      } else {
        state.verifiedSaleCustomer = null;
        card.classList.add('hidden');
        statusEl.innerHTML = `<span class="text-rose-400 font-semibold">غير معتمد! يرجى إضافة صاحب الاعتماد في قائمة العملاء.</span>`;
        if (isManualBtn) {
          customAlert('هذا الشخص غير معتمد، يرجى إضافة صاحب الاعتماد في قائمة العملاء أولاً.', 'غير معتمد', 'warning');
        }
      }
    } catch (e) {
      statusEl.textContent = '';
    }
  }, isManualBtn ? 0 : 350);
}

async function saveNewSale(e) {
  e.preventDefault();

  if (!state.selectedSaleMisbah) {
    customAlert('يرجى اختيار المسباح من المخزون أولاً', 'تنبيه', 'warning');
    return;
  }

  if (!state.verifiedSaleCustomer) {
    customAlert('هذا الشخص غير معتمد، يرجى إضافة صاحب الاعتماد في قائمة العملاء أولاً.', 'الاعتماد مطلوب', 'warning');
    return;
  }

  const payment_status = document.getElementById('sale-payment-status').value;

  const payload = {
    misbah_id: state.selectedSaleMisbah.id,
    customer_phone: state.verifiedSaleCustomer.phone,
    customer_tiktok: state.verifiedSaleCustomer.tiktok_username,
    customer_name: state.verifiedSaleCustomer.name,
    payment_status: payment_status,
    paid_amount: payment_status === 'غير مدفوع' ? 0 : state.selectedSaleMisbah.selling_price,
    payment_method: getValueWithOtherOption('sale-payment-method-select', 'sale-payment-method-custom'),
    recipient_name: document.getElementById('sale-recipient-name').value.trim(),
    delivery_country: getValueWithOtherOption('sale-delivery-country-select', 'sale-delivery-country-custom'),
    created_by: state.currentUser?.full_name || 'موظف النظام'
  };

  try {
    const res = await fetchWithAuth('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      if (payment_status === 'غير مدفوع') {
        showToast('تم تسجيل الطلب كـ (محجوز / غير مدفوع)');
      } else {
        showToast('تم تسجيل البيع وإصدار الفاتورة!');
        viewInvoice(data.id);
      }
      closeModal('modal-sale');
      loadSales();
      loadMisbahs();
      loadDashboard();
    } else {
      customAlert(data.error || 'فشل تسجيل الطلب', 'تنبيه', 'warning');
    }
  } catch (err) {
    customAlert('خطأ في الاتصال بالسيرفر', 'خطأ', 'error');
  }
}

function openPayReservedModal(saleId) {
  const sale = state.sales.find(s => s.id === saleId);
  if (!sale) return;

  document.getElementById('pay-reserved-sale-id').value = sale.id;
  document.getElementById('pay-res-cust-name').textContent = sale.customer_name;
  document.getElementById('pay-res-amount').textContent = parseFloat(sale.selling_price).toFixed(3);
  document.getElementById('pay-res-recipient').value = sale.recipient_name || '';

  openModal('modal-pay-reserved');
}

async function submitPayReserved(e) {
  e.preventDefault();
  const sid = document.getElementById('pay-reserved-sale-id').value;
  const payload = {
    payment_method: document.getElementById('pay-res-method').value,
    recipient_name: document.getElementById('pay-res-recipient').value.trim(),
    employee_name: state.currentUser?.full_name || 'موظف النظام'
  };

  try {
    const res = await fetchWithAuth(`/api/sales/${sid}/pay`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      showToast('تم تسجيل الدفع وإصدار الفاتورة!');
      closeModal('modal-pay-reserved');
      loadSales();
      loadMisbahs();
      loadDashboard();
      viewInvoice(data.id);
    }
  } catch (err) {
    customAlert('خطأ في الاتصال بالسيرفر', 'خطأ', 'error');
  }
}

// ==================== 5. الفواتير والـ PDF ====================
async function viewInvoice(saleId) {
  try {
    const res = await fetchWithAuth(`/api/sales/${saleId}`);
    const sale = await res.json();
    state.currentViewingSale = sale;

    document.getElementById('inv-store-name').textContent = state.settings.store_name || 'عبق الكهرب';
    document.getElementById('inv-store-phone').textContent = `${state.settings.phone || '+965 99887766'} | ${state.settings.tiktok_account || '@abaq_alkahrab'}`;
    document.getElementById('inv-logo-img').src = state.settings.invoice_logo || state.settings.system_logo || 'https://k.top4top.io/p_38967jw2l0.png?utm_source=chatgpt.com';

    document.getElementById('inv-code').textContent = sale.sale_code;
    document.getElementById('inv-misbah-order-code').textContent = sale.misbah_code || '-';
    document.getElementById('inv-date').textContent = sale.sale_date;
    document.getElementById('inv-customer-name').textContent = sale.customer_name || 'عميل معتمد';
    document.getElementById('inv-customer-phone').textContent = `${sale.customer_phone || ''} ${sale.customer_tiktok ? `(${sale.customer_tiktok})` : ''}`;
    document.getElementById('inv-delivery-country').textContent = sale.delivery_country || 'الكويت 🇰🇼';

    document.getElementById('inv-misbah-desc').textContent = `${sale.cut || ''} - ${sale.material || ''}`;
    document.getElementById('inv-misbah-weight').textContent = `${sale.weight_grams || 0}ج (${sale.bead_count || 33}خ)`;
    document.getElementById('inv-selling-price').textContent = parseFloat(sale.selling_price).toFixed(3);

    document.getElementById('inv-total').textContent = parseFloat(sale.selling_price).toFixed(3);
    document.getElementById('inv-paid').textContent = parseFloat(sale.paid_amount).toFixed(3);
    document.getElementById('inv-method').textContent = sale.payment_method;

    const recipientRow = document.getElementById('inv-recipient-row');
    if (sale.recipient_name) {
      recipientRow.classList.remove('hidden');
      document.getElementById('inv-recipient-name').textContent = sale.recipient_name;
    } else {
      recipientRow.classList.add('hidden');
    }

    document.getElementById('inv-footer-text').textContent = state.settings.invoice_footer || 'شكراً لتعاملكم مع عبق الكهرب. المسابيح المباعة أصلية ومفحوصة مخبرياً.';

    openModal('modal-invoice');
    refreshIcons();
  } catch (err) {
    customAlert('تعذر تحميل بيانات الفاتورة', 'خطأ', 'error');
  }
}

async function downloadInvoicePDF() {
  const renderArea = document.getElementById('invoice-render-area');
  if (!renderArea || !window.html2canvas || !window.jspdf) {
    customAlert('مكتبة توليد PDF غير متوفرة', 'خطأ', 'error');
    return;
  }

  showToast('جاري توليد ملف الفاتورة PDF...');

  try {
    const canvas = await html2canvas(renderArea, {
      scale: 3,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#18181b',
      logging: false,
      windowWidth: renderArea.scrollWidth,
      windowHeight: renderArea.scrollHeight
    });

    const imgData = canvas.toDataURL('image/jpeg', 0.97);
    const { jsPDF } = window.jspdf;

    const pdf = new jsPDF({
      orientation: 'portrait',
      unit: 'mm',
      format: 'a4'
    });

    const pdfW = pdf.internal.pageSize.getWidth();   // 210mm
    const pdfH = pdf.internal.pageSize.getHeight();  // 297mm

    // حساب النسبة لتملأ الصفحة بالكامل
    const imgAspect = canvas.height / canvas.width;
    const imgW = pdfW;
    const imgH = imgW * imgAspect;

    // إذا أقل من A4 نوسطها، وإذا أكبر نضغطها
    const finalH = Math.min(imgH, pdfH);
    const finalW = finalH < imgH ? (finalH / imgAspect) : imgW;
    const xOff = (pdfW - finalW) / 2;
    const yOff = (pdfH - finalH) / 2;

    pdf.addImage(imgData, 'JPEG', xOff, yOff, finalW, finalH);

    const saleCode = state.currentViewingSale ? state.currentViewingSale.sale_code : 'فاتورة';
    const orderCode = state.currentViewingSale ? state.currentViewingSale.misbah_code : '';
    const filename = `فاتورة_${orderCode || saleCode}_عبق_الكهرب.pdf`;

    pdf.save(filename);
    showToast('تم تحميل الفاتورة بنجاح');
  } catch (err) {
    console.error('PDF generation error:', err);
    customAlert('حدث خطأ أثناء تصيير ملف PDF', 'خطأ', 'error');
  }
}

function shareInvoiceWhatsApp() {
  if (!state.currentViewingSale) return;
  const sale = state.currentViewingSale;
  const text = `📿 *فاتورة شراء - عبق الكهرب*\n\n` +
               `رقم الفاتورة: ${sale.sale_code}\n` +
               `رقم الطلب: ${sale.misbah_code}\n` +
               `العميل: ${sale.customer_name}\n` +
               `المسباح: ${sale.cut} - ${sale.material}\n` +
               `السعر الإجمالي: ${parseFloat(sale.selling_price).toFixed(3)} د.ك\n` +
               `طريقة الدفع: ${sale.payment_method}\n` +
               `التاريخ: ${sale.sale_date}\n\n` +
               `شكراً لتعاملكم مع عبق الكهرب.`;

  const phone = (sale.customer_phone || '').replace(/[^0-9]/g, '');
  const url = phone ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}`;
  window.open(url, '_blank');
}

// ==================== 6. أصحاب المسابيح والمستحقات التفصيلية ====================
function filterOwnerItemsTab(filter) {
  state.ownersCurrentFilter = filter;

  document.querySelectorAll('.cycle-tab-btn').forEach(btn => {
    btn.classList.remove('active', 'bg-amber-500', 'text-zinc-950');
    btn.classList.add('bg-zinc-900');
  });

  const activeBtn = document.getElementById(`owner-item-tab-${filter}`);
  if (activeBtn) {
    activeBtn.classList.add('active', 'bg-amber-500', 'text-zinc-950');
    activeBtn.classList.remove('bg-zinc-900');
  }

  loadOwners();
}

async function loadOwners() {
  try {
    const params = new URLSearchParams();
    if (state.ownersCurrentFilter !== 'all') {
      params.append('tab', state.ownersCurrentFilter);
    }

    const [itemsRes, statsRes] = await Promise.all([
      fetchWithAuth(`/api/owners/items?${params.toString()}`),
      fetchWithAuth('/api/owners/stats')
    ]);

    state.ownerItems = await itemsRes.json();
    const stats = await statsRes.json();

    document.getElementById('owner-kpi-total-dues').textContent = stats.total_dues.toFixed(3);
    document.getElementById('owner-kpi-pending-dues').textContent = stats.pending_dues.toFixed(3);
    document.getElementById('owner-kpi-paid-dues').textContent = stats.paid_dues.toFixed(3);
    document.getElementById('owner-kpi-current-count').textContent = stats.current_misbahs_count.toLocaleString();
    document.getElementById('owner-kpi-settled-count').textContent = stats.settled_misbahs_count.toLocaleString();

    renderOwnerItemsTable(state.ownerItems);
  } catch (err) {
    console.error('Error loading owners dues:', err);
  }
}

function renderOwnerItemsTable(items) {
  const tbody = document.getElementById('owners-items-tbody');
  const emptyEl = document.getElementById('owners-items-empty');
  if (!tbody) return;

  if (!items || items.length === 0) {
    tbody.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  tbody.innerHTML = items.map(item => `
    <tr class="hover:bg-zinc-800/30 transition border-b border-zinc-800/50">
      <td class="py-3 px-3 text-center">
        ${item.owner_payment_status !== 'تم الدفع' ? `
          <input type="checkbox" onchange="toggleSelectOwnerItem(${item.id})" ${state.selectedOwnerItemIds.has(item.id) ? 'checked' : ''} class="w-4 h-4 rounded text-amber-500 bg-zinc-900 border-zinc-700">
        ` : `<span class="text-zinc-600">-</span>`}
      </td>
      <td class="py-3 px-3.5 font-bold text-amber-400 font-mono">${item.code}</td>
      <td class="py-3 px-3.5 font-bold text-zinc-100">${item.owner_name}</td>
      <td class="py-3 px-3.5 text-zinc-300">${item.cut || ''} - ${item.material || ''}</td>
      <td class="py-3 px-3.5 font-mono text-zinc-300 text-xs">${parseFloat(item.original_price).toFixed(3)} د.ك</td>
      <td class="py-3 px-3.5 font-mono text-amber-300 text-xs font-bold">${parseFloat(item.profit).toFixed(3)} د.ك</td>
      <td class="py-3 px-3.5 font-mono text-rose-300 text-xs font-bold">${parseFloat(item.supplier_due).toFixed(3)} د.ك</td>
      <td class="py-3 px-3.5 font-mono text-emerald-400 text-xs font-bold">${parseFloat(item.amount_paid).toFixed(3)} د.ك</td>
      <td class="py-3 px-3.5 font-mono text-rose-400 text-xs font-bold">${parseFloat(item.amount_pending).toFixed(3)} د.ك</td>
      <td class="py-3 px-3.5">${getOwnerPayBadge(item.owner_payment_status)}</td>
      <td class="py-3 px-3.5 font-mono text-zinc-400 text-xs">${item.owner_payment_date || '-'}</td>
      <td class="py-3 px-3.5 text-center no-print">
        <div class="flex items-center justify-center gap-1.5">
          ${item.owner_payment_status !== 'تم الدفع' ? `
            <button onclick="paySingleOwnerPiece(${item.id})" class="px-2.5 py-1 bg-amber-500 hover:bg-amber-600 text-zinc-950 font-black rounded text-xs">
              سداد
            </button>
          ` : `
            <button onclick="toggleOwnerPaymentStatus(${item.id}, 'تم الدفع')" class="px-2 py-1 bg-rose-950/60 hover:bg-rose-900 text-rose-400 font-bold rounded text-xs border border-rose-800/40 flex items-center gap-1" title="إعادة إلى غير مدفوع مع توثيق الحدث بالسجل">
              <i data-lucide="rotate-ccw" class="w-3 h-3"></i>
              <span>غير مدفوع ↩️</span>
            </button>
          `}
        </div>
      </td>
    </tr>
  `).join('');

  refreshIcons();
}

async function toggleOwnerPaymentStatus(misbahId, currentStatus) {
  const isCurrentlyPaid = currentStatus === 'تم الدفع';
  const targetLabel = isCurrentlyPaid ? 'غير مدفوع ↩️' : 'تم الدفع ✅';
  const confirmed = await customConfirm(
    `هل تريد تغيير حالة السداد للمورد إلى (${targetLabel})؟\nسيتم توثيق هذا الإجراء مع اسمك والتاريخ في السجل التاريخي للمسباح.`,
    'تأكيد تعديل حالة سداد المورد'
  );
  if (!confirmed) return;

  try {
    const res = await fetchWithAuth(`/api/owners/toggle-payment/${misbahId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        employee_name: state.currentUser?.full_name || 'موظف النظام'
      })
    });
    if (res.ok) {
      showToast(`تم تغيير حالة السداد إلى (${targetLabel}) وتوثيق الحدث بالسجل`);
      loadOwners();
      loadDashboard();
    }
  } catch (err) {
    customAlert('فشل تعديل حالة سداد المورد', 'خطأ', 'error');
  }
}

function toggleSelectOwnerItem(id) {
  if (state.selectedOwnerItemIds.has(id)) {
    state.selectedOwnerItemIds.delete(id);
  } else {
    state.selectedOwnerItemIds.add(id);
  }
}

function toggleSelectAllOwnerItems() {
  const selectAll = document.getElementById('select-all-owner-items').checked;
  const pendingItems = state.ownerItems.filter(i => i.owner_payment_status !== 'تم الدفع');

  if (selectAll) {
    pendingItems.forEach(i => state.selectedOwnerItemIds.add(i.id));
  } else {
    state.selectedOwnerItemIds.clear();
  }
  renderOwnerItemsTable(state.ownerItems);
}

async function paySelectedOwnerBatch() {
  const ids = Array.from(state.selectedOwnerItemIds);
  if (ids.length === 0) {
    customAlert('يرجى تحديد طلب واحد على الأقل للسداد', 'تنبيه', 'warning');
    return;
  }

  const confirmed = await customConfirm(`هل تريد سداد مستحقات (${ids.length}) طلبات محددة؟`, 'تأكيد السداد');
  if (!confirmed) return;

  try {
    const res = await fetchWithAuth('/api/owners/pay-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        misbah_ids: ids,
        employee_name: state.currentUser?.full_name || 'موظف النظام'
      })
    });
    if (res.ok) {
      showToast(`تم تسجيل سداد ${ids.length} طلبات بنجاح`);
      state.selectedOwnerItemIds.clear();
      loadOwners();
      loadDashboard();
    }
  } catch (err) {
    customAlert('فشل تسجيل السداد', 'خطأ', 'error');
  }
}

async function paySingleOwnerPiece(misbahId) {
  const confirmed = await customConfirm('هل تريد تسجيل سداد هذا الطلب للمورد؟', 'تأكيد السداد');
  if (!confirmed) return;

  try {
    const res = await fetchWithAuth('/api/owners/pay-batch', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        misbah_ids: [misbahId],
        employee_name: state.currentUser?.full_name || 'موظف النظام'
      })
    });
    if (res.ok) {
      showToast('تم سداد الطلب بنجاح');
      loadOwners();
      loadDashboard();
    }
  } catch (err) {
    customAlert('فشل تسجيل السداد', 'خطأ', 'error');
  }
}

// ==================== 7. العملاء واستيراد Excel ====================
async function loadCustomers() {
  const search = document.getElementById('customers-search')?.value || '';
  const reliability = document.getElementById('customers-reliability-filter')?.value || '';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (reliability) params.append('reliability', reliability);

  try {
    const res = await fetchWithAuth(`/api/customers?${params.toString()}`);
    const data = await res.json();
    state.customers = data;
    renderCustomersTable(data);
  } catch (err) {
    console.error('Error loading customers:', err);
  }
}

function renderCustomersTable(customers) {
  const tbody = document.getElementById('customers-tbody');
  if (!tbody) return;

  if (!customers || customers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" class="py-5 text-center text-zinc-500">لا يوجد أشخاص مطابقين</td></tr>`;
    return;
  }

  tbody.innerHTML = customers.map((c, idx) => `
    <tr class="hover:bg-zinc-800/30 transition border-b border-zinc-800/50">
      <td class="py-3 px-3.5 text-zinc-500 text-xs">${idx + 1}</td>
      <td class="py-3 px-3.5 font-bold text-zinc-100">
        <button onclick="viewCustomerProfile(${c.id})" class="hover:text-amber-400 hover:underline text-right transition">
          ${c.name}
        </button>
      </td>
      <td class="py-3 px-3.5 font-mono text-xs">
        <button onclick="viewCustomerProfile(${c.id})" class="text-emerald-400 hover:underline">
          ${c.country_code || '+965'} ${c.phone || '-'}
        </button>
      </td>
      <td class="py-3 px-3.5 text-amber-400 font-medium text-xs">
        ${c.tiktok_username ? `<a href="https://tiktok.com/@${c.tiktok_username.replace('@','')}" target="_blank" class="hover:underline">${c.tiktok_username}</a>` : '-'}
      </td>
      <td class="py-3 px-3.5 text-zinc-300">${c.country || 'الكويت'}</td>
      <td class="py-3 px-3.5 text-zinc-400 font-mono text-xs">${formatCustomerTimestamp(c.created_at)}</td>
      <td class="py-3 px-3.5">${getReliabilityBadge(c.reliability)}</td>
      <td class="py-3 px-3.5 text-center no-print whitespace-nowrap">
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="viewCustomerProfile(${c.id})" class="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500 text-amber-300 hover:text-zinc-950 font-bold rounded text-xs transition">
            السجل
          </button>
          <button onclick="editCustomer(${c.id})" class="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded">
            <i data-lucide="edit-3" class="w-4 h-4"></i>
          </button>
          <button onclick="deleteCustomer(${c.id})" class="p-1.5 bg-red-950/40 hover:bg-red-900 text-red-400 rounded">
            <i data-lucide="trash-2" class="w-4 h-4"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  applyRolePermissions();
  refreshIcons();
}

function formatCustomerTimestamp(ts) {
  if (!ts) return '-';
  try {
    const d = new Date(ts.replace(' ', 'T'));
    if (isNaN(d.getTime())) return ts;
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const mins = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${mins}`;
  } catch (e) {
    return ts;
  }
}

function downloadExcelTemplate() {
  if (!window.XLSX) {
    customAlert('مكتبة Excel غير متوفرة', 'خطأ', 'error');
    return;
  }

  const sampleData = [
    {
      "الاسم الكامل *": "محمد أحمد الشمري",
      "الهاتف ومفتاح الدولة": "+965 99112233",
      "Username TikTok": "@mohammad_sh",
      "الدولة": "الكويت",
      "حالة الاعتماد": "معتمد"
    },
    {
      "الاسم الكامل *": "سلطان فهد الدوسري",
      "الهاتف ومفتاح الدولة": "+966 501234567",
      "Username TikTok": "@sultan_d",
      "الدولة": "السعودية",
      "حالة الاعتماد": "معتمد"
    }
  ];

  const ws = XLSX.utils.json_to_sheet(sampleData);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "العملاء");
  XLSX.writeFile(wb, "نموذج_استيراد_عملاء_عبق_الكهرب.xlsx");
  showToast('تم تحميل نموذج Excel بنجاح');
}

function openImportCustomersModal() {
  document.getElementById('excel-import-file-input').value = '';
  document.getElementById('excel-inspection-results').classList.add('hidden');
  state.parsedExcelRows = [];
  state.validExcelRows = [];
  openModal('modal-import-excel');
}

function processSelectedExcelFile() {
  const fileInput = document.getElementById('excel-import-file-input');
  const file = fileInput?.files[0];
  if (!file) {
    customAlert('يرجى اختيار ملف Excel أولاً', 'تنبيه', 'warning');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const data = new Uint8Array(e.target.result);
      const workbook = XLSX.read(data, { type: 'array' });
      const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
      const rawRows = XLSX.utils.sheet_to_json(firstSheet);

      if (!rawRows || rawRows.length === 0) {
        customAlert('الملف المختار فارغ ولا يحتوي على صفوف بيانات', 'تنبيه', 'warning');
        return;
      }

      state.parsedExcelRows = rawRows;
      validateAndShowExcelResults(rawRows);
    } catch (err) {
      customAlert('تعذر قراءة ملف Excel، يرجى التأكد من سلامة وصيغة الملف', 'خطأ', 'error');
    }
  };
  reader.readAsArrayBuffer(file);
}

function validateAndShowExcelResults(rows) {
  const resultsContainer = document.getElementById('excel-inspection-results');
  const statusBox = document.getElementById('excel-status-box');
  const errorsList = document.getElementById('excel-errors-list');
  const confirmBtn = document.getElementById('btn-confirm-import');

  let valid = [];
  let errors = [];

  rows.forEach((r, idx) => {
    const rowNum = idx + 2;
    const name = (r['الاسم الكامل *'] || r['الاسم الكامل'] || r['الاسم'] || r['name'] || '').toString().trim();
    const phone = (r['الهاتف ومفتاح الدولة'] || r['الهاتف'] || r['رقم الهاتف'] || r['phone'] || '').toString().trim();
    const tiktok = (r['Username TikTok'] || r['تيك توك'] || r['tiktok'] || '').toString().trim();
    const country = (r['الدولة'] || r['country'] || 'الكويت').toString().trim();
    const reliability = (r['حالة الاعتماد'] || r['reliability'] || 'معتمد').toString().trim();

    if (!name) {
      errors.push({ row: rowNum, reason: 'الاسم الكامل مطلوب ومفقود في هذا الصف' });
      return;
    }

    valid.push({ name, phone, tiktok, country, reliability, row: rowNum });
  });

  state.validExcelRows = valid;
  resultsContainer.classList.remove('hidden');

  if (errors.length > 0) {
    statusBox.className = 'p-3 rounded-lg border bg-amber-950/30 border-amber-800/40 text-xs text-amber-300';
    statusBox.innerHTML = `⚠️ تم فحص (${rows.length}) صفوف: وجد (${valid.length}) صفوف صالحة و (${errors.length}) صفوف بها أخطاء.`;
    errorsList.innerHTML = errors.map(err => `
      <div class="p-2 bg-rose-950/30 border border-rose-900/40 rounded text-xs text-rose-300">
        <strong>الصف ${err.row}:</strong> ${err.reason}
      </div>
    `).join('');
  } else {
    statusBox.className = 'p-3 rounded-lg border bg-emerald-950/30 border-emerald-800/40 text-xs text-emerald-300';
    statusBox.innerHTML = `✅ جميع الصفوف (${valid.length}) صالحة وجاهزة للاستيراد دون أي أخطاء.`;
    errorsList.innerHTML = '';
  }

  if (valid.length === 0) {
    confirmBtn.classList.add('hidden');
  } else {
    confirmBtn.classList.remove('hidden');
    confirmBtn.textContent = `تأكيد استيراد (${valid.length}) عميل ✅`;
  }
}

async function confirmExecuteExcelImport() {
  if (state.validExcelRows.length === 0) return;

  try {
    const res = await fetchWithAuth('/api/customers/import', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: state.validExcelRows })
    });
    const data = await res.json();

    if (res.ok && data.success) {
      let msg = `تم استيراد ${data.imported_count} عميل بنجاح.`;
      if (data.duplicates && data.duplicates.length > 0) {
        msg += `\n(تم تخطي ${data.duplicates.length} عملاء مسجلين مسبقاً لمنع التكرار).`;
      }
      customAlert(msg, 'نتيجة الاستيراد', 'info');
      closeModal('modal-import-excel');
      loadCustomers();
    } else {
      customAlert(data.error || 'فشلت عملية الاستيراد', 'خطأ', 'error');
    }
  } catch (err) {
    customAlert('خطأ في الاتصال بالسيرفر', 'خطأ', 'error');
  }
}

function openNewCustomerModal() {
  document.getElementById('customer-form').reset();
  document.getElementById('customer-id').value = '';
  document.getElementById('cust-country-code').value = '+965';
  document.getElementById('cust-custom-country-code').classList.add('hidden');
  setValueWithOtherOption('cust-country-select', 'cust-country-custom', 'الكويت');
  document.getElementById('cust-reliability').value = 'معتمد';
  openModal('modal-customer');
}

function editCustomer(id) {
  const c = state.customers.find(item => item.id == id);
  if (!c) return;

  document.getElementById('customer-id').value = c.id;
  document.getElementById('cust-name').value = c.name || '';
  document.getElementById('cust-tiktok').value = c.tiktok_username || '';
  document.getElementById('cust-phone').value = c.phone || '';

  const codeSelect = document.getElementById('cust-country-code');
  const customCodeInput = document.getElementById('cust-custom-country-code');
  if (['+965', '+966', '+971', '+974', '+973', '+968'].includes(c.country_code)) {
    codeSelect.value = c.country_code;
    customCodeInput.classList.add('hidden');
    customCodeInput.value = '';
  } else if (c.country_code) {
    codeSelect.value = 'custom';
    customCodeInput.classList.remove('hidden');
    customCodeInput.value = c.country_code;
  }

  setValueWithOtherOption('cust-country-select', 'cust-country-custom', c.country, 'الكويت');
  document.getElementById('cust-reliability').value = c.reliability || 'معتمد';

  openModal('modal-customer');
}

async function saveCustomer(e) {
  e.preventDefault();
  const id = document.getElementById('customer-id').value;

  const codeSelectVal = document.getElementById('cust-country-code').value;
  const country_code = codeSelectVal === 'custom' ? (document.getElementById('cust-custom-country-code').value.trim() || '+965') : codeSelectVal;

  const payload = {
    name: document.getElementById('cust-name').value.trim(),
    tiktok_username: document.getElementById('cust-tiktok').value.trim(),
    phone: document.getElementById('cust-phone').value.trim(),
    country_code: country_code,
    country: getValueWithOtherOption('cust-country-select', 'cust-country-custom'),
    reliability: document.getElementById('cust-reliability').value
  };

  const url = id ? `/api/customers/${id}` : '/api/customers';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetchWithAuth(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast('تم حفظ بيانات الشخص بنجاح');
      closeModal('modal-customer');
      loadCustomers();
    } else {
      const err = await res.json();
      customAlert(err.error || 'حدث خطأ أثناء الحفظ', 'خطأ', 'error');
    }
  } catch (err) {
    customAlert('خطأ في الاتصال بالسيرفر', 'خطأ', 'error');
  }
}

async function deleteCustomer(id) {
  const confirmed = await customConfirm('هل أنت متأكد من حذف هذا الشخص؟', 'تأكيد الحذف');
  if (!confirmed) return;

  try {
    const res = await fetchWithAuth(`/api/customers/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('تم حذف الشخص بنجاح');
      loadCustomers();
    } else {
      customAlert('فشل حذف الشخص', 'خطأ', 'error');
    }
  } catch (err) {
    customAlert('خطأ في الاتصال بالسيرفر', 'خطأ', 'error');
  }
}

async function viewCustomerProfile(id) {
  try {
    const res = await fetchWithAuth(`/api/customers/${id}`);
    const customer = await res.json();
    if (!res.ok) {
      customAlert(customer.error || 'تعذر جلب بيانات الشخص', 'خطأ', 'error');
      return;
    }

    document.getElementById('cust-profile-name').textContent = customer.name;
    document.getElementById('cust-profile-phone').textContent = `${customer.country_code || '+965'} ${customer.phone || '-'}`;
    document.getElementById('cust-profile-tiktok').textContent = customer.tiktok_username || '-';
    document.getElementById('cust-profile-country').textContent = customer.country || 'الكويت';

    const regDateStr = formatCustomerTimestamp(customer.created_at);
    document.getElementById('cust-profile-registration-date').textContent = `تم تسجيل العميل بتاريخ: ${regDateStr}`;

    const sales = customer.sales_history || [];
    const totalSpent = sales.reduce((acc, s) => acc + parseFloat(s.selling_price || 0), 0);
    document.getElementById('cust-profile-total-spent').textContent = totalSpent.toFixed(3);
    document.getElementById('cust-profile-pending-dues').textContent = parseFloat(customer.dues_summary?.pending_dues || 0).toFixed(3);

    const salesTbody = document.getElementById('cust-profile-sales-tbody');
    const allCustomerOrders = [...(customer.sales_history || []), ...(customer.reserved_orders || [])];

    if (allCustomerOrders.length === 0) {
      salesTbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-zinc-500">لا توجد عمليات سابقة</td></tr>`;
    } else {
      salesTbody.innerHTML = allCustomerOrders.map(s => `
        <tr class="hover:bg-zinc-800/30 transition">
          <td class="py-2.5 px-3 font-bold text-amber-400 font-mono">${s.misbah_code || s.sale_code || '-'}</td>
          <td class="py-2.5 px-3">${getOrderStatusBadge(s.status)}</td>
          <td class="py-2.5 px-3 text-zinc-200">${s.cut || ''} - ${s.material || ''}</td>
          <td class="py-2.5 px-3 font-bold text-zinc-100 font-mono">${parseFloat(s.selling_price).toFixed(3)} د.ك</td>
          <td class="py-2.5 px-3 text-zinc-400 font-mono text-xs">${s.sale_date}</td>
        </tr>
      `).join('');
    }

    const suppliedTbody = document.getElementById('cust-profile-supplied-tbody');
    const supplied = customer.supplied_misbahs || [];
    if (supplied.length === 0) {
      suppliedTbody.innerHTML = `<tr><td colspan="5" class="py-4 text-center text-zinc-500">لم يقم بتوريد أي مسابيح بعد</td></tr>`;
    } else {
      suppliedTbody.innerHTML = supplied.map(m => {
        const isReturned = m.status === 'مسترجع' || m.return_reason;
        const dueAmount = isReturned ? 0 : parseFloat(m.supplier_due || (m.original_price - m.profit));
        return `
          <tr class="hover:bg-zinc-800/30 transition border-b border-zinc-800/50">
            <td class="py-2.5 px-3 font-bold text-amber-400 font-mono">${m.code}</td>
            <td class="py-2.5 px-3 text-zinc-200">${m.cut || ''} - ${m.material || ''}</td>
            <td class="py-2.5 px-3">${getMisbahStatusBadge(m.status, m.sub_status, m.return_reason)}</td>
            <td class="py-2.5 px-3 font-bold ${isReturned ? 'text-zinc-500' : 'text-rose-300'} font-mono">${dueAmount.toFixed(3)} د.ك</td>
            <td class="py-2.5 px-3">${getOwnerPayBadge(m.owner_payment_status)}</td>
          </tr>
        `;
      }).join('');
    }

    openModal('modal-customer-profile');
    refreshIcons();
  } catch (err) {
    customAlert('تعذر تحميل السجل الموحد', 'خطأ', 'error');
  }
}

// ==================== 8. التقارير المالية (4 تقارير موحدة في صفحة واحدة) ====================
async function loadAllFinancialReports() {
  const salesBox = document.getElementById('report-sales-container');
  const profitsBox = document.getElementById('report-profits-container');
  const inventoryBox = document.getElementById('report-inventory-container');
  const duesBox = document.getElementById('report-dues-container');

  if (!salesBox || !profitsBox || !inventoryBox || !duesBox) return;

  salesBox.innerHTML = `<div class="py-3 text-center text-zinc-500">جاري تحميل تقرير المبيعات...</div>`;
  profitsBox.innerHTML = `<div class="py-3 text-center text-zinc-500">جاري تحميل تقرير الأرباح...</div>`;
  inventoryBox.innerHTML = `<div class="py-3 text-center text-zinc-500">جاري تحميل تقرير المخزون...</div>`;
  duesBox.innerHTML = `<div class="py-3 text-center text-zinc-500">جاري تحميل تقرير المستحقات...</div>`;

  try {
    const [salesRes, misbahsRes, duesStatsRes] = await Promise.all([
      fetchWithAuth('/api/sales'),
      fetchWithAuth('/api/misbahs'),
      fetchWithAuth('/api/owners/stats')
    ]);

    const allSales = await salesRes.json();
    const misbahs = await misbahsRes.json();
    const duesStats = await duesStatsRes.json();

    const paidSales = allSales.filter(s => s.status === 'محجوز / مدفوع');
    const totalSalesAmount = paidSales.reduce((acc, s) => acc + parseFloat(s.selling_price || 0), 0);
    const totalProfitAmount = paidSales.reduce((acc, s) => acc + parseFloat(s.profit || 0), 0);
    const totalCostValue = misbahs.reduce((acc, m) => acc + parseFloat(m.original_price || 0), 0);

    // 1. تقرير المبيعات
    salesBox.innerHTML = `
      <div class="flex justify-between items-center border-b border-zinc-800 pb-3">
        <h4 class="font-bold text-sm text-zinc-100 flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
          <span>1. تقرير المبيعات المدفوعة</span>
        </h4>
        <span class="text-xs text-amber-400 font-bold">${paidSales.length} طلب مدفوع</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-center">
        <div class="p-3.5 bg-zinc-900 rounded-lg border border-zinc-800">
          <span class="text-xs text-zinc-400 block mb-1">إجمالي المبيعات المدفوعة</span>
          <span class="text-xl font-black text-amber-400">${totalSalesAmount.toFixed(3)} د.ك</span>
        </div>
        <div class="p-3.5 bg-zinc-900 rounded-lg border border-zinc-800">
          <span class="text-xs text-zinc-400 block mb-1">متوسط قيمة الفاتورة</span>
          <span class="text-xl font-black text-zinc-100">${paidSales.length > 0 ? (totalSalesAmount / paidSales.length).toFixed(3) : '0.000'} د.ك</span>
        </div>
      </div>
    `;

    // 2. تقرير الأرباح
    profitsBox.innerHTML = `
      <div class="flex justify-between items-center border-b border-zinc-800 pb-3">
        <h4 class="font-bold text-sm text-zinc-100 flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
          <span>2. تقرير الأرباح المحققة</span>
        </h4>
        <span class="text-xs text-emerald-400 font-bold">صافي الأرباح</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-center">
        <div class="p-3.5 bg-zinc-900 rounded-lg border border-zinc-800">
          <span class="text-xs text-zinc-400 block mb-1">إجمالي المبيعات</span>
          <span class="text-xl font-black text-amber-400">${totalSalesAmount.toFixed(3)} د.ك</span>
        </div>
        <div class="p-3.5 bg-zinc-900 rounded-lg border border-emerald-900/30 bg-emerald-950/10">
          <span class="text-xs text-emerald-400 block mb-1">صافي أرباح النظام</span>
          <span class="text-xl font-black text-emerald-400">${totalProfitAmount.toFixed(3)} د.ك</span>
        </div>
      </div>
    `;

    // 3. تقرير المخزون
    inventoryBox.innerHTML = `
      <div class="flex justify-between items-center border-b border-zinc-800 pb-3">
        <h4 class="font-bold text-sm text-zinc-100 flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
          <span>3. تقرير المخزون</span>
        </h4>
        <span class="text-xs text-zinc-400 font-bold">حالة القطع</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
        <div class="p-3.5 bg-zinc-900 rounded-lg border border-zinc-800">
          <span class="text-xs text-zinc-400 block mb-1">القطع الحالية بالمخزون</span>
          <span class="text-xl font-black text-emerald-400">${misbahs.filter(m => m.status === 'حالي').length}</span>
        </div>
        <div class="p-3.5 bg-zinc-900 rounded-lg border border-zinc-800">
          <span class="text-xs text-zinc-400 block mb-1">القطع المباعة</span>
          <span class="text-xl font-black text-blue-400">${misbahs.filter(m => m.status === 'مباع').length}</span>
        </div>
        <div class="p-3.5 bg-zinc-900 rounded-lg border border-zinc-800">
          <span class="text-xs text-amber-400 block mb-1">قيمة التكلفة الإجمالية</span>
          <span class="text-xl font-black text-amber-400">${totalCostValue.toFixed(3)} د.ك</span>
        </div>
      </div>
    `;

    // 4. تقرير المستحقات
    duesBox.innerHTML = `
      <div class="flex justify-between items-center border-b border-zinc-800 pb-3">
        <h4 class="font-bold text-sm text-zinc-100 flex items-center gap-2">
          <span class="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
          <span>4. تقرير مستحقات الموردين (المباع والمستلم)</span>
        </h4>
        <span class="text-xs text-rose-400 font-bold">تسويات الموردين</span>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 text-center">
        <div class="p-3.5 bg-zinc-900 rounded-lg border border-zinc-800">
          <span class="text-xs text-zinc-400 block mb-1">إجمالي المستحق للموردين</span>
          <span class="text-xl font-black text-zinc-100">${duesStats.total_dues.toFixed(3)} د.ك</span>
        </div>
        <div class="p-3.5 bg-zinc-900 rounded-lg border border-emerald-900/30">
          <span class="text-xs text-emerald-400 block mb-1">المسدد للموردين</span>
          <span class="text-xl font-black text-emerald-400">${duesStats.paid_dues.toFixed(3)} د.ك</span>
        </div>
        <div class="p-3.5 bg-zinc-900 rounded-lg border border-rose-900/40 bg-rose-950/10">
          <span class="text-xs text-rose-400 block mb-1">المتبقي (واجب السداد)</span>
          <span class="text-xl font-black text-rose-400">${duesStats.pending_dues.toFixed(3)} د.ك</span>
        </div>
      </div>
    `;

    refreshIcons();
  } catch (err) {
    console.error('Error loading financial reports:', err);
  }
}

// ==================== 9. المستخدمون والصلاحيات المخصصة ====================
async function loadUsers() {
  try {
    const res = await fetchWithAuth('/api/users');
    const data = await res.json();
    state.users = data;

    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;

    tbody.innerHTML = data.map((u, idx) => `
      <tr class="hover:bg-zinc-800/30 transition border-b border-zinc-800/50">
        <td class="py-3 px-3.5 text-zinc-500 text-xs">${idx + 1}</td>
        <td class="py-3 px-3.5 font-bold text-zinc-100">${u.username}</td>
        <td class="py-3 px-3.5 text-zinc-300 font-medium">${u.full_name}</td>
        <td class="py-3 px-3.5">${getUserRoleBadge(u.role)}</td>
        <td class="py-3 px-3.5 font-mono text-xs text-zinc-400">${formatPermissionsSummary(u.permissions)}</td>
        <td class="py-3 px-3.5">
          ${u.is_active !== 0 ? '<span class="text-emerald-400 font-bold">مفعل ✅</span>' : '<span class="text-rose-400 font-bold">معطل ⛔</span>'}
        </td>
        <td class="py-3 px-3.5 text-center no-print">
          <div class="flex items-center justify-center gap-1.5">
            <button onclick="editUserModal(${u.id})" class="px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500 text-amber-400 hover:text-zinc-950 font-bold rounded text-xs transition border border-amber-500/30">
              تعديل الصلاحيات
            </button>
            ${u.id !== 1 ? `
              <button onclick="deleteUser(${u.id})" class="p-1.5 bg-red-950/40 hover:bg-red-900 text-red-400 rounded" title="حذف">
                <i data-lucide="trash-2" class="w-4 h-4"></i>
              </button>
            ` : ''}
          </div>
        </td>
      </tr>
    `).join('');

    refreshIcons();
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function formatPermissionsSummary(perms) {
  if (!perms) return 'افتراضي';
  const labels = {
    misbahs: perms.misbahs === 'edit' ? 'المخزون: كامل' : (perms.misbahs === 'view' ? 'المخزون: رؤية' : 'المخزون: ⛔'),
    sales: perms.sales === 'edit' ? 'الطلبات: كامل' : (perms.sales === 'view' ? 'الطلبات: رؤية' : 'الطلبات: ⛔'),
    customers: perms.customers === 'edit' ? 'العملاء: كامل' : (perms.customers === 'view' ? 'العملاء: رؤية' : 'العملاء: ⛔'),
    owners: perms.owners === 'edit' ? 'الموردين: كامل' : (perms.owners === 'view' ? 'الموردين: رؤية' : 'الموردين: ⛔')
  };
  return Object.values(labels).join(' | ');
}

function onUserRoleChange() {
  const role = document.getElementById('usr-role').value;
  setPermissionsMatrixByRole(role);
}

function setPermissionsMatrixByRole(role) {
  const perms = {
    Admin: { dashboard: 'view', misbahs: 'edit', sales: 'edit', customers: 'edit', owners: 'edit', reports: 'view', users: 'edit', settings: 'edit' },
    Manager: { dashboard: 'view', misbahs: 'edit', sales: 'edit', customers: 'edit', owners: 'edit', reports: 'view', users: 'edit', settings: 'edit' },
    Employee: { dashboard: 'view', misbahs: 'edit', sales: 'edit', customers: 'edit', owners: 'view', reports: 'none', users: 'none', settings: 'none' },
    'View Only': { dashboard: 'view', misbahs: 'view', sales: 'view', customers: 'view', owners: 'view', reports: 'view', users: 'none', settings: 'none' }
  }[role] || { dashboard: 'view', misbahs: 'edit', sales: 'edit', customers: 'edit', owners: 'view', reports: 'none', users: 'none', settings: 'none' };

  for (const page in perms) {
    const select = document.getElementById(`perm-${page}`);
    if (select) select.value = perms[page];
  }
}

function openNewUserModal() {
  document.getElementById('modal-user-title').textContent = 'إضافة موظف جديد وتحديد الصلاحيات';
  document.getElementById('user-form').reset();
  document.getElementById('user-id').value = '';
  document.getElementById('usr-role').value = 'Employee';
  document.getElementById('usr-is-active').value = '1';
  setPermissionsMatrixByRole('Employee');
  openModal('modal-user');
}

function editUserModal(id) {
  const u = state.users.find(item => item.id == id);
  if (!u) return;

  document.getElementById('modal-user-title').textContent = `تعديل الموظف وصلاحياته (${u.username})`;
  document.getElementById('user-id').value = u.id;
  document.getElementById('usr-username').value = u.username;
  document.getElementById('usr-fullname').value = u.full_name;
  document.getElementById('usr-password').value = '';
  document.getElementById('usr-role').value = u.role;
  document.getElementById('usr-is-active').value = u.is_active !== undefined ? u.is_active.toString() : '1';

  const perms = u.permissions || {};
  for (const page of ['dashboard', 'misbahs', 'sales', 'customers', 'owners', 'reports', 'users', 'settings']) {
    const select = document.getElementById(`perm-${page}`);
    if (select) select.value = perms[page] || 'none';
  }

  openModal('modal-user');
}

async function saveUser(e) {
  e.preventDefault();
  const id = document.getElementById('user-id').value;
  const password = document.getElementById('usr-password').value;

  const permissions = {};
  for (const page of ['dashboard', 'misbahs', 'sales', 'customers', 'owners', 'reports', 'users', 'settings']) {
    const select = document.getElementById(`perm-${page}`);
    if (select) permissions[page] = select.value;
  }

  const payload = {
    username: document.getElementById('usr-username').value.trim(),
    full_name: document.getElementById('usr-fullname').value.trim(),
    role: document.getElementById('usr-role').value,
    is_active: parseInt(document.getElementById('usr-is-active').value),
    permissions: permissions
  };

  if (password) payload.password = password;

  const url = id ? `/api/users/${id}` : '/api/users';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetchWithAuth(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast('تم حفظ الموظف والصلاحيات بنجاح');
      closeModal('modal-user');
      loadUsers();
    } else {
      const err = await res.json();
      customAlert(err.error || 'فشلت عملية الحفظ', 'خطأ', 'error');
    }
  } catch (err) {
    customAlert('خطأ في الاتصال بالسيرفر', 'خطأ', 'error');
  }
}

async function deleteUser(id) {
  const confirmed = await customConfirm('هل أنت متأكد من حذف هذا المستخدم؟', 'تأكيد الحذف');
  if (!confirmed) return;

  try {
    const res = await fetchWithAuth(`/api/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      showToast('تم حذف المستخدم بنجاح');
      loadUsers();
    } else {
      customAlert(data.error || 'فشل الحذف', 'تنبيه', 'warning');
    }
  } catch (err) {
    customAlert('خطأ في الاتصال بالسيرفر', 'خطأ', 'error');
  }
}

// ==================== 10. الإعدادات والهوية ====================
async function loadSettings() {
  try {
    const res = await fetch('/api/settings', {
      headers: { 'X-User-Role': state.currentUser?.role || 'Admin' }
    });
    if (res.ok) {
      const data = await res.json();
      state.settings = { ...state.settings, ...data };
      applySettingsToUI();
    }
  } catch (e) {}
}

function applySettingsToUI() {
  const sysLogo = state.settings.system_logo || 'https://k.top4top.io/p_38967jw2l0.png?utm_source=chatgpt.com';
  const invLogo = state.settings.invoice_logo || sysLogo;

  const sidebarLogo = document.getElementById('sidebar-logo-img');
  const topbarLogo = document.getElementById('topbar-logo-img');
  const loginLogo = document.getElementById('login-logo-img');
  const invLogoEl = document.getElementById('inv-logo-img');
  const previewSys = document.getElementById('preview-system-logo');
  const previewInv = document.getElementById('preview-invoice-logo');

  if (sidebarLogo) sidebarLogo.src = sysLogo;
  if (topbarLogo) topbarLogo.src = sysLogo;
  if (loginLogo) loginLogo.src = sysLogo;
  if (invLogoEl) invLogoEl.src = invLogo;
  if (previewSys) previewSys.src = sysLogo;
  if (previewInv) previewInv.src = invLogo;

  const storeTitle = document.getElementById('sidebar-store-name');
  if (storeTitle) storeTitle.textContent = state.settings.store_name || 'عبق الكهرب';
  const loginTitle = document.getElementById('login-title-name');
  if (loginTitle) loginTitle.textContent = state.settings.store_name || 'عبق الكهرب';
}

function fillSettingsForm() {
  document.getElementById('setting-store-name').value = state.settings.store_name || 'عبق الكهرب';
  document.getElementById('setting-currency').value = state.settings.currency || 'د.ك';
  document.getElementById('setting-phone').value = state.settings.phone || '+965 99887766';
  document.getElementById('setting-tiktok').value = state.settings.tiktok_account || '@abaq_alkahrab';
  document.getElementById('setting-invoice-footer').value = state.settings.invoice_footer || 'شكراً لتعاملكم مع عبق الكهرب. المسابيح المباعة أصلية ومفحوصة.';
  applySettingsToUI();
}

function handleLogoUpload(event, type) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const base64Data = e.target.result;
    if (type === 'system') {
      state.settings.system_logo = base64Data;
      document.getElementById('preview-system-logo').src = base64Data;
    } else {
      state.settings.invoice_logo = base64Data;
      document.getElementById('preview-invoice-logo').src = base64Data;
    }
    showToast(`تم تحميل صورة اللوقو. اضغط حفظ للتثبيت.`);
  };
  reader.readAsDataURL(file);
}

function resetLogoToDefault(type) {
  const defaultLogo = 'https://k.top4top.io/p_38967jw2l0.png?utm_source=chatgpt.com';
  if (type === 'system') {
    state.settings.system_logo = defaultLogo;
    document.getElementById('preview-system-logo').src = defaultLogo;
  } else {
    state.settings.invoice_logo = defaultLogo;
    document.getElementById('preview-invoice-logo').src = defaultLogo;
  }
}

async function saveIdentityLogos() {
  const payload = {
    system_logo: state.settings.system_logo,
    invoice_logo: state.settings.invoice_logo
  };

  try {
    const res = await fetchWithAuth('/api/settings/identity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast('تم حفظ الشعار على السيرفر بنجاح');
      applySettingsToUI();
    }
  } catch (err) {
    customAlert('خطأ في الاتصال بالسيرفر', 'خطأ', 'error');
  }
}

async function saveSettings(e) {
  e.preventDefault();
  const payload = {
    store_name: document.getElementById('setting-store-name').value,
    currency: document.getElementById('setting-currency').value,
    phone: document.getElementById('setting-phone').value,
    tiktok_account: document.getElementById('setting-tiktok').value,
    invoice_footer: document.getElementById('setting-invoice-footer').value
  };

  try {
    const res = await fetchWithAuth('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      state.settings = { ...state.settings, ...payload };
      showToast('تم حفظ إعدادات النظام بنجاح');
      applySettingsToUI();
    }
  } catch (err) {
    customAlert('خطأ في الاتصال بالسيرفر', 'خطأ', 'error');
  }
}

async function downloadBackup() {
  try {
    const res = await fetchWithAuth('/api/backup');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `abaq_alkahrab_full_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تنزيل النسخة الاحتياطية بنجاح');
  } catch (err) {
    customAlert('فشل تنزيل النسخة الاحتياطية', 'خطأ', 'error');
  }
}

async function restoreBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  const confirmed = await customConfirm('تحذير: استعادة النسخة الاحتياطية ستستبدل البيانات الحالية. هل تريد المتابعة؟', 'تأكيد الاسترجاع');
  if (!confirmed) {
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const json = JSON.parse(event.target.result);
      const res = await fetchWithAuth('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: json.data || json })
      });
      if (res.ok) {
        showToast('تمت استعادة قاعدة البيانات بنجاح');
        setTimeout(() => location.reload(), 1000);
      }
    } catch (err) {
      customAlert('ملف النسخة الاحتياطية غير صالح', 'خطأ', 'error');
    }
  };
  reader.readAsText(file);
}

// ==================== وظائف مساعدة و Badges ====================
function getMisbahStatusBadge(status, sub_status, return_reason) {
  if (sub_status === 'محجوز') {
    return `<span class="px-2.5 py-1 rounded text-xs font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">محجوز ⏳</span>`;
  }
  if (status === 'مسترجع' || (return_reason && status !== 'مباع' && sub_status !== 'محجوز')) {
    return `<span class="px-2.5 py-1 rounded text-xs font-bold bg-rose-950/60 text-rose-400 border border-rose-800/40">مسترجع ↩️</span>`;
  }
  if (status === 'حالي') {
    return `<span class="px-2.5 py-1 rounded text-xs font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">حالي بالمخزون</span>`;
  }
  if (status === 'مباع') {
    return `<span class="px-2.5 py-1 rounded text-xs font-bold bg-blue-950/60 text-blue-400 border border-blue-800/40">مباع 📄</span>`;
  }
  return `<span class="px-2.5 py-1 rounded text-xs font-bold bg-zinc-800 text-zinc-400">${status}</span>`;
}

function getOrderStatusBadge(status) {
  if (status === 'محجوز / غير مدفوع' || status === 'محجوز') {
    return `<span class="px-2.5 py-1 rounded text-xs font-bold bg-amber-950/60 text-amber-400 border border-amber-800/40">محجوز / غير مدفوع ⏳</span>`;
  }
  if (status === 'محجوز / مدفوع') {
    return `<span class="px-2.5 py-1 rounded text-xs font-bold bg-blue-950/60 text-blue-400 border border-blue-800/40">محجوز / مدفوع 📄</span>`;
  }
  if (status === 'مدفوع') {
    return `<span class="px-2.5 py-1 rounded text-xs font-bold bg-emerald-950/80 text-emerald-400 border border-emerald-700/50">مدفوع ✅</span>`;
  }
  if (status === 'مسترجع') {
    return `<span class="px-2.5 py-1 rounded text-xs font-bold bg-rose-950/60 text-rose-400 border border-rose-800/40">مسترجع ↩️</span>`;
  }
  return `<span class="px-2.5 py-1 rounded text-xs font-bold bg-zinc-800 text-zinc-400">${status}</span>`;
}

function getReceiptStatusBadge(status) {
  if (status === 'تم الاستلام') {
    return `<span class="px-2.5 py-1 rounded text-xs font-bold bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">تم الاستلام ✅</span>`;
  }
  return `<span class="px-2.5 py-1 rounded text-xs font-semibold bg-zinc-800 text-zinc-400 border border-zinc-700">لم يتم الاستلام</span>`;
}

function getReliabilityBadge(reliability) {
  if (reliability === 'معتمد') return `<span class="px-2.5 py-0.5 rounded text-xs font-bold bg-emerald-950/50 text-emerald-400 border border-emerald-800/30">معتمد ✅</span>`;
  return `<span class="px-2.5 py-0.5 rounded text-xs font-bold bg-red-950/50 text-red-400 border border-red-800/30">محظور ⛔</span>`;
}

function getOwnerPayBadge(status) {
  if (status === 'تم الدفع') return `<span class="text-emerald-400 font-bold text-xs">تم السداد ✅</span>`;
  return `<span class="text-rose-400 font-bold text-xs">متبقي</span>`;
}

function getUserRoleBadge(role) {
  const styles = {
    Admin: 'bg-amber-950/50 text-amber-400 border-amber-800/40',
    Manager: 'bg-purple-950/50 text-purple-400 border-purple-800/40',
    Employee: 'bg-emerald-950/50 text-emerald-400 border-emerald-800/40',
    'View Only': 'bg-zinc-800 text-zinc-400 border-zinc-700'
  };
  return `<span class="px-2.5 py-0.5 rounded text-xs font-bold border ${styles[role] || 'bg-zinc-800 text-zinc-300'}">${role === 'Admin' ? 'Admin (Owner)' : role}</span>`;
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) {
    el.classList.remove('hidden');
    refreshIcons();
  }
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('hidden');
}

function handleGlobalSearch(e) {
  if (e.key === 'Enter') {
    const val = e.target.value.trim();
    if (!val) return;
    switchTab('misbahs');
    const mSearch = document.getElementById('misbahs-search');
    if (mSearch) {
      mSearch.value = val;
      loadMisbahs();
    }
  }
}

function exportTableToExcel(tableId, filename = 'export') {
  const table = document.getElementById(tableId);
  if (!table) return;

  if (window.XLSX) {
    const wb = XLSX.utils.table_to_book(table, { sheet: "Sheet1" });
    XLSX.writeFile(wb, `${filename}_${new Date().toISOString().slice(0,10)}.xlsx`);
    showToast('تم تصدير ملف Excel بنجاح');
  } else {
    customAlert('مكتبة التصدير غير متوفرة', 'خطأ', 'error');
  }
}

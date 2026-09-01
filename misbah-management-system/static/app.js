// ==========================================================
// نظام "عبق الكهرب" الداخلي - المنطق البرمجي والتفاعلي
// ==========================================================

const state = {
  currentUser: {
    id: 1,
    username: 'admin',
    full_name: 'مدير النظام (أبو فهد)',
    role: 'Admin',
    phone: '96599001122'
  },
  currentTab: 'dashboard',
  misbahStatusFilter: '',
  customers: [],
  misbahs: [],
  sales: [],
  ownersData: null,
  users: [],
  settings: {},
  cutsChart: null
};

// ==================== التهيئة عند تحميل الصفحة ====================
document.addEventListener('DOMContentLoaded', () => {
  // استعادة جلسة المستخدم من الـ Storage
  const savedUser = localStorage.getItem('abaq_user');
  if (savedUser) {
    try {
      state.currentUser = JSON.parse(savedUser);
    } catch (e) {}
  }

  updateUserUI();
  refreshIcons();
  
  // تحميل الإعدادات أولاً ثم لوحة التحكم
  loadSettings().then(() => {
    switchTab('dashboard');
  });

  // مزامنة دورية للبيانات بين مختلف الأجهزة كل 30 ثانية
  setInterval(() => {
    if (state.currentTab === 'dashboard') {
      loadDashboard();
    }
  }, 30000);
});

function refreshIcons() {
  if (window.lucide) {
    window.lucide.createIcons();
  }
}

// ==================== التجاوب مع الموبايل والقائمة الجانبية ====================
function toggleMobileSidebar() {
  const sidebar = document.getElementById('main-sidebar');
  const backdrop = document.getElementById('mobile-backdrop');
  
  if (sidebar.classList.contains('translate-x-full')) {
    sidebar.classList.remove('translate-x-full');
    backdrop.classList.remove('hidden');
  } else {
    sidebar.classList.add('translate-x-full');
    backdrop.classList.add('hidden');
  }
}

function closeMobileSidebarIfOpen() {
  const sidebar = document.getElementById('main-sidebar');
  const backdrop = document.getElementById('mobile-backdrop');
  if (window.innerWidth < 768) {
    sidebar.classList.add('translate-x-full');
    backdrop.classList.add('hidden');
  }
}

// ==================== معالجة خيار "أخرى" الديناميكي ====================
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

// ==================== التنبيهات Toast Notifications ====================
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  const toast = document.createElement('div');
  
  const bgClass = type === 'success' ? 'bg-zinc-800 text-amber-400 border border-amber-500/40' : (type === 'error' ? 'bg-red-950 text-red-300 border border-red-800' : 'bg-zinc-800 text-zinc-200 border border-zinc-700');
  const iconName = type === 'success' ? 'check-circle' : (type === 'error' ? 'alert-circle' : 'info');

  toast.className = `p-3.5 rounded-xl shadow-2xl flex items-center gap-2.5 text-xs font-bold transition-all duration-300 pointer-events-auto transform translate-y-2 opacity-0 ${bgClass}`;
  toast.innerHTML = `<i data-lucide="${iconName}" class="w-4 h-4 text-amber-400"></i><span>${message}</span>`;
  
  container.appendChild(toast);
  refreshIcons();

  setTimeout(() => {
    toast.classList.remove('translate-y-2', 'opacity-0');
  }, 10);

  setTimeout(() => {
    toast.classList.add('opacity-0', 'translate-y-2');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// ==================== المستخدمين والصلاحيات ====================
function updateUserUI() {
  const nameEl = document.getElementById('current-user-name');
  const roleEl = document.getElementById('current-user-role');
  const avatarEl = document.getElementById('user-avatar');

  if (nameEl) nameEl.textContent = state.currentUser.full_name;
  if (roleEl) roleEl.textContent = state.currentUser.role;
  if (avatarEl) {
    const initials = state.currentUser.full_name.split(' ').map(n => n[0]).slice(0, 2).join('');
    avatarEl.textContent = initials || 'ع';
  }

  applyRolePermissions();
}

function applyRolePermissions() {
  const role = state.currentUser.role;
  const isViewOnly = role === 'View Only';
  const isAdmin = role === 'Admin';

  document.querySelectorAll('.view-only-hidden').forEach(el => {
    el.style.display = isViewOnly ? 'none' : '';
  });

  document.querySelectorAll('.admin-only').forEach(el => {
    el.style.display = isAdmin ? '' : 'none';
  });
}

function openLoginModal() {
  openModal('modal-login');
}

async function handleLogin(e) {
  e.preventDefault();
  const username = document.getElementById('login-username').value;
  const password = document.getElementById('login-password').value;

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
      updateUserUI();
      closeModal('modal-login');
      showToast(`مرحباً بك في عبق الكهرب، ${data.user.full_name}`);
      switchTab(state.currentTab);
    } else {
      showToast(data.error || 'فشل تسجيل الدخول', 'error');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالخادم المركزي', 'error');
  }
}

function quickLogin(username, password) {
  document.getElementById('login-username').value = username;
  document.getElementById('login-password').value = password;
  document.getElementById('login-form').dispatchEvent(new Event('submit'));
}

// زر التحديث الفوري
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
    showToast('تمت مزامنة البيانات مع السيرفر بنجاح');
  }, 400);
}

// ==================== إدارة التبويبات والتنقل ====================
function switchTab(tabId) {
  state.currentTab = tabId;

  document.querySelectorAll('.nav-btn').forEach(btn => {
    btn.classList.remove('bg-zinc-800', 'text-amber-400', 'font-bold');
    btn.classList.add('text-zinc-300');
  });

  const activeBtn = document.getElementById(`nav-${tabId}`);
  if (activeBtn) {
    activeBtn.classList.add('bg-zinc-800', 'text-amber-400', 'font-bold');
    activeBtn.classList.remove('text-zinc-300');
  }

  document.querySelectorAll('.tab-content').forEach(sec => sec.classList.add('hidden'));
  const targetSec = document.getElementById(`tab-${tabId}`);
  if (targetSec) targetSec.classList.remove('hidden');

  const titles = {
    dashboard: 'لوحة التحكم الرئيسية',
    misbahs: 'المسابيح / المخزون',
    sales: 'عمليات البيع',
    customers: 'إدارة العملاء',
    owners: 'مستحقات أصحاب المسابيح',
    reports: 'التقارير والإحصائيات',
    users: 'المستخدمين والصلاحيات',
    settings: 'الإعدادات والنسخ الاحتياطي'
  };
  document.getElementById('page-title').textContent = titles[tabId] || 'عبق الكهرب';

  if (tabId === 'dashboard') loadDashboard();
  else if (tabId === 'customers') loadCustomers();
  else if (tabId === 'misbahs') loadMisbahs();
  else if (tabId === 'sales') loadSales();
  else if (tabId === 'owners') loadOwners();
  else if (tabId === 'reports') renderReport('sales');
  else if (tabId === 'users') loadUsers();
  else if (tabId === 'settings') fillSettingsForm();

  refreshIcons();
}

// ==================== 1. لوحة التحكم DASHBOARD ====================
async function loadDashboard() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();

    // تحديث أهم المؤشرات
    document.getElementById('kpi-current-misbahs').textContent = data.current_misbahs.toLocaleString();
    document.getElementById('kpi-sold-misbahs').textContent = data.sold_misbahs.toLocaleString();
    document.getElementById('kpi-ended-misbahs').textContent = data.ended_misbahs.toLocaleString();
    document.getElementById('kpi-total-sales').textContent = data.total_sales.toFixed(3);
    document.getElementById('kpi-total-profit').textContent = data.total_profit.toFixed(3);
    document.getElementById('kpi-paid-to-owners').textContent = data.paid_to_owners.toFixed(3);
    document.getElementById('kpi-due-to-owners').textContent = data.due_to_owners.toFixed(3);

    renderRecentSalesTable(data.recent_sales);
    renderCutsChart(data.cuts_stats);

    refreshIcons();
  } catch (err) {
    console.error('Error loading dashboard:', err);
  }
}

function renderRecentSalesTable(sales) {
  const tbody = document.getElementById('dashboard-recent-sales-tbody');
  if (!tbody) return;

  if (!sales || sales.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="py-6 text-center text-zinc-500">لا توجد عمليات بيع مسجلة بعد</td></tr>`;
    return;
  }

  tbody.innerHTML = sales.map(s => `
    <tr class="hover:bg-zinc-800/40 transition">
      <td class="py-2.5 px-3 font-bold text-zinc-200">${s.sale_code}</td>
      <td class="py-2.5 px-3">
        <span class="font-bold text-amber-400">${s.misbah_code || '-'}</span>
        <span class="text-[10px] text-zinc-500 block">${s.cut || ''} - ${s.material || ''}</span>
      </td>
      <td class="py-2.5 px-3 font-medium text-zinc-300">${s.customer_name || 'عميل نقدي'}</td>
      <td class="py-2.5 px-3 font-bold text-amber-400">${parseFloat(s.selling_price).toFixed(3)} د.ك</td>
      <td class="py-2.5 px-3">${getPaymentBadge(s.payment_status)}</td>
      <td class="py-2.5 px-3 text-zinc-400">${s.sale_date}</td>
      <td class="py-2.5 px-3 text-center">
        <button onclick="viewInvoice(${s.id})" class="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg" title="عرض الفاتورة">
          <i data-lucide="printer" class="w-3.5 h-3.5"></i>
        </button>
      </td>
    </tr>
  `).join('');
}

function renderCutsChart(cutsStats) {
  const ctx = document.getElementById('cutsChart');
  if (!ctx) return;

  if (state.cutsChart) {
    state.cutsChart.destroy();
  }

  const labels = cutsStats && cutsStats.length > 0 ? cutsStats.map(c => c.cut) : ['برميلي', 'ذروي', 'اسطواني', 'كروي', 'أخرى'];
  const counts = cutsStats && cutsStats.length > 0 ? cutsStats.map(c => c.count) : [5, 3, 2, 4, 1];

  state.cutsChart = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: counts,
        backgroundColor: [
          '#f59e0b', // Amber
          '#3b82f6', // Blue
          '#10b981', // Emerald
          '#8b5cf6', // Purple
          '#ec4899', // Pink
          '#71717a'  // Zinc
        ],
        borderWidth: 2,
        borderColor: '#18181b'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'bottom',
          labels: {
            font: { family: 'Cairo', size: 11 },
            color: '#a1a1aa',
            boxWidth: 10
          }
        }
      },
      cutout: '65%'
    }
  });
}

// ==================== 2. إدارة العملاء CUSTOMERS ====================
async function loadCustomers() {
  const search = document.getElementById('customers-search')?.value || '';
  const reliability = document.getElementById('customers-reliability-filter')?.value || '';
  const payment_status = document.getElementById('customers-payment-filter')?.value || '';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (reliability) params.append('reliability', reliability);
  if (payment_status) params.append('payment_status', payment_status);

  try {
    const res = await fetch(`/api/customers?${params.toString()}`);
    const data = await res.json();
    state.customers = data;
    renderCustomersTable(data);
  } catch (err) {
    console.error('Error loading customers:', err);
  }
}

function renderCustomersTable(customers) {
  const tbody = document.getElementById('customers-tbody');
  const emptyEl = document.getElementById('customers-empty');
  if (!tbody) return;

  if (!customers || customers.length === 0) {
    tbody.innerHTML = '';
    emptyEl?.classList.remove('hidden');
    return;
  }
  emptyEl?.classList.add('hidden');

  tbody.innerHTML = customers.map((c, idx) => `
    <tr class="hover:bg-zinc-800/40 transition border-b border-zinc-800/60">
      <td class="py-3 px-3 font-semibold text-zinc-500">${idx + 1}</td>
      <td class="py-3 px-3 font-bold text-zinc-100">${c.name}</td>
      <td class="py-3 px-3 text-amber-400 font-medium">${c.tiktok_username ? `<a href="https://tiktok.com/@${c.tiktok_username.replace('@','')}" target="_blank" class="hover:underline">${c.tiktok_username}</a>` : '-'}</td>
      <td class="py-3 px-3 font-mono">${c.phone ? `<a href="https://wa.me/${c.phone.replace(/[^0-9]/g, '')}" target="_blank" class="text-emerald-400 hover:underline"><span>${c.phone}</span></a>` : '-'}</td>
      <td class="py-3 px-3 text-zinc-300">${c.country || 'الكويت'}</td>
      <td class="py-3 px-3">${getReliabilityBadge(c.reliability)}</td>
      <td class="py-3 px-3 text-zinc-300">${c.payment_method || '-'}</td>
      <td class="py-3 px-3">${getPaymentBadge(c.payment_status)}</td>
      <td class="py-3 px-3">${getCheckBadge(c.payment_received)}</td>
      <td class="py-3 px-3">${getDeliveryBadge(c.misbah_received)}</td>
      <td class="py-3 px-3 font-medium text-zinc-300">${c.owner_name || '-'}</td>
      <td class="py-3 px-3 font-mono text-zinc-400">${c.owner_phone || '-'}</td>
      <td class="py-3 px-3 text-zinc-400 max-w-[140px] truncate" title="${c.notes || ''}">${c.notes || '-'}</td>
      <td class="py-3 px-3 text-center no-print whitespace-nowrap">
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="editCustomer(${c.id})" class="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg" title="تعديل">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="deleteCustomer(${c.id})" class="admin-only p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg" title="حذف">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  applyRolePermissions();
  refreshIcons();
}

function openNewCustomerModal() {
  document.getElementById('modal-customer-title').innerHTML = `<i data-lucide="user-plus" class="w-5 h-5 text-amber-500"></i><span>إضافة عميل جديد</span>`;
  document.getElementById('customer-form').reset();
  document.getElementById('customer-id').value = '';
  setValueWithOtherOption('cust-country-select', 'cust-country-custom', 'الكويت');
  setValueWithOtherOption('cust-payment-method-select', 'cust-payment-method-custom', 'كي نت');
  openModal('modal-customer');
}

function editCustomer(id) {
  const c = state.customers.find(item => item.id == id);
  if (!c) return;

  document.getElementById('modal-customer-title').innerHTML = `<i data-lucide="edit-3" class="w-5 h-5 text-amber-500"></i><span>تعديل بيانات العميل</span>`;
  document.getElementById('customer-id').value = c.id;
  document.getElementById('cust-name').value = c.name || '';
  document.getElementById('cust-tiktok').value = c.tiktok_username || '';
  document.getElementById('cust-phone').value = c.phone || '';
  
  setValueWithOtherOption('cust-country-select', 'cust-country-custom', c.country, 'الكويت');
  setValueWithOtherOption('cust-payment-method-select', 'cust-payment-method-custom', c.payment_method, 'كي نت');
  
  document.getElementById('cust-reliability').value = c.reliability || 'معتمد';
  document.getElementById('cust-payment-status').value = c.payment_status || 'غير مدفوع';
  document.getElementById('cust-payment-received').value = c.payment_received || 'لم يتم';
  document.getElementById('cust-misbah-received').value = c.misbah_received || 'غير مستلم';
  document.getElementById('cust-owner-name').value = c.owner_name || '';
  document.getElementById('cust-owner-phone').value = c.owner_phone || '';
  document.getElementById('cust-notes').value = c.notes || '';

  openModal('modal-customer');
}

async function saveCustomer(e) {
  e.preventDefault();
  const id = document.getElementById('customer-id').value;
  const payload = {
    name: document.getElementById('cust-name').value,
    tiktok_username: document.getElementById('cust-tiktok').value,
    phone: document.getElementById('cust-phone').value,
    country: getValueWithOtherOption('cust-country-select', 'cust-country-custom'),
    reliability: document.getElementById('cust-reliability').value,
    payment_method: getValueWithOtherOption('cust-payment-method-select', 'cust-payment-method-custom'),
    payment_status: document.getElementById('cust-payment-status').value,
    payment_received: document.getElementById('cust-payment-received').value,
    misbah_received: document.getElementById('cust-misbah-received').value,
    owner_name: document.getElementById('cust-owner-name').value,
    owner_phone: document.getElementById('cust-owner-phone').value,
    notes: document.getElementById('cust-notes').value
  };

  const url = id ? `/api/customers/${id}` : '/api/customers';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast(id ? 'تم تحديث بيانات العميل' : 'تمت إضافة العميل بنجاح');
      closeModal('modal-customer');
      loadCustomers();
    } else {
      const err = await res.json();
      showToast(err.error || 'حدث خطأ أثناء حفظ العميل', 'error');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالسيرفر', 'error');
  }
}

async function deleteCustomer(id) {
  if (!confirm('هل أنت متأكد من حذف هذا العميل؟')) return;
  try {
    const res = await fetch(`/api/customers/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('تم حذف العميل بنجاح');
      loadCustomers();
    } else {
      showToast('فشل حذف العميل', 'error');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالسيرفر', 'error');
  }
}

// ==================== 3. إدارة المسابيح والمخزون MISBAHS ====================
async function loadMisbahs() {
  const search = document.getElementById('misbahs-search')?.value || '';
  const cut = document.getElementById('misbahs-cut-filter')?.value || '';
  const owner_payment_status = document.getElementById('misbahs-owner-pay-filter')?.value || '';

  const params = new URLSearchParams();
  if (state.misbahStatusFilter) params.append('status', state.misbahStatusFilter);
  if (search) params.append('search', search);
  if (cut) params.append('cut', cut);
  if (owner_payment_status) params.append('owner_payment_status', owner_payment_status);

  try {
    const res = await fetch(`/api/misbahs?${params.toString()}`);
    const data = await res.json();
    state.misbahs = data;

    updateMisbahCounts();
    renderMisbahsTable(data);
  } catch (err) {
    console.error('Error loading misbahs:', err);
  }
}

async function updateMisbahCounts() {
  try {
    const res = await fetch('/api/stats');
    const stats = await res.json();
    document.getElementById('count-all-misbahs').textContent = stats.total_misbahs;
    document.getElementById('count-curr-misbahs').textContent = stats.current_misbahs;
    document.getElementById('count-sold-misbahs').textContent = stats.sold_misbahs;
    document.getElementById('count-ended-misbahs').textContent = stats.ended_misbahs;
  } catch (e) {}
}

function filterMisbahsByStatus(status) {
  state.misbahStatusFilter = status;
  document.querySelectorAll('.misbah-tab-btn').forEach(btn => {
    btn.classList.remove('bg-amber-500', 'text-zinc-950');
    btn.classList.add('bg-[#18181b]');
  });

  const btnId = status === '' ? 'filter-btn-all' : (status === 'حالي' ? 'filter-btn-current' : (status === 'مباع' ? 'filter-btn-sold' : 'filter-btn-ended'));
  const activeBtn = document.getElementById(btnId);
  if (activeBtn) {
    activeBtn.classList.add('bg-amber-500', 'text-zinc-950');
    activeBtn.classList.remove('bg-[#18181b]');
  }

  loadMisbahs();
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
    <tr class="hover:bg-zinc-800/40 transition border-b border-zinc-800/60">
      <td class="py-3 px-3 font-bold text-amber-400">${m.code}</td>
      <td class="py-3 px-3">${getMisbahStatusBadge(m.status)}</td>
      <td class="py-3 px-3 font-semibold text-zinc-100">${m.owner_name}</td>
      <td class="py-3 px-3 font-mono text-zinc-400">${m.owner_phone || '-'}</td>
      <td class="py-3 px-3 font-mono text-zinc-300">${m.weight_grams ? `${m.weight_grams} ج` : '-'}</td>
      <td class="py-3 px-3 font-medium text-zinc-200">${m.cut || '-'}</td>
      <td class="py-3 px-3 text-zinc-400">${m.material || '-'}</td>
      <td class="py-3 px-3 font-bold text-zinc-300">${parseFloat(m.original_price).toFixed(3)} د.ك</td>
      <td class="py-3 px-3 font-bold text-amber-400">${parseFloat(m.profit).toFixed(3)} د.ك</td>
      <td class="py-3 px-3 font-black text-amber-300 text-sm">${parseFloat(m.selling_price).toFixed(3)} د.ك</td>
      <td class="py-3 px-3">${m.sale_status === 'تم البيع' ? '<span class="text-blue-400 font-bold">تم البيع</span>' : '<span class="text-zinc-500">غير مباع</span>'}</td>
      <td class="py-3 px-3 text-zinc-400">${m.sale_date || '-'}</td>
      <td class="py-3 px-3">${getOwnerPayBadge(m.owner_payment_status)}</td>
      <td class="py-3 px-3 text-zinc-400">${m.owner_payment_date || '-'}</td>
      <td class="py-3 px-3">${getCheckBadge(m.item_received_status)}</td>
      <td class="py-3 px-3 text-zinc-400">${m.item_received_date || '-'}</td>
      <td class="py-3 px-3 text-zinc-400 max-w-[130px] truncate" title="${m.notes || ''}">${m.notes || '-'}</td>
      <td class="py-3 px-3 text-center no-print whitespace-nowrap">
        <div class="flex items-center justify-center gap-1.5">
          ${m.status === 'حالي' ? `
            <button onclick="startSaleFromMisbah(${m.id})" class="px-2 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-zinc-950 font-bold rounded-lg text-[11px] transition border border-amber-500/30" title="بيع هذه القطعة">
              بيع
            </button>
          ` : ''}
          <button onclick="editMisbah(${m.id})" class="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg" title="تعديل">
            <i data-lucide="edit-3" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="deleteMisbah(${m.id})" class="admin-only p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg" title="حذف">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
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
  const sellingPriceInput = document.getElementById('msb-selling-price');

  const orig = parseFloat(origPriceInput.value) || 0;
  let profit = 0;

  if (orig < 100) {
    profit = 5.0;
  } else {
    profit = orig * 0.05;
  }

  const selling = orig + profit;
  profitInput.value = profit.toFixed(3);
  sellingPriceInput.value = selling.toFixed(3);
}

function openNewMisbahModal() {
  document.getElementById('modal-misbah-title').innerHTML = `<i data-lucide="gem" class="w-5 h-5 text-amber-500"></i><span>إضافة مسباح جديد للمخزون</span>`;
  document.getElementById('misbah-form').reset();
  document.getElementById('misbah-id').value = '';
  document.getElementById('msb-status').value = 'حالي';
  setValueWithOtherOption('msb-cut-select', 'msb-cut-custom', 'برميلي');
  setValueWithOtherOption('msb-mat-select', 'msb-mat-custom', 'كهرمان بولندي قديم');
  document.getElementById('msb-item-rec-status').value = 'تم الاستلام';
  document.getElementById('msb-item-rec-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('msb-owner-pay-status').value = 'لم يتم الدفع';
  calculateLivePricing();
  openModal('modal-misbah');
}

function editMisbah(id) {
  const m = state.misbahs.find(item => item.id == id);
  if (!m) return;

  document.getElementById('modal-misbah-title').innerHTML = `<i data-lucide="edit-3" class="w-5 h-5 text-amber-500"></i><span>تعديل بيانات المسباح</span>`;
  document.getElementById('misbah-id').value = m.id;
  document.getElementById('msb-code').value = m.code || '';
  document.getElementById('msb-status').value = m.status || 'حالي';
  
  setValueWithOtherOption('msb-cut-select', 'msb-cut-custom', m.cut, 'برميلي');
  setValueWithOtherOption('msb-mat-select', 'msb-mat-custom', m.material, 'كهرمان بولندي قديم');

  document.getElementById('msb-owner-name').value = m.owner_name || '';
  document.getElementById('msb-owner-phone').value = m.owner_phone || '';
  document.getElementById('msb-weight').value = m.weight_grams || '';
  document.getElementById('msb-bead-count').value = m.bead_count || 33;
  document.getElementById('msb-bead-size').value = m.bead_size || '';
  document.getElementById('msb-orig-price').value = m.original_price || '';
  document.getElementById('msb-profit').value = parseFloat(m.profit).toFixed(3);
  document.getElementById('msb-selling-price').value = parseFloat(m.selling_price).toFixed(3);
  document.getElementById('msb-item-rec-status').value = m.item_received_status || 'تم الاستلام';
  document.getElementById('msb-item-rec-date').value = m.item_received_date || '';
  document.getElementById('msb-owner-pay-status').value = m.owner_payment_status || 'لم يتم الدفع';
  document.getElementById('msb-owner-pay-date').value = m.owner_payment_date || '';
  document.getElementById('msb-notes').value = m.notes || '';

  openModal('modal-misbah');
}

async function saveMisbah(e) {
  e.preventDefault();
  const id = document.getElementById('misbah-id').value;
  const payload = {
    code: document.getElementById('msb-code').value,
    status: document.getElementById('msb-status').value,
    cut: getValueWithOtherOption('msb-cut-select', 'msb-cut-custom'),
    material: getValueWithOtherOption('msb-mat-select', 'msb-mat-custom'),
    owner_name: document.getElementById('msb-owner-name').value,
    owner_phone: document.getElementById('msb-owner-phone').value,
    weight_grams: document.getElementById('msb-weight').value,
    bead_count: document.getElementById('msb-bead-count').value,
    bead_size: document.getElementById('msb-bead-size').value,
    original_price: document.getElementById('msb-orig-price').value,
    item_received_status: document.getElementById('msb-item-rec-status').value,
    item_received_date: document.getElementById('msb-item-rec-date').value,
    owner_payment_status: document.getElementById('msb-owner-pay-status').value,
    owner_payment_date: document.getElementById('msb-owner-pay-date').value,
    notes: document.getElementById('msb-notes').value
  };

  const url = id ? `/api/misbahs/${id}` : '/api/misbahs';
  const method = id ? 'PUT' : 'POST';

  try {
    const res = await fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast(id ? 'تم تحديث بيانات المسباح' : 'تمت إضافة المسباح بنجاح');
      closeModal('modal-misbah');
      loadMisbahs();
    } else {
      const err = await res.json();
      showToast(err.error || 'حدث خطأ أثناء حفظ المسباح', 'error');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالسيرفر', 'error');
  }
}

async function deleteMisbah(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المسباح؟')) return;
  try {
    const res = await fetch(`/api/misbahs/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      showToast('تم حذف المسباح بنجاح');
      loadMisbahs();
    } else {
      showToast(data.error || 'فشل حذف المسباح', 'error');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالسيرفر', 'error');
  }
}

// ==================== 4. إدارة المبيعات SALES ====================
async function loadSales() {
  const search = document.getElementById('sales-search')?.value || '';
  const payment_status = document.getElementById('sales-payment-filter')?.value || '';
  const date_from = document.getElementById('sales-date-from')?.value || '';
  const date_to = document.getElementById('sales-date-to')?.value || '';

  const params = new URLSearchParams();
  if (search) params.append('search', search);
  if (payment_status) params.append('payment_status', payment_status);
  if (date_from) params.append('from', date_from);
  if (date_to) params.append('to', date_to);

  try {
    const res = await fetch(`/api/sales?${params.toString()}`);
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
    <tr class="hover:bg-zinc-800/40 transition border-b border-zinc-800/60">
      <td class="py-3 px-3 font-bold text-zinc-100">${s.sale_code}</td>
      <td class="py-3 px-3 font-black text-amber-400">${s.misbah_code || '-'}</td>
      <td class="py-3 px-3">
        <span class="font-medium text-zinc-200">${s.cut || ''}</span>
        <span class="text-[10px] text-zinc-500 block">${s.material || ''} ${s.weight_grams ? `(${s.weight_grams}ج)` : ''}</span>
      </td>
      <td class="py-3 px-3 font-bold text-zinc-100">${s.customer_name || '-'}</td>
      <td class="py-3 px-3 font-mono text-zinc-400">${s.customer_phone || '-'}</td>
      <td class="py-3 px-3 text-zinc-300">${parseFloat(s.original_price).toFixed(3)} د.ك</td>
      <td class="py-3 px-3 font-bold text-amber-400">${parseFloat(s.profit).toFixed(3)} د.ك</td>
      <td class="py-3 px-3 font-black text-amber-300 text-sm">${parseFloat(s.selling_price).toFixed(3)} د.ك</td>
      <td class="py-3 px-3">${getPaymentBadge(s.payment_status)}</td>
      <td class="py-3 px-3 font-bold text-emerald-400">${parseFloat(s.paid_amount).toFixed(3)} د.ك</td>
      <td class="py-3 px-3 font-bold ${parseFloat(s.remaining_amount) > 0 ? 'text-rose-400' : 'text-zinc-500'}">${parseFloat(s.remaining_amount).toFixed(3)} د.ك</td>
      <td class="py-3 px-3 text-zinc-400">${s.sale_date}</td>
      <td class="py-3 px-3 text-zinc-300">${s.payment_method}</td>
      <td class="py-3 px-3 text-zinc-400 max-w-[130px] truncate" title="${s.notes || ''}">${s.notes || '-'}</td>
      <td class="py-3 px-3 text-center no-print whitespace-nowrap">
        <div class="flex items-center justify-center gap-1.5">
          <button onclick="viewInvoice(${s.id})" class="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg" title="طباعة الفاتورة">
            <i data-lucide="printer" class="w-3.5 h-3.5"></i>
          </button>
          <button onclick="deleteSale(${s.id})" class="admin-only p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg" title="إلغاء البيع واسترجاع المسباح">
            <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
          </button>
        </div>
      </td>
    </tr>
  `).join('');

  applyRolePermissions();
  refreshIcons();
}

async function openNewSaleModal() {
  document.getElementById('sale-form').reset();
  document.getElementById('sale-date').value = new Date().toISOString().split('T')[0];
  document.getElementById('sale-misbah-details').classList.add('hidden');
  setValueWithOtherOption('sale-payment-method-select', 'sale-payment-method-custom', 'كي نت');

  const select = document.getElementById('sale-misbah-select');
  select.innerHTML = '<option value="">-- جاري تحميل المسابيح المتاحة... --</option>';

  try {
    const res = await fetch('/api/misbahs?status=حالي');
    const misbahs = await res.json();
    if (misbahs.length === 0) {
      select.innerHTML = '<option value="">لا توجد مسابيح متوفرة حالياً بالمخزون</option>';
    } else {
      select.innerHTML = '<option value="">-- اختر مسباحاً من المخزون الحالي --</option>' +
        misbahs.map(m => `
          <option value="${m.id}" data-orig="${m.original_price}" data-profit="${m.profit}" data-sell="${m.selling_price}" data-cut="${m.cut || ''}" data-mat="${m.material || ''}" data-owner="${m.owner_name}">
            ${m.code} - ${m.cut || ''} (${m.material || ''}) - سعر البيع: ${parseFloat(m.selling_price).toFixed(3)} د.ك
          </option>
        `).join('');
    }
  } catch (e) {
    select.innerHTML = '<option value="">خطأ في تحميل المسابيح</option>';
  }

  openModal('modal-sale');
}

function startSaleFromMisbah(misbahId) {
  openNewSaleModal().then(() => {
    const select = document.getElementById('sale-misbah-select');
    select.value = misbahId;
    onSaleMisbahSelected();
  });
}

function onSaleMisbahSelected() {
  const select = document.getElementById('sale-misbah-select');
  const opt = select.options[select.selectedIndex];
  const detailsDiv = document.getElementById('sale-misbah-details');

  if (!opt || !opt.value) {
    detailsDiv.classList.add('hidden');
    return;
  }

  const sellPrice = parseFloat(opt.dataset.sell) || 0;
  const origPrice = parseFloat(opt.dataset.orig) || 0;
  const profit = parseFloat(opt.dataset.profit) || 0;

  document.getElementById('sale-misbah-cut-mat').textContent = `${opt.dataset.cut} / ${opt.dataset.mat}`;
  document.getElementById('sale-misbah-orig').textContent = origPrice.toFixed(3);
  document.getElementById('sale-misbah-profit').textContent = profit.toFixed(3);
  document.getElementById('sale-misbah-sell').textContent = sellPrice.toFixed(3);

  document.getElementById('sale-paid-amount').value = sellPrice.toFixed(3);
  document.getElementById('sale-remaining-amount').value = '0.000';

  detailsDiv.classList.remove('hidden');
}

function calculateSaleRemaining() {
  const select = document.getElementById('sale-misbah-select');
  const opt = select.options[select.selectedIndex];
  const sellPrice = opt && opt.value ? (parseFloat(opt.dataset.sell) || 0) : 0;
  const paid = parseFloat(document.getElementById('sale-paid-amount').value) || 0;

  let remaining = sellPrice - paid;
  if (remaining < 0) remaining = 0;
  document.getElementById('sale-remaining-amount').value = remaining.toFixed(3);
}

async function saveNewSale(e) {
  e.preventDefault();
  const misbah_id = document.getElementById('sale-misbah-select').value;
  if (!misbah_id) {
    showToast('يرجى اختيار المسباح أولاً', 'warning');
    return;
  }

  const payload = {
    misbah_id: parseInt(misbah_id),
    customer_name: document.getElementById('sale-cust-name').value,
    customer_phone: document.getElementById('sale-cust-phone').value,
    customer_tiktok: document.getElementById('sale-cust-tiktok').value,
    paid_amount: parseFloat(document.getElementById('sale-paid-amount').value),
    payment_method: getValueWithOtherOption('sale-payment-method-select', 'sale-payment-method-custom'),
    sale_date: document.getElementById('sale-date').value,
    notes: document.getElementById('sale-notes').value,
    created_by: state.currentUser.full_name
  };

  try {
    const res = await fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const data = await res.json();
    if (res.ok) {
      showToast('تم تسجيل عملية البيع بنجاح!');
      closeModal('modal-sale');
      loadSales();
      loadDashboard();
      viewInvoice(data.id);
    } else {
      showToast(data.error || 'فشل تسجيل البيع', 'error');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالسيرفر', 'error');
  }
}

async function deleteSale(id) {
  if (!confirm('هل تريد إلغاء عملية البيع هذه؟ سيتم استرجاع المسباح إلى المخزون كمتوفر (حالي).')) return;
  try {
    const res = await fetch(`/api/sales/${id}`, { method: 'DELETE' });
    if (res.ok) {
      showToast('تم إلغاء عملية البيع وإعادة المسباح للمخزون');
      loadSales();
      loadDashboard();
    } else {
      showToast('فشل إلغاء البيع', 'error');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالسيرفر', 'error');
  }
}

// ==================== 5. معاينة وطباعة الفاتورة INVOICE ====================
async function viewInvoice(saleId) {
  try {
    const res = await fetch(`/api/sales/${saleId}`);
    const sale = await res.json();

    document.getElementById('inv-store-name').textContent = state.settings.store_name || 'عبق الكهرب';
    document.getElementById('inv-store-phone').textContent = `${state.settings.phone || ''} | ${state.settings.tiktok_account || ''}`;
    document.getElementById('inv-code').textContent = sale.sale_code;
    document.getElementById('inv-date').textContent = sale.sale_date;
    document.getElementById('inv-customer-name').textContent = sale.customer_name || 'عميل نقدي';
    document.getElementById('inv-customer-phone').textContent = `${sale.customer_phone || ''} ${sale.customer_tiktok ? `(${sale.customer_tiktok})` : ''}`;
    
    document.getElementById('inv-misbah-code').textContent = sale.misbah_code || '-';
    document.getElementById('inv-misbah-desc').textContent = `${sale.cut || ''} - ${sale.material || ''}`;
    document.getElementById('inv-misbah-weight').textContent = sale.weight_grams ? `${sale.weight_grams} جرام` : '-';
    document.getElementById('inv-selling-price').textContent = parseFloat(sale.selling_price).toFixed(3);

    document.getElementById('inv-total').textContent = parseFloat(sale.selling_price).toFixed(3);
    document.getElementById('inv-paid').textContent = parseFloat(sale.paid_amount).toFixed(3);
    document.getElementById('inv-remaining').textContent = parseFloat(sale.remaining_amount).toFixed(3);
    document.getElementById('inv-method').textContent = sale.payment_method;
    document.getElementById('inv-created-by').textContent = sale.created_by || 'النظام';
    document.getElementById('inv-footer-text').textContent = state.settings.invoice_footer || 'شكراً لتعاملكم مع عبق الكهرب. المسابيح المباعة أصلية ومفحوصة.';

    openModal('modal-invoice');
    refreshIcons();
  } catch (err) {
    showToast('تعذر تحميل بيانات الفاتورة', 'error');
  }
}

// ==================== 6. مستحقات أصحاب المسابيح OWNERS ====================
async function loadOwners() {
  try {
    const res = await fetch('/api/owners');
    const data = await res.json();
    state.ownersData = data;

    renderOwnersSummaryTable(data.owners);
    renderOwnersPiecesTable(data.misbahs);
  } catch (err) {
    console.error('Error loading owners dues:', err);
  }
}

function renderOwnersSummaryTable(owners) {
  const tbody = document.getElementById('owners-tbody');
  if (!tbody) return;

  if (!owners || owners.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="py-6 text-center text-zinc-500">لا يوجد أصحاب مسابيح مسجلين</td></tr>`;
    return;
  }

  tbody.innerHTML = owners.map(o => `
    <tr class="hover:bg-zinc-800/40 transition border-b border-zinc-800/60">
      <td class="py-3.5 px-3 font-bold text-zinc-100">${o.owner_name}</td>
      <td class="py-3.5 px-3 font-mono text-zinc-400">${o.owner_phone || '-'}</td>
      <td class="py-3.5 px-3 text-center font-bold text-zinc-200">${o.total_pieces}</td>
      <td class="py-3.5 px-3 text-center font-bold text-emerald-400">${o.active_pieces}</td>
      <td class="py-3.5 px-3 text-center font-bold text-blue-400">${o.sold_pieces}</td>
      <td class="py-3.5 px-3 font-bold text-zinc-200">${parseFloat(o.sold_due_total || 0).toFixed(3)} د.ك</td>
      <td class="py-3.5 px-3 font-bold text-emerald-400">${parseFloat(o.total_paid || 0).toFixed(3)} د.ك</td>
      <td class="py-3.5 px-3 font-black ${parseFloat(o.total_pending || 0) > 0 ? 'text-rose-400 bg-rose-950/20' : 'text-zinc-500'}">${parseFloat(o.total_pending || 0).toFixed(3)} د.ك</td>
      <td class="py-3.5 px-3 text-center no-print">
        ${parseFloat(o.total_pending || 0) > 0 ? `
          <button onclick="openOwnerPayModal('${o.owner_name}', '${o.owner_phone}', ${o.total_pending})" class="bg-amber-500 hover:bg-amber-600 text-zinc-950 font-black px-3 py-1.5 rounded-lg text-xs transition">
            تسجيل سداد
          </button>
        ` : `<span class="text-emerald-400 font-bold text-xs">خالص بالكامل ✅</span>`}
      </td>
    </tr>
  `).join('');
}

function renderOwnersPiecesTable(misbahs) {
  const tbody = document.getElementById('owners-pieces-tbody');
  if (!tbody) return;

  if (!misbahs || misbahs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" class="py-6 text-center text-zinc-500">لا توجد قطع مسجلة</td></tr>`;
    return;
  }

  tbody.innerHTML = misbahs.map(m => `
    <tr class="hover:bg-zinc-800/40 transition border-b border-zinc-800/60">
      <td class="py-3 px-3 font-bold text-amber-400">${m.code}</td>
      <td class="py-3 px-3 font-semibold text-zinc-200">${m.owner_name}</td>
      <td class="py-3 px-3 font-mono text-zinc-400">${m.owner_phone || '-'}</td>
      <td class="py-3 px-3 font-bold text-zinc-300">${parseFloat(m.original_price).toFixed(3)} د.ك</td>
      <td class="py-3 px-3">${m.status === 'مباع' ? '<span class="text-blue-400 font-bold">مباع</span>' : (m.status === 'حالي' ? '<span class="text-emerald-400 font-medium">حالي</span>' : '<span class="text-zinc-500">منتهي</span>')}</td>
      <td class="py-3 px-3">${getOwnerPayBadge(m.owner_payment_status)}</td>
      <td class="py-3 px-3 text-zinc-400">${m.owner_payment_date || '-'}</td>
      <td class="py-3 px-3 font-black ${m.status === 'مباع' && m.owner_payment_status !== 'تم الدفع' ? 'text-rose-400 font-bold' : 'text-zinc-500'}">
        ${m.status === 'مباع' ? `${parseFloat(m.original_price).toFixed(3)} د.ك` : '0.000 د.ك'}
      </td>
      <td class="py-3 px-3 text-center no-print">
        ${m.status === 'مباع' && m.owner_payment_status !== 'تم الدفع' ? `
          <button onclick="openMisbahPiecePayModal(${m.id}, '${m.code}', '${m.owner_name}', ${m.original_price})" class="px-2.5 py-1 bg-amber-500/20 hover:bg-amber-500 text-amber-300 hover:text-zinc-950 font-bold rounded-lg text-xs border border-amber-500/30 transition">
            سداد
          </button>
        ` : (m.owner_payment_status === 'تم الدفع' ? `<span class="text-emerald-400 font-bold text-xs">تم السداد</span>` : `-`)}
      </td>
    </tr>
  `).join('');
}

function openOwnerPayModal(name, phone, amount) {
  document.getElementById('owner-pay-form').reset();
  document.getElementById('pay-misbah-id').value = '';
  document.getElementById('pay-misbah-code').value = 'دفعة عامة لحساب المالك';
  document.getElementById('pay-owner-name').value = name;
  document.getElementById('pay-amount').value = parseFloat(amount).toFixed(3);
  document.getElementById('pay-date').value = new Date().toISOString().split('T')[0];
  setValueWithOtherOption('pay-method-select', 'pay-method-custom', 'تحويل بنكي');
  openModal('modal-owner-pay');
}

function openMisbahPiecePayModal(misbahId, code, ownerName, amount) {
  document.getElementById('owner-pay-form').reset();
  document.getElementById('pay-misbah-id').value = misbahId;
  document.getElementById('pay-misbah-code').value = code;
  document.getElementById('pay-owner-name').value = ownerName;
  document.getElementById('pay-amount').value = parseFloat(amount).toFixed(3);
  document.getElementById('pay-date').value = new Date().toISOString().split('T')[0];
  setValueWithOtherOption('pay-method-select', 'pay-method-custom', 'تحويل بنكي');
  openModal('modal-owner-pay');
}

async function saveOwnerPayment(e) {
  e.preventDefault();
  const payload = {
    misbah_id: document.getElementById('pay-misbah-id').value || null,
    owner_name: document.getElementById('pay-owner-name').value,
    amount: parseFloat(document.getElementById('pay-amount').value),
    payment_date: document.getElementById('pay-date').value,
    payment_method: getValueWithOtherOption('pay-method-select', 'pay-method-custom'),
    notes: document.getElementById('pay-notes').value
  };

  try {
    const res = await fetch('/api/owners/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast('تم تسجيل سداد المستحق بنجاح');
      closeModal('modal-owner-pay');
      loadOwners();
      loadDashboard();
    } else {
      showToast('فشل تسجيل الدفعة', 'error');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالسيرفر', 'error');
  }
}

// ==================== 7. التقارير والإحصائيات REPORTS ====================
function renderReport(type) {
  document.querySelectorAll('.report-tab-btn').forEach(btn => {
    btn.classList.remove('border-amber-500');
    btn.classList.add('border-zinc-800');
  });

  const btnId = `rep-btn-${type}`;
  document.getElementById(btnId)?.classList.remove('border-zinc-800');
  document.getElementById(btnId)?.classList.add('border-amber-500');

  const container = document.getElementById('report-view-container');
  if (!container) return;

  if (type === 'sales') renderSalesReportView(container);
  else if (type === 'profits') renderProfitsReportView(container);
  else if (type === 'inventory') renderInventoryReportView(container);
  else if (type === 'dues') renderDuesReportView(container);

  refreshIcons();
}

async function renderSalesReportView(container) {
  container.innerHTML = `<div class="py-8 text-center text-zinc-500">جاري إنشاء تقرير المبيعات...</div>`;
  const res = await fetch('/api/sales');
  const sales = await res.json();

  const totalSales = sales.reduce((acc, s) => acc + parseFloat(s.selling_price || 0), 0);
  const totalPaid = sales.reduce((acc, s) => acc + parseFloat(s.paid_amount || 0), 0);
  const totalRemaining = sales.reduce((acc, s) => acc + parseFloat(s.remaining_amount || 0), 0);

  container.innerHTML = `
    <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
      <div>
        <h3 class="font-bold text-sm text-zinc-100">تقرير المبيعات الشامل</h3>
        <p class="text-xs text-zinc-400">حركة المبيعات، التحصيلات، والمبالغ المتبقية</p>
      </div>
      <div class="flex items-center gap-2">
        <button onclick="exportTableToExcel('report-sales-table', 'تقرير_مبيعات_عبق_الكهرب')" class="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-zinc-700">
          <i data-lucide="file-spreadsheet" class="w-4 h-4 text-emerald-400"></i>
          <span>تصدير Excel</span>
        </button>
      </div>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
        <span class="text-xs text-zinc-400 block mb-1">إجمالي المبيعات</span>
        <span class="text-xl font-black text-zinc-100">${totalSales.toFixed(3)} د.ك</span>
      </div>
      <div class="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
        <span class="text-xs text-emerald-400 block mb-1">إجمالي المحصل</span>
        <span class="text-xl font-black text-emerald-400">${totalPaid.toFixed(3)} د.ك</span>
      </div>
      <div class="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
        <span class="text-xs text-rose-400 block mb-1">إجمالي المتبقي (ذمم)</span>
        <span class="text-xl font-black text-rose-400">${totalRemaining.toFixed(3)} د.ك</span>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table id="report-sales-table" class="w-full text-right text-xs">
        <thead class="bg-zinc-900 text-zinc-400 border-b border-zinc-800">
          <tr>
            <th class="py-2.5 px-3">رقم الفاتورة</th>
            <th class="py-2.5 px-3">التاريخ</th>
            <th class="py-2.5 px-3">المسباح</th>
            <th class="py-2.5 px-3">العميل</th>
            <th class="py-2.5 px-3">طريقة الدفع</th>
            <th class="py-2.5 px-3">سعر البيع</th>
            <th class="py-2.5 px-3">المحصل</th>
            <th class="py-2.5 px-3">المتبقي</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800/60">
          ${sales.map(s => `
            <tr>
              <td class="py-2.5 px-3 font-bold text-zinc-200">${s.sale_code}</td>
              <td class="py-2.5 px-3 text-zinc-400">${s.sale_date}</td>
              <td class="py-2.5 px-3 font-bold text-amber-400">${s.misbah_code || '-'} (${s.cut || ''})</td>
              <td class="py-2.5 px-3 text-zinc-300">${s.customer_name}</td>
              <td class="py-2.5 px-3 text-zinc-300">${s.payment_method}</td>
              <td class="py-2.5 px-3 font-bold text-zinc-100">${parseFloat(s.selling_price).toFixed(3)} د.ك</td>
              <td class="py-2.5 px-3 text-emerald-400 font-bold">${parseFloat(s.paid_amount).toFixed(3)} د.ك</td>
              <td class="py-2.5 px-3 font-bold ${parseFloat(s.remaining_amount) > 0 ? 'text-rose-400' : 'text-zinc-500'}">${parseFloat(s.remaining_amount).toFixed(3)} د.ك</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function renderProfitsReportView(container) {
  container.innerHTML = `<div class="py-8 text-center text-zinc-500">جاري إنشاء تقرير الأرباح...</div>`;
  const res = await fetch('/api/sales');
  const sales = await res.json();

  const totalCost = sales.reduce((acc, s) => acc + parseFloat(s.original_price || 0), 0);
  const totalSales = sales.reduce((acc, s) => acc + parseFloat(s.selling_price || 0), 0);
  const totalProfit = sales.reduce((acc, s) => acc + parseFloat(s.profit || 0), 0);
  const margin = totalSales > 0 ? ((totalProfit / totalSales) * 100).toFixed(1) : '0.0';

  container.innerHTML = `
    <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
      <div>
        <h3 class="font-bold text-sm text-zinc-100">تقرير الأرباح وتحليل الهامش</h3>
        <p class="text-xs text-zinc-400">حساب صافي الأرباح المحققة لكافة عمليات البيع</p>
      </div>
      <button onclick="exportTableToExcel('report-profits-table', 'تقرير_أرباح_عبق_الكهرب')" class="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-zinc-700">
        <i data-lucide="file-spreadsheet" class="w-4 h-4 text-emerald-400"></i>
        <span>تصدير Excel</span>
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-4 gap-3">
      <div class="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
        <span class="text-xs text-zinc-400 block mb-1">إجمالي التكلفة الأصلية</span>
        <span class="text-xl font-black text-zinc-200">${totalCost.toFixed(3)} د.ك</span>
      </div>
      <div class="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
        <span class="text-xs text-amber-400 block mb-1">إجمالي المبيعات</span>
        <span class="text-xl font-black text-amber-400">${totalSales.toFixed(3)} د.ك</span>
      </div>
      <div class="p-3.5 bg-zinc-900 border border-amber-500/40 rounded-xl text-center bg-gradient-to-b from-[#1c1a17] to-zinc-900">
        <span class="text-xs text-amber-300 block mb-1">صافي الأرباح الكلية</span>
        <span class="text-xl font-black text-amber-400">${totalProfit.toFixed(3)} د.ك</span>
      </div>
      <div class="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
        <span class="text-xs text-purple-400 block mb-1">متوسط هامش الربح</span>
        <span class="text-xl font-black text-purple-400">${margin}%</span>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table id="report-profits-table" class="w-full text-right text-xs">
        <thead class="bg-zinc-900 text-zinc-400 border-b border-zinc-800">
          <tr>
            <th class="py-2.5 px-3">رقم الفاتورة</th>
            <th class="py-2.5 px-3">المسباح</th>
            <th class="py-2.5 px-3">التاريخ</th>
            <th class="py-2.5 px-3">السعر الأصلي</th>
            <th class="py-2.5 px-3">سعر البيع</th>
            <th class="py-2.5 px-3 text-amber-400 font-bold">الربح الصافي</th>
            <th class="py-2.5 px-3">نسبة الربح</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800/60">
          ${sales.map(s => {
            const orig = parseFloat(s.original_price);
            const prof = parseFloat(s.profit);
            const pct = orig > 0 ? ((prof / orig) * 100).toFixed(1) : '0';
            return `
              <tr>
                <td class="py-2.5 px-3 font-bold text-zinc-200">${s.sale_code}</td>
                <td class="py-2.5 px-3 font-bold text-amber-400">${s.misbah_code}</td>
                <td class="py-2.5 px-3 text-zinc-400">${s.sale_date}</td>
                <td class="py-2.5 px-3 font-mono text-zinc-300">${orig.toFixed(3)} د.ك</td>
                <td class="py-2.5 px-3 font-mono font-bold text-zinc-100">${parseFloat(s.selling_price).toFixed(3)} د.ك</td>
                <td class="py-2.5 px-3 font-black text-amber-400">${prof.toFixed(3)} د.ك</td>
                <td class="py-2.5 px-3 font-semibold text-zinc-300">${pct}%</td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function renderInventoryReportView(container) {
  container.innerHTML = `<div class="py-8 text-center text-zinc-500">جاري إنشاء تقرير المخزون...</div>`;
  const res = await fetch('/api/misbahs');
  const misbahs = await res.json();

  const totalValue = misbahs.reduce((acc, m) => acc + parseFloat(m.original_price || 0), 0);
  const activeCount = misbahs.filter(m => m.status === 'حالي').length;
  const soldCount = misbahs.filter(m => m.status === 'مباع').length;
  const endedCount = misbahs.filter(m => m.status === 'منتهي').length;

  container.innerHTML = `
    <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
      <div>
        <h3 class="font-bold text-sm text-zinc-100">تقرير جرد المخزون</h3>
        <p class="text-xs text-zinc-400">حالة المسابيح وتوزيعها بين الحالي والمباع والمنتهي</p>
      </div>
      <button onclick="exportTableToExcel('report-inventory-table', 'تقرير_مخزون_عبق_الكهرب')" class="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-zinc-700">
        <i data-lucide="file-spreadsheet" class="w-4 h-4 text-emerald-400"></i>
        <span>تصدير Excel</span>
      </button>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <div class="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
        <span class="text-xs text-emerald-400 block mb-1">قطع حالية (متوفرة)</span>
        <span class="text-2xl font-black text-emerald-400">${activeCount}</span>
      </div>
      <div class="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
        <span class="text-xs text-blue-400 block mb-1">قطع مباعة</span>
        <span class="text-2xl font-black text-blue-400">${soldCount}</span>
      </div>
      <div class="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
        <span class="text-xs text-zinc-400 block mb-1">قطع منتهية</span>
        <span class="text-2xl font-black text-zinc-400">${endedCount}</span>
      </div>
      <div class="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
        <span class="text-xs text-amber-400 block mb-1">إجمالي قيمة التكلفة</span>
        <span class="text-2xl font-black text-amber-400">${totalValue.toFixed(3)} د.ك</span>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table id="report-inventory-table" class="w-full text-right text-xs">
        <thead class="bg-zinc-900 text-zinc-400 border-b border-zinc-800">
          <tr>
            <th class="py-2.5 px-3">رقم المسباح</th>
            <th class="py-2.5 px-3">الحالة</th>
            <th class="py-2.5 px-3">القصة</th>
            <th class="py-2.5 px-3">الخامة</th>
            <th class="py-2.5 px-3">الوزن</th>
            <th class="py-2.5 px-3">المالك</th>
            <th class="py-2.5 px-3">السعر الأصلي</th>
            <th class="py-2.5 px-3">سعر البيع</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800/60">
          ${misbahs.map(m => `
            <tr>
              <td class="py-2.5 px-3 font-bold text-amber-400">${m.code}</td>
              <td class="py-2.5 px-3">${getMisbahStatusBadge(m.status)}</td>
              <td class="py-2.5 px-3 font-semibold text-zinc-200">${m.cut || '-'}</td>
              <td class="py-2.5 px-3 text-zinc-400">${m.material || '-'}</td>
              <td class="py-2.5 px-3 font-mono text-zinc-300">${m.weight_grams ? `${m.weight_grams}ج` : '-'}</td>
              <td class="py-2.5 px-3 font-medium text-zinc-200">${m.owner_name}</td>
              <td class="py-2.5 px-3 font-mono text-zinc-300">${parseFloat(m.original_price).toFixed(3)} د.ك</td>
              <td class="py-2.5 px-3 font-mono font-bold text-amber-300">${parseFloat(m.selling_price).toFixed(3)} د.ك</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

async function renderDuesReportView(container) {
  container.innerHTML = `<div class="py-8 text-center text-zinc-500">جاري إنشاء تقرير المستحقات...</div>`;
  const res = await fetch('/api/owners');
  const data = await res.json();
  const owners = data.owners;

  const totalDue = owners.reduce((acc, o) => acc + parseFloat(o.sold_due_total || 0), 0);
  const totalPaid = owners.reduce((acc, o) => acc + parseFloat(o.total_paid || 0), 0);
  const totalPending = owners.reduce((acc, o) => acc + parseFloat(o.total_pending || 0), 0);

  container.innerHTML = `
    <div class="flex items-center justify-between border-b border-zinc-800 pb-3">
      <div>
        <h3 class="font-bold text-sm text-zinc-100">تقرير مستحقات أصحاب المسابيح والذمم</h3>
        <p class="text-xs text-zinc-400">كشف شامل بمبالغ الموردين المسددة والمتبقية</p>
      </div>
      <button onclick="exportTableToExcel('report-dues-table', 'تقرير_مستحقات_عبق_الكهرب')" class="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border border-zinc-700">
        <i data-lucide="file-spreadsheet" class="w-4 h-4 text-emerald-400"></i>
        <span>تصدير Excel</span>
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <div class="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
        <span class="text-xs text-zinc-400 block mb-1">إجمالي المستحق من المبيعات</span>
        <span class="text-xl font-black text-zinc-200">${totalDue.toFixed(3)} د.ك</span>
      </div>
      <div class="p-3.5 bg-zinc-900 border border-zinc-800 rounded-xl text-center">
        <span class="text-xs text-emerald-400 block mb-1">إجمالي المسدد للملاك</span>
        <span class="text-xl font-black text-emerald-400">${totalPaid.toFixed(3)} د.ك</span>
      </div>
      <div class="p-3.5 bg-zinc-900 border border-rose-900/40 rounded-xl text-center">
        <span class="text-xs text-rose-400 block mb-1">إجمالي المتبقي واجب السداد</span>
        <span class="text-xl font-black text-rose-400">${totalPending.toFixed(3)} د.ك</span>
      </div>
    </div>

    <div class="overflow-x-auto">
      <table id="report-dues-table" class="w-full text-right text-xs">
        <thead class="bg-zinc-900 text-zinc-400 border-b border-zinc-800">
          <tr>
            <th class="py-2.5 px-3">اسم المالك</th>
            <th class="py-2.5 px-3">رقم الهاتف</th>
            <th class="py-2.5 px-3 text-center">إجمالي القطع</th>
            <th class="py-2.5 px-3 text-center">المباع</th>
            <th class="py-2.5 px-3">المستحق الكلي</th>
            <th class="py-2.5 px-3 text-emerald-400 font-bold">المدفوع له</th>
            <th class="py-2.5 px-3 text-rose-400 font-black">المتبقي له (واجب السداد)</th>
          </tr>
        </thead>
        <tbody class="divide-y divide-zinc-800/60">
          ${owners.map(o => `
            <tr>
              <td class="py-2.5 px-3 font-bold text-zinc-200">${o.owner_name}</td>
              <td class="py-2.5 px-3 font-mono text-zinc-400">${o.owner_phone || '-'}</td>
              <td class="py-2.5 px-3 text-center font-semibold text-zinc-300">${o.total_pieces}</td>
              <td class="py-2.5 px-3 text-center font-semibold text-blue-400">${o.sold_pieces}</td>
              <td class="py-2.5 px-3 font-mono font-bold text-zinc-200">${parseFloat(o.sold_due_total || 0).toFixed(3)} د.ك</td>
              <td class="py-2.5 px-3 font-mono font-bold text-emerald-400">${parseFloat(o.total_paid || 0).toFixed(3)} د.ك</td>
              <td class="py-2.5 px-3 font-mono font-black ${parseFloat(o.total_pending || 0) > 0 ? 'text-rose-400' : 'text-zinc-500'}">${parseFloat(o.total_pending || 0).toFixed(3)} د.ك</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
  `;
}

// ==================== 8. المستخدمين والصلاحيات USERS ====================
async function loadUsers() {
  try {
    const res = await fetch('/api/users');
    const data = await res.json();
    state.users = data;

    const tbody = document.getElementById('users-tbody');
    if (!tbody) return;

    tbody.innerHTML = data.map((u, idx) => `
      <tr class="hover:bg-zinc-800/40 transition border-b border-zinc-800/60">
        <td class="py-3 px-3 font-semibold text-zinc-500">${idx + 1}</td>
        <td class="py-3 px-3 font-bold text-zinc-100">${u.username}</td>
        <td class="py-3 px-3 font-medium text-zinc-300">${u.full_name}</td>
        <td class="py-3 px-3">${getUserRoleBadge(u.role)}</td>
        <td class="py-3 px-3 font-mono text-zinc-400">${u.phone || '-'}</td>
        <td class="py-3 px-3 text-zinc-500">${u.created_at || '-'}</td>
        <td class="py-3 px-3 text-center no-print admin-only">
          ${u.id !== 1 ? `
            <button onclick="deleteUser(${u.id})" class="p-1.5 bg-red-950/40 hover:bg-red-900/60 text-red-400 rounded-lg" title="حذف المستخدم">
              <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
            </button>
          ` : `<span class="text-zinc-500 text-[11px]">المدير الرئيسي</span>`}
        </td>
      </tr>
    `).join('');

    applyRolePermissions();
    refreshIcons();
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function openNewUserModal() {
  document.getElementById('modal-user-title').textContent = 'إضافة مستخدم جديد للنظام';
  document.getElementById('user-form').reset();
  document.getElementById('user-id').value = '';
  openModal('modal-user');
}

async function saveUser(e) {
  e.preventDefault();
  const payload = {
    username: document.getElementById('usr-username').value,
    full_name: document.getElementById('usr-fullname').value,
    password: document.getElementById('usr-password').value,
    role: document.getElementById('usr-role').value,
    phone: document.getElementById('usr-phone').value
  };

  try {
    const res = await fetch('/api/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      showToast('تمت إضافة المستخدم بنجاح');
      closeModal('modal-user');
      loadUsers();
    } else {
      const err = await res.json();
      showToast(err.error || 'فشلت إضافة المستخدم', 'error');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالسيرفر', 'error');
  }
}

async function deleteUser(id) {
  if (!confirm('هل أنت متأكد من حذف هذا المستخدم؟')) return;
  try {
    const res = await fetch(`/api/users/${id}`, { method: 'DELETE' });
    const data = await res.json();
    if (res.ok) {
      showToast('تم حذف المستخدم بنجاح');
      loadUsers();
    } else {
      showToast(data.error || 'فشل حذف المستخدم', 'error');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالسيرفر', 'error');
  }
}

// ==================== 9. الإعدادات والنسخ الاحتياطي SETTINGS ====================
async function loadSettings() {
  try {
    const res = await fetch('/api/settings');
    const data = await res.json();
    state.settings = data;
  } catch (e) {}
}

function fillSettingsForm() {
  document.getElementById('setting-store-name').value = state.settings.store_name || 'عبق الكهرب';
  document.getElementById('setting-currency').value = state.settings.currency || 'د.ك';
  document.getElementById('setting-phone').value = state.settings.phone || '';
  document.getElementById('setting-tiktok').value = state.settings.tiktok_account || '';
  document.getElementById('setting-invoice-footer').value = state.settings.invoice_footer || '';
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
    const res = await fetch('/api/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    if (res.ok) {
      state.settings = { ...state.settings, ...payload };
      showToast('تم حفظ إعدادات عبق الكهرب بنجاح');
    } else {
      showToast('فشل حفظ الإعدادات', 'error');
    }
  } catch (err) {
    showToast('خطأ في الاتصال بالسيرفر', 'error');
  }
}

async function downloadBackup() {
  try {
    const res = await fetch('/api/backup');
    const data = await res.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `abaq_alkahrab_backup_${new Date().toISOString().slice(0,10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('تم تنزيل نسخة قاعدة البيانات بنجاح');
  } catch (err) {
    showToast('فشل تنزيل النسخة الاحتياطية', 'error');
  }
}

async function restoreBackup(e) {
  const file = e.target.files[0];
  if (!file) return;
  if (!confirm('تحذير: استعادة النسخة الاحتياطية ستستبدل البيانات الحالية على السيرفر. هل تريد المتابعة؟')) {
    e.target.value = '';
    return;
  }

  const reader = new FileReader();
  reader.onload = async (event) => {
    try {
      const json = JSON.parse(event.target.result);
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: json.data || json })
      });
      if (res.ok) {
        showToast('تمت استعادة قاعدة البيانات بنجاح!');
        setTimeout(() => location.reload(), 1000);
      } else {
        showToast('فشلت عملية الاستعادة', 'error');
      }
    } catch (err) {
      showToast('ملف النسخة الاحتياطية غير صالح', 'error');
    }
  };
  reader.readAsText(file);
}

// ==================== وظائف المساعدة والـ Badges ====================
function getMisbahStatusBadge(status) {
  if (status === 'حالي') return `<span class="px-2.5 py-0.5 rounded-full font-bold text-xs bg-emerald-950/60 text-emerald-400 border border-emerald-800/40">حالي</span>`;
  if (status === 'مباع') return `<span class="px-2.5 py-0.5 rounded-full font-bold text-xs bg-blue-950/60 text-blue-400 border border-blue-800/40">مباع</span>`;
  return `<span class="px-2.5 py-0.5 rounded-full font-bold text-xs bg-zinc-800 text-zinc-400 border border-zinc-700">منتهي</span>`;
}

function getReliabilityBadge(reliability) {
  if (reliability === 'معتمد') return `<span class="px-2 py-0.5 rounded-full font-bold text-[11px] bg-emerald-950/50 text-emerald-400 border border-emerald-800/30">معتمد ✅</span>`;
  return `<span class="px-2 py-0.5 rounded-full font-bold text-[11px] bg-red-950/50 text-red-400 border border-red-800/30">محظور ⛔</span>`;
}

function getPaymentBadge(status) {
  if (status === 'مدفوع كامل') return `<span class="px-2 py-0.5 rounded-full font-bold text-[11px] bg-emerald-950/50 text-emerald-400 border border-emerald-800/30">مدفوع كامل</span>`;
  if (status === 'مدفوع جزئي') return `<span class="px-2 py-0.5 rounded-full font-bold text-[11px] bg-amber-950/50 text-amber-400 border border-amber-800/30">مدفوع جزئي</span>`;
  return `<span class="px-2 py-0.5 rounded-full font-bold text-[11px] bg-rose-950/50 text-rose-400 border border-rose-800/30">غير مدفوع</span>`;
}

function getOwnerPayBadge(status) {
  if (status === 'تم الدفع') return `<span class="px-2 py-0.5 rounded-full font-bold text-[11px] text-emerald-400 font-bold">تم الدفع ✅</span>`;
  return `<span class="px-2 py-0.5 rounded-full font-bold text-[11px] text-rose-400 font-bold">لم يتم الدفع ⏳</span>`;
}

function getCheckBadge(status) {
  if (status === 'تم' || status === 'تم الاستلام') return `<span class="text-emerald-400 font-bold">تم ✅</span>`;
  return `<span class="text-zinc-500 font-medium">لم يتم</span>`;
}

function getDeliveryBadge(status) {
  if (status === 'مستلم') return `<span class="text-emerald-400 font-bold">مستلم</span>`;
  return `<span class="text-amber-400 font-medium">غير مستلم</span>`;
}

function getUserRoleBadge(role) {
  const styles = {
    Admin: 'bg-red-950/50 text-red-400 border-red-800/40',
    Manager: 'bg-purple-950/50 text-purple-400 border-purple-800/40',
    Employee: 'bg-emerald-950/50 text-emerald-400 border-emerald-800/40',
    'View Only': 'bg-zinc-800 text-zinc-400 border-zinc-700'
  };
  return `<span class="px-2 py-0.5 rounded-full font-bold text-[11px] border ${styles[role] || 'bg-zinc-800 text-zinc-300'}">${role}</span>`;
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
    state.misbahStatusFilter = '';
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
    showToast('مكتبة التصدير غير محملة', 'error');
  }
}

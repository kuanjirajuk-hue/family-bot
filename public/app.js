const API_BASE = '/api';

// ─────────────────────────────────────────────
//  Toast Notification
// ─────────────────────────────────────────────
function showToast(message, type = 'success') {
    let toast = document.getElementById('toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'toast';
        toast.style.cssText = `
            position: fixed; bottom: 30px; right: 30px; z-index: 9999;
            padding: 14px 22px; border-radius: 10px; font-size: 14px;
            font-weight: 500; color: #fff; box-shadow: 0 8px 24px rgba(0,0,0,0.3);
            transition: opacity 0.4s; opacity: 0; pointer-events: none;
        `;
        document.body.appendChild(toast);
    }
    toast.style.background = type === 'success' ? '#10b981' : '#ef4444';
    toast.textContent = message;
    toast.style.opacity = '1';
    clearTimeout(toast._timer);
    toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 3000);
}

// ─────────────────────────────────────────────
//  API Helper with Error Handling
// ─────────────────────────────────────────────
async function fetchData(endpoint) {
    const res = await fetch(`${API_BASE}/${endpoint}`);
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error(err.error || `HTTP ${res.status}`);
    }
    return await res.json();
}

async function postData(endpoint, data) {
    const res = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}

async function putData(endpoint, data) {
    const res = await fetch(`${API_BASE}/${endpoint}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}

async function deleteData(endpoint) {
    const res = await fetch(`${API_BASE}/${endpoint}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
    return json;
}

// ─────────────────────────────────────────────
//  Navigation
// ─────────────────────────────────────────────
document.querySelectorAll('.nav-links li').forEach(link => {
    link.addEventListener('click', (e) => {
        document.querySelectorAll('.nav-links li').forEach(l => l.classList.remove('active'));
        document.querySelectorAll('.view-section').forEach(s => s.classList.remove('active'));

        e.currentTarget.classList.add('active');
        const target = e.currentTarget.getAttribute('data-target');
        document.getElementById(target).classList.add('active');
        document.getElementById('page-title').textContent = e.currentTarget.textContent.trim();

        if (target === 'dashboard') loadDashboard();
        if (target === 'transactions') loadTransactions();
        if (target === 'stock') loadStock();
        if (target === 'fixed') loadFixed();
    });
});

// ─────────────────────────────────────────────
//  Modals
// ─────────────────────────────────────────────
function openModal(id) {
    document.getElementById(id).style.display = 'flex';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
    document.body.style.overflow = '';
    if (id === 'txModal') document.getElementById('txForm').reset();
    if (id === 'stockModal') {
        document.getElementById('stockForm').reset();
        document.getElementById('stockId').value = '';
    }
    if (id === 'fixedModal') {
        document.getElementById('fixedForm').reset();
        document.getElementById('fixedId').value = '';
    }
    if (id === 'userModal') {
        document.getElementById('userForm').reset();
    }
}

window.onclick = function (event) {
    if (event.target.classList.contains('modal')) {
        event.target.style.display = 'none';
    }
};

// ─────────────────────────────────────────────
//  Charts
// ─────────────────────────────────────────────
let categoryChartIns = null;
let userChartIns = null;

Chart.defaults.color = '#94a3b8';
Chart.defaults.borderColor = 'rgba(255,255,255,0.1)';

// ─────────────────────────────────────────────
//  Savings Visibility Toggle State
// ─────────────────────────────────────────────
let actualSavingsValue = 0;
let isSavingsHidden = localStorage.getItem('hide_savings') === 'true';

function updateSavingsDisplay() {
    const savingsEl = document.getElementById('total-savings');
    const iconEl = document.getElementById('toggleSavingsIcon');
    const btnEl = document.getElementById('toggleSavingsBtn');
    if (!savingsEl) return;

    if (isSavingsHidden) {
        savingsEl.innerText = '฿ ****';
        savingsEl.classList.add('masked');
        if (iconEl) iconEl.className = 'fa-solid fa-eye';
        if (btnEl) btnEl.title = 'แสดงยอดเงิน';
    } else {
        savingsEl.innerText = `฿${actualSavingsValue.toLocaleString('th-TH')}`;
        savingsEl.classList.remove('masked');
        if (iconEl) iconEl.className = 'fa-solid fa-eye-slash';
        if (btnEl) btnEl.title = 'ซ่อนยอดเงิน';
    }
}

function toggleSavingsVisibility() {
    isSavingsHidden = !isSavingsHidden;
    localStorage.setItem('hide_savings', isSavingsHidden);
    updateSavingsDisplay();
}

window.toggleSavingsVisibility = toggleSavingsVisibility;

// ─────────────────────────────────────────────
//  Dashboard
// ─────────────────────────────────────────────
async function loadDashboard() {
    try {
        const [txs, users, fixedTxs, settings, budgets] = await Promise.all([
            fetchData('transactions'),
            fetchData('users'),
            fetchData('fixed_transactions'),
            fetchData('settings'),
            fetchData('budgets').catch(() => [])
        ]);
        
        actualSavingsValue = parseFloat(settings['savings'] || 0);
        updateSavingsDisplay();

        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        const monthNamesThai = [
            'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
            'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
        ];
        const monthBadge = document.getElementById('budget-month-label');
        if (monthBadge) {
            monthBadge.innerText = `${monthNamesThai[currentMonth]} ${currentYear + 543}`;
        }

        let income = 0, expense = 0;
        const categoryData = {};
        const userData = {};

        txs.forEach(tx => {
            const d = new Date(tx.date);
            if (d.getMonth() === currentMonth && d.getFullYear() === currentYear) {
                const amt = parseFloat(tx.amount) || 0;
                if (tx.type === 'income') {
                    income += amt;
                } else {
                    expense += amt;
                    categoryData[tx.category] = (categoryData[tx.category] || 0) + amt;
                    const uId = tx.user_id || tx.userId;
                    const userName = uId && users[uId]
                        ? users[uId].name
                        : (uId || 'Unknown');
                    userData[userName] = (userData[userName] || 0) + amt;
                }
            }
        });

        // Add fixed transactions for the current month
        fixedTxs.forEach(tx => {
            const amt = parseFloat(tx.amount) || 0;
            if (tx.type === 'income') {
                income += amt;
            } else {
                expense += amt;
                categoryData[tx.category] = (categoryData[tx.category] || 0) + amt;
                userData['รายเดือน (System)'] = (userData['รายเดือน (System)'] || 0) + amt;
            }
        });

        document.getElementById('total-income').innerText = `฿${income.toLocaleString('th-TH')}`;
        document.getElementById('total-expense').innerText = `฿${expense.toLocaleString('th-TH')}`;

        const balance = income - expense;
        const balanceEl = document.getElementById('total-balance');
        balanceEl.innerText = `฿${balance.toLocaleString('th-TH')}`;
        balanceEl.className = `amount ${balance >= 0 ? 'positive' : 'negative'}`;

        // Render User Monthly Budgets
        renderUserBudgets(budgets);

        // Populate users datalist for forms
        updateUsersDatalist(users, budgets);

        renderCharts(categoryData, userData);
    } catch (err) {
        console.error('loadDashboard error:', err);
        showToast('โหลดข้อมูลแดชบอร์ดไม่สำเร็จ: ' + err.message, 'error');
    }
}

function updateUsersDatalist(users, budgets) {
    const datalist = document.getElementById('usersList');
    if (!datalist) return;
    datalist.innerHTML = '';
    const names = new Set();

    if (budgets && Array.isArray(budgets)) {
        budgets.forEach(b => { if (b.userName && b.userName !== '???') names.add(b.userName); });
    }
    if (users && typeof users === 'object') {
        Object.values(users).forEach(u => { if (u.name && u.name !== '???') names.add(u.name); });
    }

    names.forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        datalist.appendChild(option);
    });
}

function renderUserBudgets(budgets) {
    const grid = document.getElementById('userBudgetGrid');
    if (!grid) return;
    grid.innerHTML = '';

    if (!budgets || budgets.length === 0) {
        grid.innerHTML = '<div style="grid-column: 1/-1; text-align: center; color: var(--text-muted); padding: 1.5rem;">ยังไม่มีข้อมูลสมาชิกครอบครัว</div>';
        return;
    }

    budgets.forEach(u => {
        let statusClass = 'status-healthy';
        let pillClass = 'pill-healthy';
        let fillClass = 'fill-healthy';
        let pillText = '<i class="fa-solid fa-circle-check"></i> ปกติ';
        let valClass = 'val-healthy';

        if (u.isOverBudget || u.remaining < 0) {
            statusClass = 'status-over';
            pillClass = 'pill-over';
            fillClass = 'fill-over';
            pillText = '<i class="fa-solid fa-triangle-exclamation"></i> เกินงบ';
            valClass = 'val-over';
        } else if (u.percentage >= 75) {
            statusClass = 'status-warning';
            pillClass = 'pill-warning';
            fillClass = 'fill-warning';
            pillText = '<i class="fa-solid fa-bell"></i> ใกล้หมด';
            valClass = 'val-warning';
        }

        const initialChar = (u.userName || 'U').trim().charAt(0).toUpperCase();
        const percentClamped = Math.min(Math.max(u.percentage || 0, 0), 100);

        const card = document.createElement('div');
        card.className = `user-budget-card ${statusClass}`;
        card.innerHTML = `
            <div class="budget-card-top">
                <div class="budget-user-profile">
                    <div class="budget-avatar">${initialChar}</div>
                    <div>
                        <div class="budget-user-name">${u.userName}</div>
                        <div style="font-size: 0.75rem; color: var(--text-muted);">วงเงิน: ฿${(u.budget || 4000).toLocaleString('th-TH')}</div>
                    </div>
                </div>
                <span class="budget-pill ${pillClass}">${pillText}</span>
            </div>
            
            <div class="budget-meter-wrap">
                <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 5px;">
                    <span style="color: var(--text-muted);">ใช้ไป ${u.percentage}%</span>
                    <span style="font-weight: 600;">฿${(u.spent || 0).toLocaleString('th-TH')} / ฿${(u.budget || 4000).toLocaleString('th-TH')}</span>
                </div>
                <div class="budget-bar-track">
                    <div class="budget-bar-fill ${fillClass}" style="width: ${percentClamped}%;"></div>
                </div>
            </div>

            <div class="budget-stats-grid">
                <div class="budget-stat-col">
                    <span class="budget-stat-label">งบต่อเดือน</span>
                    <span class="budget-stat-val val-muted">฿${(u.budget || 4000).toLocaleString('th-TH')}</span>
                </div>
                <div class="budget-stat-col">
                    <span class="budget-stat-label">ใช้ไปแล้ว</span>
                    <span class="budget-stat-val ${valClass}">฿${(u.spent || 0).toLocaleString('th-TH')}</span>
                </div>
                <div class="budget-stat-col">
                    <span class="budget-stat-label">${u.remaining >= 0 ? 'คงเหลือ' : 'เกินงบ'}</span>
                    <span class="budget-stat-val ${valClass}">฿${Math.abs(u.remaining || 0).toLocaleString('th-TH')}</span>
                </div>
            </div>

            <div class="budget-card-footer">
                <button class="btn-edit-budget" onclick="editUserBudget('${u.userId}', '${u.userName}', ${u.budget || 4000})">
                    <i class="fa-solid fa-pen"></i> ปรับวงเงิน
                </button>
                <button class="btn-delete-user" onclick="deleteUser('${u.userId}', '${u.userName}')">
                    <i class="fa-solid fa-trash"></i> ลบสมาชิก
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

async function deleteUser(userId, userName) {
    if (!confirm(`คุณต้องการลบสมาชิก "${userName}" ใช่หรือไม่?`)) return;
    try {
        await deleteData(`users/${encodeURIComponent(userId)}`);
        showToast(`🗑️ ลบสมาชิก "${userName}" เรียบร้อยแล้ว`);
        loadDashboard();
    } catch (err) {
        console.error('deleteUser error:', err);
        showToast('❌ ลบสมาชิกไม่สำเร็จ: ' + err.message, 'error');
    }
}

async function editUserBudget(userId, userName, currentBudget) {
    try {
        const input = prompt(`ระบุวงเงินงบรายเดือนของ ${userName} (บาท):`, currentBudget || 4000);
        if (input !== null && !isNaN(input) && input.trim() !== '') {
            const newBudget = parseFloat(input);
            if (newBudget < 0) {
                showToast('วงเงินต้องมากกว่าหรือเท่ากับ 0 บาท', 'error');
                return;
            }
            await putData(`users/${encodeURIComponent(userId)}/budget`, { budget: newBudget });
            showToast(`✅ อัปเดตงบของ ${userName} เป็น ฿${newBudget.toLocaleString('th-TH')} เรียบร้อย`);
            loadDashboard();
        }
    } catch (err) {
        console.error('editUserBudget error:', err);
        showToast('❌ ปรับวงเงินไม่สำเร็จ: ' + err.message, 'error');
    }
}

// User Form Submit
document.getElementById('userForm')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('newUserName').value.trim();
    const budget = parseFloat(document.getElementById('newUserBudget').value) || 4000;

    if (!name) {
        showToast('กรุณากรอกชื่อสมาชิก', 'error');
        return;
    }

    try {
        await postData('users', { name, budget });
        showToast(`✅ เพิ่มสมาชิก "${name}" เรียบร้อยแล้ว`);
        closeModal('userModal');
        loadDashboard();
    } catch (err) {
        console.error('userForm error:', err);
        showToast('❌ เพิ่มสมาชิกไม่สำเร็จ: ' + err.message, 'error');
    }
});

async function editSavings() {
    try {
        const settings = await fetchData('settings');
        actualSavingsValue = parseFloat(settings['savings'] || 0);
        const newSavings = prompt("ระบุยอดเงินเก็บสะสมปัจจุบัน (บาท):", actualSavingsValue);
        if (newSavings !== null && !isNaN(newSavings) && newSavings.trim() !== "") {
            await postData('settings', { key: 'savings', value: newSavings });
            actualSavingsValue = parseFloat(newSavings);
            showToast('✅ อัปเดตเงินเก็บเรียบร้อยแล้ว');
            loadDashboard();
        }
    } catch (err) {
        console.error('editSavings error:', err);
        showToast('❌ อัปเดตไม่สำเร็จ: ' + err.message, 'error');
    }
}
window.editSavings = editSavings;

function renderCharts(categoryData, userData) {
    if (categoryChartIns) categoryChartIns.destroy();
    if (userChartIns) userChartIns.destroy();

    const colors = ['#ec4899', '#8b5cf6', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#06b6d4'];

    const ctxCat = document.getElementById('categoryChart').getContext('2d');
    categoryChartIns = new Chart(ctxCat, {
        type: 'doughnut',
        data: {
            labels: Object.keys(categoryData),
            datasets: [{
                data: Object.values(categoryData),
                backgroundColor: colors,
                borderWidth: 0
            }]
        },
        options: {
            cutout: '70%',
            plugins: { legend: { position: 'right' } }
        }
    });

    const ctxUser = document.getElementById('userChart').getContext('2d');
    userChartIns = new Chart(ctxUser, {
        type: 'bar',
        data: {
            labels: Object.keys(userData),
            datasets: [{
                label: 'รายจ่าย (บาท)',
                data: Object.values(userData),
                backgroundColor: '#6366f1',
                borderRadius: 5
            }]
        }
    });
}

// ─────────────────────────────────────────────
//  Transactions & Filters State
// ─────────────────────────────────────────────
let cachedTransactions = [];
let cachedUsers = {};
let isTxFiltersInitialized = false;

const txFilterState = {
    period: 'all',       // 'all', 'month', 'today', '7days', 'prev_month', 'custom'
    search: '',
    type: 'all',         // 'all', 'income', 'expense'
    category: 'all',
    user: 'all',
    sort: 'date-desc',   // 'date-desc', 'date-asc', 'amount-desc', 'amount-asc'
    startDate: '',
    endDate: ''
};

function initTxFilters() {
    if (isTxFiltersInitialized) return;
    isTxFiltersInitialized = true;

    // Period quick pills
    const periodPills = document.querySelectorAll('#txPeriodPills .filter-pill');
    periodPills.forEach(pill => {
        pill.addEventListener('click', () => {
            periodPills.forEach(p => p.classList.remove('active'));
            pill.classList.add('active');
            const period = pill.dataset.period;
            txFilterState.period = period;

            const customRow = document.getElementById('txCustomDateRow');
            if (customRow) {
                if (period === 'custom') {
                    customRow.style.display = 'block';
                } else {
                    customRow.style.display = 'none';
                }
            }
            renderFilteredTransactions();
        });
    });

    // Search input & clear button
    const searchInput = document.getElementById('txFilterSearch');
    const clearSearchBtn = document.getElementById('txClearSearch');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            txFilterState.search = e.target.value;
            if (clearSearchBtn) {
                clearSearchBtn.style.display = e.target.value.trim() ? 'flex' : 'none';
            }
            renderFilteredTransactions();
        });
    }
    if (clearSearchBtn) {
        clearSearchBtn.addEventListener('click', () => {
            if (searchInput) searchInput.value = '';
            txFilterState.search = '';
            clearSearchBtn.style.display = 'none';
            renderFilteredTransactions();
            if (searchInput) searchInput.focus();
        });
    }

    // Type select
    const typeSelect = document.getElementById('txFilterType');
    if (typeSelect) {
        typeSelect.addEventListener('change', (e) => {
            txFilterState.type = e.target.value;
            renderFilteredTransactions();
        });
    }

    // Category select
    const categorySelect = document.getElementById('txFilterCategory');
    if (categorySelect) {
        categorySelect.addEventListener('change', (e) => {
            txFilterState.category = e.target.value;
            renderFilteredTransactions();
        });
    }

    // User select
    const userSelect = document.getElementById('txFilterUser');
    if (userSelect) {
        userSelect.addEventListener('change', (e) => {
            txFilterState.user = e.target.value;
            renderFilteredTransactions();
        });
    }

    // Sort select
    const sortSelect = document.getElementById('txFilterSort');
    if (sortSelect) {
        sortSelect.addEventListener('change', (e) => {
            txFilterState.sort = e.target.value;
            renderFilteredTransactions();
        });
    }

    // Custom Date inputs
    const startInput = document.getElementById('txDateStart');
    const endInput = document.getElementById('txDateEnd');
    if (startInput) {
        startInput.addEventListener('change', (e) => {
            txFilterState.startDate = e.target.value;
            renderFilteredTransactions();
        });
    }
    if (endInput) {
        endInput.addEventListener('change', (e) => {
            txFilterState.endDate = e.target.value;
            renderFilteredTransactions();
        });
    }
}

function updateTxFilterDropdowns() {
    // 1. Populate categories
    const categorySelect = document.getElementById('txFilterCategory');
    if (categorySelect) {
        const currentCategory = txFilterState.category;
        const categories = Array.from(
            new Set(cachedTransactions.map(t => (t.category || '').trim()).filter(Boolean))
        ).sort();

        categorySelect.innerHTML = '<option value="all">ทุกหมวดหมู่</option>';
        categories.forEach(cat => {
            const opt = document.createElement('option');
            opt.value = cat;
            opt.textContent = cat;
            categorySelect.appendChild(opt);
        });

        if (categories.includes(currentCategory)) {
            categorySelect.value = currentCategory;
        } else {
            txFilterState.category = 'all';
            categorySelect.value = 'all';
        }
    }

    // 2. Populate users
    const userSelect = document.getElementById('txFilterUser');
    if (userSelect) {
        const currentUser = txFilterState.user;
        const userNames = new Set();

        if (cachedUsers && typeof cachedUsers === 'object') {
            Object.values(cachedUsers).forEach(u => {
                const name = (u.name || '').trim();
                if (name && name !== '???') userNames.add(name);
            });
        }

        cachedTransactions.forEach(t => {
            const uId = t.user_id || t.userId;
            const userName = uId && cachedUsers[uId] ? cachedUsers[uId].name : (uId || '');
            const cleanName = (userName || '').trim();
            if (cleanName && cleanName !== '???') userNames.add(cleanName);
        });

        const sortedUsers = Array.from(userNames).sort();
        userSelect.innerHTML = '<option value="all">สมาชิกทุกคน</option>';
        sortedUsers.forEach(name => {
            const opt = document.createElement('option');
            opt.value = name;
            opt.textContent = `👤 ${name}`;
            userSelect.appendChild(opt);
        });

        if (sortedUsers.includes(currentUser)) {
            userSelect.value = currentUser;
        } else {
            txFilterState.user = 'all';
            userSelect.value = 'all';
        }
    }
}

function getFilteredTransactions() {
    let result = [...cachedTransactions];
    const now = new Date();

    // 1. Period filter
    if (txFilterState.period === 'today') {
        const start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
        result = result.filter(tx => {
            const d = new Date(tx.date);
            return !isNaN(d.getTime()) && d >= start && d <= end;
        });
    } else if (txFilterState.period === '7days') {
        const start = new Date();
        start.setDate(now.getDate() - 7);
        start.setHours(0, 0, 0, 0);
        result = result.filter(tx => {
            const d = new Date(tx.date);
            return !isNaN(d.getTime()) && d >= start;
        });
    } else if (txFilterState.period === 'month') {
        result = result.filter(tx => {
            const d = new Date(tx.date);
            return !isNaN(d.getTime()) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        });
    } else if (txFilterState.period === 'prev_month') {
        const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const prevYear = prevMonthDate.getFullYear();
        const prevMonth = prevMonthDate.getMonth();
        result = result.filter(tx => {
            const d = new Date(tx.date);
            return !isNaN(d.getTime()) && d.getFullYear() === prevYear && d.getMonth() === prevMonth;
        });
    } else if (txFilterState.period === 'custom') {
        if (txFilterState.startDate) {
            const start = new Date(txFilterState.startDate + 'T00:00:00');
            result = result.filter(tx => {
                const d = new Date(tx.date);
                return !isNaN(d.getTime()) && d >= start;
            });
        }
        if (txFilterState.endDate) {
            const end = new Date(txFilterState.endDate + 'T23:59:59');
            result = result.filter(tx => {
                const d = new Date(tx.date);
                return !isNaN(d.getTime()) && d <= end;
            });
        }
    }

    // 2. Type filter
    if (txFilterState.type !== 'all') {
        result = result.filter(tx => tx.type === txFilterState.type);
    }

    // 3. Category filter
    if (txFilterState.category !== 'all') {
        result = result.filter(tx => (tx.category || '').trim() === txFilterState.category);
    }

    // 4. User filter
    if (txFilterState.user !== 'all') {
        result = result.filter(tx => {
            const uId = tx.user_id || tx.userId;
            const userName = uId && cachedUsers[uId] ? cachedUsers[uId].name : (uId || '');
            return (userName || '').toLowerCase() === txFilterState.user.toLowerCase() || String(uId) === txFilterState.user;
        });
    }

    // 5. Keyword search (category, description, user, amount)
    if (txFilterState.search.trim()) {
        const kw = txFilterState.search.trim().toLowerCase();
        result = result.filter(tx => {
            const uId = tx.user_id || tx.userId;
            const userName = uId && cachedUsers[uId] ? cachedUsers[uId].name : (uId || '');
            const cat = (tx.category || '').toLowerCase();
            const desc = (tx.description || '').toLowerCase();
            const usr = (userName || '').toLowerCase();
            const amt = String(tx.amount || '');
            return cat.includes(kw) || desc.includes(kw) || usr.includes(kw) || amt.includes(kw);
        });
    }

    // 6. Sorting
    result.sort((a, b) => {
        const dateA = new Date(a.date).getTime() || 0;
        const dateB = new Date(b.date).getTime() || 0;
        const amtA = parseFloat(a.amount) || 0;
        const amtB = parseFloat(b.amount) || 0;

        if (txFilterState.sort === 'date-desc') return dateB - dateA;
        if (txFilterState.sort === 'date-asc') return dateA - dateB;
        if (txFilterState.sort === 'amount-desc') return amtB - amtA;
        if (txFilterState.sort === 'amount-asc') return amtA - amtB;
        return 0;
    });

    return result;
}

function renderFilteredTransactions() {
    const tbody = document.querySelector('#txTable tbody');
    if (!tbody) return;
    tbody.innerHTML = '';

    const filtered = getFilteredTransactions();

    // Calculate Summary Stats for filtered results
    let income = 0;
    let expense = 0;
    filtered.forEach(tx => {
        const amt = parseFloat(tx.amount) || 0;
        if (tx.type === 'income') {
            income += amt;
        } else {
            expense += amt;
        }
    });
    const balance = income - expense;

    // Update Mini Summary Cards
    const summaryIncomeEl = document.getElementById('txSummaryIncome');
    const summaryExpenseEl = document.getElementById('txSummaryExpense');
    const summaryBalanceEl = document.getElementById('txSummaryBalance');
    const summaryCountEl = document.getElementById('txSummaryCount');
    const filterCountEl = document.getElementById('txFilterCount');

    if (summaryIncomeEl) summaryIncomeEl.innerText = `฿${income.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (summaryExpenseEl) summaryExpenseEl.innerText = `฿${expense.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    if (summaryBalanceEl) {
        summaryBalanceEl.innerText = `${balance >= 0 ? '+' : ''}฿${balance.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
        summaryBalanceEl.className = `mini-value ${balance >= 0 ? 'positive' : 'negative'}`;
    }
    if (summaryCountEl) summaryCountEl.innerText = `${filtered.length.toLocaleString('th-TH')} รายการ`;
    if (filterCountEl) {
        filterCountEl.innerText = `แสดง ${filtered.length.toLocaleString('th-TH')} จากทั้งหมด ${cachedTransactions.length.toLocaleString('th-TH')} รายการ`;
    }

    // Render Table Rows or Empty State
    if (filtered.length === 0) {
        const tr = document.createElement('tr');
        if (cachedTransactions.length === 0) {
            tr.innerHTML = `
                <td colspan="6" class="tx-empty-state">
                    <i class="fa-solid fa-receipt"></i>
                    <p>ยังไม่มีรายการบันทึกในระบบ</p>
                    <span>เริ่มต้นโดยการกดปุ่ม "เพิ่มรายการ" ด้านบน</span>
                    <button class="btn primary btn-sm" onclick="openModal('txModal')">
                        <i class="fa-solid fa-plus"></i> เพิ่มรายการแรก
                    </button>
                </td>
            `;
        } else {
            tr.innerHTML = `
                <td colspan="6" class="tx-empty-state">
                    <i class="fa-solid fa-filter-circle-xmark"></i>
                    <p>ไม่พบรายการที่ตรงกับเงื่อนไขการค้นหา / ตัวกรอง</p>
                    <span>ลองปรับเปลี่ยนคำค้นหา หรือเลือกช่วงเวลาอื่น</span>
                    <button class="btn secondary btn-sm" onclick="resetTxFilters()">
                        <i class="fa-solid fa-rotate-left"></i> ล้างตัวกรองทั้งหมด
                    </button>
                </td>
            `;
        }
        tbody.appendChild(tr);
        return;
    }

    filtered.forEach(tx => {
        const tr = document.createElement('tr');
        const uId = tx.user_id || tx.userId;
        const userName = uId && cachedUsers[uId] ? cachedUsers[uId].name : (uId || '-');

        const d = new Date(tx.date);
        const isValidDate = !isNaN(d.getTime());
        const dateStr = isValidDate ? d.toLocaleDateString('th-TH', { year: 'numeric', month: 'short', day: 'numeric' }) : '-';
        const timeStr = isValidDate ? d.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }) : '';

        const descDiffers = tx.description && tx.description.trim() && tx.description.trim() !== (tx.category || '').trim();

        tr.innerHTML = `
            <td>
                <div>${dateStr}</div>
                ${timeStr ? `<span class="tx-time-sub"><i class="fa-regular fa-clock" style="font-size:0.68rem;margin-right:2px;"></i>${timeStr} น.</span>` : ''}
            </td>
            <td><span class="badge ${tx.type}">${tx.type === 'income' ? '💰 รายรับ' : '💸 รายจ่าย'}</span></td>
            <td>
                <div style="font-weight: 500;">${escapeHtml(tx.category || '-')}</div>
                ${descDiffers ? `<span class="tx-desc-sub">${escapeHtml(tx.description)}</span>` : ''}
            </td>
            <td class="${tx.type === 'income' ? 'positive' : 'negative'}" style="font-weight: 600;">
                ${tx.type === 'income' ? '+' : '-'}฿${parseFloat(tx.amount || 0).toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </td>
            <td>
                <span style="display:inline-flex;align-items:center;gap:0.35rem;">
                    <i class="fa-regular fa-user" style="color:var(--text-muted);font-size:0.75rem;"></i>
                    ${escapeHtml(userName)}
                </span>
            </td>
            <td>
                <button class="btn secondary icon-only" onclick="editTxById('${tx.id}')" title="แก้ไขรายการ" style="margin-right: 5px;">
                    <i class="fa-solid fa-pen"></i>
                </button>
                <button class="btn danger icon-only" onclick="deleteTx('${tx.id}')" title="ลบรายการ">
                    <i class="fa-solid fa-trash"></i>
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function resetTxFilters() {
    txFilterState.period = 'all';
    txFilterState.search = '';
    txFilterState.type = 'all';
    txFilterState.category = 'all';
    txFilterState.user = 'all';
    txFilterState.sort = 'date-desc';
    txFilterState.startDate = '';
    txFilterState.endDate = '';

    // Reset Pills
    document.querySelectorAll('#txPeriodPills .filter-pill').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.period === 'all');
    });

    // Reset inputs
    const searchInput = document.getElementById('txFilterSearch');
    if (searchInput) searchInput.value = '';
    const clearBtn = document.getElementById('txClearSearch');
    if (clearBtn) clearBtn.style.display = 'none';

    const typeSelect = document.getElementById('txFilterType');
    if (typeSelect) typeSelect.value = 'all';

    const catSelect = document.getElementById('txFilterCategory');
    if (catSelect) catSelect.value = 'all';

    const userSelect = document.getElementById('txFilterUser');
    if (userSelect) userSelect.value = 'all';

    const sortSelect = document.getElementById('txFilterSort');
    if (sortSelect) sortSelect.value = 'date-desc';

    const startInput = document.getElementById('txDateStart');
    if (startInput) startInput.value = '';

    const endInput = document.getElementById('txDateEnd');
    if (endInput) endInput.value = '';

    const customRow = document.getElementById('txCustomDateRow');
    if (customRow) customRow.style.display = 'none';

    renderFilteredTransactions();
    showToast('ล้างตัวกรองทั้งหมดแล้ว');
}

function exportFilteredTransactionsCSV() {
    const list = getFilteredTransactions();
    if (!list || list.length === 0) {
        showToast('ไม่มีรายการตามเงื่อนไขที่เลือกเพื่อส่งออก', 'error');
        return;
    }

    const headers = ['วันที่', 'เวลา', 'ประเภท', 'หมวดหมู่', 'รายละเอียด', 'จำนวนเงิน (บาท)', 'ผู้บันทึก'];
    const rows = list.map(tx => {
        const d = new Date(tx.date);
        const isValidDate = !isNaN(d.getTime());
        const dateStr = isValidDate ? d.toLocaleDateString('th-TH') : '-';
        const timeStr = isValidDate ? d.toLocaleTimeString('th-TH') : '';
        const uId = tx.user_id || tx.userId;
        const userName = uId && cachedUsers[uId] ? cachedUsers[uId].name : (uId || '');
        const typeStr = tx.type === 'income' ? 'รายรับ' : 'รายจ่าย';
        const catClean = `"${(tx.category || '').replace(/"/g, '""')}"`;
        const descClean = `"${(tx.description || tx.category || '').replace(/"/g, '""')}"`;
        const userClean = `"${(userName || '').replace(/"/g, '""')}"`;

        return [dateStr, timeStr, typeStr, catClean, descClean, tx.amount, userClean].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const nowStr = new Date().toISOString().slice(0, 10);
    a.download = `transactions_${txFilterState.period}_${nowStr}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('✅ ส่งออกไฟล์ CSV สำเร็จ');
}

function escapeHtml(str) {
    if (!str) return '';
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

function editTxById(id) {
    const tx = cachedTransactions.find(t => String(t.id) === String(id));
    if (!tx) {
        showToast('ไม่พบข้อมูลรายการ', 'error');
        return;
    }
    const uId = tx.user_id || tx.userId;
    const userName = uId && cachedUsers[uId] ? cachedUsers[uId].name : (uId || '');

    document.getElementById('txId').value = tx.id;
    document.getElementById('txType').value = tx.type;
    document.getElementById('txCategory').value = tx.category || '';
    document.getElementById('txAmount').value = tx.amount;
    document.getElementById('txUser').value = userName;
    document.getElementById('txModalTitle').innerHTML = '<i class="fa-solid fa-pen" style="margin-right:0.5rem;color:var(--primary);"></i>แก้ไขรายการ';
    openModal('txModal');
}

// Backward-compatible editTx
function editTx(id, type, category, amount, user) {
    editTxById(id);
}

async function loadTransactions() {
    try {
        const [txs, users] = await Promise.all([
            fetchData('transactions'),
            fetchData('users')
        ]);
        cachedTransactions = txs || [];
        cachedUsers = users || {};

        initTxFilters();
        updateTxFilterDropdowns();
        renderFilteredTransactions();
    } catch (err) {
        console.error('loadTransactions error:', err);
        showToast('โหลดรายการไม่สำเร็จ: ' + err.message, 'error');
    }
}

// Expose handlers globally
window.loadTransactions = loadTransactions;
window.resetTxFilters = resetTxFilters;
window.exportFilteredTransactionsCSV = exportFilteredTransactionsCSV;
window.editTxById = editTxById;
window.editTx = editTx;

document.getElementById('txForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';

    try {
        const id = document.getElementById('txId').value;
        const data = {
            type: document.getElementById('txType').value,
            category: document.getElementById('txCategory').value.trim(),
            amount: parseFloat(document.getElementById('txAmount').value),
            userId: document.getElementById('txUser').value.trim()
        };

        if (id) {
            await putData(`transactions/${id}`, data);
            showToast('✅ แก้ไขรายการเรียบร้อยแล้ว');
        } else {
            await postData('transactions', data);
            showToast('✅ บันทึกรายการเรียบร้อยแล้ว');
        }
        
        closeModal('txModal');
        document.getElementById('txId').value = '';
        document.getElementById('txModalTitle').textContent = 'เพิ่มรายการใหม่';
        loadTransactions();
        loadDashboard();
    } catch (err) {
        console.error('saveTransaction error:', err);
        showToast('❌ บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'บันทึก';
    }
});

async function deleteTx(id) {
    if (!confirm('ต้องการลบรายการนี้?')) return;
    try {
        await deleteData(`transactions/${id}`);
        showToast('✅ ลบรายการเรียบร้อยแล้ว');
        loadTransactions();
        loadDashboard();
    } catch (err) {
        showToast('❌ ลบไม่สำเร็จ: ' + err.message, 'error');
    }
}

// ─────────────────────────────────────────────
//  Stock
// ─────────────────────────────────────────────
async function loadStock() {
    try {
        const stocks = await fetchData('stock');
        const grid = document.getElementById('stockGrid');
        grid.innerHTML = '';

        if (stocks.length === 0) {
            grid.innerHTML = '<p style="color:var(--text-muted);text-align:center;width:100%">ยังไม่มีสินค้าในสต็อก</p>';
            return;
        }

        stocks.forEach(s => {
            const isLow = parseFloat(s.quantity) <= parseFloat(s.threshold || 1);
            const div = document.createElement('div');
            div.className = `stock-card glass ${isLow ? 'low-stock' : ''}`;
            div.innerHTML = `
                ${isLow ? '<div style="color:var(--negative); position:absolute; top:10px; right:10px"><i class="fa-solid fa-triangle-exclamation"></i></div>' : ''}
                <h3>${s.name}</h3>
                <div class="stock-qty">${parseFloat(s.quantity).toLocaleString('th-TH')}</div>
                <div style="color:var(--text-muted)">${s.unit}</div>
                <div class="stock-actions">
                    <button class="btn primary icon-only" onclick="editStock('${s.id}')">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn danger icon-only" onclick="deleteStock('${s.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
            grid.appendChild(div);
        });
    } catch (err) {
        console.error('loadStock error:', err);
        showToast('โหลดสต็อกไม่สำเร็จ: ' + err.message, 'error');
    }
}

document.getElementById('stockForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';

    try {
        const idVal = document.getElementById('stockId').value;
        const data = {
            id: idVal || undefined,
            name: document.getElementById('stockName').value.trim(),
            quantity: parseFloat(document.getElementById('stockQty').value),
            unit: document.getElementById('stockUnit').value.trim(),
            threshold: parseFloat(document.getElementById('stockThreshold').value)
        };

        await postData('stock', data);
        showToast('✅ บันทึกสต็อกเรียบร้อยแล้ว');
        closeModal('stockModal');
        loadStock();
    } catch (err) {
        console.error('saveStock error:', err);
        showToast('❌ บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'บันทึก';
    }
});

async function editStock(id) {
    try {
        const stocks = await fetchData('stock');
        const s = stocks.find(x => x.id === id);
        if (s) {
            document.getElementById('stockId').value = s.id;
            document.getElementById('stockName').value = s.name;
            document.getElementById('stockQty').value = s.quantity;
            document.getElementById('stockUnit').value = s.unit;
            document.getElementById('stockThreshold').value = s.threshold || 1;
            openModal('stockModal');
        }
    } catch (err) {
        showToast('โหลดข้อมูลไม่สำเร็จ: ' + err.message, 'error');
    }
}

async function deleteStock(id) {
    if (!confirm('ต้องการลบสินค้านี้?')) return;
    try {
        await deleteData(`stock/${id}`);
        showToast('✅ ลบสินค้าเรียบร้อยแล้ว');
        loadStock();
    } catch (err) {
        showToast('❌ ลบไม่สำเร็จ: ' + err.message, 'error');
    }
}

// ─────────────────────────────────────────────
//  Fixed Transactions
// ─────────────────────────────────────────────
async function loadFixed() {
    try {
        const data = await fetchData('fixed_transactions');
        const tbody = document.querySelector('#fixedTable tbody');
        tbody.innerHTML = '';

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted)">ยังไม่มีรายการประจำ</td></tr>';
            return;
        }

        data.sort((a, b) => (a.recurringDay || 0) - (b.recurringDay || 0)).forEach(tx => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td>วันที่ ${tx.recurringDay}</td>
                <td><span class="badge ${tx.type}">${tx.type === 'income' ? 'รายรับ' : 'รายจ่าย'}</span></td>
                <td>${tx.category}</td>
                <td class="${tx.type === 'income' ? 'positive' : 'negative'}">฿${parseFloat(tx.amount).toLocaleString('th-TH')}</td>
                <td>
                    <button class="btn danger icon-only" onclick="deleteFixed('${tx.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('loadFixed error:', err);
        showToast('โหลดรายการประจำไม่สำเร็จ: ' + err.message, 'error');
    }
}

document.getElementById('fixedForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'กำลังบันทึก...';

    try {
        const idVal = document.getElementById('fixedId').value;
        const data = {
            id: idVal || undefined,
            type: document.getElementById('fixedType').value,
            category: document.getElementById('fixedCategory').value.trim(),
            amount: parseFloat(document.getElementById('fixedAmount').value),
            recurringDay: parseInt(document.getElementById('fixedDay').value)
        };

        await postData('fixed_transactions', data);
        showToast('✅ บันทึกรายการประจำเรียบร้อยแล้ว');
        closeModal('fixedModal');
        loadFixed();
    } catch (err) {
        console.error('saveFixed error:', err);
        showToast('❌ บันทึกไม่สำเร็จ: ' + err.message, 'error');
    } finally {
        btn.disabled = false;
        btn.textContent = 'บันทึก';
    }
});

async function deleteFixed(id) {
    if (!confirm('ต้องการลบรายการนี้?')) return;
    try {
        await deleteData(`fixed_transactions/${id}`);
        showToast('✅ ลบรายการเรียบร้อยแล้ว');
        loadFixed();
    } catch (err) {
        showToast('❌ ลบไม่สำเร็จ: ' + err.message, 'error');
    }
}

// ─────────────────────────────────────────────
//  Init on page load
// ─────────────────────────────────────────────
window.loadDashboard = loadDashboard;
window.loadStock = loadStock;
window.loadFixed = loadFixed;

loadDashboard();

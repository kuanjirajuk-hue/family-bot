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
    document.getElementById(id).style.display = 'block';
}

function closeModal(id) {
    document.getElementById(id).style.display = 'none';
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
        
        const currentSavings = parseFloat(settings['savings'] || 0);
        document.getElementById('total-savings').innerText = `฿${currentSavings.toLocaleString('th-TH')}`;

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
        const current = parseFloat(settings['savings'] || 0);
        const newSavings = prompt("ระบุยอดเงินเก็บสะสมปัจจุบัน (บาท):", current);
        if (newSavings !== null && !isNaN(newSavings) && newSavings.trim() !== "") {
            await postData('settings', { key: 'savings', value: newSavings });
            showToast('✅ อัปเดตเงินเก็บเรียบร้อยแล้ว');
            loadDashboard();
        }
    } catch (err) {
        console.error('editSavings error:', err);
        showToast('❌ อัปเดตไม่สำเร็จ: ' + err.message, 'error');
    }
}

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
//  Transactions
// ─────────────────────────────────────────────
async function loadTransactions() {
    try {
        const [txs, users] = await Promise.all([
            fetchData('transactions'),
            fetchData('users')
        ]);
        const tbody = document.querySelector('#txTable tbody');
        tbody.innerHTML = '';

        if (txs.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--text-muted)">ยังไม่มีรายการ</td></tr>';
            return;
        }

        txs.sort((a, b) => new Date(b.date) - new Date(a.date)).forEach(tx => {
            const tr = document.createElement('tr');
            const uId = tx.user_id || tx.userId;
            const userName = uId && users[uId] ? users[uId].name : (uId || '-');
            
            tr.innerHTML = `
                <td>${new Date(tx.date).toLocaleDateString('th-TH')}</td>
                <td><span class="badge ${tx.type}">${tx.type === 'income' ? 'รายรับ' : 'รายจ่าย'}</span></td>
                <td>${tx.category}</td>
                <td class="${tx.type === 'income' ? 'positive' : 'negative'}">฿${parseFloat(tx.amount).toLocaleString('th-TH')}</td>
                <td>${userName}</td>
                <td>
                    <button class="btn secondary icon-only" onclick="editTx('${tx.id}', '${tx.type}', '${tx.category}', '${tx.amount}', '${userName}')" style="margin-right: 5px;">
                        <i class="fa-solid fa-pen"></i>
                    </button>
                    <button class="btn danger icon-only" onclick="deleteTx('${tx.id}')">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </td>
            `;
            tbody.appendChild(tr);
        });
    } catch (err) {
        console.error('loadTransactions error:', err);
        showToast('โหลดรายการไม่สำเร็จ: ' + err.message, 'error');
    }
}

function editTx(id, type, category, amount, user) {
    document.getElementById('txId').value = id;
    document.getElementById('txType').value = type;
    document.getElementById('txCategory').value = category;
    document.getElementById('txAmount').value = amount;
    document.getElementById('txUser').value = user;
    document.getElementById('txModalTitle').textContent = 'แก้ไขรายการ';
    openModal('txModal');
}

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
loadDashboard();

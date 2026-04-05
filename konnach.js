// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Konnach Service Worker: Registered', reg))
            .catch(err => console.log('Konnach Service Worker: Error', err));
    });
}

// ── API & Connectivity ──────────────────────────────────────────────
const SAVED_IP = localStorage.getItem('station_ziz_server_ip');
const API_BASE = (window.location.protocol === 'file:')
    ? (SAVED_IP ? `http://${SAVED_IP}:3001` : 'http://localhost:3001')
    : '';

const API_URL = API_BASE + '/api/konnach';

let isServerOnline = false;

async function checkServerStatus() {
    try {
        const res = await fetch(API_BASE + '/api/diag', { method: 'GET', signal: AbortSignal.timeout(2000) });
        isServerOnline = res.ok;
    } catch (e) {
        isServerOnline = false;
    }
}

// Universal API wrapper for Konnach with LocalStorage fallback
async function callKonnachAPI(endpoint, options = {}) {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;

    if (isServerOnline) {
        try {
            const res = await fetch(API_URL + endpoint, options);
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn(`Server request failed for Konnach ${endpoint}, falling back to LocalStorage.`);
        }
    }

    // --- LocalStorage Fallback Logic ---
    if (endpoint.startsWith('/summary')) {
        const clients = JSON.parse(localStorage.getItem('offline_konnach_clients') || '[]');
        const trans = JSON.parse(localStorage.getItem('offline_konnach_transactions') || '[]');
        let took = 0, gave = 0;
        trans.forEach(t => { if (t.type === 'took') took += t.amount; else gave += t.amount; });
        return { total_took: took, total_gave: gave };
    }

    if (endpoint.startsWith('/clients')) {
        let list = JSON.parse(localStorage.getItem('offline_konnach_clients') || '[]');
        if (method === 'GET') {
            const trans = JSON.parse(localStorage.getItem('offline_konnach_transactions') || '[]');
            return list.map(c => {
                let bal = 0;
                trans.filter(t => t.client_id === c.id).forEach(t => {
                    if (t.type === 'took') bal -= t.amount; else bal += t.amount;
                });
                return { ...c, total_balance: bal };
            });
        }
        if (method === 'POST') {
            const newItem = { ...body, id: Date.now(), total_balance: 0, offline: true };
            list.push(newItem);
            localStorage.setItem('offline_konnach_clients', JSON.stringify(list));
            return newItem;
        }
    }

    if (endpoint.startsWith('/transactions')) {
        let list = JSON.parse(localStorage.getItem('offline_konnach_transactions') || '[]');
        if (method === 'GET') {
            const clientId = parseInt(endpoint.split('/').pop());
            return list.filter(t => t.client_id === clientId).reverse();
        }
        if (method === 'POST') {
            const newItem = { ...body, id: Date.now(), date: new Date().toISOString(), offline: true };
            list.push(newItem);
            localStorage.setItem('offline_konnach_transactions', JSON.stringify(list));
            return newItem;
        }
        if (method === 'DELETE') {
            const id = parseInt(endpoint.split('/').pop());
            localStorage.setItem('offline_konnach_transactions', JSON.stringify(list.filter(t => t.id !== id)));
            return { success: true };
        }
    }

    if (endpoint.startsWith('/clear')) {
        localStorage.removeItem('offline_konnach_clients');
        localStorage.removeItem('offline_konnach_transactions');
        return { success: true };
    }

    throw new Error("Action indisponible hors ligne");
}

let clients = [];
let activeClient = null;
let currentTransType = 'took'; // 'took' or 'gave'

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    await checkServerStatus();
    loadSummary();
    loadClients();
    setInterval(checkServerStatus, 10000);
});

async function loadSummary() {
    try {
        const data = await callKonnachAPI('/summary');
        document.getElementById('summaryTotalTook').innerText = `${(data.total_took || 0).toFixed(1)} درهم`;
        document.getElementById('summaryTotalGave').innerText = `${(data.total_gave || 0).toFixed(1)} درهم`;
    } catch (err) {
        console.error("Summary error:", err);
    }
}

async function loadClients() {
    try {
        clients = await callKonnachAPI('/clients');
        renderClients(clients);
    } catch (err) {
        console.error("Load clients error:", err);
    }
}

function renderClients(list) {
    const container = document.getElementById('clientList');
    if (list.length === 0) {
        container.innerHTML = `
            <div style="text-align: center; padding: 40px; color: #94a3b8;">
                <i class="fas fa-users-slash" style="font-size: 3rem; margin-bottom: 15px; opacity: 0.2;"></i>
                <p>لا يوجد زبناء بعد</p>
            </div>
        `;
        return;
    }

    container.innerHTML = list.map(c => `
        <div class="client-item">
            <div style="display:flex; align-items:center; flex:1; cursor:pointer;" onclick="showDetail(${c.id})">
                <div class="client-avatar">${c.name.charAt(0).toUpperCase()}</div>
                <div class="client-info">
                    <div class="client-name">${c.name}</div>
                    <div class="client-sub">اليوم</div>
                </div>
                <div class="client-balance">
                    <div class="balance-val ${c.total_balance >= 0 ? 'value-gave' : 'value-took'}">
                        ${Math.abs(c.total_balance).toFixed(1)} درهم
                    </div>
                    <div style="font-size: 0.65rem; color: #94a3b8;">${c.total_balance >= 0 ? 'لي سـال' : 'لي عـطيت'}</div>
                </div>
            </div>
            <button class="btn-del-trans" onclick="event.stopPropagation(); deleteClientById(${c.id}, '${c.name.replace(/'/g, "\\'")}')" title="حذف الزبون" style="margin-right:10px;">
                <i class="fas fa-trash-alt"></i>
            </button>
        </div>
    `).join('');
}

function filterClients() {
    const q = document.getElementById('clientSearch').value.toLowerCase();
    const filtered = clients.filter(c => c.name.toLowerCase().includes(q));
    renderClients(filtered);
}

// --- Detail View ---
async function showDetail(clientId) {
    activeClient = clients.find(c => c.id === clientId);
    if (!activeClient) return;

    document.getElementById('activeClientName').innerText = activeClient.name;
    document.getElementById('activeClientBalance').innerText = `${activeClient.total_balance.toFixed(1)} درهم`;

    document.getElementById('listView').style.display = 'none';
    document.getElementById('detailView').style.display = 'flex';

    loadTransactions(clientId);
}

function hideDetail() {
    activeClient = null;
    document.getElementById('detailView').style.display = 'none';
    document.getElementById('listView').style.display = 'block';
    loadClients(); // Refresh list to update balances
    loadSummary();
}

async function loadTransactions(clientId) {
    const container = document.getElementById('ledgerContent');
    container.innerHTML = '<div style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i></div>';

    try {
        const transactions = await callKonnachAPI(`/transactions/${clientId}`);

        if (transactions.length === 0) {
            container.innerHTML = `
                <div style="text-align: center; padding: 40px; color: #94a3b8;">
                    <img src="https://cdn-icons-png.flaticon.com/512/1057/1057210.png" style="width: 80px; opacity: 0.2; margin-bottom:15px;">
                    <p>لا توجد أي معاملة</p>
                </div>
            `;
            return;
        }

        container.innerHTML = transactions.map(t => {
            const isTook = t.type === 'took';
            const date = new Date(t.date);
            const dateStr = `اليوم مع ${date.getHours()}:${date.getMinutes().toString().padStart(2, '0')}`;

            return `
                <div class="ledger-item">
                    <div class="ledger-info">
                        <span class="ledger-note">${t.note || (isTook ? 'خدا كريدي' : 'خلص لي')}</span>
                        <span class="ledger-date">${dateStr}</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 15px;">
                        <div class="ledger-amount ${isTook ? 'value-took' : 'value-gave'}">
                            ${isTook ? '↑' : '↓'} ${t.amount.toFixed(1)} درهم
                        </div>
                        <button class="btn-del-trans" onclick="deleteTransaction(${t.id})" title="حذف">
                            <i class="fas fa-trash-alt"></i> X
                        </button>
                    </div>
                </div>
            `;
        }).join('');
    } catch (err) {
        console.error("Load transactions error:", err);
    }
}

async function deleteTransaction(id) {
    if (!confirm('هل أنت متأكد من حذف هذه المعاملة؟')) return;
    try {
        await callKonnachAPI(`/transactions/${id}`, { method: 'DELETE' });
        loadTransactions(activeClient.id);
        // Refresh balance
        clients = await callKonnachAPI('/clients');
        const updated = clients.find(c => c.id === activeClient.id);
        if (updated) {
            activeClient = updated;
            document.getElementById('activeClientBalance').innerText = `${activeClient.total_balance.toFixed(1)} درهم`;
        }
    } catch (err) {
        console.error("Delete transaction error:", err);
    }
}

async function deleteClient() {
    if (!activeClient) return;
    await deleteClientById(activeClient.id, activeClient.name);
}

async function deleteClientById(id, name) {
    if (!confirm(`هل أنت متأكد من حذف الزبون "${name}" وجميع معاملاته؟`)) return;
    try {
        await callKonnachAPI(`/clients/${id}`, { method: 'DELETE' });
        if (activeClient && activeClient.id === id) {
            hideDetail();
        } else {
            loadClients();
            loadSummary();
        }
    } catch (err) {
        console.error("Delete client error:", err);
    }
}

async function clearKonnach() {
    if (!confirm("هل أنت متأكد من مسح جميع بيانات الكوناش (الزبناء والمعاملات)؟ هذه العملية لا يمكن التراجع عنها.")) return;
    try {
        await callKonnachAPI('/clear', { method: 'DELETE' });
        loadClients();
        loadSummary();
    } catch (err) {
        console.error("Clear konnach error:", err);
    }
}

// --- Modals ---
function showAddClientModal() {
    document.getElementById('clientModal').style.display = 'flex';
    setTimeout(() => {
        const input = document.getElementById('newName');
        input.focus();
        input.select();
    }, 150);
}

function showTransactionModal(type) {
    currentTransType = type;
    const title = type === 'took' ? ' أعطيت(كريدي)' : ' (دفع لي)خديت';
    const btn = document.getElementById('btnSaveTrans');

    document.getElementById('transModalTitle').innerText = title;
    btn.innerText = 'حفظ المعاملة';
    btn.style.background = (type === 'took' ? '#10b981' : '#ef4444');
    btn.style.color = '#fff';

    document.getElementById('transactionModal').style.display = 'flex';
    setTimeout(() => {
        const input = document.getElementById('transAmount');
        input.focus();
        input.select();
    }, 150);
}

function closeModals() {
    document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
}

async function saveClient() {
    const name = document.getElementById('newName').value;
    const phone = document.getElementById('newPhone').value;

    if (!name) return alert('يرجى إدخال الاسم');

    try {
        await callKonnachAPI('/clients', {
            method: 'POST',
            body: JSON.stringify({ name, phone })
        });

        closeModals();
        loadClients();
        document.getElementById('newName').value = '';
        document.getElementById('newPhone').value = '';
    } catch (err) {
        console.error("Save client error:", err);
        alert('حدث خطأ أثناء الاتصال بالخادم');
    }
}

async function saveTransaction() {
    const amount = parseFloat(document.getElementById('transAmount').value);
    const note = document.getElementById('transNote').value;

    if (!amount || amount <= 0) return alert('يرجى إدخال مبلغ صحيح');

    try {
        await callKonnachAPI('/transactions', {
            method: 'POST',
            body: JSON.stringify({
                client_id: activeClient.id,
                type: currentTransType,
                amount: amount,
                note: note
            })
        });

        closeModals();
        document.getElementById('transAmount').value = '';
        document.getElementById('transNote').value = '';

        // Re-fetch client data to get updated balance
        clients = await callKonnachAPI('/clients');
        const updated = clients.find(c => c.id === activeClient.id);
        if (updated) {
            activeClient = updated;
            document.getElementById('activeClientBalance').innerText = `${activeClient.total_balance.toFixed(1)} درهم`;
        }

        loadTransactions(activeClient.id);
    } catch (err) {
        console.error("Save transaction error:", err);
    }
}

function callClient() {
    if (activeClient && activeClient.phone) {
        window.open(`tel:${activeClient.phone}`);
    } else {
        alert('لا يوجد رقم هاتف لهذا الزبون');
    }
}

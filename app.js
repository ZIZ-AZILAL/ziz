/* ═══════════════════════════════════════
   STATION ZIZ – app.js
   ═══════════════════════════════════════ */

// Register Service Worker for PWA
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js')
            .then(reg => console.log('Service Worker: Registered', reg))
            .catch(err => console.log('Service Worker: Error', err));
    });
}

// PWA Install Button Logic
let deferredPrompt;
window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) installBtn.style.display = 'flex';
});

document.addEventListener('DOMContentLoaded', () => {
    const installBtn = document.getElementById('pwa-install-btn');
    if (installBtn) {
        installBtn.addEventListener('click', async () => {
            if (!deferredPrompt) {
                alert('Installation automatique indisponible. Sur iOS (Safari), utilisez "Sur l\'écran d\'accueil" du menu Partager. Sur Android, Chrome devrait proposer le bouton l\'installation si vous utilisez HTTPS ou localhost.');
                return;
            }
            deferredPrompt.prompt();
            const { outcome } = await deferredPrompt.userChoice;
            console.log(`User response to the install prompt: ${outcome}`);
            deferredPrompt = null;
            installBtn.style.display = 'none';
        });
    }
});

// ── API & Connectivity ──────────────────────────────────────────────
const SAVED_IP = localStorage.getItem('station_ziz_server_ip');
const API_BASE = (window.location.protocol === 'file:')
    ? (SAVED_IP ? `http://${SAVED_IP}:3001` : 'http://localhost:3001')
    : '';

let isServerOnline = false;

async function checkServerStatus() {
    try {
        const res = await fetch(API_BASE + '/api/diag', { method: 'GET', signal: AbortSignal.timeout(2000) });
        isServerOnline = res.ok;
    } catch (e) {
        isServerOnline = false;
    }
    updateStatusUI();
}

function updateStatusUI() {
    const badge = document.getElementById('server-status-badge');
    if (!badge) return;
    if (isServerOnline) {
        badge.textContent = 'En Ligne';
        badge.className = 'status-badge online';
    } else {
        badge.textContent = 'Mode Local';
        badge.className = 'status-badge offline';
    }
}

// Universal API wrapper with LocalStorage fallback
async function callAPI(endpoint, options = {}) {
    const method = options.method || 'GET';
    const body = options.body ? JSON.parse(options.body) : null;

    if (isServerOnline) {
        try {
            const res = await fetch(API_BASE + endpoint, options);
            if (res.ok) return await res.json();
        } catch (e) {
            console.warn(`Server request failed for ${endpoint}, falling back to LocalStorage.`);
        }
    }

    // --- LocalStorage Fallback Logic ---
    const route = endpoint.split('?')[0];

    // SESSIONS
    if (route.startsWith('/api/sessions')) {
        const list = JSON.parse(localStorage.getItem('offline_sessions') || '[]');
        if (method === 'GET') {
            if (endpoint.includes('/:')) { /* detail logic if needed */ }
            return list.slice(-30).reverse();
        }
        if (method === 'POST') {
            const newItem = { ...body, id: Date.now(), offline: true };
            list.push(newItem);
            localStorage.setItem('offline_sessions', JSON.stringify(list));
            return newItem;
        }
    }

    // INVOICES
    if (route.startsWith('/api/invoices')) {
        const list = JSON.parse(localStorage.getItem('offline_invoices') || '[]');
        if (method === 'GET') return list.reverse();
        if (method === 'POST') {
            const newItem = { ...body, id: Date.now(), offline: true };
            list.push(newItem);
            localStorage.setItem('offline_invoices', JSON.stringify(list));
            return newItem;
        }
        if (method === 'PUT') {
            const id = parseInt(endpoint.split('/').pop());
            const idx = list.findIndex(i => i.id === id);
            if (idx !== -1) { list[idx] = { ...body, id }; localStorage.setItem('offline_invoices', JSON.stringify(list)); }
            return { success: true };
        }
        if (method === 'DELETE') {
            const id = parseInt(endpoint.split('/').pop());
            const filtered = list.filter(i => i.id !== id);
            localStorage.setItem('offline_invoices', JSON.stringify(filtered));
            return { success: true };
        }
    }

    // CREDITS
    if (route.startsWith('/api/credits')) {
        const list = JSON.parse(localStorage.getItem('offline_credits') || '[]');
        if (method === 'GET') return list.reverse();
        if (method === 'POST') {
            const newItem = { ...body, id: Date.now(), offline: true };
            list.push(newItem);
            localStorage.setItem('offline_credits', JSON.stringify(list));
            return newItem;
        }
        if (method === 'DELETE') {
            const id = parseInt(endpoint.split('/').pop());
            localStorage.setItem('offline_credits', JSON.stringify(list.filter(i => i.id !== id)));
            return { success: true };
        }
    }

    // STATS (Local Calculation)
    if (route.startsWith('/api/stats')) {
        return calculateLocalStats();
    }

    // KОNNАСH SUMMARY
    if (route.startsWith('/api/konnach/summary')) {
        return { total_took: 0, total_gave: 0 }; // Simplified
    }

    throw new Error("Action indisponible hors ligne");
}

function calculateLocalStats() {
    const today = new Date().toISOString().slice(0, 10);
    const sessions = JSON.parse(localStorage.getItem('offline_sessions') || '[]');
    const stats = { day: 0, week: 0, month: 0, credits: { day: 0 }, invoices: { day: 0 } };
    sessions.forEach(s => { if (s.date === today) stats.day += parseFloat(s.grand_total || 0); });
    return stats;
}

window.setServerIP = (ip) => {
    localStorage.setItem('station_ziz_server_ip', ip);
    location.reload();
};

// Start status check
checkServerStatus();
setInterval(checkServerStatus, 10000); // Check every 10s


// ── Row definitions (all counter rows) ──────────────────────────────
const ROWS = [
    { id: 'g1', group: 'gasoil' },
    { id: 'g2', group: 'gasoil' },
    { id: 'g3', group: 'gasoil' },
    { id: 'g4', group: 'gasoil' },
    { id: 's1', group: 'super' },
    { id: 's2', group: 'super' },
    { id: 'lav', group: 'services' },
    { id: 'lub', group: 'services' },
    { id: 'gaz', group: 'services' },
    { id: 'one', group: 'services' },
];

function debounce(func, timeout = 300) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => { func.apply(this, args); }, timeout);
    };
}

// ── Helpers ──────────────────────────────────────────────────────────
function val(el) {
    const v = parseFloat(el.value);
    return isNaN(v) ? 0 : v;
}
function fmt(n, dec = 3) { return n.toFixed(dec); }
function fmtMoney(n) {
    const val = parseFloat(n) || 0;
    return val.toFixed(2) + ' MAD';
}
function fmtLitre(n) { return n.toFixed(3) + ' L'; }

function setCell(id, text, cls) {
    const el = document.getElementById(id);
    if (!el) return;
    el.textContent = text;
    if (cls) { el.classList.remove('has-value'); if (text !== '–') el.classList.add(cls); }
}

// ── Core calculation ─────────────────────────────────────────────────
function calcRow(rowId) {
    const debutInputs = document.querySelectorAll(`.idx-debut[data-row="${rowId}"]`);
    const finInputs = document.querySelectorAll(`.idx-fin[data-row="${rowId}"]`);

    // Determine if this row belongs to a group with centralized pricing
    const rowDef = ROWS.find(r => r.id === rowId);
    let priceInput;
    if (rowDef && (rowDef.group === 'gasoil' || rowDef.group === 'super')) {
        priceInput = document.querySelector(`.price-input[data-group="${rowDef.group}"]`);
    } else {
        priceInput = document.querySelector(`.price-input[data-row="${rowId}"]`);
    }

    if (!debutInputs.length || !finInputs.length || !priceInput) return { qty: 0, total: 0 };

    const debut = val(debutInputs[0]);
    const fin = val(finInputs[0]);
    const price = val(priceInput);
    const qty = Math.max(0, fin - debut);
    const total = qty * price;

    const qtyEl = document.getElementById(`qty-${rowId}`);
    const totalEl = document.getElementById(`total-${rowId}`);

    if (qtyEl) {
        qtyEl.textContent = (debut || fin) ? fmt(qty) : '–';
        qtyEl.classList.toggle('has-value', !!(debut || fin));
    }
    if (totalEl) {
        totalEl.textContent = (debut || fin) ? fmtMoney(total) : '–';
        totalEl.classList.toggle('has-value', !!(debut || fin));
    }

    return { qty, total };
}

// ── Recalculate everything ───────────────────────────────────────────
let konnachCreditToday = 0; // Cached value from server

async function loadKonnachCredits() {
    try {
        const data = await callAPI('/api/konnach/summary');
        konnachCreditToday = data.total_took || 0;
    } catch (err) {
        console.error('Erreur chargement crédits Konnach:', err);
        konnachCreditToday = 0;
    }
}

function recalcAll() {
    let gasoilQty = 0, gasoilTotal = 0;
    let superQty = 0, superTotal = 0;
    let servicesTotal = 0;
    let grandQty = 0, grandTotal = 0;

    ROWS.forEach(({ id, group }) => {
        const { qty, total } = calcRow(id);
        if (group === 'gasoil') {
            gasoilQty += qty; gasoilTotal += total;
        } else if (group === 'super') {
            superQty += qty; superTotal += total;
        } else {
            servicesTotal += total;
        }
        grandQty += qty;
        grandTotal += total;
    });

    // Subtotals
    const hasGasoil = gasoilTotal > 0 || gasoilQty > 0;
    const hasSuper = superTotal > 0 || superQty > 0;

    document.getElementById('subtotal-qty-gasoil').textContent = hasGasoil ? fmtLitre(gasoilQty) : '– L';
    document.getElementById('subtotal-total-gasoil').textContent = hasGasoil ? fmtMoney(gasoilTotal) : '– MAD';
    document.getElementById('subtotal-qty-super').textContent = hasSuper ? fmtLitre(superQty) : '– L';
    document.getElementById('subtotal-total-super').textContent = hasSuper ? fmtMoney(superTotal) : '– MAD';

    // Grand total row
    document.getElementById('grand-qty').textContent = grandTotal > 0 ? fmtLitre(grandQty) : '– L';
    document.getElementById('grand-total').textContent = grandTotal > 0 ? fmtMoney(grandTotal) : '– MAD';

    // Credit Calculation (local credits from this page)
    let localCreditTotal = 0;
    document.querySelectorAll('.credit-amount-input').forEach(input => {
        localCreditTotal += val(input);
    });

    // Combined credit total = local + Konnach
    const creditTotal = localCreditTotal + konnachCreditToday;
    const netTotal = grandTotal - creditTotal;

    // Summary cards
    const grandTotalEl = document.getElementById('card-grand-total');
    if (grandTotalEl) grandTotalEl.textContent = fmtMoney(grandTotal);

    const creditsTotalEl = document.getElementById('card-credits-total');
    if (creditsTotalEl) creditsTotalEl.textContent = fmtMoney(creditTotal);

    const netTotalEl = document.getElementById('card-net-total');
    if (netTotalEl) netTotalEl.textContent = fmtMoney(netTotal);

    const creditDisplayEl = document.getElementById('total-credits-display');
    if (creditDisplayEl) creditDisplayEl.textContent = fmtMoney(creditTotal);

    // Update Konnach badge display
    const konnachBadge = document.getElementById('konnach-credit-badge');
    if (konnachBadge) {
        konnachBadge.textContent = konnachCreditToday > 0 ? `(Konnach: ${fmtMoney(konnachCreditToday)})` : '';
    }

    // Persist to localStorage
    saveState();
}

// ── localStorage persistence ─────────────────────────────────────────
const ARCHIVE_KEY = 'stationZiz_archives';

function saveState() {
    const data = { pompiste: '', vacation: '', date: '', observations: '', rows: {}, credits: [] };
    data.pompiste = document.getElementById('pompiste')?.value || '';
    data.vacation = document.getElementById('vacation')?.value || '';
    data.date = document.getElementById('sessionDate')?.value || '';
    data.observations = document.getElementById('observations')?.value || '';

    ROWS.forEach(({ id, group }) => {
        const debut = document.querySelector(`.idx-debut[data-row="${id}"]`);
        const fin = document.querySelector(`.idx-fin[data-row="${id}"]`);
        let price;
        if (group === 'gasoil' || group === 'super') {
            price = document.querySelector(`.price-input[data-group="${group}"]`);
        } else {
            price = document.querySelector(`.price-input[data-row="${id}"]`);
        }
        data.rows[id] = {
            debut: debut?.value || '',
            fin: fin?.value || '',
            price: price?.value || '',
        };
    });

    // Save credits
    document.querySelectorAll('.credit-row-item').forEach(row => {
        const client = row.querySelector('.credit-client-input')?.value || '';
        const motif = row.querySelector('.credit-motif-input')?.value || '';
        const amount = row.querySelector('.credit-amount-input')?.value || '';
        const avance = row.querySelector('.credit-avance-input')?.value || '';
        const id = row.dataset.id || null;
        data.credits.push({ client, motif, amount, avance, id });
    });

    window.currentSessionData = data;
    // Persist draft to localStorage to prevent data loss on navigation
    localStorage.setItem('stationZiz_draft', JSON.stringify(data));
    console.log('Draft saved to localStorage:', data);
}

async function loadState(forceCarryOver = false, carryOverData = null) {
    // 1. Check if there is a draft in localStorage (if not forcing carry-over)
    const draft = localStorage.getItem('stationZiz_draft');
    if (draft && !forceCarryOver) {
        try {
            const data = JSON.parse(draft);
            console.log('Restoring draft from localStorage:', data);
            applyDataToUI(data);
            window.currentSessionData = data;
            return;
        } catch (e) {
            console.error('Erreur restauration brouillon:', e);
        }
    }

    // 2. Prepare next session
    let initialData = {
        pompiste: '',
        vacation: 'Matin',
        date: today(),
        observations: '',
        rows: {},
        credits: []
    };

    if (carryOverData) {
        // Use provided data directly (immediate carry-over)
        ROWS.forEach(({ id }) => {
            const oldRow = carryOverData.rows?.[id];
            initialData.rows[id] = {
                debut: oldRow?.fin || '',
                fin: '',
                price: oldRow?.price || (id === 'lav' ? '30.00' : id === 'lub' ? '50.00' : id === 'gaz' ? '8.50' : (id.startsWith('g') ? '11.00' : (id.startsWith('s') ? '13.40' : '0.00')))
            };
        });
    } else {
        // Fetch the last archived session from DB
        try {
            const archives = await callAPI('/api/sessions?limit=1');
            if (archives.length > 0) {
                const lastArc = archives[0];
                const data = lastArc.data;
                ROWS.forEach(({ id }) => {
                    const oldRow = data.rows?.[id];
                    initialData.rows[id] = {
                        debut: oldRow?.fin || '',
                        fin: '',
                        price: oldRow?.price || (id === 'lav' ? '30.00' : id === 'lub' ? '50.00' : id === 'gaz' ? '8.50' : (id.startsWith('g') ? '11.00' : (id.startsWith('s') ? '13.40' : '0.00')))
                    };
                });
            }
        } catch (e) { console.error('Erreur chargement DB:', e); }
    }

    applyDataToUI(initialData);
    window.currentSessionData = initialData;
}

function applyDataToUI(data) {
    document.getElementById('pompiste').value = data.pompiste || '';
    document.getElementById('vacation').value = data.vacation || 'Matin';
    document.getElementById('sessionDate').value = data.date || today();
    document.getElementById('observations').value = data.observations || '';

    ROWS.forEach(({ id, group }) => {
        const r = data.rows?.[id];
        const debut = document.querySelector(`.idx-debut[data-row="${id}"]`);
        const fin = document.querySelector(`.idx-fin[data-row="${id}"]`);
        let price;
        if (group === 'gasoil' || group === 'super') {
            price = document.querySelector(`.price-input[data-group="${group}"]`);
        } else {
            price = document.querySelector(`.price-input[data-row="${id}"]`);
        }
        if (debut) debut.value = r?.debut || '';
        if (fin) fin.value = r?.fin || '';
        if (price && r?.price) price.value = r.price;
    });

    if (data.credits && data.credits.length > 0) {
        renderCredits(data.credits);
    } else {
        const body = document.getElementById('creditBody');
        if (body) body.innerHTML = '';
        addCreditRow();
    }

    recalcAll();
}

async function archiveSession(data) {
    try {
        // Calculate grand total from data
        let grand = 0;
        if (data.rows) {
            Object.values(data.rows).forEach(r => {
                const qty = Math.max(0, parseFloat(r.fin || 0) - parseFloat(r.debut || 0));
                grand += qty * parseFloat(r.price || 0);
            });
        }

        const sessionPayload = {
            date: data.date,
            pompiste: data.pompiste,
            vacation: data.vacation,
            grand_total: grand,
            data: data
        };

        const sessionResult = await callAPI('/api/sessions', {
            method: 'POST',
            body: JSON.stringify(sessionPayload)
        });

        // Save/Update credits
        if (data.credits && data.credits.length > 0) {
            for (let c of data.credits) {
                if (!c.client && !c.amount) continue;

                const creditPayload = {
                    date: data.date,
                    client: c.client,
                    motif: c.motif,
                    amount: c.amount,
                    avance: c.avance,
                    status: 'archived',
                    sessionId: sessionResult.id
                };

                if (c.id) {
                    // Update existing "current" credit to "archived"
                    await callAPI(`/api/credits/${c.id}`, {
                        method: 'PUT',
                        body: JSON.stringify(creditPayload)
                    });
                } else {
                    // Create new archived credit (if not already synced)
                    await callAPI('/api/credits', {
                        method: 'POST',
                        body: JSON.stringify(creditPayload)
                    });
                }
            }
        }

        // Refresh UI
        await renderArchives();

    } catch (err) {
        console.error("Erreur archivage:", err);
        alert("Erreur lors de l'archivage de la session. Veuillez vérifier la console pour plus de détails.");
    }
}

// ── Reset ────────────────────────────────────────────────────────────
async function resetAll() {
    if (!confirm('Voulez-vous ENREGISTRER cette session dans les ARCHIVES et préparer le prochain shift ?')) return;

    // Save current state to ensure everything is captured
    saveState();
    const data = window.currentSessionData || {};
    if (!data.date) data.date = today();

    // 1. Archive current session (this now calls renderArchives internally)
    await archiveSession(data);

    // 2. Clear current draft
    localStorage.removeItem('stationZiz_draft');
    localStorage.removeItem('stationZiz_state');

    // 3. Prepare next session with carry-over (immediate)
    await loadState(true, data); // forceCarryOver = true, pass current data

    // 4. Refresh Konnach credits for the new shift
    await loadKonnachCredits();
    recalcAll();

    alert('Session ENREGISTRÉE et ARCHIVÉE avec succès.\nLes index de sortie sont devenus les index d\'entrée pour le nouveau shift.');
}

// ── Clock & Date ─────────────────────────────────────────────────────
function today() {
    return new Date().toISOString().slice(0, 10);
}

function updateClock() {
    const now = new Date();
    const date = now.toLocaleDateString('fr-MA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    const time = now.toLocaleTimeString('fr-MA', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    document.getElementById('currentDate').textContent = date;
    document.getElementById('currentTime').textContent = time;
}

// ── Credits Management ──────────────────────────────────────────────
async function syncCreditToDBDirect(row) {
    const client = row.querySelector('.credit-client-input')?.value || '';
    const amount = row.querySelector('.credit-amount-input')?.value || '';

    // Only sync if at least name or amount are partially present
    if (!client && (!amount || amount === '0')) return;

    const data = {
        date: document.getElementById('sessionDate')?.value || today(),
        client: client,
        motif: row.querySelector('.credit-motif-input')?.value || '',
        amount: parseFloat(amount) || 0,
        avance: parseFloat(row.querySelector('.credit-avance-input')?.value) || 0,
        status: 'current'
    };

        try {
            if (row.dataset.id && row.dataset.id !== 'undefined') {
                await callAPI(`/api/credits/${row.dataset.id}`, {
                    method: 'PUT',
                    body: JSON.stringify(data)
                });
            } else {
                if (row.dataset.syncing) return; // Prevent double creation
                row.dataset.syncing = "true";
                const result = await callAPI('/api/credits', {
                    method: 'POST',
                    body: JSON.stringify(data)
                });
                row.dataset.id = result.id;
                delete row.dataset.syncing;
            }
    } catch (err) {
        console.error('Sync credit error:', err);
        alert("Erreur lors de la synchronisation du crédit. Veuillez vérifier la console pour plus de détails.");
    }
}

const syncCreditToDB = debounce(syncCreditToDBDirect, 500);

function addCreditRow(data = { client: '', motif: '', amount: '', avance: '', id: null }) {
    const body = document.getElementById('creditBody');
    if (!body) return;

    const row = document.createElement('tr');
    row.className = 'credit-row-item';
    if (data.id) row.dataset.id = data.id;

    row.innerHTML = `
        <td><input type="text" class="credit-client-input" placeholder="Nom du client" value="${data.client}" /></td>
        <td><input type="text" class="credit-motif-input" placeholder="Motif du crédit" value="${data.motif}" /></td>
        <td>
            <input type="number" class="credit-amount-input" placeholder="0.00" step="0.01" value="${data.amount}" />
            <input type="hidden" class="credit-avance-input" value="${data.avance || 0}" />
        </td>
        <td style="text-align: center;">
            <button class="btn-icon del" onclick="deleteCreditRow(this)">
                <i class="fas fa-trash"></i>
            </button>
        </td>
    `;
    body.appendChild(row);

    // Attach listeners
    row.querySelectorAll('input').forEach(input => {
        input.addEventListener('input', () => {
            recalcAll();
            syncCreditToDB(row);
        });
        input.addEventListener('change', () => {
            recalcAll();
            syncCreditToDB(row);
        });
    });

    recalcAll();
}

async function deleteCreditRow(btn) {
    if (!confirm('Supprimer cette ligne de crédit ?')) return;
    const row = btn.closest('tr');
    const id = row.dataset.id;

    if (id) {
        try {
            await callAPI(`/api/credits/${id}`, { method: 'DELETE' });
        } catch (err) {
            console.error('Error deleting credit:', err);
        }
    }

    row.remove();
    recalcAll();
}

function renderCredits(credits) {
    const body = document.getElementById('creditBody');
    if (!body) return;
    body.innerHTML = '';
    if (credits && Array.isArray(credits)) {
        credits.forEach(c => addCreditRow(c));
    }
}

// Attach to window so onclick works
window.addCreditRow = addCreditRow;
window.deleteCreditRow = deleteCreditRow;

// ── Archives Management ──────────────────────────────────────────────
async function manualArchive() {
    if (!confirm('Voulez-vous archiver la session actuelle et envoyer à la base de données ?')) return;

    saveState();
    const data = window.currentSessionData || {};
    if (!data.date) data.date = today();

    await archiveSession(data);
    localStorage.removeItem('stationZiz_draft'); // Clear draft after successful archive
    await renderArchives();
    alert('Session archivée avec succès.');
}

async function renderArchives() {
    const body = document.getElementById('archiveBody');
    if (!body) return;
    body.innerHTML = '';

    try {
        const archives = await callAPI('/api/sessions?limit=10');

        archives.forEach((arc) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${arc.date || '–'}</td>
                <td>${arc.pompiste || '–'}</td>
                <td>${arc.vacation || '–'}</td>
                <td class="archive-total">${fmtMoney(arc.grand_total || 0)}</td>
                <td>
                    <button class="btn-icon" onclick="showArchiveDetails(${arc.id})" title="Voir" style="background:rgba(251,191,36,0.15); color:var(--ziz-yellow); border:1px solid rgba(251,191,36,0.3);">
                        <i class="fas fa-eye"></i>
                    </button>
                    <button class="btn-icon del" onclick="deleteArchive(${arc.id})" title="Supprimer">
                        <i class="fas fa-trash"></i>
                    </button>
                </td>
            `;
            body.appendChild(row);
        });
    } catch (err) {
        console.error(err);
    }
}

async function deleteArchive(id) {
    if (!confirm('Supprimer cette archive définitivement de la base de données ?')) return;
    try {
        await fetch(API_BASE + `/api/sessions/${id}`, { method: 'DELETE' });
        await renderArchives();
    } catch (err) {
        console.error(err);
    }
}

async function showArchiveDetails(id) {
    try {
        const arc = await callAPI(`/api/sessions/${id}`);
        const data = arc.data;

        // Fill Info Grid
        const infoGrid = document.getElementById('arch-info-grid');
        infoGrid.innerHTML = `
            <div class="archive-data-item"><span class="archive-data-label">DATE</span><span class="archive-data-value">${arc.date}</span></div>
            <div class="archive-data-item"><span class="archive-data-label">POMPISTE</span><span class="archive-data-value">${arc.pompiste || '–'}</span></div>
            <div class="archive-data-item"><span class="archive-data-label">VACATION</span><span class="archive-data-value">${arc.vacation || '–'}</span></div>
            <div class="archive-data-item"><span class="archive-data-label">TOTAL GÉNÉRAL</span><span class="archive-data-value" style="color:var(--ziz-yellow)">${fmtMoney(arc.grand_total)}</span></div>
        `;

        // Fill Table
        const tableBody = document.getElementById('arch-table-body');
        tableBody.innerHTML = '';
        if (data.rows) {
            ROWS.forEach(rowDef => {
                const r = data.rows[rowDef.id];
                if (!r) return;
                const qty = parseFloat(r.fin || 0) - parseFloat(r.debut || 0);
                const total = Math.max(0, qty) * parseFloat(r.price || 0);
                const tr = document.createElement('tr');
                tr.innerHTML = `
                    <td><b>${rowDef.id.toUpperCase()}</b></td>
                    <td>${r.debut || '0'}</td>
                    <td>${r.fin || '0'}</td>
                    <td>${qty.toFixed(2)}</td>
                    <td>${r.price || '0.00'}</td>
                    <td style="font-weight:700">${fmtMoney(total)}</td>
                `;
                tableBody.appendChild(tr);
            });
        }

        // Fill Credits
        const creditsList = document.getElementById('arch-credits-list');
        creditsList.innerHTML = '';
        if (data.credits && data.credits.length > 0) {
            data.credits.forEach(c => {
                const div = document.createElement('div');
                div.className = 'archive-data-item';
                div.style.marginBottom = '8px';
                div.innerHTML = `<b>${c.client || 'Client inconnu'}</b>: ${fmtMoney(c.amount)} (Avance: ${fmtMoney(c.avance)})<br><small>${c.motif || ''}</small>`;
                creditsList.appendChild(div);
            });
        } else {
            creditsList.innerHTML = '<p class="empty-factures">Aucun crédit.</p>';
        }

        // Fill Factures
        const facturesList = document.getElementById('arch-factures-list');
        facturesList.innerHTML = '<p class="empty-factures">Consultation via "Gestion Factures".</p>';

        // Observations
        document.getElementById('arch-obs-box').innerText = data.observations || 'Aucune observation.';

        document.getElementById('archiveDetailsModal').classList.add('open');
    } catch (err) {
        console.error(err);
        alert('Erreur lors du chargement des détails: ' + err.message);
    }
}

function closeArchiveDetailsModal() {
    document.getElementById('archiveDetailsModal').classList.remove('open');
}

function closeArchiveDetailsModalOnOverlay(e) {
    if (e.target.id === 'archiveDetailsModal') closeArchiveDetailsModal();
}

window.manualArchive = manualArchive;
window.deleteArchive = deleteArchive;
window.showArchiveDetails = showArchiveDetails;
window.closeArchiveDetailsModal = closeArchiveDetailsModal;
window.closeArchiveDetailsModalOnOverlay = closeArchiveDetailsModalOnOverlay;

// ── Init ─────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

    // set today's date if not already set
    const dateField = document.getElementById('sessionDate');
    if (dateField) dateField.value = today();

    // clock
    updateClock();
    setInterval(updateClock, 1000);

    // attach recalc listeners to every relevant input
    document.querySelectorAll('.idx-debut, .idx-fin, .price-input').forEach(input => {
        input.addEventListener('input', recalcAll);
        input.addEventListener('change', recalcAll);
    });

    // persist on any shift-info change
    ['pompiste', 'vacation', 'sessionDate', 'observations'].forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', saveState);
            el.addEventListener('change', saveState);
        }
    });

    // Aggressive save on exit
    window.addEventListener('beforeunload', saveState);
    window.addEventListener('pagehide', saveState);

    // restore previous session
    loadState();

    // Load Konnach credits for today
    loadKonnachCredits().then(() => recalcAll());

    // Initial renders
    renderArchives();
    renderFactureList();
});

/* ═══════════════════════════════════════════════════════════
   FACTURES MODULE
   ═══════════════════════════════════════════════════════════ */

let factures = []; // will be loaded from DB on init
let editingFactureId = null;
let lineCounter = 0;

// ── Product presets ───────────────────────────────────────────────────
const PRODUCTS = [
    { label: 'GASOIL', price: 11.00 },
    { label: 'SUPER', price: 13.40 },
    { label: 'LAVAGE', price: 30.00 },
    { label: 'LUBRIFIANT', price: 50.00 },
    { label: 'GAZ', price: 8.50 },
    { label: 'ONE', price: 0.00 },
    { label: 'AUTRE', price: 0.00 },
];

// ── Number → French words ─────────────────────────────────────────────
function nombreEnLettres(n) {
    const u = ['', 'UN', 'DEUX', 'TROIS', 'QUATRE', 'CINQ', 'SIX', 'SEPT', 'HUIT', 'NEUF',
        'DIX', 'ONZE', 'DOUZE', 'TREIZE', 'QUATORZE', 'QUINZE', 'SEIZE',
        'DIX-SEPT', 'DIX-HUIT', 'DIX-NEUF'];
    const d = ['', '', 'VINGT', 'TRENTE', 'QUARANTE', 'CINQUANTE', 'SOIXANTE',
        'SOIXANTE', 'QUATRE-VINGT', 'QUATRE-VINGT'];
    function conv(nb) {
        if (nb === 0) return '';
        if (nb < 20) return u[nb];
        const di = Math.floor(nb / 10), un = nb % 10;
        if (di === 7 || di === 9) return d[di] + (un === 1 ? '-ONZE' : (un > 0 ? '-' + u[10 + un] : (di === 9 ? '-DIX' : '')));
        return d[di] + (un === 1 && di !== 8 ? '-ET-UN' : (un > 0 ? '-' + u[un] : (di === 8 && un === 0 ? 'S' : '')));
    }
    function convCentaines(nb) {
        if (nb === 0) return '';
        const c = Math.floor(nb / 100), r = nb % 100;
        const cStr = c === 0 ? '' : (c === 1 ? 'CENT' : u[c] + ' CENT' + (r === 0 ? 'S' : ''));
        return (cStr + ' ' + conv(r)).trim();
    }
    const entier = Math.floor(n);
    const decimal = Math.round((n - entier) * 100);
    let res = '';
    const mil = Math.floor(entier / 1000);
    const rem = entier % 1000;
    if (mil === 1) res = 'MILLE';
    else if (mil > 1) res = convCentaines(mil) + ' MILLE';
    if (rem > 0) res = (res + ' ' + convCentaines(rem)).trim();
    if (!res) res = 'ZÉRO';
    res += ' DIRHAMS';
    if (decimal > 0) res += ' ET ' + conv(decimal) + ' CENTIMES';
    return res;
}

// ── Helpers ───────────────────────────────────────────────────────────
function nextFactureNum() {
    const year = new Date().getFullYear();
    const n = factures.length + 1;
    return `${n}/${year}`;
}
async function fetchFactures() {
    try {
        const rows = await callAPI('/api/invoices');
        factures = rows.map(r => ({
            ...r,
            ...(r.data || {})
        }));
    } catch (err) {
        console.error(err);
    }
}

// ── Modal open / close ────────────────────────────────────────────────
function openFactureModal(id = null) {
    editingFactureId = id;
    const modal = document.getElementById('factureModal');
    document.getElementById('modalTitle').textContent = id ? 'Modifier la Facture' : 'Nouvelle Facture';
    document.getElementById('fExploitant').value = 'ZAKI IDDIR';
    document.getElementById('fNumero').value = '';
    document.getElementById('fDate').value = today();
    document.getElementById('fClient').value = '';
    document.getElementById('fICE').value = '';
    document.getElementById('fNotes').value = '';
    document.getElementById('fMontantLettres').value = '';
    document.getElementById('factureLines').innerHTML = '';
    lineCounter = 0;

    if (id !== null) {
        const f = factures.find(x => x.id === id);
        if (f) {
            document.getElementById('fExploitant').value = f.exploitant || 'ZAKI IDDIR';
            document.getElementById('fNumero').value = f.num || '';
            document.getElementById('fClient').value = f.client || '';
            document.getElementById('fICE').value = f.ice || '';
            document.getElementById('fDate').value = f.date || today();
            document.getElementById('fNotes').value = f.notes || '';
            document.getElementById('fTvaRate').value = f.tvaRate != null ? String(f.tvaRate) : '10';
            f.lines.forEach(l => addFactureLine(l));
        }
    } else {
        addFactureLine();
        // auto-generate N°
        document.getElementById('fNumero').value = nextFactureNum();
    }

    recalcFactureTotals();
    modal.classList.add('open');
    setTimeout(() => document.getElementById('fNumero').focus(), 100);
}

function closeFactureModal() {
    document.getElementById('factureModal').classList.remove('open');
    editingFactureId = null;
}
function closeFactureModalOnOverlay(e) {
    if (e.target === document.getElementById('factureModal')) closeFactureModal();
}

// ── Line management ───────────────────────────────────────────────────
function addFactureLine(data = {}) {
    lineCounter++;
    const id = `line-${lineCounter}`;
    const tbody = document.getElementById('factureLines');

    const opts = PRODUCTS.map(p =>
        `<option value="${p.label}" data-price="${p.price}" ${(data.desc || '').toUpperCase() === p.label ? 'selected' : ''}>${p.label}</option>`
    ).join('');

    const tr = document.createElement('tr');
    tr.id = id;
    // New columns: DÉSIGNATION (text area) | QTÉ | P.U | MONTANT | delete
    tr.innerHTML = `
      <td>
        <select class="line-desc" onchange="onDescChange(this,'${id}')">
          ${opts}
          <option value="__custom__" ${data.desc && !PRODUCTS.find(p => p.label === data.desc.toUpperCase()) ? 'selected' : ''}>Personnalisé…</option>
        </select>
        <input type="text" class="custom-desc" placeholder="Désignation libre"
               style="display:${data.desc && !PRODUCTS.find(p => p.label === data.desc.toUpperCase()) ? 'block' : 'none'};margin-top:4px;text-transform:uppercase"
               value="${data.desc && !PRODUCTS.find(p => p.label === data.desc.toUpperCase()) ? data.desc : ''}"
               oninput="onDescChange(this.previousElementSibling,'${id}')" />
        <input type="text" class="line-note" placeholder="Précision (ex: PAYEE PAR CHEQUE N°…)"
               style="margin-top:4px;font-size:.78rem;color:#aaa"
               value="${data.note || ''}" />
      </td>
      <td><input type="number" class="line-qty"   value="${data.qty || 0}"   min="0" step="0.001" oninput="recalcFactureTotals()" /></td>
      <td><input type="number" class="line-price" value="${data.price || 0}"   min="0" step="0.01" oninput="onDescChange(this,'${id}')" style="color:#000; font-weight:900; background:#fff; border:2px solid #1a1a1b;" /></td>
      <td><input type="number" class="line-total" value="${data.total || 0}"   min="0" step="0.01" oninput="onLineTotalChange(this,'${id}')" style="width:100%; padding:5px; border-radius:4px; border:1px solid var(--border); background:var(--bg); color:var(--text);" /></td>
      <td><button class="btn-icon del" onclick="removeLine('${id}')" title="Supprimer"><i class="fas fa-trash"></i></button></td>
    `;
    tbody.appendChild(tr);
    recalcFactureTotals();
}

function onLineTotalChange(input, rowId) {
    const tr = document.getElementById(rowId);
    if (!tr) return;
    const total = parseFloat(input.value) || 0;
    const price = parseFloat(tr.querySelector('.line-price')?.value) || 0;
    const qtyInput = tr.querySelector('.line-qty');

    if (price > 0 && qtyInput) {
        qtyInput.value = (total / price).toFixed(3);
    }
    recalcFactureTotals();
}

function onDescChange(sel, rowId) {
    const tr = document.getElementById(rowId);
    if (!tr) return;
    const customInput = tr.querySelector('.custom-desc');
    const priceInput = tr.querySelector('.line-price');
    const totalInput = tr.querySelector('.line-total');
    const qtyInput = tr.querySelector('.line-qty');

    if (sel.classList.contains('line-desc')) {
        if (sel.value === '__custom__') {
            customInput.style.display = 'block';
            customInput.focus();
        } else {
            customInput.style.display = 'none';
            const opt = sel.options[sel.selectedIndex];
            if (opt) priceInput.value = opt.dataset.price || 0;
        }
    }

    // Recalculate quantity if price changes and total is present
    const total = parseFloat(totalInput?.value) || 0;
    const price = parseFloat(priceInput?.value) || 0;
    if (price > 0 && total > 0 && qtyInput) {
        qtyInput.value = (total / price).toFixed(3);
    }

    recalcFactureTotals();
}

function removeLine(id) {
    const el = document.getElementById(id);
    if (el) el.remove();
    recalcFactureTotals();
}

// ── Recalculate totals (TVA COMPRISE = included) ──────────────────────
function recalcFactureTotals() {
    let montant = 0;
    document.querySelectorAll('#factureLines tr').forEach(tr => {
        const qty = parseFloat(tr.querySelector('.line-qty')?.value) || 0;
        const price = parseFloat(tr.querySelector('.line-price')?.value) || 0;
        const totalInput = tr.querySelector('.line-total');

        // Use total input value if present, otherwise calculate it
        let lineTotal = 0;
        if (totalInput && document.activeElement !== totalInput) {
            lineTotal = qty * price;
            totalInput.value = lineTotal.toFixed(2);
        } else if (totalInput) {
            lineTotal = parseFloat(totalInput.value) || 0;
        } else {
            lineTotal = qty * price;
        }

        montant += lineTotal;
    });

    const tvaRate = parseFloat(document.getElementById('fTvaRate')?.value || 10);
    // TVA comprise = montant already includes TVA
    const tva = montant * tvaRate / (100 + tvaRate);
    const net = montant; // NET A PAYER = MONTANT (TVA already inside)

    document.getElementById('fSubtotal').textContent = montant.toFixed(2) + ' MAD';
    document.getElementById('fTVA').textContent = tva.toFixed(2) + ' MAD';
    document.getElementById('fTotal').textContent = net.toFixed(2) + ' MAD';

    const lettresEl = document.getElementById('fMontantLettres');
    if (lettresEl) lettresEl.value = nombreEnLettres(net);
}

// ── Collect lines ─────────────────────────────────────────────────────
function collectLines() {
    const lines = [];
    document.querySelectorAll('#factureLines tr').forEach(tr => {
        const selDesc = tr.querySelector('.line-desc');
        const customDesc = tr.querySelector('.custom-desc');
        let desc = selDesc?.value === '__custom__'
            ? (customDesc?.value || 'Personnalisé')
            : (selDesc?.value || '');
        const note = tr.querySelector('.line-note')?.value || '';
        const qty = parseFloat(tr.querySelector('.line-qty')?.value) || 0;
        const price = parseFloat(tr.querySelector('.line-price')?.value) || 0;
        const totalInput = tr.querySelector('.line-total');
        const total = totalInput ? parseFloat(totalInput.value || 0) : (qty * price);
        lines.push({ desc: desc.toUpperCase(), note, qty, price, total });
    });
    return lines;
}

// ── Save / update ─────────────────────────────────────────────────────
async function saveFacture() {
    const exploitant = document.getElementById('fExploitant').value.trim() || 'ZAKI IDDIR';
    const num = document.getElementById('fNumero').value.trim() || nextFactureNum();
    const client = document.getElementById('fClient').value.trim() || 'CLIENT';
    const ice = document.getElementById('fICE').value.trim();
    const date = document.getElementById('fDate').value || today();
    const notes = document.getElementById('fNotes').value.trim();
    const tvaRate = parseFloat(document.getElementById('fTvaRate')?.value || 10);
    const lines = collectLines();

    const montant = lines.reduce((s, l) => s + l.total, 0);
    const tva = montant * tvaRate / (100 + tvaRate);
    const total = montant;
    const lettres = nombreEnLettres(total);

    const invoiceData = { exploitant, num, client, ice, date, notes, tvaRate, lines, montant, tva, total, lettres };

    try {
        let finalId = editingFactureId;
        if (editingFactureId !== null) {
            await callAPI(`/api/invoices/${editingFactureId}`, {
                method: 'PUT',
                body: JSON.stringify({ num, date, client, ice, exploitant, total, data: invoiceData })
            });
        } else {
            const result = await callAPI('/api/invoices', {
                method: 'POST',
                body: JSON.stringify({ num, date, client, ice, exploitant, total, data: invoiceData })
            });
            finalId = result.id;
            console.log("Nouvelle facture créée avec ID:", finalId);
        }
        console.log("Mise à jour de la liste des factures...");
        await renderFactureList();
        closeFactureModal();
        return finalId;
    } catch (err) {
        console.error("ERREUR LORS DE L'ENREGISTREMENT:", err);
        alert("Action échouée : " + err.message);
        return null;
    }
}

async function saveAndNextFacture() {
    // 1. Save current
    // To preserve client info, we manually create a save flow that doesn't close the modal
    const exploitant = document.getElementById('fExploitant').value.trim() || 'ZAKI IDDIR';
    const num = document.getElementById('fNumero').value.trim() || nextFactureNum();
    const client = document.getElementById('fClient').value.trim() || 'CLIENT';
    const ice = document.getElementById('fICE').value.trim();
    const date = document.getElementById('fDate').value || today();
    const notes = document.getElementById('fNotes').value.trim();
    const tvaRate = parseFloat(document.getElementById('fTvaRate')?.value || 10);
    const lines = collectLines();

    if (lines.length === 0) return alert("Ajoutez au moins une ligne.");

    const montant = lines.reduce((s, l) => s + l.total, 0);
    const tva = montant * tvaRate / (100 + tvaRate);
    const total = montant;
    const lettres = nombreEnLettres(total);

    const invoiceData = { exploitant, num, client, ice, date, notes, tvaRate, lines, montant, tva, total, lettres };

    try {
        await callAPI('/api/invoices', {
            method: 'POST',
            body: JSON.stringify({ num, date, client, ice, exploitant, total, data: invoiceData })
        });

        await renderFactureList();
        console.log("Facture enregistrée en série.");

        // 2. Prepare for NEXT
        editingFactureId = null;
        document.getElementById('modalTitle').textContent = 'Nouvelle Facture';
        // Increment number
        document.getElementById('fNumero').value = nextFactureNum();
        // Clear lines
        document.getElementById('factureLines').innerHTML = '';
        lineCounter = 0;
        addFactureLine();
        recalcFactureTotals();

        // Focus first line
        setTimeout(() => {
            const firstLine = document.querySelector('.line-desc');
            if (firstLine) firstLine.focus();
        }, 100);

    } catch (err) {
        console.error("ERREUR:", err);
        alert("Action échouée : " + err.message);
    }
}

// ── Render list ───────────────────────────────────────────────────────
async function renderFactureList() {
    await fetchFactures();
    const tbody = document.getElementById('factureListBody');
    const emptyEl = document.getElementById('factureEmptyRow');
    [...tbody.querySelectorAll('tr.fac-row')].forEach(r => r.remove());

    if (!factures.length) { emptyEl.style.display = ''; return; }
    emptyEl.style.display = 'none';

    factures.forEach(f => {
        const prods = f.lines.map(l => l.desc).filter(Boolean).join(', ') || '–';
        const tr = document.createElement('tr');
        tr.className = 'fac-row';
        tr.innerHTML = `
          <td class="fac-num">${f.num}</td>
          <td class="fac-client">${f.client}</td>
          <td>${f.date}</td>
          <td style="font-size:.78rem;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${prods}</td>
          <td class="fac-total">${f.total.toFixed(2)} MAD</td>
          <td>
            <button class="btn-icon" title="Partager WhatsApp" onclick="shareInvoiceWhatsApp(${f.id})" style="background:rgba(37,211,102,0.1); color:#25D366; border-color:rgba(37,211,102,0.2)"><i class="fab fa-whatsapp"></i></button>
            <button class="btn-icon" title="Imprimer" onclick="printFactureById(${f.id})"><i class="fas fa-print"></i></button>
            <button class="btn-icon" title="Modifier"  onclick="openFactureModal(${f.id})"><i class="fas fa-edit"></i></button>
            <button class="btn-icon del" title="Supprimer" onclick="deleteFacture(${f.id})"><i class="fas fa-trash"></i></button>
          </td>
        `;
        tbody.appendChild(tr);
    });
}

// ── Delete ────────────────────────────────────────────────────────────
async function deleteFacture(id) {
    if (!confirm('Supprimer cette facture définitivement ?')) return;
    try {
        await callAPI(`/api/invoices/${id}`, { method: 'DELETE' });
        await renderFactureList();
    } catch (err) {
        console.error(err);
    }
}

// ── Print from modal ──────────────────────────────────────────────────
async function printFacture() {
    const savedId = await saveFacture();
    if (savedId !== null) {
        printFactureById(savedId);
    }
}
function printFactureById(id) {
    const f = factures.find(x => x.id === id);
    if (f) openPrintWindow(f);
}

// ── Print window – styled as the reference invoice ────────────────────
function openPrintWindow(f) {
    const tvaPercent = f.tvaRate != null ? f.tvaRate : 10;
    const htTotal = f.total - f.tva;
    // We assume the first line's price is the main reference price, as requested "Prix (MAD/L)" singular
    const unitPrice = f.lines.length > 0 ? Number(f.lines[0].price).toFixed(2) : '0.00';

    const linesHTML = f.lines.map(l => `
      <tr class="row-item">
        <td class="col-des">
            <div style="font-weight:700; color:var(--text-main); font-size:13px;">${l.desc}</div>
            ${l.note ? '<div style="font-weight:400; font-size:11px; color:var(--text-muted); margin-top:2px">' + l.note + '</div>' : ''}
        </td>
        <td class="col-qty">${Number(l.qty).toFixed(3)}</td>
        <td class="col-price">${Number(l.price).toFixed(2)}</td>
        <td class="col-total" style="font-weight:700; color:var(--text-main)">${l.total.toFixed(2)}</td>
      </tr>`).join('');

    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="UTF-8"/>
<title>Facture N° ${f.num}</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Montserrat:wght@700;800;900&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
<style>
:root {
    --ziz-green: #2e7d32;
    --ziz-yellow: #ffc107;
    --text-main: #1a1a1b;
    --text-muted: #64748b;
    --border-light: #e2e8f0;
    --surface-light: #f8fafc;
}

*{box-sizing:border-box;margin:0;padding:0}
body{font-family:'Inter', sans-serif;color:var(--text-main);padding:40px;font-size:13px;max-width:850px;margin:0 auto;line-height:1.5;background:#fff}

/* ── HEADER ── */
.header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 4px solid var(--ziz-yellow);
    padding-bottom: 20px;
    margin-bottom: 30px;
}

.brand {
    display: flex;
    flex-direction: column;
    gap: 5px;
}

.logo-container {
    display: flex;
    align-items: center;
    gap: 12px;
}

.logo-icon {
    width: 50px;
    height: 50px;
    background: linear-gradient(135deg, var(--ziz-green), #1b5e20);
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 20px;
    color: var(--ziz-yellow);
    font-weight: 900;
}

.brand-name {
    font-family: 'Montserrat', sans-serif;
    font-size: 24px;
    font-weight: 900;
    letter-spacing: 1px;
}

.brand-name span { color: var(--ziz-green); }

.arabic-brand {
    font-family: 'Amiri', serif;
    font-size: 18px;
    font-weight: 700;
    color: var(--ziz-green);
    direction: rtl;
}

.invoice-meta {
    text-align: right;
}

.invoice-title {
    font-family: 'Montserrat', sans-serif;
    font-size: 28px;
    font-weight: 800;
    color: var(--ziz-green);
    margin-bottom: 5px;
    text-transform: uppercase;
}

.invoice-num {
    font-size: 16px;
    font-weight: 600;
    color: var(--text-main);
}

/* ── DETAILS ── */
.details-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 40px;
    margin-bottom: 40px;
}

.detail-section h4 {
    text-transform: uppercase;
    font-size: 10px;
    letter-spacing: 1px;
    color: var(--text-muted);
    margin-bottom: 8px;
    border-bottom: 1px solid var(--border-light);
    padding-bottom: 4px;
}

.detail-content {
    font-weight: 500;
}

.detail-content b {
    font-weight: 700;
    font-size: 14px;
}

/* ── TABLE ── */
.table-container {
    position: relative;
    margin-bottom: 30px;
}

.watermark {
    position: absolute;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-25deg);
    font-size: 120px;
    font-weight: 900;
    color: rgba(46, 125, 50, 0.04);
    pointer-events: none;
    z-index: 0;
}

table {
    width: 100%;
    border-collapse: collapse;
    position: relative;
    z-index: 1;
}

thead th {
    background: var(--surface-light);
    border-bottom: 2px solid var(--ziz-green);
    padding: 12px 15px;
    text-align: left;
    font-weight: 700;
    text-transform: uppercase;
    font-size: 11px;
    letter-spacing: 0.5px;
}

tbody td {
    padding: 15px;
    border-bottom: 1px solid var(--border-light);
    vertical-align: middle;
}

.col-qty, .col-price, .col-total { text-align: right; }
.col-des { width: 45%; }

.row-item:last-child td { border-bottom: none; }

/* ── TOTALS ── */
.totals-wrapper {
    display: flex;
    justify-content: flex-end;
    margin-top: 20px;
}

.totals-box {
    width: 300px;
}

.total-line {
    display: flex;
    justify-content: space-between;
    padding: 8px 0;
}

.total-line.grand-total {
    border-top: 2px solid var(--ziz-green);
    margin-top: 10px;
    padding-top: 15px;
    font-size: 18px;
    font-weight: 800;
    color: var(--ziz-green);
}

/* ── ARRESTÉE ── */
.arrete-section {
    background: var(--surface-light);
    border-radius: 8px;
    padding: 15px 20px;
    margin-top: 30px;
    font-style: italic;
    color: var(--text-muted);
}

.arrete-section span {
    font-weight: 700;
    color: var(--text-main);
    font-style: normal;
}

/* ── FOOTER ── */
.footer {
    margin-top: 60px;
    padding-top: 20px;
    border-top: 1px solid var(--border-light);
    text-align: center;
    font-size: 10px;
    color: var(--text-muted);
    line-height: 1.8;
}

.footer b { color: var(--text-main); }

@media print {
    body { padding: 0; }
    .header { margin-bottom: 20px; }
}
</style>
</head><body>

<div class="header">
    <div class="brand">
        <div class="logo-container">
            <div class="logo-icon">ZIZ</div>
            <div class="brand-name">STATION <span>ZIZ</span></div>
        </div>
        <div class="arabic-brand">محطة الوقود زيز ازيلال</div>
    </div>
    <div class="invoice-meta">
        <div class="invoice-title">Facture</div>
        <div class="invoice-num">N° ${f.num}</div>
        <div style="color:var(--text-muted); margin-top:5px;">Date: ${f.date}</div>
    </div>
</div>

<div class="details-grid">
    <div class="detail-section">
        <div class="detail-content">
            <b>${f.exploitant || 'ZAKI IDDIR'}</b><br>
            EXPLOITANT DE STATION DE SERVICE<br>
            ROUTE MARRAKECH, AZILAL
        </div>
    </div>
    <div class="detail-section">
        <h4>Facturé à</h4>
        <div class="detail-content">
            <b>${f.client}</b><br>
            ${f.ice ? 'ICE: ' + f.ice : ''}
        </div>
    </div>
</div>

<div class="table-container">
    <div class="watermark">ZIZ</div>
    <table>
        <thead>
            <tr>
                <th class="col-des">Désignation</th>
                <th class="col-qty">Qté</th>
                <th class="col-price">P.U (MAD)</th>
                <th class="col-total">Total (MAD)</th>
            </tr>
        </thead>
        <tbody>
            ${linesHTML}
        </tbody>
    </table>
</div>

<div class="totals-wrapper">
    <div class="totals-box">
        <div class="total-line">
            <span>Montant HT</span>
            <span>${htTotal.toFixed(2)} MAD</span>
        </div>
        <div class="total-line">
            <span>TVA (${tvaPercent}%)</span>
            <span>${f.tva.toFixed(2)} MAD</span>
        </div>
        <div class="total-line grand-total">
            <span>NET À PAYER</span>
            <span>${f.total.toFixed(2)} MAD</span>
        </div>
    </div>
</div>

<div class="arrete-section">
    Arrêtée la présente facture à la somme de :<br>
    <span>${f.lettres || nombreEnLettres(f.total)}</span>
</div>

${f.notes ? `<div style="margin-top:20px; font-size:11px; color:var(--text-muted);"><b>Notes:</b> ${f.notes}</div>` : ''}

<div class="footer">
    <b>SIÈGE SOCIAL :</b> ROUTE MARRAKECH AZILAL<br>
    <b>R.C :</b> 15146  |  <b>PATENTE :</b> 41600302  |  <b>IDENT FISC :</b> 062305420  |  <b>C.N.S.S :</b> 6468434<br>
    <b>ICE :</b> 000502528000007
</div>

<script>window.onload=()=>{window.print();window.onafterprint=()=>window.close();}<\/script>
</body></html>`;

    const w = window.open('', '_blank', 'width=820,height:1020');
    if (w) { w.document.write(html); w.document.close(); }
}

// ── WhatsApp Sharing ──────────────────────────────────────────────────
function shareInvoiceWhatsApp(id) {
    const f = factures.find(x => x.id === id);
    if (!f) return;

    let linesDesc = "";
    f.lines.forEach(l => {
        linesDesc += `• ${l.desc}: ${l.qty} x ${l.price.toFixed(2)} = *${l.total.toFixed(2)} MAD*\n`;
    });

    const message = `*STATION ZIZ - FACTURE N° ${f.num}*\n\n` +
        `👤 *Client:* ${f.client}\n` +
        `📅 *Date:* ${f.date}\n\n` +
        `📦 *DÉTAILS :*\n${linesDesc}\n` +
        `💰 *TOTAL À PAYER:* *${f.total.toFixed(2)} MAD*\n\n` +
        `_Merci de votre confiance._`;

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
}

function shareCountersWhatsApp() {
    const pompiste = document.getElementById('pompiste')?.value || '–';
    const vacation = document.getElementById('vacation')?.value || '–';
    const date = document.getElementById('sessionDate')?.value || today();

    // Pump Labels Mapping
    const PUMP_LABELS = {
        'g1': 'Gasoil P1', 'g2': 'Gasoil P2', 'g3': 'Gasoil P3', 'g4': 'Gasoil P4',
        's1': 'Super P1', 's2': 'Super P2',
        'lav': 'Lavage', 'lub': 'Lubrifiant', 'gaz': 'Gaz', 'one': 'ONE'
    };

    let detailsMessage = "*DÉTAILS DES COMPTEURS :*\n";
    ROWS.forEach(({ id }) => {
        const debut = document.querySelector(`.idx-debut[data-row="${id}"]`)?.value || '0';
        const fin = document.querySelector(`.idx-fin[data-row="${id}"]`)?.value || '0';
        const qty = document.getElementById(`qty-${id}`)?.textContent || '0.000';
        const price = document.querySelector(`.price-input[data-row="${id}"]`)?.value || '0.00';
        const total = document.getElementById(`total-${id}`)?.textContent || '0.00 MAD';

        if (parseFloat(qty) > 0 || parseFloat(debut) > 0 || parseFloat(fin) > 0) {
            detailsMessage += `• *${PUMP_LABELS[id] || id}* :\n`;
            detailsMessage += `  Index: ${debut} ➔ ${fin}\n`;
            detailsMessage += `  Volume: ${qty} L | Total: *${total}*\n`;
        }
    });

    // Get totals from UI
    const gasoilTotal = document.getElementById('subtotal-total-gasoil')?.textContent || '0.00 MAD';
    const superTotal = document.getElementById('subtotal-total-super')?.textContent || '0.00 MAD';
    const grandTotal = document.getElementById('grand-total')?.textContent || '0.00 MAD';
    const netTotal = document.getElementById('card-net-total')?.textContent || '0.00 MAD';
    const creditsTotal = document.getElementById('card-credits-total')?.textContent || '0.00 MAD';

    const message = `*STATION ZIZ - RELEVÉ DÉTAILLÉ*\n\n` +
        `📅 *Date:* ${date}\n` +
        `👤 *Pompiste:* ${pompiste}\n` +
        `⏰ *Vacation:* ${vacation}\n\n` +
        detailsMessage +
        `\n📊 *RÉSUMÉ FINAL :*\n` +
        `⛽ *Total Gasoil:* ${gasoilTotal}\n` +
        `🔥 *Total Super:* ${superTotal}\n` +
        `💰 *TOTAL BRUT:* ${grandTotal}\n` +
        `💳 *TOTAL CRÉDITS:* ${creditsTotal}\n` +
        `🏧 *NET À ENCAISSER:* *${netTotal}*\n\n` +
        `_Généré via Station ZIZ Management._`;

    const encoded = encodeURIComponent(message);
    window.open(`https://wa.me/?text=${encoded}`, '_blank');
}

async function showSalesStats() {
    const modal = document.getElementById('statsModal');
    if (!modal) return;
    modal.style.display = 'flex';

    try {
        const stats = await callAPI('/api/stats');

        // Store for printing
        window.__currentStats = stats;

        document.getElementById('stat-day').textContent = fmtMoney(stats.day || 0);
        document.getElementById('stat-week').textContent = fmtMoney(stats.week || 0);
        document.getElementById('stat-month').textContent = fmtMoney(stats.month || 0);
    } catch (err) {
        console.error('Stats error:', err);
    }
}

function printSalesStats() {
    const stats = window.__currentStats;
    if (!stats) return;

    const printWindow = window.open('', '_blank', 'width=950,height=900');
    const todayStr = new Date().toLocaleDateString('fr-FR', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
    });

    const renderBreakdownTable = (breakdown, total) => `
        <table class="details-table">
            <thead>
                <tr>
                    <th>Produit</th>
                    <th>Volume (L)</th>
                    <th>Total (MAD)</th>
                </tr>
            </thead>
            <tbody>
                <tr>
                    <td><b>GASOIL</b></td>
                    <td>${fmt(breakdown.gasoil.qty)} L</td>
                    <td>${fmtMoney(breakdown.gasoil.total)}</td>
                </tr>
                <tr>
                    <td><b>SUPER</b></td>
                    <td>${fmt(breakdown.super.qty)} L</td>
                    <td>${fmtMoney(breakdown.super.total)}</td>
                </tr>
                <tr>
                    <td><b>SERVICES / DIVERS</b></td>
                    <td>–</td>
                    <td>${fmtMoney(breakdown.services.total)}</td>
                </tr>
                <tr class="row-total">
                    <td>TOTAL GÉNÉRAL</td>
                    <td>${fmt((breakdown.gasoil.qty + breakdown.super.qty))} L</td>
                    <td>${fmtMoney(total)}</td>
                </tr>
            </tbody>
        </table>
    `;

    const renderSecondaryStats = (period) => `
        <div class="secondary-stats">
            <div class="sec-item"><span>Crédits Accordés:</span> <b>${fmtMoney(stats.credits[period])}</b></div>
            <div class="sec-item"><span>Factures Émises:</span> <b>${fmtMoney(stats.invoices[period])}</b></div>
        </div>
    `;

    const sessionsHtml = stats.today_sessions.length > 0 ? `
        <table class="details-table" style="margin-top: 10px;">
            <thead>
                <tr>
                    <th>Pompiste</th>
                    <th>Vacation</th>
                    <th>Total Session</th>
                </tr>
            </thead>
            <tbody>
                ${stats.today_sessions.map(s => `
                    <tr>
                        <td>${s.pompiste || '–'}</td>
                        <td>${s.vacation || '–'}</td>
                        <td>${fmtMoney(s.total)}</td>
                    </tr>
                `).join('')}
            </tbody>
        </table>
    ` : '<p style="text-align:center; color:#94a3b8;">Aucune session enregistrée aujourd\'hui.</p>';

    const html = `
    <!DOCTYPE html>
    <html lang="fr">
    <head>
        <meta charset="UTF-8">
        <title>Rapport d'Activité Complet - Station ZIZ</title>
        <link href="https://fonts.googleapis.com/css2?family=Montserrat:wght@400;700;900&family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
        <style>
            body { font-family: 'Inter', sans-serif; color: #1a1a1b; margin: 40px; line-height: 1.4; background: #fff; font-size: 13px; }
            .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #1b5e20; padding-bottom: 15px; margin-bottom: 25px; }
            .logo-text { font-family: 'Montserrat', sans-serif; font-weight: 900; font-size: 1.8rem; color: #1b5e20; letter-spacing: -1px; }
            .logo-text span { color: #fbc02d; }
            .report-title { text-align: right; }
            .report-title h1 { margin: 0; font-size: 1.4rem; text-transform: uppercase; letter-spacing: 1px; color: #1b5e20; }
            .report-title p { margin: 3px 0 0; color: #64748b; font-weight: 600; }
            
            section { margin-bottom: 30px; page-break-inside: avoid; }
            h2 { font-size: 1rem; text-transform: uppercase; color: #1b5e20; border-left: 4px solid #fbc02d; padding-left: 10px; margin-bottom: 15px; background: #f8fafc; padding-top: 5px; padding-bottom: 5px; }
            
            .details-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; }
            .details-table th { background: #f1f5f9; text-align: left; padding: 8px 12px; border-bottom: 2px solid #e2e8f0; font-size: 0.75rem; color: #64748b; text-transform: uppercase; }
            .details-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
            .row-total { background: #f8fafc; font-weight: 800; color: #1b5e20; }

            .secondary-stats { display: flex; gap: 30px; margin: 10px 0; padding: 10px; background: #fffbeb; border: 1px solid #fef3c7; border-radius: 8px; }
            .sec-item { font-size: 0.9rem; }
            .sec-item span { color: #92400e; margin-right: 5px; }

            .footer { margin-top: 40px; border-top: 1px solid #e2e8f0; padding-top: 15px; text-align: center; color: #94a3b8; font-size: 0.7rem; }
            @media print {
                body { margin: 15px; }
                header { -webkit-print-color-adjust: exact; }
                h2 { background: #f8fafc !important; -webkit-print-color-adjust: exact; }
            }
        </style>
    </head>
    <body>
        <div class="header">
            <div class="logo-text">STATION <span>ZIZ</span></div>
            <div class="report-title">
                <h1>Rapport d'Activité Complet</h1>
                <p>Date d'édition: ${todayStr}</p>
            </div>
        </div>

        <section>
            <h2>1. BILAN AUJOURD'HUI</h2>
            ${renderBreakdownTable(stats.today_breakdown, stats.day)}
            ${renderSecondaryStats('day')}
            <h3 style="font-size: 0.85rem; color: #64748b; text-transform: uppercase; margin: 15px 0 5px;">Sessions de la journée :</h3>
            ${sessionsHtml}
        </section>

        <section>
            <h2>2. BILAN DES 7 DERNIERS JOURS</h2>
            ${renderBreakdownTable(stats.week_breakdown, stats.week)}
            ${renderSecondaryStats('week')}
        </section>

        <section>
            <h2>3. BILAN MENSUEL (MOIS EN COURS)</h2>
            ${renderBreakdownTable(stats.month_breakdown, stats.month)}
            ${renderSecondaryStats('month')}
        </section>

        <div class="footer">
            <p>Ce rapport consolide les données des compteurs, des crédits clients et des facturations émises.</p>
            <p>&copy; ${new Date().getFullYear()} Station ZIZ - Système de Gestion Intégré</p>
        </div>

        <script>
            window.onload = () => {
                setTimeout(() => { window.print(); }, 500);
            };
        </script>
    </body>
    </html>
    `;

    printWindow.document.open();
    printWindow.document.write(html);
    printWindow.document.close();
}

async function runDiagnostic() {
    const modal = document.getElementById('diagModal');
    const content = document.getElementById('diagContent');
    if (!modal || !content) return;

    modal.style.display = 'flex';
    content.innerHTML = '<div style="text-align:center; padding: 20px;"><i class="fas fa-spinner fa-spin"></i> Analyse en cours...</div>';

    try {
        const data = await callAPI('/api/diag');
        content.innerHTML = `
            <div style="background:var(--surface2); padding: 15px; border-radius: 8px; margin-bottom: 15px;">
                <h4 style="color:var(--ziz-yellow); margin-bottom: 10px;"><i class="fas fa-database"></i> Base de Données</h4>
                <p><b>Chemin:</b> <code style="word-break:break-all; font-size:0.8rem;">${data.dbPath}</code></p>
                <p><b>Sessions:</b> ${data.counts.sessions}</p>
                <p><b>Crédits:</b> ${data.counts.credits}</p>
                <p><b>Factures:</b> ${data.counts.invoices}</p>
            </div>
            <div style="background:var(--surface2); padding: 15px; border-radius: 8px;">
                <h4 style="color:var(--ziz-green); margin-bottom: 10px;"><i class="fas fa-info-circle"></i> Système</h4>
                <p><b>Plateforme:</b> ${data.platform}</p>
                <p><b>Node:</b> ${data.nodeVersion}</p>
                <p><b>Uptime:</b> ${Math.floor(data.uptime / 60)} minutes</p>
                <p><b>Statut Serveur:</b> <span style="color:#10b981">OPÉRATIONNEL</span></p>
            </div>
        `;
    } catch (err) {
        content.innerHTML = `<div style="color:#ef4444; padding: 20px; text-align:center;">
            <i class="fas fa-exclamation-circle"></i> Erreur de diagnostic: ${err.message}
        </div>`;
    }
}

// ── Sharing ──────────────────────────────────────────────────────────
function shareOnWhatsApp() {
    const data = window.currentSessionData || {};
    const pompiste = data.pompiste || 'Pompiste non spécifié';
    const date = data.date || today();
    const net = document.getElementById('card-net-total')?.textContent || '0.00 MAD';
    const grand = document.getElementById('card-grand-total')?.textContent || '0.00 MAD';
    const credits = document.getElementById('card-credits-total')?.textContent || '0.00 MAD';

    let msg = `⛽ *STATION ZIZ - RAPPORT DE POSTE*\n`;
    msg += `----------------------------------\n`;
    msg += `👤 *Pompiste:* ${pompiste}\n`;
    msg += `📅 *Date:* ${date}\n`;
    msg += `🕒 *Vacation:* ${data.vacation || '-'}\n\n`;
    msg += `💰 *TOTAL GÉNÉRAL:* ${grand}\n`;
    msg += `💳 *TOTAL CRÉDITS:* ${credits}\n`;
    msg += `💵 *NET À ENCAISSER:* ${net}\n`;
    msg += `----------------------------------\n`;
    msg += `_Généré via Station ZIZ App_`;

    const url = `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(url, '_blank');
}

// ── Export all inline HTML functions to window ────────────────────────
window.resetAll = resetAll;
window.showSalesStats = showSalesStats;
window.printSalesStats = printSalesStats;
window.runDiagnostic = runDiagnostic;
window.addCreditRow = addCreditRow;
window.deleteCreditRow = deleteCreditRow;
window.manualArchive = manualArchive;
window.deleteArchive = deleteArchive;
window.showArchiveDetails = showArchiveDetails;
window.closeArchiveDetailsModal = closeArchiveDetailsModal;
window.closeArchiveDetailsModalOnOverlay = closeArchiveDetailsModalOnOverlay;
window.openFactureModal = openFactureModal;
window.closeFactureModal = closeFactureModal;
window.closeFactureModalOnOverlay = closeFactureModalOnOverlay;
window.addFactureLine = addFactureLine;
window.removeLine = removeLine;
window.onDescChange = onDescChange;
window.recalcFactureTotals = recalcFactureTotals;
window.saveFacture = saveFacture;
window.saveAndNextFacture = saveAndNextFacture;
window.deleteFacture = deleteFacture;
window.printFacture = printFacture;
window.printFactureById = printFactureById;
window.shareInvoiceWhatsApp = shareInvoiceWhatsApp;
window.shareCountersWhatsApp = shareCountersWhatsApp;
window.shareOnWhatsApp = shareOnWhatsApp;

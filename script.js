let currentSearchType = 'email';
let currentQuery = '';
let resultData = null;

// DOM
const searchInput = document.getElementById('searchInput');
const searchBtn = document.getElementById('searchBtn');
const loading = document.getElementById('loading');
const resultContainer = document.getElementById('resultContainer');
const resultContent = document.getElementById('resultContent');
const exportBtn = document.getElementById('exportBtn');
const reportBtn = document.getElementById('reportBtn');

// Search Type
document.querySelectorAll('.type-btn').forEach(btn => {
    btn.addEventListener('click', function() {
        document.querySelectorAll('.type-btn').forEach(b => b.classList.remove('active'));
        this.classList.add('active');
        currentSearchType = this.dataset.type;
        searchInput.placeholder = getPlaceholder(currentSearchType);
        searchInput.focus();
    });
});

function getPlaceholder(type) {
    const map = {
        email: '📧 user@domain.com',
        username: '👤 @username atau username saja',
        phone: '📱 +628123456789',
        ip: '🌐 192.168.1.1'
    };
    return map[type] || 'Masukkan query...';
}

// Search
searchBtn.addEventListener('click', performSearch);
searchInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') performSearch();
});

async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) {
        searchInput.style.borderColor = '#ef4444';
        setTimeout(() => searchInput.style.borderColor = '', 2000);
        return;
    }

    currentQuery = query;
    resultData = null;

    // Loading
    loading.classList.remove('hidden');
    resultContainer.classList.add('hidden');
    searchBtn.disabled = true;
    searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Proses...';

    const progressFill = document.querySelector('.progress-fill');
    let progress = 0;
    const interval = setInterval(() => {
        progress += Math.random() * 10;
        if (progress > 95) progress = 95;
        progressFill.style.width = progress + '%';
    }, 300);

    try {
        const res = await fetch('/api/osint', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: currentSearchType, query })
        });

        const data = await res.json();
        clearInterval(interval);
        progressFill.style.width = '100%';

        setTimeout(() => {
            loading.classList.add('hidden');
            if (data.success) {
                resultData = data.data;
                renderResults(data.data);
                resultContainer.classList.remove('hidden');
            } else {
                showError(data.message || 'Gagal');
            }
            searchBtn.disabled = false;
            searchBtn.innerHTML = '<i class="fas fa-search"></i> Lacak';
        }, 500);

    } catch (err) {
        clearInterval(interval);
        loading.classList.add('hidden');
        showError('⚠️ Gagal menghubungi server.');
        searchBtn.disabled = false;
        searchBtn.innerHTML = '<i class="fas fa-search"></i> Lacak';
    }
}

function renderResults(data) {
    let html = `
        <div style="display:flex; gap:16px; flex-wrap:wrap; margin-bottom:16px;">
            <div style="background:#0e0e1a;padding:12px 20px;border-radius:10px;flex:1;min-width:120px;text-align:center;">
                <div style="color:var(--text-dim);font-size:0.75rem;">Total Found</div>
                <div style="font-size:1.4rem;font-weight:700;color:var(--success);">${data.total || 0}</div>
            </div>
            <div style="background:#0e0e1a;padding:12px 20px;border-radius:10px;flex:1;min-width:120px;text-align:center;">
                <div style="color:var(--text-dim);font-size:0.75rem;">Platforms</div>
                <div style="font-size:1.4rem;font-weight:700;color:var(--primary);">${data.platforms || 0}</div>
            </div>
            <div style="background:#0e0e1a;padding:12px 20px;border-radius:10px;flex:1;min-width:120px;text-align:center;">
                <div style="color:var(--text-dim);font-size:0.75rem;">Type</div>
                <div style="font-size:1rem;font-weight:600;color:var(--warning);">${data.type || 'unknown'}</div>
            </div>
        </div>
    `;

    if (data.results && data.results.length > 0) {
        data.results.forEach(item => {
            html += `
                <div class="result-item">
                    <div>
                        <div class="label">${item.label || 'Info'}</div>
                        <div class="value">${item.value || '-'}</div>
                        <div class="source">Source: ${item.source || 'Unknown'}</div>
                    </div>
                    <span class="badge ${item.confidence === 'high' ? 'success' : item.confidence === 'medium' ? 'warning' : 'danger'}">
                        ${item.confidence || 'unknown'}
                    </span>
                </div>
            `;
        });
    } else {
        html += `
            <div style="text-align:center;padding:30px;color:var(--text-dim);">
                <i class="fas fa-search" style="font-size:2rem;margin-bottom:12px;opacity:0.3;"></i>
                <p>Tidak ditemukan hasil untuk query ini.</p>
            </div>
        `;
    }

    resultContent.innerHTML = html;
}

function showError(msg) {
    resultContainer.classList.remove('hidden');
    resultContent.innerHTML = `
        <div style="background:#0e0e1a;border-radius:10px;padding:20px;text-align:center;border-left:3px solid #ef4444;">
            <i class="fas fa-exclamation-triangle" style="color:#ef4444;font-size:1.8rem;margin-bottom:8px;"></i>
            <p style="color:#ef4444;font-weight:500;">${msg}</p>
        </div>
    `;
}

// Export
exportBtn.addEventListener('click', () => {
    if (!resultData) return;
    const blob = new Blob([JSON.stringify(resultData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `hidaka-osint_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
});

// Report (print-friendly)
reportBtn.addEventListener('click', () => {
    window.print();
});
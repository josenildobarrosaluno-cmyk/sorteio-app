const loginScreen = document.getElementById('login-screen');
const adminApp = document.getElementById('admin-app');

function getKey() {
  return sessionStorage.getItem('admin-key');
}

async function apiAdmin(path, options = {}) {
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'x-admin-key': getKey(),
      ...(options.headers || {})
    }
  });
  if (res.status === 401) {
    sessionStorage.removeItem('admin-key');
    showLogin();
    throw new Error('Não autorizado');
  }
  return res;
}

function showLogin() {
  loginScreen.style.display = 'flex';
  adminApp.style.display = 'none';
}

function showApp() {
  loginScreen.style.display = 'none';
  adminApp.style.display = 'block';
  loadSummary();
}

document.getElementById('login-btn').addEventListener('click', async () => {
  const key = document.getElementById('admin-key').value;
  const res = await fetch('/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key })
  });
  if (res.ok) {
    sessionStorage.setItem('admin-key', key);
    showApp();
  } else {
    document.getElementById('login-msg').innerHTML = '<div class="msg error">Senha incorreta</div>';
  }
});

function fmtMoney(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function loadSummary() {
  const res = await apiAdmin('/api/admin/summary');
  const data = await res.json();

  document.getElementById('a-available').textContent = data.counts.available || 0;
  document.getElementById('a-reserved').textContent = data.counts.reserved || 0;
  document.getElementById('a-sold').textContent = data.counts.sold || 0;
  document.getElementById('a-revenue').textContent = fmtMoney(data.revenue);

  document.getElementById('cfg-title').value = data.raffle.title || '';
  document.getElementById('cfg-desc').value = data.raffle.description || '';
  document.getElementById('cfg-price').value = data.raffle.price;
  document.getElementById('cfg-total').value = data.raffle.total_numbers;
  document.getElementById('cfg-digits').value = data.raffle.digits;
  document.getElementById('cfg-date').value = data.raffle.draw_date || '';
  document.getElementById('cfg-status').value = data.raffle.status;

  renderTiers(data.raffle.pricing_tiers || []);

  const previewEl = document.getElementById('prize-preview');
  if (data.raffle.image_url) {
    previewEl.src = data.raffle.image_url + '?t=' + Date.now();
    previewEl.style.display = 'block';
  } else {
    previewEl.style.display = 'none';
  }

  const digits = data.raffle.digits;
  const tbody = document.getElementById('orders-body');
  tbody.innerHTML = data.orders.map(o => `
    <tr>
      <td>${o.name || '—'}</td>
      <td>${o.phone || ''}${o.email ? '<br>' + o.email : ''}</td>
      <td>${o.numbers.map(n => String(n).padStart(digits, '0')).join(', ')}</td>
      <td>${fmtMoney(o.amount)}</td>
      <td><span class="pill ${o.status}">${o.status}</span></td>
    </tr>
  `).join('') || '<tr><td colspan="5">Nenhum pedido ainda</td></tr>';
}

function renderTiers(tiers) {
  const list = document.getElementById('tiers-list');
  list.innerHTML = '';
  tiers.forEach(t => addTierRow(t.qty, t.price));
}

function addTierRow(qty = '', price = '') {
  const list = document.getElementById('tiers-list');
  const row = document.createElement('div');
  row.className = 'tier-row';
  row.innerHTML = `
    <input type="number" class="tier-qty" placeholder="Quantidade" min="2" value="${qty}" style="margin:0">
    <input type="number" class="tier-price" placeholder="Preço total (R$)" min="0.01" step="0.01" value="${price}" style="margin:0">
    <button type="button" class="tier-remove">×</button>
  `;
  row.querySelector('.tier-remove').addEventListener('click', () => row.remove());
  list.appendChild(row);
}

function collectTiers() {
  return [...document.querySelectorAll('.tier-row')]
    .map(row => ({
      qty: Number(row.querySelector('.tier-qty').value),
      price: Number(row.querySelector('.tier-price').value)
    }))
    .filter(t => t.qty > 1 && t.price > 0);
}

document.getElementById('add-tier-btn').addEventListener('click', () => addTierRow());

document.getElementById('save-cfg').addEventListener('click', async () => {
  const body = {
    title: document.getElementById('cfg-title').value,
    description: document.getElementById('cfg-desc').value,
    price: Number(document.getElementById('cfg-price').value),
    total_numbers: Number(document.getElementById('cfg-total').value),
    digits: Number(document.getElementById('cfg-digits').value),
    draw_date: document.getElementById('cfg-date').value || null,
    status: document.getElementById('cfg-status').value,
    pricing_tiers: collectTiers()
  };
  const res = await apiAdmin('/api/admin/raffle', { method: 'PUT', body: JSON.stringify(body) });
  const data = await res.json();
  const msgEl = document.getElementById('cfg-msg');
  if (res.ok) {
    msgEl.innerHTML = '<div class="msg ok">Configurações salvas.</div>';
    loadSummary();
  } else {
    msgEl.innerHTML = `<div class="msg error">${data.error}</div>`;
  }
});

document.getElementById('reset-btn').addEventListener('click', async () => {
  if (!confirm('Isso vai apagar TODOS os pedidos, compradores e liberar todos os números. Continuar?')) return;
  await apiAdmin('/api/admin/reset', { method: 'POST' });
  loadSummary();
});

document.getElementById('upload-img-btn').addEventListener('click', async () => {
  const fileInput = document.getElementById('prize-file');
  const msgEl = document.getElementById('img-msg');
  if (!fileInput.files || fileInput.files.length === 0) {
    msgEl.innerHTML = '<div class="msg error">Escolha uma imagem primeiro.</div>';
    return;
  }
  const formData = new FormData();
  formData.append('image', fileInput.files[0]);

  try {
    const res = await fetch('/api/admin/raffle/image', {
      method: 'POST',
      headers: { 'x-admin-key': getKey() },
      body: formData
    });
    const data = await res.json();
    if (res.ok) {
      msgEl.innerHTML = '<div class="msg ok">Imagem atualizada.</div>';
      loadSummary();
    } else {
      msgEl.innerHTML = `<div class="msg error">${data.error}</div>`;
    }
  } catch (err) {
    msgEl.innerHTML = '<div class="msg error">Erro ao enviar imagem.</div>';
  }
});

document.getElementById('draw-btn').addEventListener('click', async () => {
  const res = await apiAdmin('/api/admin/draw', { method: 'POST' });
  const data = await res.json();
  const area = document.getElementById('winner-area');
  if (!res.ok) {
    area.innerHTML = `<div class="msg error">${data.error}</div>`;
    return;
  }
  const digits = Number(document.getElementById('cfg-digits').value) || 2;
  area.innerHTML = `
    <div class="winner-box">
      <div class="big">${String(data.winner.number).padStart(digits, '0')}</div>
      <div>${data.winner.name || 'Comprador não identificado'}</div>
      <div style="opacity:0.7">${data.winner.phone || ''}</div>
      <div style="margin-top:8px;font-size:12px;opacity:0.6">Sorteado entre ${data.totalVendidos} números vendidos</div>
    </div>
  `;
});

if (getKey()) {
  fetch('/api/admin/summary', { headers: { 'x-admin-key': getKey() } })
    .then(res => res.ok ? showApp() : showLogin())
    .catch(showLogin);
} else {
  showLogin();
}

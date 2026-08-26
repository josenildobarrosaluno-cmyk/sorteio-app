let raffleState = null;
let digits = 2;
const selected = new Set();

const gridEl = document.getElementById('numbers-grid');
const cartListEl = document.getElementById('cart-list');
const cartTotalEl = document.getElementById('cart-total');
const buyBtn = document.getElementById('buy-btn');
const formMsg = document.getElementById('form-msg');

function fmtNumber(n) {
  return String(n).padStart(digits, '0');
}

function fmtMoney(v) {
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function computeAmount(quantity, raffle) {
  const customTiers = (raffle.pricing_tiers || [])
    .filter(t => Number(t.qty) > 1 && Number(t.price) > 0)
    .map(t => ({ qty: Number(t.qty), price: Number(t.price) }));
  const tiers = [...customTiers, { qty: 1, price: raffle.price }]
    .sort((a, b) => b.qty - a.qty);

  let remaining = quantity;
  let total = 0;
  for (const tier of tiers) {
    while (remaining >= tier.qty) {
      total += tier.price;
      remaining -= tier.qty;
    }
  }
  return Math.round(total * 100) / 100;
}

async function loadRaffle() {
  const res = await fetch('/api/raffle');
  const data = await res.json();
  raffleState = data;
  digits = data.raffle.digits;

  document.getElementById('raffle-title').textContent = data.raffle.title;
  document.getElementById('raffle-desc').textContent = data.raffle.description;
  document.getElementById('raffle-price').textContent = fmtMoney(data.raffle.price);
  document.getElementById('raffle-total').textContent = data.raffle.total_numbers;
  document.getElementById('raffle-date').textContent = data.raffle.draw_date
    ? new Date(data.raffle.draw_date + 'T00:00:00').toLocaleDateString('pt-BR')
    : 'a definir';

  const imgEl = document.getElementById('prize-image');
  if (data.raffle.image_url) {
    imgEl.src = data.raffle.image_url;
    imgEl.style.display = 'block';
  } else {
    imgEl.style.display = 'none';
  }

  const mastheadEl = document.getElementById('masthead');
  const logoEl = document.getElementById('org-logo');
  const orgNameEl = document.getElementById('org-name');
  const hasLogo = !!data.raffle.logo_url;
  const hasOrgName = !!(data.raffle.org_name && data.raffle.org_name.trim());

  if (hasLogo) {
    logoEl.src = data.raffle.logo_url;
    logoEl.style.display = 'block';
  } else {
    logoEl.style.display = 'none';
  }
  orgNameEl.textContent = hasOrgName ? data.raffle.org_name : '';
  mastheadEl.style.display = (hasLogo || hasOrgName) ? 'flex' : 'none';

  renderGrid(data.numbers);
  renderPackOptions();
  renderCart();
}

function renderPackOptions() {
  const packEl = document.getElementById('pack-options');
  const tiers = raffleState.raffle.pricing_tiers || [];
  if (tiers.length === 0) {
    packEl.innerHTML = '';
    return;
  }
  const sorted = [...tiers].sort((a, b) => a.qty - b.qty);

  // Destaca a faixa com o melhor preço por número (mais vantajosa) como "Mais popular"
  let bestIdx = 0;
  let bestUnitPrice = Infinity;
  sorted.forEach((t, i) => {
    const unitPrice = t.price / t.qty;
    if (unitPrice < bestUnitPrice) { bestUnitPrice = unitPrice; bestIdx = i; }
  });

  packEl.innerHTML = sorted.map((t, i) => `
    <div class="pack-card" data-qty="${t.qty}">
      ${i === bestIdx && sorted.length > 1 ? '<span class="badge">Mais popular</span>' : ''}
      <div class="qty">${t.qty}</div>
      <div class="label">números</div>
      <div class="price">${fmtMoney(t.price)}</div>
    </div>
  `).join('');
  packEl.querySelectorAll('.pack-card').forEach(card => {
    card.addEventListener('click', () => selectRandomPack(Number(card.dataset.qty)));
  });
}

function renderUpsellHint() {
  const hintEl = document.getElementById('upsell-hint');
  const tiers = raffleState?.raffle.pricing_tiers || [];
  if (tiers.length === 0 || selected.size === 0) {
    hintEl.innerHTML = '';
    return;
  }
  const sorted = [...tiers].sort((a, b) => a.qty - b.qty);
  const next = sorted.find(t => t.qty > selected.size);
  if (!next) {
    hintEl.innerHTML = '';
    return;
  }
  const missing = next.qty - selected.size;
  hintEl.innerHTML = `<div class="upsell-hint">Faltam ${missing} número(s) para o pacote de ${next.qty} por ${fmtMoney(next.price)}</div>`;
}

function selectRandomPack(qty) {
  const available = raffleState.numbers
    .filter(n => n.status === 'available' && !selected.has(n.number))
    .map(n => n.number);

  if (available.length < qty) {
    showMsg(`Só restam ${available.length} números disponíveis no momento.`, 'error');
    return;
  }

  for (let i = available.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [available[i], available[j]] = [available[j], available[i]];
  }
  available.slice(0, qty).forEach(n => selected.add(n));

  renderGrid(raffleState.numbers);
  renderCart();
}

function renderGrid(numbers) {
  gridEl.innerHTML = '';
  for (const n of numbers) {
    const chip = document.createElement('button');
    chip.type = 'button';
    chip.className = 'num-chip ' + n.status + (selected.has(n.number) ? ' selected' : '');
    chip.textContent = fmtNumber(n.number);
    chip.disabled = n.status !== 'available';
    chip.addEventListener('click', () => toggleNumber(n.number));
    gridEl.appendChild(chip);
  }
}

function toggleNumber(n) {
  if (selected.has(n)) selected.delete(n);
  else selected.add(n);
  renderGrid(raffleState.numbers);
  renderCart();
}

function renderCart() {
  if (selected.size === 0) {
    cartListEl.innerHTML = '<span class="cart-empty">Nenhum número selecionado ainda</span>';
  } else {
    cartListEl.innerHTML = [...selected]
      .sort((a, b) => a - b)
      .map(n => `<span class="cart-chip">${fmtNumber(n)}</span>`)
      .join('');
  }
  renderUpsellHint();
  const total = computeAmount(selected.size, raffleState?.raffle || { price: 0 });
  cartTotalEl.textContent = fmtMoney(total);

  buyBtn.disabled = selected.size === 0;
  buyBtn.textContent = selected.size === 0
    ? 'Selecione um número'
    : `Pagar ${fmtMoney(total)} com Mercado Pago`;
}

function showMsg(text, type) {
  formMsg.innerHTML = `<div class="msg ${type}">${text}</div>`;
}

document.getElementById('clear-btn').addEventListener('click', () => {
  selected.clear();
  renderGrid(raffleState.numbers);
  renderCart();
});

document.getElementById('custom-qty-btn').addEventListener('click', () => {
  const input = document.getElementById('custom-qty-input');
  const qty = parseInt(input.value, 10);
  if (!qty || qty < 1) {
    showMsg('Digite uma quantidade válida.', 'error');
    return;
  }
  selectRandomPack(qty);
  input.value = '';
});

buyBtn.addEventListener('click', async () => {
  const name = document.getElementById('name').value.trim();
  const phone = document.getElementById('phone').value.trim();
  const email = document.getElementById('email').value.trim();
  const cpf = document.getElementById('cpf').value.trim();

  if (!name || !phone) {
    showMsg('Preencha nome e telefone para continuar.', 'error');
    return;
  }

  buyBtn.disabled = true;
  buyBtn.textContent = 'Gerando pagamento…';

  try {
    const res = await fetch('/api/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ numbers: [...selected], name, phone, email, cpf })
    });
    const data = await res.json();

    if (!res.ok) {
      showMsg(data.error || 'Não foi possível concluir o pedido.', 'error');
      await loadRaffle();
      buyBtn.disabled = false;
      return;
    }

    window.location.href = data.init_point;
  } catch (err) {
    showMsg('Erro de conexão. Tente novamente.', 'error');
    buyBtn.disabled = false;
  }
});

loadRaffle();
setInterval(loadRaffle, 15000);

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

  document.getElementById('count-available').textContent = data.counts.available || 0;
  document.getElementById('count-reserved').textContent = data.counts.reserved || 0;
  document.getElementById('count-sold').textContent = data.counts.sold || 0;

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
  packEl.innerHTML = sorted.map(t =>
    `<button type="button" class="pack-chip" data-qty="${t.qty}">${t.qty} números por ${fmtMoney(t.price)}</button>`
  ).join('');
  packEl.querySelectorAll('.pack-chip').forEach(btn => {
    btn.addEventListener('click', () => selectRandomPack(Number(btn.dataset.qty)));
  });
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

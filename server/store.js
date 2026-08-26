const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_FILE = path.join(__dirname, '..', 'data', 'sorteio.json');

function defaultData() {
  return {
    raffle: {
      id: 1,
      title: 'Meu Sorteio',
      description: 'Compre seus números e concorra ao prêmio!',
      total_numbers: 100,
      digits: 2,
      price: 10,
      draw_date: null,
      status: 'open',
      image_url: null,
      logo_url: null,
      org_name: '',
      pricing_tiers: []
    },
    numbers: Array.from({ length: 100 }, (_, i) => ({
      number: i, status: 'available', buyer_id: null, order_id: null, reserved_until: null
    })),
    buyers: [],
    orders: []
  };
}

function load() {
  if (!fs.existsSync(DATA_FILE)) {
    const initial = defaultData();
    fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
    fs.writeFileSync(DATA_FILE, JSON.stringify(initial, null, 2));
    return initial;
  }
  return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
}

function save(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// Toda operação abaixo faz load -> altera -> save, de forma síncrona.
// Como Node roda em thread única e não há "await" no meio dessas funções,
// isso é seguro mesmo com vários pedidos simultâneos.

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

function getRaffle() {
  return load().raffle;
}

function getNumbers() {
  return load().numbers.map(n => ({ number: n.number, status: n.status }));
}

function getCounts() {
  const numbers = load().numbers;
  return numbers.reduce(
    (acc, n) => { acc[n.status] = (acc[n.status] || 0) + 1; return acc; },
    { available: 0, reserved: 0, sold: 0 }
  );
}

function regenerateNumbers(totalNumbers) {
  const data = load();
  data.numbers = Array.from({ length: totalNumbers }, (_, i) => ({
    number: i, status: 'available', buyer_id: null, order_id: null, reserved_until: null
  }));
  save(data);
}

function updateRaffle(patch) {
  const data = load();
  const willChangeCount = patch.total_numbers !== undefined &&
    Number(patch.total_numbers) !== data.raffle.total_numbers;

  if (willChangeCount) {
    const compromised = data.numbers.some(n => n.status !== 'available');
    if (compromised) {
      return { error: 'Não é possível mudar a quantidade de números: já existem números reservados ou vendidos. Use "Resetar sorteio" primeiro.' };
    }
  }

  for (const key of ['title', 'description', 'price', 'draw_date', 'digits', 'total_numbers', 'status', 'org_name']) {
    if (patch[key] !== undefined && patch[key] !== null && patch[key] !== '') {
      data.raffle[key] = patch[key];
    } else if (patch[key] === null && key === 'draw_date') {
      data.raffle[key] = null;
    } else if (patch[key] === '' && key === 'org_name') {
      data.raffle[key] = '';
    }
  }
  if (Array.isArray(patch.pricing_tiers)) {
    data.raffle.pricing_tiers = patch.pricing_tiers
      .filter(t => Number(t.qty) > 1 && Number(t.price) > 0)
      .map(t => ({ qty: Number(t.qty), price: Number(t.price) }));
  }
  save(data);

  if (willChangeCount) {
    regenerateNumbers(Number(patch.total_numbers));
  }
  return { raffle: load().raffle };
}

function releaseExpiredReservations() {
  const data = load();
  const now = Date.now();
  let changed = false;
  for (const n of data.numbers) {
    if (n.status === 'reserved' && n.reserved_until && n.reserved_until < now) {
      const order = data.orders.find(o => o.id === n.order_id);
      if (order && order.status === 'pending') order.status = 'expired';
      n.status = 'available';
      n.buyer_id = null;
      n.order_id = null;
      n.reserved_until = null;
      changed = true;
    }
  }
  if (changed) save(data);
}

function createBuyer({ name, email, phone, cpf }) {
  const data = load();
  const id = data.buyers.length ? Math.max(...data.buyers.map(b => b.id)) + 1 : 1;
  data.buyers.push({ id, name, email: email || null, phone, cpf: cpf || null });
  save(data);
  return id;
}

// Reserva números de forma atômica: retorna { ok: true } ou { ok: false, indisponiveis }
function reserveNumbers({ numbers, buyerId, orderId, reservedUntil, raffle }) {
  const data = load();
  const map = new Map(data.numbers.map(n => [n.number, n]));

  const invalid = numbers.filter(n => !map.has(n));
  if (invalid.length > 0) return { ok: false, error: 'invalid' };

  const indisponiveis = numbers.filter(n => map.get(n).status !== 'available');
  if (indisponiveis.length > 0) return { ok: false, error: 'unavailable', indisponiveis };

  for (const n of numbers) {
    const row = map.get(n);
    row.status = 'reserved';
    row.buyer_id = buyerId;
    row.order_id = orderId;
    row.reserved_until = reservedUntil;
  }

  const amount = computeAmount(numbers.length, raffle);
  data.orders.push({
    id: orderId,
    raffle_id: raffle.id,
    buyer_id: buyerId,
    numbers,
    amount,
    mp_preference_id: null,
    mp_payment_id: null,
    status: 'pending',
    created_at: Date.now()
  });

  save(data);
  return { ok: true, amount };
}

function setOrderPreference(orderId, preferenceId) {
  const data = load();
  const order = data.orders.find(o => o.id === orderId);
  if (order) order.mp_preference_id = preferenceId;
  save(data);
}

function getOrder(orderId) {
  return load().orders.find(o => o.id === orderId) || null;
}

function approveOrder(orderId, mpPaymentId) {
  const data = load();
  const order = data.orders.find(o => o.id === orderId);
  if (!order) return;
  order.status = 'approved';
  order.mp_payment_id = String(mpPaymentId);
  for (const n of order.numbers) {
    const row = data.numbers.find(x => x.number === n);
    if (row && row.order_id === orderId) {
      row.status = 'sold';
      row.reserved_until = null;
    }
  }
  save(data);
}

function failOrder(orderId, status) {
  const data = load();
  const order = data.orders.find(o => o.id === orderId);
  if (!order) return;
  order.status = status;
  for (const n of order.numbers) {
    const row = data.numbers.find(x => x.number === n);
    if (row && row.order_id === orderId) {
      row.status = 'available';
      row.buyer_id = null;
      row.order_id = null;
      row.reserved_until = null;
    }
  }
  save(data);
}

function getSummary() {
  const data = load();
  const counts = data.numbers.reduce(
    (acc, n) => { acc[n.status] = (acc[n.status] || 0) + 1; return acc; },
    { available: 0, reserved: 0, sold: 0 }
  );
  const orders = [...data.orders]
    .sort((a, b) => b.created_at - a.created_at)
    .map(o => {
      const buyer = data.buyers.find(b => b.id === o.buyer_id) || {};
      return { ...o, name: buyer.name, email: buyer.email, phone: buyer.phone, cpf: buyer.cpf };
    });
  const revenue = orders.filter(o => o.status === 'approved').reduce((sum, o) => sum + o.amount, 0);
  return { raffle: data.raffle, counts, revenue, orders };
}

function resetRaffle() {
  const data = load();
  regenerateNumbers(data.raffle.total_numbers);
  const fresh = load();
  fresh.buyers = [];
  fresh.orders = [];
  save(fresh);
}

function drawWinner() {
  const data = load();
  const sold = data.numbers.filter(n => n.status === 'sold');
  if (sold.length === 0) return null;
  const idx = crypto.randomInt(0, sold.length);
  const winnerRow = sold[idx];
  const buyer = data.buyers.find(b => b.id === winnerRow.buyer_id) || {};
  return {
    winner: { number: winnerRow.number, name: buyer.name, email: buyer.email, phone: buyer.phone },
    totalVendidos: sold.length
  };
}

function setRaffleImage(imageUrl) {
  const data = load();
  data.raffle.image_url = imageUrl;
  save(data);
}

function setLogoImage(imageUrl) {
  const data = load();
  data.raffle.logo_url = imageUrl;
  save(data);
}

function onlyDigits(str) {
  return (str || '').replace(/\D/g, '');
}

function findOrdersByContact(contact) {
  const data = load();
  const contactDigits = onlyDigits(contact);
  const contactLower = (contact || '').trim().toLowerCase();

  const matchingBuyerIds = data.buyers
    .filter(b =>
      (contactDigits && onlyDigits(b.phone) === contactDigits) ||
      (contactLower && b.email && b.email.toLowerCase() === contactLower)
    )
    .map(b => b.id);

  return data.orders
    .filter(o => matchingBuyerIds.includes(o.buyer_id) && o.status !== 'expired')
    .sort((a, b) => b.created_at - a.created_at)
    .map(o => ({ id: o.id, numbers: o.numbers, status: o.status, amount: o.amount, created_at: o.created_at }));
}

module.exports = {
  getRaffle, getNumbers, getCounts, regenerateNumbers, updateRaffle,
  releaseExpiredReservations, createBuyer, reserveNumbers, setOrderPreference,
  getOrder, approveOrder, failOrder, getSummary, resetRaffle, drawWinner,
  setRaffleImage, setLogoImage, findOrdersByContact, computeAmount
};

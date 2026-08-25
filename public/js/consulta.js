const statusLabels = {
  approved: 'Pago',
  pending: 'Aguardando pagamento',
  rejected: 'Recusado',
  cancelled: 'Cancelado',
  expired: 'Expirado'
};

async function search() {
  const contact = document.getElementById('contact').value.trim();
  const msgEl = document.getElementById('search-msg');
  const resultsEl = document.getElementById('results');
  resultsEl.innerHTML = '';

  if (!contact) {
    msgEl.innerHTML = '<div class="msg error">Digite seu telefone ou e-mail.</div>';
    return;
  }
  msgEl.innerHTML = '';

  try {
    const res = await fetch('/api/my-numbers?contato=' + encodeURIComponent(contact));
    const data = await res.json();

    if (!res.ok) {
      msgEl.innerHTML = `<div class="msg error">${data.error}</div>`;
      return;
    }

    if (data.orders.length === 0) {
      msgEl.innerHTML = '<div class="msg error">Nenhum pedido encontrado com esse contato.</div>';
      return;
    }

    resultsEl.innerHTML = data.orders.map(o => `
      <div class="panel" style="margin-bottom:16px">
        <h2 style="display:flex;justify-content:space-between;align-items:center;font-size:16px">
          <span>Pedido</span>
          <span class="pill ${o.status}">${statusLabels[o.status] || o.status}</span>
        </h2>
        <div class="cart-list">
          ${o.numbers.map(n => `<span class="cart-chip">${String(n).padStart(data.digits, '0')}</span>`).join('')}
        </div>
        <div class="total-row">
          <span class="label">Valor</span>
          <span class="value" style="font-size:18px">${(o.amount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
        </div>
      </div>
    `).join('');
  } catch (err) {
    msgEl.innerHTML = '<div class="msg error">Erro ao consultar. Tente novamente.</div>';
  }
}

document.getElementById('search-btn').addEventListener('click', search);
document.getElementById('contact').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') search();
});

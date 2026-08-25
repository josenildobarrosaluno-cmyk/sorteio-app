const { MercadoPagoConfig, Preference, Payment } = require('mercadopago');

function getClient() {
  if (!process.env.MP_ACCESS_TOKEN) {
    throw new Error('MP_ACCESS_TOKEN não configurado no .env');
  }
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
}

async function createPreference({ order, raffle, amount }) {
  const client = getClient();
  const preference = new Preference(client);
  const appUrl = process.env.APP_URL || 'http://localhost:3000';

  const body = {
    items: [
      {
        id: order.id,
        title: `${order.numbers.length} número(s) - ${raffle.title}`,
        description: `Números: ${order.numbers.map(n => String(n).padStart(raffle.digits, '0')).join(', ')}`,
        quantity: 1,
        unit_price: Number(amount),
        currency_id: 'BRL'
      }
    ],
    external_reference: order.id,
    back_urls: {
      success: `${appUrl}/sucesso.html?order=${order.id}`,
      failure: `${appUrl}/index.html?falha=1`,
      pending: `${appUrl}/index.html?pendente=1`
    },
    auto_return: 'approved',
    notification_url: `${appUrl}/api/webhook/mercadopago`
  };

  const result = await preference.create({ body });
  return result; // contém .id e .init_point
}

async function getPayment(paymentId) {
  const client = getClient();
  const payment = new Payment(client);
  return payment.get({ id: paymentId });
}

module.exports = { createPreference, getPayment };

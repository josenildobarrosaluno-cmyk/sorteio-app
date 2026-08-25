require('dotenv').config();
const path = require('path');
const fs = require('fs');
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { v4: uuidv4 } = require('uuid');

const store = require('./store');
const mp = require('./mercadopago');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

const UPLOADS_DIR = path.join(__dirname, '..', 'public', 'uploads');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, file, cb) => cb(null, UPLOADS_DIR),
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname) || '.jpg';
      cb(null, `premio-${Date.now()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (/^image\//.test(file.mimetype)) cb(null, true);
    else cb(new Error('Envie apenas arquivos de imagem'));
  }
});

const RESERVATION_MINUTES = 15;

// Libera reservas expiradas a cada minuto
setInterval(store.releaseExpiredReservations, 60 * 1000);

function requireAdmin(req, res, next) {
  const key = req.header('x-admin-key');
  if (!process.env.ADMIN_KEY) {
    return res.status(500).json({ error: 'ADMIN_KEY não configurada no servidor' });
  }
  if (!key || key !== process.env.ADMIN_KEY) {
    return res.status(401).json({ error: 'Não autorizado' });
  }
  next();
}

// ---------- Rotas públicas ----------

app.get('/api/raffle', (req, res) => {
  store.releaseExpiredReservations();
  res.json({
    raffle: store.getRaffle(),
    numbers: store.getNumbers(),
    counts: store.getCounts()
  });
});

app.post('/api/orders', async (req, res) => {
  try {
    store.releaseExpiredReservations();
    const { numbers, name, email, phone, cpf } = req.body;

    if (!Array.isArray(numbers) || numbers.length === 0) {
      return res.status(400).json({ error: 'Selecione ao menos um número' });
    }
    if (!name || !phone) {
      return res.status(400).json({ error: 'Nome e telefone são obrigatórios' });
    }

    const raffle = store.getRaffle();
    if (raffle.status !== 'open') {
      return res.status(409).json({ error: 'Este sorteio não está mais aceitando compras' });
    }

    const buyerId = store.createBuyer({ name, email, phone, cpf });
    const orderId = uuidv4();
    const reservedUntil = Date.now() + RESERVATION_MINUTES * 60 * 1000;

    const result = store.reserveNumbers({
      numbers: numbers.map(Number),
      buyerId,
      orderId,
      reservedUntil,
      raffle
    });

    if (!result.ok) {
      if (result.error === 'invalid') {
        return res.status(400).json({ error: 'Algum número selecionado não existe' });
      }
      return res.status(409).json({
        error: 'Alguns números acabaram de ser reservados por outra pessoa',
        numeros: result.indisponiveis
      });
    }

    const preference = await mp.createPreference({
      order: { id: orderId, numbers },
      raffle,
      amount: result.amount
    });

    store.setOrderPreference(orderId, preference.id);

    res.json({ order_id: orderId, init_point: preference.init_point });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Erro ao criar pedido' });
  }
});

app.get('/api/orders/:id', (req, res) => {
  const order = store.getOrder(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  res.json(order);
});

app.get('/api/my-numbers', (req, res) => {
  const contact = (req.query.contato || '').trim();
  if (!contact) return res.status(400).json({ error: 'Informe telefone ou e-mail' });
  store.releaseExpiredReservations();
  const orders = store.findOrdersByContact(contact);
  const raffle = store.getRaffle();
  res.json({ orders, digits: raffle.digits });
});

// Webhook do Mercado Pago
app.post('/api/webhook/mercadopago', async (req, res) => {
  try {
    const paymentId = req.query['data.id'] || req.body?.data?.id || req.query.id;
    const type = req.query.type || req.body?.type;

    if (type && type !== 'payment') return res.sendStatus(200);
    if (!paymentId) return res.sendStatus(200);

    const payment = await mp.getPayment(paymentId);
    const orderId = payment.external_reference;
    const order = store.getOrder(orderId);
    if (!order) return res.sendStatus(200);

    if (payment.status === 'approved') {
      store.approveOrder(orderId, payment.id);
    } else if (['rejected', 'cancelled'].includes(payment.status)) {
      store.failOrder(orderId, payment.status);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error('Erro no webhook:', err);
    res.sendStatus(200); // sempre 200 para o MP não ficar reenviando indefinidamente
  }
});

// ---------- Rotas admin ----------

app.post('/api/admin/login', (req, res) => {
  const { key } = req.body;
  if (key && process.env.ADMIN_KEY && key === process.env.ADMIN_KEY) {
    return res.json({ ok: true });
  }
  res.status(401).json({ ok: false });
});

app.get('/api/admin/summary', requireAdmin, (req, res) => {
  res.json(store.getSummary());
});

app.put('/api/admin/raffle', requireAdmin, (req, res) => {
  const { title, description, price, draw_date, digits, total_numbers, status, pricing_tiers } = req.body;
  const result = store.updateRaffle({ title, description, price, draw_date, digits, total_numbers, status, pricing_tiers });
  if (result.error) return res.status(409).json({ error: result.error });
  res.json({ ok: true, raffle: result.raffle });
});

app.post('/api/admin/reset', requireAdmin, (req, res) => {
  store.resetRaffle();
  res.json({ ok: true });
});

app.post('/api/admin/raffle/image', requireAdmin, (req, res) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });
    const imageUrl = '/uploads/' + req.file.filename;
    store.setRaffleImage(imageUrl);
    res.json({ ok: true, image_url: imageUrl });
  });
});

app.post('/api/admin/draw', requireAdmin, (req, res) => {
  const result = store.drawWinner();
  if (!result) {
    return res.status(409).json({ error: 'Ainda não há números vendidos para sortear' });
  }
  res.json(result);
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Servidor do sorteio rodando em http://localhost:${PORT}`);
  console.log(`Painel admin em http://localhost:${PORT}/admin.html`);
});

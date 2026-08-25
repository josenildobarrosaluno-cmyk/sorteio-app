# Sorteio App

Site completo para vender números de sorteio com pagamento automático pelo Mercado Pago (Checkout Pro), banco de dados próprio (SQLite) e painel administrativo para configurar o sorteio e sortear o vencedor.

## O que já vem pronto

- Página pública com grade de números, carrinho e checkout
- Reserva automática por 15 minutos (evita venda duplicada enquanto alguém paga)
- Integração com Mercado Pago: cria o link de pagamento e confirma via webhook
- Painel admin (senha própria): configurar título/preço/quantidade, descontos por pacote (ex: 5 por R$45), enviar uma foto do prêmio, ver pedidos e faturamento, sortear o número vencedor, resetar o sorteio
- Página de consulta (`consulta.html`): o comprador digita telefone ou e-mail e vê os números que comprou e o status de cada pedido
- Banco de dados simples em arquivo JSON (`data/sorteio.json`) — não precisa instalar nem compilar nada extra

## 1. Pré-requisitos

- Node.js 18 ou superior
- Uma conta no [Mercado Pago](https://www.mercadopago.com.br/developers) com um **Access Token** (em *Suas integrações* → crie uma aplicação → *Credenciais de produção* ou *de teste*)

## 2. Instalação local

```bash
cd sorteio-app
npm install
cp .env.example .env
```

Edite o `.env`:

```
MP_ACCESS_TOKEN=seu-token-aqui
ADMIN_KEY=escolha-uma-senha-forte
PORT=3000
APP_URL=http://localhost:3000
```

Rode:

```bash
npm start
```

- Site: http://localhost:3000
- Painel admin: http://localhost:3000/admin.html (use a senha definida em `ADMIN_KEY`)

## 3. Testando pagamentos localmente

O Mercado Pago precisa conseguir chamar o seu `notification_url` (webhook), então `localhost` sozinho não funciona para receber a confirmação. Use o [ngrok](https://ngrok.com/):

```bash
ngrok http 3000
```

Copie a URL gerada (ex: `https://abcd1234.ngrok-free.app`) e coloque em `APP_URL` no `.env`, depois reinicie o servidor. Use as [credenciais de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/your-integrations/test/cards) e os [usuários de teste](https://www.mercadopago.com.br/developers/pt/docs/checkout-pro/additional-content/your-integrations/test/accounts) do Mercado Pago para simular compras sem gastar dinheiro de verdade.

## 4. Colocar no ar (produção)

Qualquer serviço que rode Node.js com disco persistente funciona (o banco é um arquivo JSON em `data/sorteio.json`). Duas opções simples:

**Render / Railway** (mais fácil)
1. Suba este projeto para um repositório no GitHub
2. Crie um novo "Web Service" apontando para o repositório
3. Build command: `npm install` — Start command: `npm start`
4. Configure as variáveis de ambiente (`MP_ACCESS_TOKEN`, `ADMIN_KEY`, `APP_URL` com a URL final, `PORT` geralmente é definido automaticamente pela plataforma)
5. **Importante**: garanta que o disco onde fica a pasta `data/` (o arquivo `sorteio.json`) seja persistente (no Render, adicione um "Persistent Disk" montado em `/opt/render/project/src/data`, por exemplo), senão o sorteio zera a cada deploy.

**VPS próprio** (mais controle)
1. Instale Node.js, copie o projeto, rode `npm install --production`
2. Use um gerenciador de processo como `pm2` (`pm2 start server/server.js`)
3. Coloque um proxy reverso (Nginx/Caddy) com HTTPS na frente
4. Configure o `.env` com o domínio real em `APP_URL`

Depois de publicar, troque o Access Token de **teste** pelo de **produção** no `.env` quando quiser começar a receber pagamentos reais.

## 5. Como usar no dia a dia

1. Acesse `/admin.html`, entre com a senha
2. Configure título, descrição, preço por número, quantidade de números e data do sorteio
3. Compartilhe o link do site (`/index.html`) com os compradores
4. Acompanhe vendas e faturamento no painel
5. Quando quiser sortear, clique em "Sortear vencedor" — ele escolhe aleatoriamente entre os números **pagos**
6. Para começar um novo sorteio do zero, use "Resetar sorteio" (isso apaga pedidos e libera todos os números)

## Limitações a saber

- O banco é um arquivo JSON local — ótimo para um sorteio de porte pequeno/médio, mas se for hospedar em plataformas *serverless* (ex: Vercel) sem disco persistente, os dados somem a cada deploy. Prefira Render, Railway ou uma VPS.
- A senha do admin é simples (um único token comparado no servidor) — suficiente para uso pessoal, mas sirva o site sempre com HTTPS em produção.
- Só um sorteio "ativo" por vez neste modelo. Para rodar vários sorteios ao mesmo tempo, o banco precisaria evoluir para múltiplas linhas em `raffle` — dá pra pedir ajuda para expandir isso depois.

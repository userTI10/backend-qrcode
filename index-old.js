// backend/server.js
const express = require('express');
const cors = require('cors');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Banco de dados em memória (em produção, use um banco real)
const urlDatabase = new Map();

// Gerar ID curto único
function generateShortId() {
  return Math.random().toString(36).substr(2, 8);
}

// API para criar um QR code dinâmico
app.post('/api/create-qr', (req, res) => {
  const { destinationUrl, customId } = req.body;
  
  if (!destinationUrl) {
    return res.status(400).json({ error: 'URL de destino é obrigatória' });
  }
  
  // Validar URL
  try {
    new URL(destinationUrl);
  } catch (error) {
    return res.status(400).json({ error: 'URL inválida' });
  }
  
  const shortId = customId || generateShortId();
  
  // Verificar se ID customizado já existe
  if (customId && urlDatabase.has(customId)) {
    return res.status(400).json({ error: 'ID personalizado já está em uso' });
  }
  
  const shortUrl = `http://localhost:${PORT}/r/${shortId}`;
  
  // Salvar no banco de dados
  urlDatabase.set(shortId, {
    destinationUrl,
    createdAt: new Date(),
    visits: 0,
    lastVisit: null
  });
  
  res.json({
    shortId,
    shortUrl,
    destinationUrl,
    visits: 0,
    createdAt: new Date(),
    qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shortUrl)}`
  });
});

// API para atualizar destino de um QR code existente
app.put('/api/update-qr/:id', (req, res) => {
  const { id } = req.params;
  const { destinationUrl } = req.body;
  
  if (!urlDatabase.has(id)) {
    return res.status(404).json({ error: 'QR Code não encontrado' });
  }
  
  if (!destinationUrl) {
    return res.status(400).json({ error: 'Nova URL de destino é obrigatória' });
  }
  
  // Validar URL
  try {
    new URL(destinationUrl);
  } catch (error) {
    return res.status(400).json({ error: 'URL inválida' });
  }
  
  const qrData = urlDatabase.get(id);
  qrData.destinationUrl = destinationUrl;
  qrData.updatedAt = new Date();
  
  urlDatabase.set(id, qrData);
  
  res.json({
    success: true,
    message: 'URL de destino atualizada com sucesso',
    id,
    destinationUrl,
    updatedAt: qrData.updatedAt
  });
});

// API para deletar um QR code
app.delete('/api/delete-qr/:id', (req, res) => {
  const { id } = req.params;
  
  if (!urlDatabase.has(id)) {
    return res.status(404).json({ error: 'QR Code não encontrado' });
  }
  
  const deleted = urlDatabase.delete(id);
  
  if (deleted) {
    res.json({
      success: true,
      message: 'QR Code removido com sucesso',
      id
    });
  } else {
    res.status(500).json({ error: 'Erro ao remover QR Code' });
  }
});

// API para obter informações de um QR code
app.get('/api/qr-info/:id', (req, res) => {
  const { id } = req.params;
  
  if (!urlDatabase.has(id)) {
    return res.status(404).json({ error: 'QR Code não encontrado' });
  }
  
  const qrData = urlDatabase.get(id);
  
  res.json({
    id,
    destinationUrl: qrData.destinationUrl,
    createdAt: qrData.createdAt,
    updatedAt: qrData.updatedAt,
    visits: qrData.visits,
    lastVisit: qrData.lastVisit,
    shortUrl: `http://localhost:${PORT}/r/${id}`
  });
});

// API para listar todos os QR codes
app.get('/api/qr-codes', (req, res) => {
  const qrCodes = [];
  
  urlDatabase.forEach((data, id) => {
    qrCodes.push({
      id,
      destinationUrl: data.destinationUrl,
      createdAt: data.createdAt,
      updatedAt: data.updatedAt,
      visits: data.visits,
      lastVisit: data.lastVisit,
      shortUrl: `http://localhost:${PORT}/r/${id}`
    });
  });
  
  // Ordenar por data de criação (mais recentes primeiro)
  qrCodes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  res.json(qrCodes);
});

// API para obter estatísticas
app.get('/api/stats', (req, res) => {
  const totalQRCodes = urlDatabase.size;
  let totalVisits = 0;
  
  urlDatabase.forEach(data => {
    totalVisits += data.visits;
  });
  
  res.json({
    totalQRCodes,
    totalVisits
  });
});

// Rota de redirecionamento (esta é a URL que estará no QR code)
app.get('/r/:id', (req, res) => {
  const { id } = req.params;
  
  if (!urlDatabase.has(id)) {
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Code não encontrado</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          h1 { color: #e74c3c; }
          p { color: #666; }
        </style>
      </head>
      <body>
        <h1>QR Code não encontrado</h1>
        <p>O QR Code que você está tentando acessar não existe ou foi removido.</p>
        <p><a href="/">Voltar à página inicial</a></p>
      </body>
      </html>
    `);
  }
  
  const qrData = urlDatabase.get(id);
  
  // Incrementar contador de visitas
  qrData.visits += 1;
  qrData.lastVisit = new Date();
  urlDatabase.set(id, qrData);
  
  console.log(`Redirecionando QR Code ${id} para: ${qrData.destinationUrl}`);
  console.log(`Total de visitas: ${qrData.visits}`);
  
  // Redirecionar para a URL de destino
  res.redirect(302, qrData.destinationUrl);
});

// Rota principal para testar
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Servidor de QR Codes Dinâmicos</title>
      <style>
        body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
        h1 { color: #2c3e50; }
        .api-list { background: #f8f9fa; padding: 20px; border-radius: 5px; margin: 20px 0; }
        code { background: #e9ecef; padding: 2px 5px; border-radius: 3px; }
      </style>
    </head>
    <body>
      <h1>Servidor de QR Codes Dinâmicos</h1>
      <p>Servidor está rodando corretamente!</p>
      <div class="api-list">
        <h3>Endpoints disponíveis:</h3>
        <ul>
          <li><code>POST /api/create-qr</code> - Criar novo QR code</li>
          <li><code>PUT /api/update-qr/:id</code> - Atualizar destino</li>
          <li><code>DELETE /api/delete-qr/:id</code> - Deletar QR code</li>
          <li><code>GET /api/qr-codes</code> - Listar todos QR codes</li>
          <li><code>GET /api/qr-info/:id</code> - Informações de um QR code</li>
          <li><code>GET /r/:id</code> - Redirecionamento (usado nos QR codes)</li>
        </ul>
      </div>
      <p>Total de QR codes armazenados: ${urlDatabase.size}</p>
    </body>
    </html>
  `);
});

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
  console.log(`Acesse: http://localhost:${PORT}`);
  console.log(`API disponível em: http://localhost:${PORT}/api`);
  console.log(`Exemplo de redirecionamento: http://localhost:${PORT}/r/exemplo`);
});
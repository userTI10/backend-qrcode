// backend/server.js - VERSÃO COM JSON PERSISTENTE
const express = require('express');
const cors = require('cors');
const fs = require('fs').promises;
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuração da URL base
const BASE_URL = 'https://backend-qrcode-yiuy.onrender.com';

console.log(`🌐 URL base configurada: ${BASE_URL}`);
console.log(`🚀 Ambiente: ${process.env.NODE_ENV || 'development'}`);

// Caminho do arquivo JSON
const DATA_FILE = process.env.NODE_ENV === 'production' 
  ? path.join(__dirname, 'data', 'qrcodes.json')
  : path.join(__dirname, 'qrcodes.json');

// Garantir que o diretório existe
async function ensureDataDirectory() {
  if (process.env.NODE_ENV === 'production') {
    const dataDir = path.join(__dirname, 'data');
    try {
      await fs.access(dataDir);
    } catch {
      await fs.mkdir(dataDir, { recursive: true });
      console.log('📁 Diretório data criado');
    }
  }
}

// Banco de dados em JSON
let qrCodesDB = {};

// Carregar dados do arquivo JSON
async function loadDatabase() {
  try {
    await ensureDataDirectory();
    const data = await fs.readFile(DATA_FILE, 'utf8');
    qrCodesDB = JSON.parse(data);
    console.log(`✅ Banco de dados carregado: ${Object.keys(qrCodesDB).length} QR codes`);
  } catch (error) {
    if (error.code === 'ENOENT') {
      // Arquivo não existe, criar vazio
      qrCodesDB = {};
      await saveDatabase();
      console.log('📄 Arquivo JSON criado (vazio)');
    } else {
      console.error('❌ Erro ao carregar banco de dados:', error.message);
      qrCodesDB = {};
    }
  }
}

// Salvar dados no arquivo JSON
async function saveDatabase() {
  try {
    await ensureDataDirectory();
    await fs.writeFile(DATA_FILE, JSON.stringify(qrCodesDB, null, 2), 'utf8');
    console.log(`💾 Banco de dados salvo: ${Object.keys(qrCodesDB).length} QR codes`);
  } catch (error) {
    console.error('❌ Erro ao salvar banco de dados:', error.message);
  }
}

// Inicializar o banco de dados
loadDatabase();

// Gerar ID curto único
function generateShortId() {
  return Math.random().toString(36).substr(2, 8);
}

// Helper para simular comportamento assíncrono do banco
const dbOperation = async (operation) => {
  try {
    const result = await operation();
    await saveDatabase(); // Salva após cada operação
    return result;
  } catch (error) {
    throw error;
  }
};

// API para criar um QR code dinâmico
app.post('/api/create-qr', async (req, res) => {
  const { destinationUrl, customId } = req.body;
  
  console.log(`📝 Criando QR code para: ${destinationUrl}, ID custom: ${customId || 'auto'}`);
  
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
  
  try {
    // Verificar se ID customizado já existe
    if (customId && qrCodesDB[customId]) {
      return res.status(400).json({ error: 'ID personalizado já está em uso' });
    }
    
    // Usar a URL base configurada
    const shortUrl = `${BASE_URL}/r/${shortId}`;
    const now = new Date().toISOString();
    
    console.log(`🔗 Short URL: ${shortUrl}`);
    
    // Salvar no banco de dados
    await dbOperation(async () => {
      qrCodesDB[shortId] = {
        id: shortId,
        destination_url: destinationUrl,
        short_url: shortUrl,
        visits: 0,
        last_visit: null,
        created_at: now,
        updated_at: now
      };
    });
    
    console.log(`✅ QR Code criado: ${shortId}`);
    
    res.json({
      shortId,
      shortUrl,
      destinationUrl,
      visits: 0,
      createdAt: now,
      qrCodeUrl: `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(shortUrl)}`
    });
    
  } catch (error) {
    console.error('❌ Erro ao criar QR code:', error.message);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// API para atualizar destino de um QR code existente
app.put('/api/update-qr/:id', async (req, res) => {
  const { id } = req.params;
  const { destinationUrl } = req.body;
  
  console.log(`🔄 Atualizando QR code ${id} para: ${destinationUrl}`);
  
  if (!destinationUrl) {
    return res.status(400).json({ error: 'Nova URL de destino é obrigatória' });
  }
  
  // Validar URL
  try {
    new URL(destinationUrl);
  } catch (error) {
    return res.status(400).json({ error: 'URL inválida' });
  }
  
  try {
    // Verificar se QR code existe
    if (!qrCodesDB[id]) {
      return res.status(404).json({ error: 'QR Code não encontrado' });
    }
    
    const updatedAt = new Date().toISOString();
    
    // Atualizar no banco de dados
    await dbOperation(async () => {
      qrCodesDB[id] = {
        ...qrCodesDB[id],
        destination_url: destinationUrl,
        updated_at: updatedAt
      };
    });
    
    console.log(`✅ QR Code atualizado: ${id}`);
    
    res.json({
      success: true,
      message: 'URL de destino atualizada com sucesso',
      id,
      destinationUrl,
      updatedAt
    });
    
  } catch (error) {
    console.error('❌ Erro ao atualizar QR code:', error.message);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// API para deletar um QR code
app.delete('/api/delete-qr/:id', async (req, res) => {
  const { id } = req.params;
  
  console.log(`🗑️  Deletando QR code: ${id}`);
  
  try {
    // Verificar se QR code existe
    if (!qrCodesDB[id]) {
      return res.status(404).json({ error: 'QR Code não encontrado' });
    }
    
    // Deletar do banco de dados
    await dbOperation(async () => {
      delete qrCodesDB[id];
    });
    
    console.log(`✅ QR Code deletado: ${id}`);
    
    res.json({
      success: true,
      message: 'QR Code removido com sucesso',
      id
    });
    
  } catch (error) {
    console.error('❌ Erro ao deletar QR code:', error.message);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// API para obter informações de um QR code
app.get('/api/qr-info/:id', async (req, res) => {
  const { id } = req.params;
  
  console.log(`🔍 Buscando informações do QR code: ${id}`);
  
  if (!qrCodesDB[id]) {
    return res.status(404).json({ error: 'QR Code não encontrado' });
  }
  
  const qrData = qrCodesDB[id];
  
  res.json({
    id: qrData.id,
    destinationUrl: qrData.destination_url,
    shortUrl: qrData.short_url,
    visits: qrData.visits,
    lastVisit: qrData.last_visit,
    createdAt: qrData.created_at,
    updatedAt: qrData.updated_at
  });
});

// API para listar todos os QR codes
app.get('/api/qr-codes', async (req, res) => {
  console.log('📋 Listando todos QR codes');
  
  const qrCodes = Object.values(qrCodesDB).map(qr => ({
    id: qr.id,
    destinationUrl: qr.destination_url,
    shortUrl: qr.short_url,
    visits: qr.visits,
    lastVisit: qr.last_visit,
    createdAt: qr.created_at,
    updatedAt: qr.updated_at
  }));
  
  // Ordenar por data de criação (mais recentes primeiro)
  qrCodes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  console.log(`✅ Retornando ${qrCodes.length} QR codes`);
  
  res.json(qrCodes);
});

// API para obter estatísticas
app.get('/api/stats', async (req, res) => {
  console.log('📊 Obtendo estatísticas');
  
  const qrCodes = Object.values(qrCodesDB);
  const totalQRCodes = qrCodes.length;
  const totalVisits = qrCodes.reduce((sum, qr) => sum + (qr.visits || 0), 0);
  const avgVisits = totalQRCodes > 0 ? totalVisits / totalQRCodes : 0;
  const maxVisits = Math.max(...qrCodes.map(qr => qr.visits || 0), 0);
  
  // Popular QR codes (ordenados por visitas)
  const popular = qrCodes
    .filter(qr => qr.visits > 0)
    .sort((a, b) => b.visits - a.visits)
    .slice(0, 5)
    .map(qr => ({
      id: qr.id,
      destination_url: qr.destination_url,
      visits: qr.visits
    }));
  
  res.json({
    totalQRCodes,
    totalVisits,
    avgVisits: Math.round(avgVisits * 100) / 100,
    maxVisits,
    mostRecent: qrCodes.length > 0 
      ? qrCodes.sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0].created_at 
      : null,
    popularQRCodes: popular
  });
});

// API para buscar QR codes
app.get('/api/search', async (req, res) => {
  const { query } = req.query;
  
  console.log(`🔎 Buscando QR codes por: "${query}"`);
  
  if (!query) {
    return res.status(400).json({ error: 'Termo de busca é obrigatório' });
  }
  
  const searchTerm = query.toLowerCase();
  const qrCodes = Object.values(qrCodesDB)
    .filter(qr => 
      qr.id.toLowerCase().includes(searchTerm) || 
      qr.destination_url.toLowerCase().includes(searchTerm)
    )
    .map(qr => ({
      id: qr.id,
      destinationUrl: qr.destination_url,
      shortUrl: qr.short_url,
      visits: qr.visits,
      lastVisit: qr.last_visit,
      createdAt: qr.created_at,
      updatedAt: qr.updated_at
    }));
  
  // Ordenar por data de criação (mais recentes primeiro)
  qrCodes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  
  console.log(`✅ Busca retornou ${qrCodes.length} resultados`);
  
  res.json(qrCodes);
});

// Rota de redirecionamento (esta é a URL que estará no QR code)
app.get('/r/:id', async (req, res) => {
  const { id } = req.params;
  
  console.log(`🔗 Redirecionamento solicitado para QR code: ${id}`);
  
  if (!qrCodesDB[id]) {
    console.log(`❌ QR Code não encontrado: ${id}`);
    return res.status(404).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>QR Code não encontrado</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          h1 { color: #e74c3c; }
          p { color: #666; }
          a { color: #3498db; text-decoration: none; }
          a:hover { text-decoration: underline; }
        </style>
      </head>
      <body>
        <h1>QR Code não encontrado</h1>
        <p>O QR Code que você está tentando acessar não existe ou foi removido.</p>
        <p>ID: <strong>${id}</strong></p>
        <p><a href="${BASE_URL}">Voltar à página inicial</a></p>
      </body>
      </html>
    `);
  }
  
  const qrData = qrCodesDB[id];
  
  try {
    // Incrementar contador de visitas e atualizar última visita
    const now = new Date().toISOString();
    const newVisits = (qrData.visits || 0) + 1;
    
    await dbOperation(async () => {
      qrCodesDB[id] = {
        ...qrData,
        visits: newVisits,
        last_visit: now
      };
    });
    
    console.log(`✅ Redirecionando QR Code ${id} para: ${qrData.destination_url} (visitas: ${newVisits})`);
    
    // Redirecionar para a URL de destino
    res.redirect(302, qrData.destination_url);
    
  } catch (error) {
    console.error('❌ Erro no redirecionamento:', error.message);
    res.redirect(302, qrData.destination_url); // Redireciona mesmo com erro no contador
  }
});

// Rota de health check aprimorada
app.get('/api/health', async (req, res) => {
  try {
    // Verificar se o arquivo JSON está acessível
    await fs.access(DATA_FILE);
    const stats = await fs.stat(DATA_FILE);
    
    res.json({
      status: 'healthy',
      baseUrl: BASE_URL,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        type: 'JSON file',
        path: DATA_FILE,
        size: `${Math.round(stats.size / 1024)} KB`,
        qrCodes: Object.keys(qrCodesDB).length,
        lastSave: new Date().toISOString()
      },
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: 'Database file not accessible',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Rota para backup dos dados
app.get('/api/backup', async (req, res) => {
  try {
    const backupData = {
      timestamp: new Date().toISOString(),
      totalQRCodes: Object.keys(qrCodesDB).length,
      totalVisits: Object.values(qrCodesDB).reduce((sum, qr) => sum + (qr.visits || 0), 0),
      qrCodes: qrCodesDB
    };
    
    res.json(backupData);
  } catch (error) {
    res.status(500).json({ error: 'Erro ao criar backup' });
  }
});

// Rota principal para testar
app.get('/', async (req, res) => {
  const total = Object.keys(qrCodesDB).length;
  const visits = Object.values(qrCodesDB).reduce((sum, qr) => sum + (qr.visits || 0), 0);
  
  res.send(`
    <!DOCTYPE html>
    <html>
    <head>
      <title>Servidor de QR Codes Dinâmicos</title>
      <style>
        body { 
          font-family: Arial, sans-serif; 
          max-width: 800px; 
          margin: 0 auto; 
          padding: 20px;
          background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
          min-height: 100vh;
        }
        h1 { 
          color: #2c3e50; 
          text-align: center;
          margin-bottom: 10px;
        }
        .subtitle {
          text-align: center;
          color: #7f8c8d;
          margin-bottom: 30px;
        }
        .stats {
          background: white;
          padding: 20px;
          border-radius: 10px;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
          margin-bottom: 30px;
        }
        .api-list { 
          background: white;
          padding: 25px;
          border-radius: 10px; 
          margin: 20px 0;
          box-shadow: 0 4px 6px rgba(0,0,0,0.1);
        }
        code { 
          background: #e9ecef; 
          padding: 3px 6px; 
          border-radius: 4px;
          font-family: 'Courier New', monospace;
        }
        ul {
          line-height: 1.8;
        }
        li {
          margin-bottom: 10px;
        }
        .database-info {
          background: #2c3e50;
          color: white;
          padding: 15px;
          border-radius: 10px;
          margin-top: 20px;
        }
        .btn {
          display: inline-block;
          background: #3498db;
          color: white;
          padding: 10px 20px;
          border-radius: 5px;
          text-decoration: none;
          margin-top: 10px;
          margin-right: 10px;
        }
        .btn:hover {
          background: #2980b9;
        }
        .status-badge {
          display: inline-block;
          background: #2ecc71;
          color: white;
          padding: 5px 10px;
          border-radius: 5px;
          font-size: 0.9em;
          margin-left: 10px;
        }
        .json-badge {
          background: #f59e0b;
        }
        .warning {
          background: #fef3c7;
          border-left: 4px solid #f59e0b;
          padding: 15px;
          border-radius: 4px;
          margin: 20px 0;
          color: #92400e;
        }
      </style>
    </head>
    <body>
      <h1>📱 Servidor de QR Codes Dinâmicos</h1>
      <p class="subtitle">Render.com + JSON Database <span class="status-badge json-badge">Persistente via Git</span></p>
      
      <div class="warning">
        <strong>⚠️ Importante:</strong> Os dados são persistidos em arquivo JSON versionado no Git.
        Faça commit regularmente para não perder informações.
      </div>
      
      <div class="stats">
        <h3>📊 Estatísticas do Sistema:</h3>
        <p><strong>Total de QR Codes:</strong> ${total}</p>
        <p><strong>Total de Visitantes:</strong> ${visits}</p>
        <p><strong>URL Base:</strong> ${BASE_URL}</p>
        <p><strong>Armazenamento:</strong> Arquivo JSON (qrcodes.json)</p>
        <div>
          <a href="${BASE_URL}/api/health" class="btn">🩺 Verificar Saúde</a>
          <a href="${BASE_URL}/api/qr-codes" class="btn">📋 Ver QR Codes</a>
          <a href="${BASE_URL}/api/backup" class="btn" target="_blank">💾 Backup</a>
        </div>
      </div>
      
      <div class="api-list">
        <h3>🔧 Endpoints da API:</h3>
        <ul>
          <li><code>POST /api/create-qr</code> - Criar novo QR code</li>
          <li><code>PUT /api/update-qr/:id</code> - Atualizar destino de um QR code</li>
          <li><code>DELETE /api/delete-qr/:id</code> - Deletar QR code</li>
          <li><code>GET /api/qr-codes</code> - Listar todos QR codes</li>
          <li><code>GET /api/qr-info/:id</code> - Informações de um QR code</li>
          <li><code>GET /api/stats</code> - Estatísticas do sistema</li>
          <li><code>GET /api/search?query=termo</code> - Buscar QR codes</li>
          <li><code>GET /api/backup</code> - Backup completo dos dados</li>
          <li><code>GET /r/:id</code> - Redirecionamento (usado nos QR codes)</li>
        </ul>
      </div>
      
      <div class="database-info">
        <h3>💾 Sistema de Persistência JSON</h3>
        <p>✅ Dados salvos em: <code>qrcodes.json</code></p>
        <p>✅ Versionado no Git (sobrevive a deploys)</p>
        <p>✅ Backup automático com cada commit</p>
        <p>✅ Leve e eficiente</p>
        <p>🔧 <strong>Para fazer backup:</strong> Commit no repositório Git</p>
      </div>
    </body>
    </html>
  `);
});

// Salvar dados periodicamente (a cada 30 segundos) como segurança
setInterval(async () => {
  try {
    await saveDatabase();
  } catch (error) {
    console.error('❌ Erro no salvamento periódico:', error.message);
  }
}, 30000);

// Salvar dados ao encerrar
process.on('SIGINT', async () => {
  console.log('🚪 Encerrando servidor...');
  try {
    await saveDatabase();
    console.log('✅ Dados salvos com sucesso');
  } catch (error) {
    console.error('❌ Erro ao salvar dados ao encerrar:', error.message);
  }
  process.exit(0);
});

// Tratamento de erros
process.on('uncaughtException', (error) => {
  console.error('❌ Erro não capturado:', error);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Promise rejeitada não tratada:', reason);
});

app.listen(PORT, () => {
  console.log(`\n🚀 Servidor iniciado com sucesso!`);
  console.log(`🌐 URL Base: ${BASE_URL}`);
  console.log(`🔧 API disponível em: ${BASE_URL}/api`);
  console.log(`📱 Redirecionamento: ${BASE_URL}/r/:id`);
  console.log(`💾 Banco de dados: ${DATA_FILE}`);
  console.log(`📄 Dados carregados: ${Object.keys(qrCodesDB).length} QR codes`);
  console.log(`⚡ Porta: ${PORT}`);
  console.log(`\n✅ Pronto para receber requisições!\n`);
});
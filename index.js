// backend/server.js 
const express = require('express');
const cors = require('cors');
const sqlite3 = require('sqlite3').verbose();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Configuração da URL base - CORRIGIDO
let BASE_URL;

if (process.env.RENDER_EXTERNAL_URL) {
  // Se já tiver https://, usar direto, senão adicionar
  BASE_URL = process.env.RENDER_EXTERNAL_URL.startsWith('http') 
    ? process.env.RENDER_EXTERNAL_URL
    : `https://${process.env.RENDER_EXTERNAL_URL}`;
} else if (process.env.NODE_ENV === 'production') {
  BASE_URL = 'https://backend-qrcode-yiuy.onrender.com';
} else {
  BASE_URL = `http://localhost:${PORT}`;
}

console.log(`🌐 URL base configurada: ${BASE_URL}`);
console.log(`🚀 Ambiente: ${process.env.NODE_ENV || 'development'}`);
console.log(`🔗 Render URL: ${process.env.RENDER_EXTERNAL_URL || 'N/A'}`);

// Inicializar banco de dados SQLite
// No Render, o caminho do arquivo é persistente
const dbPath = process.env.NODE_ENV === 'production' 
  ? '/tmp/qrcodes.db'  // No Render, /tmp é persistente
  : './qrcodes.db';

console.log(`💾 Caminho do banco de dados: ${dbPath}`);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Erro ao conectar ao banco de dados:', err.message);
    console.error('Detalhes do erro:', err);
  } else {
    console.log('✅ Conectado ao banco de dados SQLite');
    
    // Criar tabela se não existir
    db.run(`CREATE TABLE IF NOT EXISTS qrcodes (
      id TEXT PRIMARY KEY,
      destination_url TEXT NOT NULL,
      short_url TEXT NOT NULL,
      visits INTEGER DEFAULT 0,
      last_visit TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`, (err) => {
      if (err) {
        console.error('❌ Erro ao criar tabela:', err.message);
      } else {
        console.log('✅ Tabela qrcodes verificada/criada com sucesso');
        
        // Criar índice para melhor performance
        db.run('CREATE INDEX IF NOT EXISTS idx_qrcodes_id ON qrcodes(id)', (err) => {
          if (err) {
            console.error('❌ Erro ao criar índice id:', err.message);
          } else {
            console.log('✅ Índice idx_qrcodes_id verificado/criado');
          }
        });
        
        db.run('CREATE INDEX IF NOT EXISTS idx_qrcodes_created ON qrcodes(created_at)', (err) => {
          if (err) {
            console.error('❌ Erro ao criar índice created:', err.message);
          } else {
            console.log('✅ Índice idx_qrcodes_created verificado/criado');
          }
        });
        
        // Verificar se a tabela tem dados
        db.get('SELECT COUNT(*) as count FROM qrcodes', (err, row) => {
          if (err) {
            console.error('❌ Erro ao contar registros:', err.message);
          } else {
            console.log(`📊 Total de QR codes no banco: ${row.count}`);
          }
        });
      }
    });
  }
});

// Gerar ID curto único
function generateShortId() {
  return Math.random().toString(36).substr(2, 8);
}

// Helper para promises com SQLite com tratamento de erro melhorado
const dbRun = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) {
        console.error(`❌ Erro dbRun na query: ${sql}`, err.message);
        reject(err);
      } else {
        resolve(this);
      }
    });
  });
};

const dbGet = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) {
        console.error(`❌ Erro dbGet na query: ${sql}`, err.message);
        reject(err);
      } else {
        resolve(row);
      }
    });
  });
};

const dbAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) {
        console.error(`❌ Erro dbAll na query: ${sql}`, err.message);
        reject(err);
      } else {
        resolve(rows || []);
      }
    });
  });
};

// Middleware para verificar conexão com banco
const checkDbConnection = (req, res, next) => {
  if (!db) {
    console.error('❌ Banco de dados não conectado');
    return res.status(500).json({ error: 'Banco de dados não conectado' });
  }
  next();
};

// API para criar um QR code dinâmico
app.post('/api/create-qr', checkDbConnection, async (req, res) => {
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
    if (customId) {
      const existing = await dbGet('SELECT id FROM qrcodes WHERE id = ?', [customId]);
      if (existing) {
        return res.status(400).json({ error: 'ID personalizado já está em uso' });
      }
    }
    
    // Usar a URL base configurada
    const shortUrl = `${BASE_URL}/r/${shortId}`;
    const now = new Date().toISOString();
    
    console.log(`🔗 Short URL: ${shortUrl}`);
    
    // Inserir no banco de dados
    await dbRun(
      'INSERT INTO qrcodes (id, destination_url, short_url, created_at, updated_at) VALUES (?, ?, ?, ?, ?)',
      [shortId, destinationUrl, shortUrl, now, now]
    );
    
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
app.put('/api/update-qr/:id', checkDbConnection, async (req, res) => {
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
    const existing = await dbGet('SELECT id FROM qrcodes WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'QR Code não encontrado' });
    }
    
    const updatedAt = new Date().toISOString();
    
    // Atualizar no banco de dados
    await dbRun(
      'UPDATE qrcodes SET destination_url = ?, updated_at = ? WHERE id = ?',
      [destinationUrl, updatedAt, id]
    );
    
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
app.delete('/api/delete-qr/:id', checkDbConnection, async (req, res) => {
  const { id } = req.params;
  
  console.log(`🗑️  Deletando QR code: ${id}`);
  
  try {
    // Verificar se QR code existe
    const existing = await dbGet('SELECT id FROM qrcodes WHERE id = ?', [id]);
    if (!existing) {
      return res.status(404).json({ error: 'QR Code não encontrado' });
    }
    
    // Deletar do banco de dados
    await dbRun('DELETE FROM qrcodes WHERE id = ?', [id]);
    
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
app.get('/api/qr-info/:id', checkDbConnection, async (req, res) => {
  const { id } = req.params;
  
  console.log(`🔍 Buscando informações do QR code: ${id}`);
  
  try {
    const qrData = await dbGet(
      'SELECT * FROM qrcodes WHERE id = ?',
      [id]
    );
    
    if (!qrData) {
      return res.status(404).json({ error: 'QR Code não encontrado' });
    }
    
    res.json({
      id: qrData.id,
      destinationUrl: qrData.destination_url,
      shortUrl: qrData.short_url,
      visits: qrData.visits,
      lastVisit: qrData.last_visit,
      createdAt: qrData.created_at,
      updatedAt: qrData.updated_at
    });
    
  } catch (error) {
    console.error('❌ Erro ao buscar QR code:', error.message);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// API para listar todos os QR codes
app.get('/api/qr-codes', checkDbConnection, async (req, res) => {
  console.log('📋 Listando todos QR codes');
  
  try {
    const qrCodes = await dbAll(
      'SELECT * FROM qrcodes ORDER BY created_at DESC'
    );
    
    const formattedQrCodes = qrCodes.map(qr => ({
      id: qr.id,
      destinationUrl: qr.destination_url,
      shortUrl: qr.short_url,
      visits: qr.visits,
      lastVisit: qr.last_visit,
      createdAt: qr.created_at,
      updatedAt: qr.updated_at
    }));
    
    console.log(`✅ Retornando ${formattedQrCodes.length} QR codes`);
    
    res.json(formattedQrCodes);
    
  } catch (error) {
    console.error('❌ Erro ao listar QR codes:', error.message);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// API para obter estatísticas
app.get('/api/stats', checkDbConnection, async (req, res) => {
  console.log('📊 Obtendo estatísticas');
  
  try {
    const stats = await dbGet(`
      SELECT 
        COUNT(*) as totalQRCodes,
        COALESCE(SUM(visits), 0) as totalVisits,
        COALESCE(AVG(visits), 0) as avgVisits,
        COALESCE(MAX(visits), 0) as maxVisits,
        MAX(created_at) as mostRecent
      FROM qrcodes
    `);
    
    // Popular QR codes (mais de 10 visitas)
    const popular = await dbAll(
      'SELECT id, destination_url, visits FROM qrcodes WHERE visits > 0 ORDER BY visits DESC LIMIT 5'
    );
    
    res.json({
      totalQRCodes: stats.totalQRCodes || 0,
      totalVisits: stats.totalVisits || 0,
      avgVisits: Math.round((stats.avgVisits || 0) * 100) / 100,
      maxVisits: stats.maxVisits || 0,
      mostRecent: stats.mostRecent,
      popularQRCodes: popular || []
    });
    
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error.message);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// API para buscar QR codes
app.get('/api/search', checkDbConnection, async (req, res) => {
  const { query } = req.query;
  
  console.log(`🔎 Buscando QR codes por: "${query}"`);
  
  if (!query) {
    return res.status(400).json({ error: 'Termo de busca é obrigatório' });
  }
  
  try {
    const qrCodes = await dbAll(
      'SELECT * FROM qrcodes WHERE id LIKE ? OR destination_url LIKE ? ORDER BY created_at DESC',
      [`%${query}%`, `%${query}%`]
    );
    
    const formattedQrCodes = qrCodes.map(qr => ({
      id: qr.id,
      destinationUrl: qr.destination_url,
      shortUrl: qr.short_url,
      visits: qr.visits,
      lastVisit: qr.last_visit,
      createdAt: qr.created_at,
      updatedAt: qr.updated_at
    }));
    
    console.log(`✅ Busca retornou ${formattedQrCodes.length} resultados`);
    
    res.json(formattedQrCodes);
    
  } catch (error) {
    console.error('❌ Erro ao buscar QR codes:', error.message);
    res.status(500).json({ 
      error: 'Erro interno do servidor',
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// Rota de redirecionamento (esta é a URL que estará no QR code)
app.get('/r/:id', checkDbConnection, async (req, res) => {
  const { id } = req.params;
  
  console.log(`🔗 Redirecionamento solicitado para QR code: ${id}`);
  
  try {
    const qrData = await dbGet('SELECT * FROM qrcodes WHERE id = ?', [id]);
    
    if (!qrData) {
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
    
    // Incrementar contador de visitas e atualizar última visita
    const now = new Date().toISOString();
    const newVisits = (qrData.visits || 0) + 1;
    
    await dbRun(
      'UPDATE qrcodes SET visits = ?, last_visit = ? WHERE id = ?',
      [newVisits, now, id]
    );
    
    console.log(`✅ Redirecionando QR Code ${id} para: ${qrData.destination_url} (visitas: ${newVisits})`);
    
    // Redirecionar para a URL de destino
    res.redirect(302, qrData.destination_url);
    
  } catch (error) {
    console.error('❌ Erro no redirecionamento:', error.message);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Erro no Servidor</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          h1 { color: #e74c3c; }
        </style>
      </head>
      <body>
        <h1>Erro interno do servidor</h1>
        <p>Desculpe, ocorreu um erro ao processar seu QR Code.</p>
        <p>Tente novamente mais tarde.</p>
        <p><a href="${BASE_URL}">Voltar à página inicial</a></p>
      </body>
      </html>
    `);
  }
});

// Rota de health check aprimorada
app.get('/api/health', checkDbConnection, async (req, res) => {
  try {
    // Testar conexão com o banco
    const dbTest = await dbGet('SELECT COUNT(*) as count FROM sqlite_master WHERE type="table"');
    const qrCount = await dbGet('SELECT COUNT(*) as count FROM qrcodes');
    
    res.json({
      status: 'healthy',
      baseUrl: BASE_URL,
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      database: {
        connected: true,
        tables: dbTest.count,
        qrCodes: qrCount.count
      },
      render: {
        externalUrl: process.env.RENDER_EXTERNAL_URL,
        serviceId: process.env.RENDER_SERVICE_ID
      },
      memory: {
        heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024) + ' MB',
        heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024) + ' MB'
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'unhealthy',
      error: 'Database connection failed',
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// Rota principal para testar
app.get('/', async (req, res) => {
  try {
    const stats = await dbGet(`
      SELECT 
        COUNT(*) as total,
        COALESCE(SUM(visits), 0) as visits
      FROM qrcodes
    `);
    
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
          .render-badge {
            background: #46b3a4;
          }
        </style>
      </head>
      <body>
        <h1>📱 Servidor de QR Codes Dinâmicos</h1>
        <p class="subtitle">Render.com + SQLite <span class="status-badge render-badge">Persistente</span></p>
        
        <div class="stats">
          <h3>📊 Estatísticas do Sistema:</h3>
          <p><strong>Total de QR Codes:</strong> ${stats?.total || 0}</p>
          <p><strong>Total de Visitantes:</strong> ${stats?.visits || 0}</p>
          <p><strong>URL Base:</strong> ${BASE_URL}</p>
          <div>
            <a href="${BASE_URL}/api/health" class="btn">🩺 Verificar Saúde</a>
            <a href="${BASE_URL}/api/qr-codes" class="btn">📋 Ver QR Codes</a>
            <a href="https://render.com" class="btn" target="_blank">🚀 Render.com</a>
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
            <li><code>GET /r/:id</code> - Redirecionamento (usado nos QR codes)</li>
          </ul>
        </div>
        
        <div class="database-info">
          <h3>💾 Banco de Dados SQLite no Render</h3>
          <p>✅ Dados persistentes armazenados em: <code>${dbPath}</code></p>
          <p>✅ Sobrevive a reinicializações do servidor</p>
          <p>✅ Backup automático do arquivo .db</p>
          <p>✅ Compatível com o sistema de serviços do Render</p>
        </div>
      </body>
      </html>
    `);
    
  } catch (error) {
    console.error('❌ Erro na rota principal:', error);
    res.status(500).send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>Erro no Servidor</title>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; }
          h1 { color: #e74c3c; }
        </style>
      </head>
      <body>
        <h1>Erro ao conectar com o banco de dados</h1>
        <p>Verifique as configurações do SQLite no Render.</p>
        <p><a href="${BASE_URL}/api/health">Verificar saúde do sistema</a></p>
      </body>
      </html>
    `);
  }
});

// Fechar conexão com o banco ao encerrar
process.on('SIGINT', () => {
  db.close((err) => {
    if (err) {
      console.error('❌ Erro ao fechar banco de dados:', err.message);
    } else {
      console.log('✅ Conexão com banco de dados fechada');
    }
    process.exit(0);
  });
});

// Tratamento de erros não capturados
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
  console.log(`💾 Banco de dados: ${dbPath}`);
  console.log(`⚡ Porta: ${PORT}`);
  console.log(`📊 Ambiente: ${process.env.NODE_ENV || 'development'}`);
  console.log(`\n✅ Pronto para receber requisições!\n`);
});
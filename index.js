// frontend/server.js - USANDO PACOTE JSON-API
const express = require('express');
const cors = require('cors');
const JsonApi = require('json-api');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// Configuração da URL da API externa
const API_BASE_URL = 'https://backend-qrcode-yiuy.onrender.com';
console.log(`🌐 Conectando à API JSON: ${API_BASE_URL}`);

// Configurar o cliente json-api
const apiClient = new JsonApi({
  baseUrl: API_BASE_URL,
  contentType: 'application/vnd.api+json',
  headers: {
    'Accept': 'application/vnd.api+json',
    'Content-Type': 'application/json'
  },
  timeout: 10000
});

// Helper para converter entre estrutura da API e formato simples
const formatQRCode = (qrData) => {
  if (!qrData) return null;
  
  return {
    id: qrData.id,
    destinationUrl: qrData.attributes?.destination_url || qrData.destination_url,
    shortUrl: qrData.attributes?.short_url || qrData.short_url,
    visits: qrData.attributes?.visits || qrData.visits || 0,
    lastVisit: qrData.attributes?.last_visit || qrData.last_visit,
    createdAt: qrData.attributes?.created_at || qrData.created_at,
    updatedAt: qrData.attributes?.updated_at || qrData.updated_at,
    qrCodeUrl: qrData.attributes?.qr_code_url || qrData.qrCodeUrl
  };
};

// Helper para fazer requisições com tratamento de erro
const makeApiRequest = async (method, endpoint, data = null) => {
  try {
    console.log(`🔄 ${method.toUpperCase()} ${endpoint}`);
    
    const options = {
      method: method.toLowerCase(),
      url: endpoint
    };
    
    if (data) {
      options.data = data;
    }
    
    const response = await apiClient.request(options);
    return response.data;
  } catch (error) {
    console.error(`❌ Erro na requisição ${method} ${endpoint}:`, error.message);
    
    // Extrair informações de erro do json-api
    let errorStatus = 500;
    let errorMessage = 'Erro na API externa';
    let errorDetails = null;
    
    if (error.response) {
      errorStatus = error.response.status || 500;
      errorMessage = error.response.data?.error || 
                    error.response.data?.message || 
                    'Erro na API externa';
      errorDetails = error.response.data?.details;
    } else if (error.request) {
      errorStatus = 503;
      errorMessage = 'API externa não disponível';
    }
    
    throw {
      status: errorStatus,
      message: errorMessage,
      details: errorDetails
    };
  }
};

// Health check da API externa
app.get('/api/health-check', async (req, res) => {
  try {
    console.log('🩺 Verificando saúde da API JSON...');
    
    // Tentar acessar endpoints básicos para verificar conexão
    const [health, qrCodes] = await Promise.all([
      makeApiRequest('GET', '/api/health').catch(() => ({ status: 'unknown' })),
      makeApiRequest('GET', '/api/qr-codes').catch(() => [])
    ]);
    
    res.json({
      status: 'connected',
      apiStatus: health,
      connectedAt: new Date().toISOString(),
      qrCodesCount: Array.isArray(qrCodes) ? qrCodes.length : 0,
      proxyServer: {
        port: PORT,
        environment: process.env.NODE_ENV || 'development',
        jsonApiVersion: JsonApi.version || 'unknown'
      }
    });
  } catch (error) {
    res.status(error.status || 500).json({
      status: 'disconnected',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// API para criar um QR code dinâmico
app.post('/api/create-qr', async (req, res) => {
  const { destinationUrl, customId } = req.body;
  
  console.log(`📝 Criando QR code: ${destinationUrl}`);
  
  if (!destinationUrl) {
    return res.status(400).json({ 
      errors: [{
        status: '400',
        title: 'Bad Request',
        detail: 'URL de destino é obrigatória'
      }]
    });
  }
  
  // Validar URL
  try {
    new URL(destinationUrl);
  } catch (error) {
    return res.status(400).json({ 
      errors: [{
        status: '400',
        title: 'Bad Request',
        detail: 'URL inválida'
      }]
    });
  }
  
  try {
    // Preparar dados no formato JSON:API
    const qrData = {
      type: 'qr-codes',
      attributes: {
        destination_url: destinationUrl,
        custom_id: customId
      }
    };
    
    const result = await makeApiRequest('POST', '/api/create-qr', {
      data: qrData
    });
    
    const formattedResult = formatQRCode(result);
    
    console.log(`✅ QR Code criado: ${formattedResult.id}`);
    
    res.json({
      data: {
        type: 'qr-codes',
        id: formattedResult.id,
        attributes: formattedResult
      }
    });
  } catch (error) {
    console.error('❌ Erro ao criar QR code:', error.message);
    res.status(error.status || 500).json({ 
      errors: [{
        status: error.status.toString(),
        title: 'API Error',
        detail: error.message,
        meta: error.details ? { details: error.details } : undefined
      }]
    });
  }
});

// API para atualizar destino de um QR code existente
app.put('/api/update-qr/:id', async (req, res) => {
  const { id } = req.params;
  const { destinationUrl } = req.body;
  
  console.log(`🔄 Atualizando QR code: ${id}`);
  
  if (!destinationUrl) {
    return res.status(400).json({ 
      errors: [{
        status: '400',
        title: 'Bad Request',
        detail: 'Nova URL de destino é obrigatória'
      }]
    });
  }
  
  // Validar URL
  try {
    new URL(destinationUrl);
  } catch (error) {
    return res.status(400).json({ 
      errors: [{
        status: '400',
        title: 'Bad Request',
        detail: 'URL inválida'
      }]
    });
  }
  
  try {
    const result = await makeApiRequest('PUT', `/api/update-qr/${id}`, {
      data: {
        type: 'qr-codes',
        id: id,
        attributes: {
          destination_url: destinationUrl
        }
      }
    });
    
    console.log(`✅ QR Code atualizado: ${id}`);
    
    res.json({
      data: {
        type: 'qr-codes',
        id: id,
        attributes: formatQRCode(result)
      }
    });
  } catch (error) {
    console.error('❌ Erro ao atualizar QR code:', error.message);
    res.status(error.status || 500).json({ 
      errors: [{
        status: error.status.toString(),
        title: 'API Error',
        detail: error.message
      }]
    });
  }
});

// API para deletar um QR code
app.delete('/api/delete-qr/:id', async (req, res) => {
  const { id } = req.params;
  
  console.log(`🗑️  Deletando QR code: ${id}`);
  
  try {
    await makeApiRequest('DELETE', `/api/delete-qr/${id}`);
    
    console.log(`✅ QR Code deletado: ${id}`);
    
    res.json({
      meta: {
        message: 'QR Code removido com sucesso',
        id: id,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Erro ao deletar QR code:', error.message);
    res.status(error.status || 500).json({ 
      errors: [{
        status: error.status.toString(),
        title: 'API Error',
        detail: error.message
      }]
    });
  }
});

// API para obter informações de um QR code
app.get('/api/qr-info/:id', async (req, res) => {
  const { id } = req.params;
  
  console.log(`🔍 Buscando QR code: ${id}`);
  
  try {
    const result = await makeApiRequest('GET', `/api/qr-info/${id}`);
    
    res.json({
      data: {
        type: 'qr-codes',
        id: id,
        attributes: formatQRCode(result)
      }
    });
  } catch (error) {
    console.error('❌ Erro ao buscar QR code:', error.message);
    res.status(error.status || 500).json({ 
      errors: [{
        status: error.status.toString(),
        title: 'API Error',
        detail: error.message
      }]
    });
  }
});

// API para listar todos os QR codes
app.get('/api/qr-codes', async (req, res) => {
  console.log('📋 Listando todos QR codes');
  
  try {
    const result = await makeApiRequest('GET', '/api/qr-codes');
    
    // Se for array, formatar todos
    const qrCodes = Array.isArray(result) 
      ? result.map(qr => formatQRCode(qr))
      : [];
    
    res.json({
      data: qrCodes.map(qr => ({
        type: 'qr-codes',
        id: qr.id,
        attributes: qr
      })),
      meta: {
        count: qrCodes.length,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Erro ao listar QR codes:', error.message);
    res.status(error.status || 500).json({ 
      errors: [{
        status: error.status.toString(),
        title: 'API Error',
        detail: error.message
      }]
    });
  }
});

// API para obter estatísticas
app.get('/api/stats', async (req, res) => {
  console.log('📊 Obtendo estatísticas');
  
  try {
    const result = await makeApiRequest('GET', '/api/stats');
    
    res.json({
      data: {
        type: 'statistics',
        id: 'current',
        attributes: result
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Erro ao obter estatísticas:', error.message);
    res.status(error.status || 500).json({ 
      errors: [{
        status: error.status.toString(),
        title: 'API Error',
        detail: error.message
      }]
    });
  }
});

// API para buscar QR codes
app.get('/api/search', async (req, res) => {
  const { query } = req.query;
  
  console.log(`🔎 Buscando QR codes por: "${query}"`);
  
  if (!query) {
    return res.status(400).json({ 
      errors: [{
        status: '400',
        title: 'Bad Request',
        detail: 'Termo de busca é obrigatório'
      }]
    });
  }
  
  try {
    const result = await makeApiRequest('GET', `/api/search?query=${encodeURIComponent(query)}`);
    
    // Se for array, formatar todos
    const qrCodes = Array.isArray(result) 
      ? result.map(qr => formatQRCode(qr))
      : [];
    
    res.json({
      data: qrCodes.map(qr => ({
        type: 'qr-codes',
        id: qr.id,
        attributes: qr
      })),
      meta: {
        count: qrCodes.length,
        searchQuery: query,
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Erro na busca:', error.message);
    res.status(error.status || 500).json({ 
      errors: [{
        status: error.status.toString(),
        title: 'API Error',
        detail: error.message
      }]
    });
  }
});

// Rota de redirecionamento
app.get('/r/:id', async (req, res) => {
  const { id } = req.params;
  
  console.log(`🔗 Redirecionando para QR code: ${id}`);
  
  try {
    // Redirecionar diretamente para a API externa
    res.redirect(302, `${API_BASE_URL}/r/${id}`);
  } catch (error) {
    console.error('❌ Erro no redirecionamento:', error.message);
    res.status(500).json({ 
      errors: [{
        status: '500',
        title: 'Internal Server Error',
        detail: 'Erro no redirecionamento'
      }]
    });
  }
});

// Rota para backup dos dados
app.get('/api/backup', async (req, res) => {
  console.log('💾 Obtendo backup');
  
  try {
    const result = await makeApiRequest('GET', '/api/backup');
    
    res.json({
      data: {
        type: 'backup',
        id: 'full',
        attributes: result
      },
      meta: {
        timestamp: new Date().toISOString()
      }
    });
  } catch (error) {
    console.error('❌ Erro ao obter backup:', error.message);
    res.status(error.status || 500).json({ 
      errors: [{
        status: error.status.toString(),
        title: 'API Error',
        detail: error.message
      }]
    });
  }
});

// Rota de health check do proxy
app.get('/api/health', async (req, res) => {
  res.json({
    data: {
      type: 'health',
      id: 'proxy',
      attributes: {
        status: 'running',
        proxyServer: {
          port: PORT,
          environment: process.env.NODE_ENV || 'development',
          uptime: process.uptime()
        },
        externalApi: API_BASE_URL,
        jsonApiClient: true,
        timestamp: new Date().toISOString()
      }
    }
  });
});

// Rota principal para testar
app.get('/', async (req, res) => {
  try {
    // Tentar obter dados da API externa
    let stats = null;
    let apiConnected = false;
    
    try {
      stats = await makeApiRequest('GET', '/api/stats');
      apiConnected = true;
    } catch (error) {
      apiConnected = false;
      console.log('API externa não disponível para dashboard');
    }
    
    res.send(`
      <!DOCTYPE html>
      <html>
      <head>
        <title>JSON:API Proxy - QR Codes</title>
        <style>
          body { 
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            max-width: 900px; 
            margin: 0 auto; 
            padding: 20px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            min-height: 100vh;
            color: #333;
          }
          .container {
            background: white;
            border-radius: 15px;
            padding: 30px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.2);
            margin-top: 20px;
          }
          h1 { 
            color: #2c3e50; 
            text-align: center;
            margin-bottom: 5px;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            -webkit-background-clip: text;
            -webkit-text-fill-color: transparent;
          }
          .subtitle {
            text-align: center;
            color: #7f8c8d;
            margin-bottom: 30px;
            font-size: 1.1em;
          }
          .status-card {
            background: ${apiConnected ? '#d4edda' : '#f8d7da'};
            border: 1px solid ${apiConnected ? '#c3e6cb' : '#f5c6cb'};
            color: ${apiConnected ? '#155724' : '#721c24'};
            padding: 20px;
            border-radius: 10px;
            margin-bottom: 30px;
          }
          .api-url {
            background: #f8f9fa;
            border: 1px solid #dee2e6;
            padding: 12px;
            border-radius: 8px;
            font-family: 'Courier New', monospace;
            word-break: break-all;
            margin: 15px 0;
            font-size: 0.9em;
          }
          .btn {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 12px 24px;
            border-radius: 8px;
            text-decoration: none;
            margin: 10px 10px 10px 0;
            font-weight: 600;
            border: none;
            cursor: pointer;
            transition: transform 0.2s;
          }
          .btn:hover {
            transform: translateY(-2px);
            box-shadow: 0 5px 15px rgba(0,0,0,0.2);
          }
          .btn-secondary {
            background: #6c757d;
          }
          .btn-success {
            background: #28a745;
          }
          .stats-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin: 25px 0;
          }
          .stat-card {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 20px;
            text-align: center;
            border: 1px solid #dee2e6;
          }
          .stat-number {
            font-size: 2.5em;
            font-weight: bold;
            color: #667eea;
            margin: 10px 0;
          }
          .stat-label {
            color: #6c757d;
            font-size: 0.9em;
          }
          .endpoint-list {
            background: #f8f9fa;
            border-radius: 10px;
            padding: 25px;
            margin: 25px 0;
          }
          .endpoint-item {
            background: white;
            padding: 15px;
            margin: 10px 0;
            border-radius: 8px;
            border-left: 4px solid #667eea;
            display: flex;
            justify-content: space-between;
            align-items: center;
          }
          .endpoint-method {
            background: #667eea;
            color: white;
            padding: 4px 12px;
            border-radius: 4px;
            font-weight: bold;
            font-size: 0.8em;
          }
          .json-api-badge {
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 5px 15px;
            border-radius: 20px;
            font-size: 0.8em;
            display: inline-block;
            margin-left: 10px;
          }
          .info-box {
            background: #e3f2fd;
            border-left: 4px solid #2196f3;
            padding: 20px;
            border-radius: 8px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <h1>🔗 JSON:API Proxy - QR Codes Dinâmicos</h1>
          <p class="subtitle">Cliente JSON:API conectado à API externa <span class="json-api-badge">json-api v${JsonApi.version || '1.0'}</span></p>
          
          <div class="status-card">
            <h3>🔌 Status da Conexão:</h3>
            <div class="api-url">${API_BASE_URL}</div>
            <p><strong>Status:</strong> ${apiConnected ? '✅ Conectado' : '❌ Desconectado'}</p>
            ${apiConnected ? '<p>API externa respondendo corretamente</p>' : '<p>Verifique se a API externa está online</p>'}
          </div>
          
          ${apiConnected && stats ? `
            <div class="stats-grid">
              <div class="stat-card">
                <div class="stat-number">${stats.totalQRCodes || 0}</div>
                <div class="stat-label">QR Codes Totais</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${stats.totalVisits || 0}</div>
                <div class="stat-label">Total de Visitas</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${stats.avgVisits ? Math.round(stats.avgVisits) : 0}</div>
                <div class="stat-label">Média de Visitas</div>
              </div>
              <div class="stat-card">
                <div class="stat-number">${stats.maxVisits || 0}</div>
                <div class="stat-label">Máximo de Visitas</div>
              </div>
            </div>
          ` : ''}
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="/api/health-check" class="btn">🩺 Verificar Conexão</a>
            <a href="${API_BASE_URL}" class="btn btn-secondary" target="_blank">🌐 API Externa</a>
            <a href="/api/qr-codes" class="btn btn-success">📋 Listar QR Codes</a>
          </div>
          
          <div class="endpoint-list">
            <h3>🔧 Endpoints Disponíveis (JSON:API Format):</h3>
            
            <div class="endpoint-item">
              <div>
                <strong>/api/create-qr</strong><br>
                <small>Criar novo QR code dinâmico</small>
              </div>
              <span class="endpoint-method">POST</span>
            </div>
            
            <div class="endpoint-item">
              <div>
                <strong>/api/update-qr/:id</strong><br>
                <small>Atualizar destino de QR code</small>
              </div>
              <span class="endpoint-method">PUT</span>
            </div>
            
            <div class="endpoint-item">
              <div>
                <strong>/api/delete-qr/:id</strong><br>
                <small>Remover QR code</small>
              </div>
              <span class="endpoint-method">DELETE</span>
            </div>
            
            <div class="endpoint-item">
              <div>
                <strong>/api/qr-codes</strong><br>
                <small>Listar todos QR codes</small>
              </div>
              <span class="endpoint-method">GET</span>
            </div>
            
            <div class="endpoint-item">
              <div>
                <strong>/api/stats</strong><br>
                <small>Estatísticas do sistema</small>
              </div>
              <span class="endpoint-method">GET</span>
            </div>
            
            <div class="endpoint-item">
              <div>
                <strong>/r/:id</strong><br>
                <small>Redirecionamento (QR code)</small>
              </div>
              <span class="endpoint-method">GET</span>
            </div>
          </div>
          
          <div class="info-box">
            <h3>ℹ️ Sobre o JSON:API</h3>
            <p>Este proxy usa o pacote <code>json-api</code> para comunicação com a API externa.</p>
            <p><strong>Vantagens:</strong></p>
            <ul>
              <li>Formatação padrão JSON:API</li>
              <li>Tratamento automático de erros</li>
              <li>Serialização/Deserialização automática</li>
              <li>Compatível com especificação JSON:API</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin-top: 30px; color: #6c757d; font-size: 0.9em;">
            <p>Proxy Server: Porta ${PORT} | Ambiente: ${process.env.NODE_ENV || 'development'}</p>
            <p>Todas as requisições seguem o formato JSON:API</p>
          </div>
        </div>
        
        <script>
          // Auto-refresh stats every 30 seconds
          setTimeout(() => {
            window.location.reload();
          }, 30000);
          
          // Test connection button
          document.addEventListener('DOMContentLoaded', function() {
            const testBtn = document.querySelector('.btn');
            if (testBtn) {
              testBtn.addEventListener('click', function(e) {
                if (this.href.includes('health-check')) {
                  e.preventDefault();
                  this.innerHTML = '🔍 Testando...';
                  fetch('/api/health-check')
                    .then(response => response.json())
                    .then(data => {
                      alert('Status: ' + data.status + '\\nQR Codes: ' + (data.qrCodesCount || 0));
                      window.location.reload();
                    })
                    .catch(() => {
                      alert('Erro ao testar conexão');
                      this.innerHTML = '🩺 Verificar Conexão';
                    });
                }
              });
            }
          });
        </script>
      </body>
      </html>
    `);
  } catch (error) {
    res.status(500).send(`
      <div style="text-align: center; padding: 50px;">
        <h1>❌ Erro no Proxy</h1>
        <p>${error.message}</p>
        <a href="/" style="color: #667eea;">Tentar novamente</a>
      </div>
    `);
  }
});

// Middleware para erros 404
app.use((req, res) => {
  res.status(404).json({
    errors: [{
      status: '404',
      title: 'Not Found',
      detail: `Rota não encontrada: ${req.path}`
    }]
  });
});

// Middleware de erro global
app.use((error, req, res, next) => {
  console.error('❌ Erro global:', error);
  res.status(500).json({
    errors: [{
      status: '500',
      title: 'Internal Server Error',
      detail: 'Erro interno do servidor proxy',
      meta: process.env.NODE_ENV === 'development' ? { stack: error.stack } : undefined
    }]
  });
});

// Iniciar servidor
app.listen(PORT, () => {
  console.log(`\n🚀 Servidor JSON:API Proxy iniciado com sucesso!`);
  console.log(`🌐 API Externa: ${API_BASE_URL}`);
  console.log(`🔧 JSON:API Client: ${JsonApi.version || 'Unknown version'}`);
  console.log(`📊 Proxy disponível em: http://localhost:${PORT}`);
  console.log(`📱 Redirecionamento: http://localhost:${PORT}/r/:id`);
  console.log(`⚡ Porta: ${PORT}`);
  console.log(`\n✅ Pronto para processar requisições JSON:API!\n`);
  
  // Testar conexão inicial
  console.log('🔍 Testando conexão com API externa...');
  makeApiRequest('GET', '/api/health')
    .then(health => {
      console.log(`✅ API Externa saudável: ${health.status || 'connected'}`);
    })
    .catch(error => {
      console.log(`⚠️  API Externa não disponível: ${error.message}`);
    });
});
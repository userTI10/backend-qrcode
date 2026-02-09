// backend/scripts/sync-data.js
const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

async function syncFromProduction() {
  const PRODUCTION_URL = 'https://backend-qrcode-yiuy.onrender.com';
  
  console.log('🔄 Sincronizando dados da produção...');
  
  try {
    // 1. Baixar dados da produção
    console.log('📥 Baixando dados da produção...');
    const response = await axios.get(`${PRODUCTION_URL}/api/export`, {
      timeout: 10000
    });
    
    const data = response.data;
    
    // 2. Salvar backup local
    const backupDir = path.join(__dirname, '..', 'backups');
    await fs.mkdir(backupDir, { recursive: true });
    
    const backupFile = path.join(backupDir, `backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    await fs.writeFile(backupFile, JSON.stringify(data, null, 2));
    console.log(`💾 Backup salvo: ${backupFile}`);
    
    // 3. Atualizar arquivo de desenvolvimento
    const devFile = path.join(__dirname, '..', 'qrcodes.json');
    await fs.writeFile(devFile, JSON.stringify(data.qrCodes, null, 2));
    console.log(`✅ Dados atualizados: ${devFile}`);
    console.log(`📊 Total de QR codes: ${Object.keys(data.qrCodes).length}`);
    console.log(`👥 Total de visitas: ${data.stats.visits}`);
    
  } catch (error) {
    console.error('❌ Erro na sincronização:', error.message);
    process.exit(1);
  }
}

async function pushToProduction() {
  console.log('⚠️  Aviso: Esta funcionalidade requer autenticação.');
  console.log('Considere usar a API de importação manualmente.');
}

// Executar baseado no argumento
const command = process.argv[2];

if (command === 'pull') {
  syncFromProduction();
} else if (command === 'push') {
  pushToProduction();
} else {
  console.log(`
Uso: node scripts/sync-data.js [comando]

Comandos:
  pull    - Puxar dados da produção para desenvolvimento
  push    - Enviar dados do desenvolvimento para produção
  
Exemplo:
  node scripts/sync-data.js pull
  `);
}
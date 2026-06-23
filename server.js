const https = require('https');
const http = require('http');
const PORT = process.env.PORT || 3000;

// Chave lida do ambiente — nunca exposta ao frontend
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';

const server = http.createServer((req, res) => {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, anthropic-version');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }

  if (req.method !== 'POST' || req.url !== '/proxy') {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
    return;
  }

  // Chave vem do ambiente, não do cliente
  if (!ANTHROPIC_API_KEY || !ANTHROPIC_API_KEY.startsWith('sk-ant')) {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { type: 'config_error', message: 'ANTHROPIC_API_KEY não configurada no servidor' } }));
    return;
  }

  let body = '';
  req.on('data', chunk => body += chunk);
  req.on('end', () => {
    // Garantir max_tokens seguro
    let parsed = {};
    try { parsed = JSON.parse(body); } catch(e) {}
    parsed.stream = false;
    if (!parsed.max_tokens || parsed.max_tokens > 4096) parsed.max_tokens = 4096;
    const finalBody = JSON.stringify(parsed);

    const options = {
      hostname: 'api.anthropic.com',
      path: '/v1/messages',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(finalBody),
        'x-api-key': ANTHROPIC_API_KEY,   // ← vem do process.env
        'anthropic-version': '2023-06-01',
      },
      timeout: 55000
    };

    const apiReq = https.request(options, (apiRes) => {
      let data = '';
      apiRes.on('data', chunk => data += chunk);
      apiRes.on('end', () => {
        res.writeHead(apiRes.statusCode, { 'Content-Type': 'application/json' });
        res.end(data);
      });
    });

    apiReq.on('timeout', () => {
      apiReq.destroy();
      res.writeHead(504, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'timeout', message: 'Requisição à Anthropic expirou (55s)' } }));
    });

    apiReq.on('error', (err) => {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: { type: 'server_error', message: err.message } }));
    });

    apiReq.write(finalBody);
    apiReq.end();
  });
});

server.listen(PORT, () => {
  console.log(`SmartIA Proxy rodando na porta ${PORT}`);
  console.log(`API Key configurada: ${ANTHROPIC_API_KEY ? '✅ sim' : '❌ NÃO'}`);
});

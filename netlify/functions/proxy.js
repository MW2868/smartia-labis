exports.handler = async function(event, context) {
  // Increase function timeout
  context.callbackWaitsForEmptyEventLoop = false;

  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, x-api-key, anthropic-version',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: corsHeaders, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Method not allowed' })
    };
  }

  try {
    const headers = event.headers || {};
    const apiKey = headers['x-api-key'] || headers['X-Api-Key'] || headers['X-API-KEY'] || '';

    if (!apiKey || !apiKey.startsWith('sk-ant')) {
      return {
        statusCode: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: { type: 'authentication_error', message: 'API key inválida ou ausente' } })
      };
    }

    const https = require('https');
    const body = event.body || '{}';

    // Parse body and set stream:false to get complete response faster
    let parsedBody;
    try {
      parsedBody = JSON.parse(body);
    } catch(e) {
      parsedBody = {};
    }
    
    // Ensure stream is false and reduce tokens if needed
    parsedBody.stream = false;
    if (!parsedBody.max_tokens || parsedBody.max_tokens > 4096) {
      parsedBody.max_tokens = 4096;
    }

    const finalBody = JSON.stringify(parsedBody);

    const result = await new Promise((resolve, reject) => {
      const options = {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(finalBody),
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        timeout: 55000  // 55 second timeout on the HTTPS request
      };

      const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => resolve({ status: res.statusCode, body: data }));
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error('Request to Anthropic timed out after 55s'));
      });

      req.on('error', reject);
      req.write(finalBody);
      req.end();
    });

    return {
      statusCode: result.status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: result.body
    };

  } catch (err) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: { type: 'server_error', message: err.message } })
    };
  }
};

export default {
  async fetch(request, env, ctx) {
    // 處理 CORS 預檢請求
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, OPTIONS',
          'Access-Control-Allow-Headers': 'X-Admin-Password, Content-Type',
          'Access-Control-Max-Age': '86400',
        },
      });
    }

    // 僅允許 GET 請求以取得留言資料
    if (request.method !== 'GET') {
      return new Response(JSON.stringify({ error: 'Method not allowed' }), {
        status: 405,
        headers: { 
          'Content-Type': 'application/json;charset=UTF-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    // 驗證來自前端的管理者密碼
    const clientPassword = request.headers.get('X-Admin-Password');
    if (!clientPassword || clientPassword !== env.ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 
          'Content-Type': 'application/json;charset=UTF-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }

    try {
      // 代理請求至真實的 Google Apps Script 取得資料
      const response = await fetch(env.APPS_SCRIPT_URL, {
        method: 'GET',
        headers: {
          'User-Agent': 'Cloudflare-Worker-Proxy',
        },
      });

      const data = await response.text();

      // 回傳資料並允許跨域存取
      return new Response(data, {
        status: response.status,
        headers: {
          'Content-Type': 'application/json;charset=UTF-8',
          'Access-Control-Allow-Origin': '*',
          'Cache-Control': 'public, max-age=60',
        },
      });
    } catch (err) {
      return new Response(JSON.stringify({ error: 'Failed to fetch messages' }), {
        status: 500,
        headers: { 
          'Content-Type': 'application/json;charset=UTF-8',
          'Access-Control-Allow-Origin': '*'
        }
      });
    }
  },
};
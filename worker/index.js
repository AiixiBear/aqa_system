export default {
  async fetch(request, env) {
    // 1. CORS Preflight 處理
    if (request.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
        }
      });
    }

    // 2. 只允許 POST 請求
    if (request.method !== 'POST') {
      return json({ status: 'error', message: '拉屎嗎？請使用 POST 請求' }, 405);
    }

    // 3. 解析請求內容
    let params;
    try {
      params = await request.json();
    } catch {
      return json({ status: 'error', message: '無效的 JSON 格式' }, 400);
    }

    const { text, tag, recaptcha, turnstile } = params;
    const token = recaptcha || turnstile;

    // 4. 驗證輸入欄位
    if (!text || text.trim().length === 0) {
      return json({ status: 'error', message: '內容不能為空' }, 400);
    }
    if (text.length > 100) {
      return json({ status: 'error', message: '內容超過 100 字' }, 400);
    }
    if (!token) {
      return json({ status: 'error', message: '未提供人機驗證 Token' }, 400);
    }

    // 5. 取得客戶端資訊
    const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const userAgent = request.headers.get('User-Agent') ?? 'unknown';

    // 6. 驗證 Cloudflare Turnstile Token
    const verifyFormData = new URLSearchParams();
    verifyFormData.append('secret', env.TURNSTILE_SECRET_KEY);
    verifyFormData.append('response', token);
    verifyFormData.append('remoteip', ip);

    const verifyRes = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      body: verifyFormData
    });
    
    const verifyJson = await verifyRes.json();

    if (!verifyJson.success) {
      return json({ 
        status: 'error', 
        message: `驗證碼驗證失敗: ${verifyJson['error-codes']?.join(', ') || '未知錯誤'}，請重試` 
      }, 400);
    }

    // 7. 將資料發送至 Google Sheet 並取得配發的流水號代碼
    const now = new Date().toLocaleString('zh-TW', { timeZone: 'Asia/Taipei' });
    const sheetParams = new URLSearchParams({ 
      time: now, 
      text: text.trim(), 
      ip, 
      tag: tag ?? '',
      userAgent 
    });

    let assignedCode = '';

    try {
      const sheetRes = await fetch(`${env.APPS_SCRIPT_URL}?${sheetParams}`, {
        method: 'GET',
        redirect: 'follow'
      });

      if (!sheetRes.ok) {
        return json({ status: 'error', message: '寫入 Google Sheet 失敗' }, 500);
      }

      // 解析 Apps Script 回傳的 JSON (含有 userCode)
      const sheetData = await sheetRes.json();
      if (sheetData.status === 'ok') {
        assignedCode = sheetData.userCode;
      } else {
        return json({ status: 'error', message: 'Google Sheet 處理失敗: ' + sheetData.message }, 500);
      }

    } catch (err) {
      return json({ status: 'error', message: '無法連接寫入服務' }, 500);
    }

    // 8. 成功時，將 100% 唯一的流水號回傳給前端
    return json({ status: 'ok', userCode: assignedCode }, 200);
  }
};

/**
 * 輔助函數：建立帶有 CORS 標頭的 JSON Response
 */
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*'
    }
  });
}
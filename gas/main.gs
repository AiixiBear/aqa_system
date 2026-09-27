/**
 * aqa_system 寫入端 Google Apps Script
 * 功能：接收 Cloudflare Worker 轉送的留言，查 IP、配發唯一流水號後寫入 Google Sheets。
 * 安全：必須帶上 WRITE_KEY（Script Properties）才能寫入，避免繞過 Worker 直灌資料。
 */

function doGet() {
  return jsonResponse({ status: 'error', message: '請使用 POST 請求，且需經 Cloudflare Worker 驗證' });
}

function doPost(e) {
  try {
    const props = PropertiesService.getScriptProperties();
    const writeKey = props.getProperty('WRITE_KEY');

    if (!writeKey) {
      return jsonResponse({ status: 'error', message: '伺服器未設定 WRITE_KEY' });
    }

    const payload = parsePayload(e);
    if (!payload) {
      return jsonResponse({ status: 'error', message: '無效的請求內容' });
    }

    const providedKey = payload.writeKey || headerValue(e, 'X-Write-Key');
    if (providedKey !== writeKey) {
      return jsonResponse({ status: 'error', message: '驗證失敗' });
    }

    const text = String(payload.text || '').trim();
    const ip = String(payload.ip || '').trim();
    const tag = payload.tag != null ? String(payload.tag) : '';
    const userAgent = payload.userAgent != null ? String(payload.userAgent) : '';
    const time = String(payload.time || '').trim();

    if (!text) {
      return jsonResponse({ status: 'error', message: '內容不能為空' });
    }
    if (text.length > 100) {
      return jsonResponse({ status: 'error', message: '內容超過 100 字' });
    }

    const sheet = openSheet(props);
    const geo = lookupIpInfo(ip, props.getProperty('IPINFO_TOKEN'));
    const userCode = allocateUserCode(props);

    sheet.appendRow([
      time,
      text,
      ip,
      tag,
      geo.country,
      geo.asName,
      userAgent,
      userCode
    ]);

    return jsonResponse({ status: 'ok', userCode: userCode });
  } catch (err) {
    console.error('doPost 發生例外', err);
    return jsonResponse({ status: 'error', message: '伺服器處理失敗' }, 500);
  }
}

function openSheet(props) {
  const spreadsheetUrl = props.getProperty('SHEET_URL');
  const sheetName = props.getProperty('SHEET_NAME');
  const sheet = SpreadsheetApp.openByUrl(spreadsheetUrl).getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('找不到指定的試算表分頁');
  }
  return sheet;
}

function lookupIpInfo(ipAddress, ipinfoToken) {
  const result = { country: 'Unknown', asName: 'Unknown' };
  if (!ipAddress || !ipinfoToken) {
    return result;
  }

  try {
    const url = 'https://api.ipinfo.io/lite/' + encodeURIComponent(ipAddress) + '?token=' + encodeURIComponent(ipinfoToken);
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      const ipInfo = JSON.parse(response.getContentText());
      result.country = ipInfo.country || 'Unknown';
      result.asName = ipInfo.as_name || 'Unknown';
    }
  } catch (err) {
    console.error('查詢 IP 失敗: ' + ipAddress, err);
  }
  return result;
}

/**
 * 在互斥鎖內遞增計數器，確保同時送出時流水號仍唯一。
 * 例如：AQA-0001、AQA-0002...
 */
function allocateUserCode(props) {
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) {
    throw new Error('系統忙碌中，請稍後再試');
  }

  try {
    let counter = Number(props.getProperty('MSG_COUNTER') || '0');
    if (!isFinite(counter) || counter < 0) {
      counter = 0;
    }
    counter += 1;
    props.setProperty('MSG_COUNTER', String(counter));
    return 'AQA-' + String(counter).padStart(4, '0');
  } finally {
    lock.releaseLock();
  }
}

function parsePayload(e) {
  if (e && e.postData && e.postData.contents) {
    try {
      return JSON.parse(e.postData.contents);
    } catch (err) {
      return null;
    }
  }
  return e && e.parameter ? e.parameter : null;
}

function headerValue(e, name) {
  if (!e || !e.request || !e.request.headers) {
    return '';
  }
  const headers = e.request.headers;
  for (const key in headers) {
    if (key.toLowerCase() === name.toLowerCase()) {
      return headers[key];
    }
  }
  return '';
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

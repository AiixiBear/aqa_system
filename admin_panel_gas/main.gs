/**
 * aqa_system 後台讀取端 Google Apps Script
 * 功能：讀取留言試算表並以 JSON 回傳給 admin_panel。
 * 安全：必須帶上 READ_KEY（Script Properties）才能讀取，避免留言與 IP 資料外洩。
 */

const SHEET_URL = PropertiesService.getScriptProperties().getProperty('SHEET_URL');
const IPINFO_TOKEN = PropertiesService.getScriptProperties().getProperty('IPINFO_TOKEN');
const DEFAULT_TZ = 'Asia/Taipei';
const TIMEZONE = PropertiesService.getScriptProperties().getProperty('TIMEZONE') || DEFAULT_TZ;
const SHEET_NAME = PropertiesService.getScriptProperties().getProperty('SHEET_NAME');
const READ_KEY = PropertiesService.getScriptProperties().getProperty('READ_KEY');

function doGet(e) {
  const providedKey =
    (e && e.parameter && (e.parameter.readKey || e.parameter.key)) ||
    headerValue(e, 'X-Read-Key') ||
    '';

  if (!READ_KEY) {
    return jsonResponse({ status: 'error', message: '伺服器未設定 READ_KEY' });
  }
  if (providedKey !== READ_KEY) {
    return jsonResponse({ status: 'error', message: '驗證失敗' });
  }

  const sheet = SpreadsheetApp.openByUrl(SHEET_URL).getSheetByName(SHEET_NAME);
  if (!sheet) {
    return jsonResponse({ status: 'error', message: '找不到指定的試算表分頁' });
  }

  const data = sheet.getDataRange().getValues();
  const rows = data.slice(1).map(function (r) {
    return {
      time: formatTime(r[0]),
      text: r[1],
      ip: r[2] ? String(r[2]).trim() : '',
      tag: r[3],
      country: r[4] || 'Unknown',
      as_name: r[5] || 'Unknown',
      userAgent: r[6],
      code: r[7]
    };
  });

  return ContentService.createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}

function formatTime(value) {
  try {
    const d = value instanceof Date ? value : new Date(value);
    if (isNaN(d.getTime())) {
      return value ? String(value) : '';
    }
    return Utilities.formatDate(d, TIMEZONE, 'yyyy-MM-dd HH:mm:ss');
  } catch (err) {
    return value ? String(value) : '';
  }
}

function lookupIpInfo(ipAddress) {
  const details = { country: 'Unknown', asName: 'Unknown' };
  if (!ipAddress || !IPINFO_TOKEN) {
    return details;
  }

  try {
    const url = 'https://api.ipinfo.io/lite/' + encodeURIComponent(ipAddress) + '?token=' + encodeURIComponent(IPINFO_TOKEN);
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      const ipInfo = JSON.parse(response.getContentText());
      details.country = ipInfo.country || 'Unknown';
      details.asName = ipInfo.as_name || 'Unknown';
    }
  } catch (err) {
    console.error('查詢 IP 失敗: ' + ipAddress, err);
  }
  return details;
}

/**
 * 舊留言補齊 IP 資料的急救函式。
 * 請在 Apps Script 編輯器中手動執行 repairOldData。
 */
function repairOldData() {
  const sheet = SpreadsheetApp.openByUrl(SHEET_URL).getSheetByName(SHEET_NAME);
  if (!sheet) {
    console.error('找不到指定的試算表分頁');
    return;
  }

  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) {
    return;
  }

  // 取得 C 欄到 F 欄（IP、Tag、國家、ASN）
  const range = sheet.getRange(2, 3, lastRow - 1, 4);
  const values = range.getValues();

  for (let i = 0; i < values.length; i++) {
    const ip = values[i][0] ? String(values[i][0]).trim() : '';
    const currentCountry = values[i][2];

    if (ip && !currentCountry) {
      const details = lookupIpInfo(ip);
      values[i][2] = details.country;
      values[i][3] = details.asName;
      Utilities.sleep(200);
    }
  }

  range.setValues(values);
  console.log('舊資料補齊完成');
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

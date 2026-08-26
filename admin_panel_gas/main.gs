const SHEET_URL = PropertiesService.getScriptProperties().getProperty('SHEET_URL');
const IPINFO_TOKEN = PropertiesService.getScriptProperties().getProperty('IPINFO_TOKEN'); 
DEFAULT_TZ = "Asia/Taipei"
const TIMEZONE = PropertiesService.getScriptProperties().getProperty('TIMEZONE') || DEFAULT_TZ;
const SHEET_NAME = PropertiesService.getScriptProperties().getProperty('SHEET_NAME');

/* ==========================================
   1. 讀取留言（網頁載入時觸發）
   因為直接讀取試算表，速度會超級快！
   ========================================== */
function doGet(e) {
  const sheet = SpreadsheetApp.openByUrl(SHEET_URL).getSheetByName(SHEET_NAME);
  const data = sheet.getDataRange().getValues();
  
  const rows = data.slice(1).map(r => {
    return {
      time: Utilities.formatDate(new Date(r[0]), TIMEZONE, "yyyy-MM-dd HH:mm:ss"),
      text: r[1],
      ip: r[2] ? String(r[2]).trim() : "",
      tag: r[3],
      country: r[4] || "Unknown",
      as_name: r[5] || "Unknown",
      userAgent: r[6],
      code: r[7]
    };
  });

  return ContentService.createTextOutput(JSON.stringify(rows))
    .setMimeType(ContentService.MimeType.JSON);
}

/* ==========================================
   2. 核心魔法：查 IP 的獨立函式
   ========================================== */
function fetchIpDetails(ipAddress) {
  let details = { country: "Unknown", asName: "Unknown" };
  if (!ipAddress || !IPINFO_TOKEN) return details;
  
  try {
    const url = "https://api.ipinfo.io/lite/" + ipAddress + "?token=" + IPINFO_TOKEN;
    const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (response.getResponseCode() === 200) {
      const ipInfo = JSON.parse(response.getContentText());
      details.country = ipInfo.country || "Unknown";
      details.asName = ipInfo.as_name || "Unknown";
    }
  } catch (err) {
    console.error("查詢 IP 失敗: " + ipAddress, err);
  }
  return details;
}

/* ==========================================
   3. 寫入新留言
   ========================================== */


/* 幫過去的舊留言一鍵補齊 IP 資料的急救函式 */
function repairOldData() {
  const sheet = SpreadsheetApp.openById(SHEET_ID).getSheetByName("Main");
  const lastRow = sheet.getLastRow();
  if (lastRow <= 1) return; // 沒有資料就跳過
  
  // 取得 C 欄到 F 欄的資料 (從第 2 列開始)
  const range = sheet.getRange(2, 3, lastRow - 1, 4); 
  const values = range.getValues();
  
  for (let i = 0; i < values.length; i++) {
    const ip = values[i][0] ? String(values[i][0]).trim() : "";
    let currentCountry = values[i][2];
    
    // 如果有 IP，且欄位目前是空的，才需要補查
    if (ip && !currentCountry) {
      const details = fetchIpDetails(ip);
      values[i][2] = details.country; // 補上 E 欄
      values[i][3] = details.asName;  // 補上 F 欄
      Utilities.sleep(200); // 休息 0.2 秒，溫柔對待 API 
    }
  }
  
  // 把補好的資料一次寫回試算表
  range.setValues(values);
  console.log("舊資料全部補齊囉！");
}
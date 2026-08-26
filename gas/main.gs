function doGet(e) {
  const { time, text, ip, tag, userAgent } = e.parameter;

  const spreadsheetUrl = PropertiesService.getScriptProperties().getProperty('SHEET_URL');
  const sheet = SpreadsheetApp.openByUrl(spreadsheetUrl).getSheetByName(PropertiesService.getScriptProperties().getProperty('SHEET_NAME'));
  
  const ipinfoToken = PropertiesService.getScriptProperties().getProperty('IPINFO_TOKEN'); 
  
  const ipAddress = ip ? String(ip).trim() : "";
  let country = "Unknown";
  let asName = "Unknown";

  /* 1. 在寫入試算表前，先由後端偷偷去查好 IP 資料（只查這一次！） */
  if (ipAddress && ipinfoToken) {
    try {
      const url = "https://api.ipinfo.io/lite/" + ipAddress + "?token=" + ipinfoToken;
      const response = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
      
      if (response.getResponseCode() === 200) {
        const ipInfo = JSON.parse(response.getContentText());
        country = ipInfo.country || "Unknown";
        asName = ipInfo.as_name || "Unknown";
      }
    } catch (err) {
      console.error("查詢 IP 失敗: " + ipAddress, err);
    }
  }

  /* 2. 計算唯一的流水號代碼 (例如第 2 列會產生 AQA-0001，第一列為表頭) */
  const nextRow = sheet.getLastRow() + 1;
  const rowNum = Math.max(1, nextRow - 1); // 扣除標題列計算數值
  const paddedNum = String(rowNum).padStart(4, '0'); // 自動補零至至少 4 位數
  const userCode = "AQA-" + paddedNum;

  /* 3. 寫入試算表 */
  sheet.appendRow([
    time,      // A欄
    text,      // B欄
    ipAddress, // C欄
    tag,       // D欄
    country,   // E欄
    asName,    // F欄
    userAgent, // G欄
    userCode   // H欄
  ]);

  /* 4. 將 status 與 userCode 包成 JSON 回傳給 Worker */
  return ContentService.createTextOutput(
    JSON.stringify({ status: 'ok', userCode: userCode })
  ).setMimeType(ContentService.MimeType.JSON);
}
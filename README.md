# DevBox - Developer Tools (Chrome Extension)

這是一個為開發者設計的多功能工具箱（All-in-one developer toolbox），包含**圖片格式轉換 (Image Converter)**、**批次重新命名 (Renamer)**、**SVG 優化 (SVG Optimizer)** 等多種實用工具。

本專案儲存庫（Repository）只包含已經建置（Build）完成的 Chrome 擴充功能檔案，您可以直接下載並手動安裝至 Chrome 瀏覽器中。

---

## 🚀 下載與安裝教學

您可以選擇使用 **[方式 A：下載 ZIP（適合一般使用者）](#方式-a下載-zip適合一般使用者)** 或 **[方式 B：Git Clone（適合開發者，便於日後更新）](#方式-bgit-clone適合開發者便於日後更新)** 來安裝此擴充功能：

### 方式 A：下載 ZIP（適合一般使用者）
1. 前往 GitHub 專案頁面：[devbox-tools](https://github.com/bbinvcd/devbox-tools.git)
2. 點擊右上角的綠色 **「Code」** 按鈕。
3. 在下拉選單中點擊 **「Download ZIP」**。
4. 下載完成後，將 ZIP 壓縮包解壓縮至您的電腦中（會得到一個 `devbox-tools-main` 資料夾，內含 `devBox-tools-dist` 目錄）。

---

### 方式 B：Git Clone（適合開發者，推薦）
1. 開啟終端機（Terminal）或命令提示字元。
2. 執行以下指令將專案 clone 到您的電腦：
   ```bash
   git clone https://github.com/bbinvcd/devbox-tools.git
   ```
3. Clone 完成後，您的電腦中會有一個 `devbox-tools` 資料夾（內含 `devBox-tools-dist` 目錄）。

---

### 🛠 載入擴充功能至 Chrome
1. 開啟您的 **Chrome 瀏覽器**。
2. 在網址列輸入 `chrome://extensions/` 並按下 Enter。
3. 在擴充功能頁面的右上角，將 **「開發者模式」 (Developer mode)** 切換為**開啟**狀態。
4. 點擊頁面左上角的 **「載入未封裝項目」 (Load unpacked)** 按鈕。
5. 在檔案選擇視窗中，選擇您剛剛下載/Clone 得到的 **`devBox-tools-dist`** 資料夾。
6. 點擊「選擇資料夾」或「確定」。

🎉 **恭喜您！安裝完成！** 
您現在可以在 Chrome 擴充功能清單中看到 **DevBox - Developer Tools**。

---

## 🔄 如何更新擴充功能

當本專案有新版本發布時，請依照您當初安裝的方式進行更新：

### 如果您是使用「方式 B：Git Clone」安裝（推薦）：
1. 開啟終端機並切換至專案根目錄下，執行更新指令：
   ```bash
   git pull
   ```
2. 開啟 Chrome 瀏覽器，進入 `chrome://extensions/` 頁面。
3. 點擊左上角的 **「更新」** 按鈕，即可立即套用最新版本！

### 如果您是使用「方式 A：下載 ZIP」安裝：
1. 重新至 GitHub 下載最新的 ZIP 檔案。
2. 將新下載的 ZIP 檔案解壓縮，並覆蓋原先的 `devBox-tools-dist` 資料夾。
3. 開啟 Chrome 瀏覽器，進入 `chrome://extensions/` 頁面。
4. 點擊左上角的 **「更新」** 按鈕，即可載入最新版本。

---

## 🛠 功能特點
* **Image Converter (圖片轉換)**：快速將圖片轉換為 WebP, PNG, JPG 等格式。
* **Renamer (批次命名)**：輕鬆自訂規則批次修改檔案名稱。
* **SVG Optimizer (SVG 優化)**：壓縮 SVG 程式碼，減少網頁載入負擔。
* **隨開即用**：不需連接外部伺服器，所有運算皆在您的瀏覽器本地端安全執行。

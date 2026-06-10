# Gemma 4 12B QAT + MTP 本地硬體加速部署指南 (macOS)

本文件記錄了在 Apple Silicon Mac (M1, 16GB RAM) 上，利用 `llama.cpp` 從無到有部署與優化 Google DeepMind 最新一代 **Gemma 4 12B QAT** 模型並啟用 **MTP (Multi-Token Prediction)** 雙模型推測解碼的完整過程、優化參數以及目前實驗性多模態的已知問題。

---

## 🚀 核心成果與加速數據

* **運行模式**：雙模型推測解碼（Speculative Decoding with MTP）
* **測試硬體**：Apple M1 (16GB 統一記憶體)
* **主模型**：`gemma-4-12B-it-QAT-Q4_0.gguf` (約 6.98 GB)
* **輔助模型 (MTP Drafter)**：`gemma-4-12B-it-qat-assistant-MTP-Q8_0.gguf` (約 465 MB)
* **推理生成速度**：**~12.68 tokens/second** （較未加速的 12B 模型速度提升近 **100%**）
* **MTP 採納率 (Draft Acceptance Rate)**：**~68.1%** （536 個推測 token 中有 365 個被採納）
* **系統負載**：記憶體佔用約 10.5 GB，載入時間僅 13 秒，運行非常流暢。

---

## 🛠 一鍵初始化與部署 (From Scratch)

我們在資料夾中生成了一個 [init_setup.sh](file:///Volumes/DATA/Downloads/gemma-4-qat-mtp-setup/init_setup.sh) 腳本，支持從無到有一鍵完成所有環境配置。

### 部署步驟
1. 確保您的 Mac 已安裝 **Homebrew**（若未安裝，腳本會提示引導）。
2. 在終端機執行初始化腳本：
   ```bash
   ./init_setup.sh
   ```
   **腳本將自動執行：**
   * 檢查並自動透過 Homebrew 安裝 `CMake`。
   * 克隆 `llama.cpp` 官方倉庫並更新至最新支援 Gemma 4 的主分支代碼。
   * 使用 CMake 在本地編譯主程式，並開啟 macOS 原生 **Accelerate** 與 **Metal** GPU 硬件加速。
   * 建立模型存放路徑。
   * 自動從 Hugging Face 下載 MTP 輔助模型。
   * 自動生成一鍵運行腳本 `run_gemma4_server.sh`。

3. **放置模型檔案**：
   請確保以下主模型與多模態投影檔已下載並手動放入模型路徑：
   * 檔案夾：[lm-studio/models/lmstudio-community/gemma-4-12B-it-QAT-GGUF](file:///Volumes/DATA/Downloads/lm-studio/models/lmstudio-community/gemma-4-12B-it-QAT-GGUF)
   * 檔案 1 (主模型)：`gemma-4-12B-it-QAT-Q4_0.gguf`
   * 檔案 2 (多模態投影檔)：`mmproj-gemma-4-12B-it-QAT-BF16.gguf`

4. **一鍵執行服務**：
   ```bash
   ./run_gemma4_server.sh
   ```

---

## 🔍 已知挑戰與技術優化

### ⚠️ 上下文大小限制（避免系統凍結）
Gemma 4 的預設上下文（Context Length）非常巨大（262k）。如果啟動時沒有限制大小，`llama.cpp` 會試圖在 Mac 記憶體中為這 262k 空間預配置極其龐大的 KV Cache。
* **優化解法**：在啟動指令中加上限制 `-c 4096`，將上下文長度固定在 4096，可大幅降低記憶體佔用至約 10.5 GB，從而防止 16GB 的 Mac 因記憶體不足進入 Severe Swap 狀態而當機。

### 🎙 語音辨識（Audio Input）實驗性問題記錄
在本次部署中，我們成功使伺服器加載多模態投影並順利吃進語音檔案，但**語音識別出的文字內容目前仍然不正確**。
* **當前狀態**：
  * 後端日誌顯示音訊解碼與特徵處理完全成功：`srv process_chun: audio processed in 23 ms`。
  * 前端已實現將音訊包裝成符合 OpenAI 標準的 `input_audio` 格式並自動注入 Gemma 4 所需的 `<|audio|>` 預留標記。
  * **但模型給出的回答在內容理解上仍存在偏差或錯誤**。
* **原因分析**：這是因為 `llama.cpp` 對於最新 Gemma 4 語音投影器（Voice Projector）的底層對齊算法仍在**高度實驗階段（Experimental Stage）**，對於部分 PCM 波形特徵的對應尚未完善。
* **後續追蹤**：這部分問題為後端底層開源庫的架構限制，我們暫時擱置，靜待 `llama.cpp` 官方未來的更新與演進，屆時只需再次執行 `./init_setup.sh` 更新並編譯 `llama.cpp` 即可。

---

## 💡 使用與管理指南

### 如何與執行中的模型對話？

#### 方法 A：在 LM Studio 內使用本地伺服器
1. 打開 **LM Studio**。
2. 點選左側選單的 **Local Server** 標籤。
3. 將端口設定為 `http://localhost:8080` 並啟用連線，即可透過 LM Studio 的聊天介面與該架構對話。

#### 方法 B：使用我們生成的網頁沙盒 (Multimodal Sandbox)
1. 在工作區中進入 [gemma-4-multimodal-chat](file:///Volumes/DATA/Downloads/gemma-4-multimodal-chat) 資料夾。
2. 執行 `./start.sh` 以在 `http://localhost:3001` 啟動前端網頁。
3. 在瀏覽器打開此網頁，即可進行包含文字對話、圖片上傳、麥克風錄音在內的多模態測試！此服務與網頁伺服器皆已綁定 `0.0.0.0`，因此局域網內的手機或其它電腦也能直接訪問連線。

### 如何關閉模型服務？
當您使用完畢，希望釋放系統記憶體時，請在終端機中執行：
```bash
killall llama-server
```

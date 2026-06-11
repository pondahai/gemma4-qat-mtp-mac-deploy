#!/bin/bash

# Gemma 4 QAT MTP 一鍵初始化部署腳本 (macOS)
# 本腳本旨在幫助使用者從無到有，在 Apple Silicon Mac 上下載、編譯與配置 llama.cpp 並運作 Gemma 4 雙模型加速服務。

set -e

# 顏色設定
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}=======================================================${NC}"
echo -e "${BLUE}  Gemma 4 12B QAT + MTP macOS 本地加速部署初始化腳本   ${NC}"
echo -e "${BLUE}=======================================================${NC}"

# 1. 檢查作業系統是否為 macOS
if [[ "$OSTYPE" != "darwin"* ]]; then
    echo -e "${RED}錯誤: 本腳本僅支援 macOS 系統！${NC}"
    exit 1
fi

# 2. 檢查必要工具
echo -e "\n${YELLOW}[步驟 1/5] 檢查系統依賴工具...${NC}"

# 檢查 Git
if ! command -v git &> /dev/null; then
    echo -e "${RED}錯誤: 未偵測到 git。請先安裝 Xcode Command Line Tools 或使用 Homebrew 安裝。${NC}"
    exit 1
else
    echo -e "${GREEN}✓ Git 已安裝${NC}"
fi

# 檢查 CMake
if ! command -v cmake &> /dev/null; then
    echo -e "${YELLOW}未偵測到 cmake。正在嘗試透過 Homebrew 安裝...${NC}"
    if ! command -v brew &> /dev/null; then
        echo -e "${RED}錯誤: 未偵測到 Homebrew。請手動安裝 CMake (https://cmake.org) 或安裝 Homebrew (https://brew.sh) 後再執行。${NC}"
        exit 1
    else
        brew install cmake
    fi
else
    echo -e "${GREEN}✓ CMake 已安裝 (${NC}$(cmake --version | head -n 1)${GREEN})${NC}"
fi

# 3. 克隆與更新 llama.cpp
echo -e "\n${YELLOW}[步驟 2/5] 獲取與更新 llama.cpp 源碼...${NC}"
TARGET_DIR="llama.cpp"

if [ ! -d "$TARGET_DIR" ]; then
    echo -e "正在克隆 llama.cpp 官方倉庫..."
    git clone https://github.com/ggml-org/llama.cpp.git "$TARGET_DIR"
    cd "$TARGET_DIR"
else
    echo -e "資料夾 $TARGET_DIR 已存在，正在拉取最新代碼..."
    cd "$TARGET_DIR"
    git fetch origin master
    git reset --hard origin/master
fi

echo -e "${GREEN}✓ llama.cpp 源碼已更新至最新主分支${NC}"

# 4. 編譯 llama.cpp (支援 Metal GPU 加速)
echo -e "\n${YELLOW}[步驟 3/5] 使用 CMake 編譯 llama.cpp (開啟 Metal GPU 支持)...${NC}"
mkdir -p build
cmake -B build
echo -e "開始編譯主程式 (llama-server 與 llama-cli)..."
cmake --build build --config Release -j$(sysctl -n hw.ncpu)

echo -e "${GREEN}✓ llama.cpp 編譯完成！可執行檔位於 build/bin/ 內${NC}"

# 5. 建立模型目錄結構並下載模型
echo -e "\n${YELLOW}[步驟 4/5] 建立模型目錄與準備模型檔案...${NC}"
cd ..

# 定義 LM Studio 目錄結構
MODEL_DIR="lm-studio/models/lmstudio-community/gemma-4-12B-it-QAT-GGUF"
mkdir -p "$MODEL_DIR"

MAIN_MODEL_FILE="$MODEL_DIR/gemma-4-12B-it-QAT-Q4_0.gguf"
MMPROJ_FILE="$MODEL_DIR/mmproj-gemma-4-12B-it-QAT-BF16.gguf"
ASSISTANT_FILE="$MODEL_DIR/gemma-4-12B-it-qat-assistant-MTP-Q8_0.gguf"

# 下載主模型
if [ ! -f "$MAIN_MODEL_FILE" ]; then
    echo -e "${YELLOW}主模型檔案不存在：$MAIN_MODEL_FILE${NC}"
    read -p "是否自動從 Hugging Face 下載 Gemma 4 12B IT QAT 主模型 (6.98 GB)? [y/N]: " download_main
    if [[ "$download_main" =~ ^[Yy]$ ]]; then
        echo "正在下載主模型 (6.98 GB)..."
        curl -L -C - -o "$MAIN_MODEL_FILE" "https://huggingface.co/lmstudio-community/gemma-4-12B-it-QAT-GGUF/resolve/main/gemma-4-12B-it-QAT-Q4_0.gguf"
        echo -e "${GREEN}✓ 主模型下載成功${NC}"
    else
        echo -e "${YELLOW}已跳過主模型下載，請事後手動放置檔案。${NC}"
    fi
else
    echo -e "${GREEN}✓ 主模型已存在，跳過下載${NC}"
fi

# 下載多模態投影檔
if [ ! -f "$MMPROJ_FILE" ]; then
    echo -e "${YELLOW}多模態投影檔不存在：$MMPROJ_FILE${NC}"
    read -p "是否自動從 Hugging Face 下載 Gemma 4 多模態投影檔 (175 MB)? [y/N]: " download_proj
    if [[ "$download_proj" =~ ^[Yy]$ ]]; then
        echo "正在下載多模態投影檔 (175 MB)..."
        curl -L -C - -o "$MMPROJ_FILE" "https://huggingface.co/lmstudio-community/gemma-4-12B-it-QAT-GGUF/resolve/main/mmproj-gemma-4-12B-it-QAT-BF16.gguf"
        echo -e "${GREEN}✓ 多模態投影檔下載成功${NC}"
    else
        echo -e "${YELLOW}已跳過多模態投影檔下載，請事後手動放置檔案。${NC}"
    fi
else
    echo -e "${GREEN}✓ 多模態投影檔已存在，跳過下載${NC}"
fi

# 下載 MTP 輔助模型
if [ ! -f "$ASSISTANT_FILE" ]; then
    echo -e "正在從 Hugging Face 下載 Gemma 4 12B IT QAT 專用 MTP 輔助模型 (約 465MB)..."
    curl -L -C - -o "$ASSISTANT_FILE" "https://huggingface.co/Janvitos/gemma-4-12B-it-qat-assistant-MTP-Q8_0-GGUF/resolve/main/gemma-4-12B-it-qat-assistant-MTP-Q8_0.gguf"
    echo -e "${GREEN}✓ 輔助模型下載成功${NC}"
else
    echo -e "${GREEN}✓ 輔助模型已存在，跳過下載${NC}"
fi

# 6. 生成一鍵啟動腳本
echo -e "\n${YELLOW}[步驟 5/5] 生成啟動服務腳本...${NC}"

RUN_SERVER_SH="run_gemma4_server.sh"
cat << 'EOF' > "$RUN_SERVER_SH"
#!/bin/bash

# 獲取指令所在目錄
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# 清理舊的殘留進程
echo "正在清理舊的 llama 進程..."
killall llama-server 2>/dev/null || true

echo "啟動 Gemma 4 12B QAT + MTP 伺服器中..."
echo "主模型: gemma-4-12B-it-QAT-Q4_0.gguf"
echo "多模態: mmproj-gemma-4-12B-it-QAT-BF16.gguf"
echo "輔助模型: gemma-4-12B-it-qat-assistant-MTP-Q8_0.gguf"
echo "上下文大小限制: 4096 (防止 16GB Mac 卡死)"
echo "-------------------------------------------------------"

# 啟動命令 (綁定 0.0.0.0 並開啟 GPU 加速與 MTP)
"$DIR/llama.cpp/build/bin/llama-server" \
  -m "$DIR/lm-studio/models/lmstudio-community/gemma-4-12B-it-QAT-GGUF/gemma-4-12B-it-QAT-Q4_0.gguf" \
  --model-draft "$DIR/lm-studio/models/lmstudio-community/gemma-4-12B-it-QAT-GGUF/gemma-4-12B-it-qat-assistant-MTP-Q8_0.gguf" \
  --spec-type draft-mtp \
  --spec-draft-n-max 4 \
  --mmproj "$DIR/lm-studio/models/lmstudio-community/gemma-4-12B-it-QAT-GGUF/mmproj-gemma-4-12B-it-QAT-BF16.gguf" \
  -ngl 99 \
  -ngld 99 \
  -c 4096 \
  -ub 1024 \
  -ctk q8_0 \
  -ctv q8_0 \
  --host 0.0.0.0
EOF

chmod +x "$RUN_SERVER_SH"

echo -e "${GREEN}✓ 啟動服務腳本 $RUN_SERVER_SH 生成完畢！${NC}"

echo -e "\n${GREEN}=======================================================${NC}"
echo -e "${GREEN}  部署就緒！請確認已將主模型放置於以下目錄中：         ${NC}"
echo -e "  [${MODEL_DIR}/gemma-4-12B-it-QAT-Q4_0.gguf]"
echo -e "  [${MODEL_DIR}/mmproj-gemma-4-12B-it-QAT-BF16.gguf]"
echo -e "  然後執行 ${BLUE}./${RUN_SERVER_SH}${NC} 即可一鍵運行伺服器！"
echo -e "${GREEN}=======================================================${NC}"

#!/bin/bash

# 清理舊的殘留進程
echo "正在清理舊的 llama-server 進程..."
killall llama-server 2>/dev/null || true

echo "啟動 Gemma 4 12B QAT + MTP 伺服器 (綁定 0.0.0.0)..."
echo "主模型: gemma-4-12B-it-QAT-Q4_0.gguf"
echo "多模態: mmproj-gemma-4-12B-it-QAT-BF16.gguf"
echo "輔助模型: gemma-4-12B-it-qat-assistant-MTP-Q8_0.gguf"
echo "上下文大小限制: 4096"
echo "-------------------------------------------------------"

/Volumes/DATA/Downloads/llama.cpp/build/bin/llama-server \
  -m /Volumes/DATA/Downloads/lm-studio/models/lmstudio-community/gemma-4-12B-it-QAT-GGUF/gemma-4-12B-it-QAT-Q4_0.gguf \
  --model-draft /Volumes/DATA/Downloads/lm-studio/models/lmstudio-community/gemma-4-12B-it-QAT-GGUF/gemma-4-12B-it-qat-assistant-MTP-Q8_0.gguf \
  --spec-type draft-mtp \
  --spec-draft-n-max 4 \
  --mmproj /Volumes/DATA/Downloads/lm-studio/models/lmstudio-community/gemma-4-12B-it-QAT-GGUF/mmproj-gemma-4-12B-it-QAT-BF16.gguf \
  -ngl 99 \
  -ngld 99 \
  -c 4096 \
  -ub 1024 \
  -np 1 \
  -ctk q8_0 \
  -ctv q8_0 \
  --host 0.0.0.0

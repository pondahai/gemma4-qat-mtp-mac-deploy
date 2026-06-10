#!/bin/bash
echo "啟動 Gemma 4 多模態網頁沙盒..."
echo "請在瀏覽器中打開: http://localhost:3001"
python3 -m http.server 3001 --directory /Volumes/DATA/Downloads/gemma-4-multimodal-chat --bind 0.0.0.0

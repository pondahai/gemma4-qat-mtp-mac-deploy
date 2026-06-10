#!/bin/bash
echo "啟動 Gemma 4 多模態網頁沙盒..."
echo "請在瀏覽器中打開: http://localhost:3001"

# 自動獲取腳本所在的目錄，確保路徑在移動資料夾後依然正確
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

python3 -m http.server 3001 --directory "$DIR" --bind 0.0.0.0

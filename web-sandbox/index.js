// 全域狀態
let chatHistory = [];
let attachedImageBase64 = null;
let attachedAudioBase64 = null;
let attachedAudioFormat = null; // "wav" 或 "mp3"
let mediaRecorder = null;
let audioChunks = [];
let recordStartTime = null;
let recordTimerInterval = null;

// HTML 元素
const serverUrlInput = document.getElementById('server-url');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');
const chatMessages = document.getElementById('chat-messages');
const textInput = document.getElementById('text-input');
const sendBtn = document.getElementById('send-btn');
const mediaUpload = document.getElementById('media-upload');
const recordBtn = document.getElementById('record-btn');
const recordPulse = document.getElementById('record-pulse');
const recordingTime = document.getElementById('recording-time');
const mediaPreviewContainer = document.getElementById('media-preview-container');
const imagePreview = document.getElementById('image-preview');
const audioPreviewContainer = document.getElementById('audio-preview-container');
const audioPreviewName = document.getElementById('audio-preview-name');
const audioPreviewPlayer = document.getElementById('audio-preview-player');
const removeMediaBtn = document.getElementById('remove-media-btn');
const thinkingContent = document.getElementById('thinking-content');

// 效能監控元素
const statSpeed = document.getElementById('stat-speed');
const statMtpRate = document.getElementById('stat-mtp-rate');
const statPromptTokens = document.getElementById('stat-prompt-tokens');
const statGenTokens = document.getElementById('stat-gen-tokens');
const timingList = document.getElementById('timing-list');

// 初始化
window.addEventListener('DOMContentLoaded', () => {
  // 自動偵測當前網頁的 Hostname / IP，將 llama-server 預設指向同一個主機的 8080 連接埠
  let currentHost = window.location.hostname || '127.0.0.1';
  if (currentHost === 'localhost') {
    currentHost = '127.0.0.1'; // 強制使用 IPv4 避開 macOS localhost 解析至 ::1 (IPv6) 的連線拒絕問題
  }
  serverUrlInput.value = `http://${currentHost}:8080`;
  serverUrlInput.placeholder = `http://${currentHost}:8080`;

  checkServerConnection();
  setInterval(checkServerConnection, 5000); // 每5秒檢查一次連線

  // 事件監聽
  textInput.addEventListener('input', handleTextInput);
  textInput.addEventListener('keydown', handleKeyDown);
  sendBtn.addEventListener('click', sendMessage);
  mediaUpload.addEventListener('change', handleMediaUpload);
  removeMediaBtn.addEventListener('click', clearAttachedMedia);
  recordBtn.addEventListener('click', toggleRecording);

  // 拖曳上傳支援
  const dropZone = document.querySelector('.left-section');
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.classList.remove('drag-over');
  });
  dropZone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    if (e.dataTransfer.files.length > 0) {
      processFile(e.dataTransfer.files[0]);
    }
  });
});

// 檢查伺服器連線狀態
async function checkServerConnection() {
  const serverUrl = serverUrlInput.value.trim();
  try {
    const res = await fetch(`${serverUrl}/health`);
    if (res.ok) {
      statusDot.className = 'status-indicator connected';
      statusText.textContent = '連線正常 (Gemma 4 Online)';
      return true;
    }
  } catch (err) {
    // 忽略連線失敗
  }
  statusDot.className = 'status-indicator';
  statusText.textContent = '連線中斷';
  return false;
}

// 處理文字輸入以啟用發送按鈕
function handleTextInput() {
  sendBtn.disabled = !textInput.value.trim() && !attachedImageBase64 && !attachedAudioBase64;
  
  // 自動調整高度
  textInput.style.height = 'auto';
  textInput.style.height = (textInput.scrollHeight - 16) + 'px';
}

function handleKeyDown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    if (!sendBtn.disabled) {
      sendMessage();
    }
  }
}

// 處理媒體上傳
function handleMediaUpload(e) {
  const file = e.target.files[0];
  if (file) {
    processFile(file);
  }
}

// 處理檔案並轉成 Base64
function processFile(file) {
  const reader = new FileReader();
  
  if (file.type.startsWith('image/')) {
    reader.onload = function(e) {
      attachedImageBase64 = e.target.result;
      attachedAudioBase64 = null;
      attachedAudioFormat = null;
      
      // 更新預覽
      imagePreview.src = attachedImageBase64;
      imagePreview.style.display = 'block';
      audioPreviewContainer.style.display = 'none';
      mediaPreviewContainer.style.display = 'block';
      
      handleTextInput();
    };
    reader.readAsDataURL(file);
  } 
  else if (file.type.startsWith('audio/') || file.name.endsWith('.wav') || file.name.endsWith('.mp3')) {
    const format = file.name.endsWith('.mp3') ? 'mp3' : 'wav';
    reader.onload = function(e) {
      const base64Data = e.target.result.split(',')[1];
      attachedAudioBase64 = base64Data;
      attachedImageBase64 = null;
      attachedAudioFormat = format;
      
      // 更新預覽
      audioPreviewName.textContent = `${file.name} (${format.toUpperCase()})`;
      audioPreviewPlayer.src = e.target.result;
      
      imagePreview.style.display = 'none';
      audioPreviewContainer.style.display = 'flex';
      mediaPreviewContainer.style.display = 'block';
      
      handleTextInput();
    };
    reader.readAsDataURL(file);
  } else {
    alert('僅支援圖片 (.jpg, .png 等) 或音檔 (.wav, .mp3)！');
  }
}

// 清除附加媒體
function clearAttachedMedia() {
  attachedImageBase64 = null;
  attachedAudioBase64 = null;
  attachedAudioFormat = null;
  
  mediaPreviewContainer.style.display = 'none';
  imagePreview.src = '';
  audioPreviewPlayer.src = '';
  mediaUpload.value = '';
  
  handleTextInput();
}

// 語音錄製邏輯
async function toggleRecording() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    // 停止錄音
    mediaRecorder.stop();
    recordBtn.classList.remove('recording');
    recordPulse.style.display = 'none';
    recordingTime.style.display = 'none';
    clearInterval(recordTimerInterval);
    return;
  }

  // 開始錄音
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    audioChunks = [];
    mediaRecorder = new MediaRecorder(stream);
    
    mediaRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) {
        audioChunks.push(e.data);
      }
    };

    mediaRecorder.onstop = async () => {
      // 停止所有麥克風軌道
      stream.getTracks().forEach(track => track.stop());

      const audioBlob = new Blob(audioChunks, { type: mediaRecorder.mimeType });
      
      // 將錄音解碼並轉換為標準的 16kHz 單聲道 16-bit PCM WAV
      try {
        statusText.textContent = '語音轉碼中 (WAV)...';
        const arrayBuffer = await audioBlob.arrayBuffer();
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const decodedBuffer = await audioCtx.decodeAudioData(arrayBuffer);
        
        // 轉為 WAV
        const wavBlob = bufferToWav(decodedBuffer);
        const reader = new FileReader();
        reader.onload = function(e) {
          attachedAudioBase64 = e.target.result.split(',')[1];
          attachedImageBase64 = null;
          attachedAudioFormat = 'wav';
          
          audioPreviewName.textContent = `錄音檔案.wav (WAV)`;
          audioPreviewPlayer.src = e.target.result;
          
          imagePreview.style.display = 'none';
          audioPreviewContainer.style.display = 'flex';
          mediaPreviewContainer.style.display = 'block';
          
          statusText.textContent = '語音載入完成';
          handleTextInput();
        };
        reader.readAsDataURL(wavBlob);
      } catch (err) {
        console.error('語音轉碼失敗:', err);
        alert('錄音轉換為 WAV 失敗，請重試！');
      }
    };

    mediaRecorder.start();
    recordStartTime = Date.now();
    recordBtn.classList.add('recording');
    recordPulse.style.display = 'block';
    recordingTime.style.display = 'block';
    recordingTime.textContent = '錄音中: 0.0s (最大 30s)';

    // 定時器
    recordTimerInterval = setInterval(() => {
      const elapsed = ((Date.now() - recordStartTime) / 1000).toFixed(1);
      recordingTime.textContent = `錄音中: ${elapsed}s (最大 30s)`;
      if (elapsed >= 30) {
        toggleRecording(); // 超過 30 秒自動停止
      }
    }, 100);

  } catch (err) {
    console.error('無法開啟麥克風:', err);
    alert('無法存取麥克風，請檢查權限設定！');
  }
}

// 標準 WAV 編碼器 (將 AudioBuffer 轉為 wav 格式 Blob)
function bufferToWav(buffer) {
  let numOfChan = buffer.numberOfChannels,
      length = buffer.length * numOfChan * 2 + 44,
      bufferArr = new ArrayBuffer(length),
      view = new DataView(bufferArr),
      channels = [], i, sample,
      offset = 0,
      pos = 0;

  // 寫入 WAV 檔頭
  setUint32(0x46464952);                         // "RIFF"
  setUint32(length - 8);                         // file length - 8
  setUint32(0x45564157);                         // "WAVE"

  setUint32(0x20746d66);                         // "fmt " chunk
  setUint32(16);                                 // chunk length
  setUint16(1);                                  // sample format (PCM)
  setUint16(numOfChan);
  setUint32(buffer.sampleRate);
  setUint32(buffer.sampleRate * 2 * numOfChan); // byte rate
  setUint16(numOfChan * 2);                      // block align
  setUint16(16);                                 // bits per sample

  setUint32(0x61746164);                         // "data" - chunk
  setUint32(length - pos - 4);                   // chunk length

  // 寫入音訊數據 (交錯寫入聲道)
  for(i=0; i<buffer.numberOfChannels; i++)
    channels.push(buffer.getChannelData(i));

  while(pos < length - 4) {
    for(i=0; i<numOfChan; i++) {
      sample = Math.max(-1, Math.min(1, channels[i][offset])); // 限制範圍
      sample = (sample < 0 ? sample * 0x8000 : sample * 0x7FFF); // 轉為 16-bit 有號整數
      view.setInt16(pos, sample, true);
      pos += 2;
    }
    offset++;
  }

  return new Blob([bufferArr], {type: "audio/wav"});

  function setUint16(data) {
    view.setUint16(pos, data, true);
    pos += 2;
  }

  function setUint32(data) {
    view.setUint32(pos, data, true);
    pos += 4;
  }
}

// 發送訊息給伺服器
async function sendMessage() {
  const text = textInput.value.trim();
  const serverUrl = serverUrlInput.value.trim();
  
  if (!text && !attachedImageBase64 && !attachedAudioBase64) return;

  // 鎖定輸入介面
  textInput.value = '';
  textInput.disabled = true;
  sendBtn.disabled = true;
  recordBtn.disabled = true;
  mediaUpload.disabled = true;
  
  // 清除思維鏈面板與效能狀態
  thinkingContent.innerHTML = '<div class="thinking-stream">模型思考中...</div>';
  statSpeed.textContent = '-';
  statMtpRate.textContent = '-';
  statPromptTokens.textContent = '-';
  statGenTokens.textContent = '-';
  timingList.innerHTML = '<div class="empty-state">等待本次推理時序...</div>';

  // 1. 在 UI 渲染使用者發送的訊息
  appendUserMessageToUI(text, attachedImageBase64, attachedAudioBase64, attachedAudioFormat);

  // 2. 準備 API 請求 payload
  let apiContent = [];

  // 如果有圖片，先附加圖片
  if (attachedImageBase64) {
    apiContent.push({
      type: "image_url",
      image_url: {
        url: attachedImageBase64
      }
    });
  }

  // 如果有音訊，附加音訊
  if (attachedAudioBase64) {
    apiContent.push({
      type: "input_audio",
      input_audio: {
        data: attachedAudioBase64,
        format: attachedAudioFormat
      }
    });
  }

  // 附加文字內容 (自動注入 Gemma 4 的多模態標記)
  let processedText = text;
  if (attachedImageBase64 && !processedText.includes('<|image|>')) {
    processedText = processedText ? processedText + '\n<|image|>' : '<|image|>';
  }
  if (attachedAudioBase64 && !processedText.includes('<|audio|>')) {
    processedText = processedText ? processedText + '\n<|audio|>' : '<|audio|>';
  }

  if (processedText) {
    apiContent.push({
      type: "text",
      text: processedText
    });
  }

  // 加入歷史紀錄並發送
  const userMessage = {
    role: "user",
    content: apiContent.length === 1 && apiContent[0].type === "text" ? processedText : apiContent
  };
  
  chatHistory.push(userMessage);

  // 3. 在 UI 上建立一個空的助理回覆框
  const assistantMsgEl = document.createElement('div');
  assistantMsgEl.className = 'message assistant';
  assistantMsgEl.innerHTML = `<div class="message-content"></div>`;
  chatMessages.appendChild(assistantMsgEl);
  chatMessages.parentElement.scrollTop = chatMessages.parentElement.scrollHeight;

  const contentEl = assistantMsgEl.querySelector('.message-content');
  let assistantResponseText = "";
  let assistantReasoningText = "";

  // 4. 清除暫存媒體
  clearAttachedMedia();

  // 5. 呼叫流式傳輸接口 (Streaming API)
  try {
    const response = await fetch(`${serverUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: "gemma4",
        messages: chatHistory,
        stream: true,
        max_tokens: 1024,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      throw new Error(`API 錯誤: ${response.statusText}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = "";

    while (true) {
      const { done, value } = await readChunkWithTimeout(reader);
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // 保留最後一條可能不完整的線

      for (const line of lines) {
        const cleanedLine = line.trim();
        if (!cleanedLine || !cleanedLine.startsWith('data:')) continue;

        const dataStr = cleanedLine.replace(/^data:\s*/, '');
        if (dataStr === '[DONE]') continue;

        try {
          const parsed = JSON.parse(dataStr);
          const delta = parsed.choices[0].delta;
          
          // 處理思維鏈
          if (delta.reasoning_content) {
            assistantReasoningText += delta.reasoning_content;
            thinkingContent.textContent = assistantReasoningText;
            thinkingContent.scrollTop = thinkingContent.scrollHeight;
          }
          
          // 處理正式回覆
          if (delta.content) {
            assistantResponseText += delta.content;
            contentEl.textContent = assistantResponseText;
            chatMessages.parentElement.scrollTop = chatMessages.parentElement.scrollHeight;
          }

          // 處理最後可能附帶的效能數據
          if (parsed.timings) {
            updatePerformanceStats(parsed.timings);
          }
        } catch (e) {
          // 忽略解析單行 JSON 失敗
        }
      }
    }

    // 儲存至歷史紀錄中
    chatHistory.push({
      role: "assistant",
      content: assistantResponseText
    });

  } catch (err) {
    console.error('發送失敗:', err);
    contentEl.innerHTML = `<span style="color:#ff5252;">⚠️ 連線或生成失敗。請確認本地 llama-server 是否運作正常。</span>`;
  } finally {
    // 釋放輸入介面
    textInput.disabled = false;
    recordBtn.disabled = false;
    mediaUpload.disabled = false;
    textInput.focus();
    handleTextInput();
  }
}

// 支援讀取讀寫超時防卡死
function readChunkWithTimeout(reader) {
  return Promise.race([
    reader.read(),
    new Promise((_, reject) => setTimeout(() => reject(new Error("讀取串流超時")), 60000))
  ]);
}

// 將使用者發送的訊息及媒體渲染到 UI
function appendUserMessageToUI(text, imageBase64, audioBase64, audioFormat) {
  const userMsgEl = document.createElement('div');
  userMsgEl.className = 'message user';
  
  let mediaHtml = '';
  if (imageBase64) {
    mediaHtml = `<div class="msg-media"><img src="${imageBase64}"></div>`;
  } else if (audioBase64) {
    const audioDataUrl = `data:audio/${audioFormat};base64,${audioBase64}`;
    mediaHtml = `<div class="msg-media"><audio src="${audioDataUrl}" controls></audio></div>`;
  }

  userMsgEl.innerHTML = `
    <div class="message-content">
      ${text ? `<div>${escapeHtml(text)}</div>` : ''}
      ${mediaHtml}
    </div>
  `;
  chatMessages.appendChild(userMsgEl);
  chatMessages.parentElement.scrollTop = chatMessages.parentElement.scrollHeight;
}

// 轉義 HTML 避免 XSS
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return text.replace(/[&<>'"]/g, (m) => map[m]);
}

// 更新效能監控儀表板
function updatePerformanceStats(timings) {
  if (!timings) return;

  // 生成速度
  if (timings.predicted_per_second) {
    statSpeed.textContent = timings.predicted_per_second.toFixed(2);
  }
  
  // Prompt 標記數
  if (timings.prompt_n) {
    const cachedText = timings.cache_n ? ` (快取: ${timings.cache_n})` : '';
    statPromptTokens.textContent = `${timings.prompt_n}${cachedText}`;
  }
  
  // 生成標記數
  if (timings.predicted_n) {
    statGenTokens.textContent = timings.predicted_n;
  }

  // MTP 接受率
  if (timings.draft_n && timings.draft_n_accepted !== undefined) {
    const percent = ((timings.draft_n_accepted / timings.draft_n) * 100).toFixed(1);
    statMtpRate.textContent = `${timings.draft_n_accepted}/${timings.draft_n} (${percent}%)`;
  }

  // 時序細節列表
  timingList.innerHTML = '';
  const timingItems = [
    { name: '載入與 Prompt 處理耗時', value: timings.prompt_ms ? `${timings.prompt_ms.toFixed(1)} ms` : '-' },
    { name: '每個 Prompt Token 耗時', value: timings.prompt_per_token_ms ? `${timings.prompt_per_token_ms.toFixed(2)} ms` : '-' },
    { name: '文字生成總耗時', value: timings.predicted_ms ? `${(timings.predicted_ms / 1000).toFixed(2)} 秒` : '-' },
    { name: '每個生成 Token 耗時', value: timings.predicted_per_token_ms ? `${timings.predicted_per_token_ms.toFixed(2)} ms` : '-' }
  ];

  timingItems.forEach(item => {
    const el = document.createElement('div');
    el.className = 'timing-item';
    el.innerHTML = `
      <span>${item.name}</span>
      <span class="timing-value">${item.value}</span>
    `;
    timingList.appendChild(el);
  });
}

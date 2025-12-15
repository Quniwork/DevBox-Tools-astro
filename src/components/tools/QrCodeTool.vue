<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Card } from '@/components/ui/card';
import Button from '@/components/ui/Button.vue';
import ToolButton from '@/components/ui/ToolButton.vue';
import DropZone from '@/components/ui/DropZone.vue';
import { Upload, Download, Copy, Check, Link, QrCode, Image as ImageIcon, RefreshCw, Trash2, Clock } from 'lucide-vue-next';
import jsQR from 'jsqr';
import QRCodeSVG from 'qrcode-svg';

// Initialize activeTab - always start with 'decode' to avoid hydration mismatch
// The correct tab will be set in onMounted based on URL hash
const activeTab = ref<'decode' | 'generate'>('decode');

// Decode state
const isDragging = ref(false);
const isScanning = ref(false);
const decodedResult = ref('');
const decodeError = ref(false);
const previewImage = ref('');
const decodeHistory = ref<Array<{ content: string; timestamp: string; isUrl: boolean }>>([]);

// Generate state
const inputUrl = ref('');
const generatedSvg = ref('');
const generatedDataUrl = ref(''); // Data URL for img display
const showCopied = ref(false);
const showDecodeCopied = ref(false);

const DECODE_HISTORY_KEY = 'qr_decode_history';
const MAX_HISTORY_ITEMS = 20;

// Update URL hash when tab changes
const setActiveTab = (tab: 'decode' | 'generate') => {
  activeTab.value = tab;

  // Only update URL hash in browser environment
  if (typeof window !== 'undefined') {
    const hash = tab === 'generate' ? '#production' : '#decode';
    window.history.replaceState(null, '', hash);
  }
};

// Load history on mount
onMounted(() => {
  loadDecodeHistory();

  // Sync with URL hash on client-side mount
  const hash = window.location.hash.slice(1);
  if (hash === 'production' || hash === 'generate') {
    activeTab.value = 'generate';
  } else if (hash === 'decode' || hash === '') {
    activeTab.value = 'decode';
  }
});

const loadDecodeHistory = () => {
  const stored = localStorage.getItem(DECODE_HISTORY_KEY);
  if (stored) {
    decodeHistory.value = JSON.parse(stored);
  }
};

const saveDecodeHistory = (content: string) => {
  // Remove duplicate if exists
  decodeHistory.value = decodeHistory.value.filter(item => item.content !== content);

  // Add new item at the beginning
  decodeHistory.value.unshift({
    content,
    timestamp: new Date().toISOString(),
    isUrl: /^(https?:\/\/|www\.)/i.test(content)
  });

  // Keep only latest items
  decodeHistory.value = decodeHistory.value.slice(0, MAX_HISTORY_ITEMS);

  // Save to localStorage
  localStorage.setItem(DECODE_HISTORY_KEY, JSON.stringify(decodeHistory.value));
};

const clearDecodeHistory = () => {
  decodeHistory.value = [];
  localStorage.removeItem(DECODE_HISTORY_KEY);
};

const removeHistoryItem = (index: number) => {
  decodeHistory.value.splice(index, 1);
  localStorage.setItem(DECODE_HISTORY_KEY, JSON.stringify(decodeHistory.value));
};

const copyHistoryItem = async (content: string) => {
  await navigator.clipboard.writeText(content);
};

const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();

  if (diff < 60000) return '剛剛';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時前`;
  return date.toLocaleDateString('zh-TW');
};

// Check if result is a URL
const isUrl = computed(() => {
  return /^(https?:\/\/|www\.)/i.test(decodedResult.value);
});

const resultUrl = computed(() => {
  let url = decodedResult.value;
  if (url.toLowerCase().startsWith('www.')) {
    url = 'https://' + url;
  }
  return url;
});

// File handling
const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0 && files[0].type.startsWith('image/')) {
    processFile(files[0]);
  }
};

const handleFileSelect = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    processFile(input.files[0]);
  }
};

// 處理 DropZone 傳入的檔案
const handleDropZoneFiles = (files: FileList) => {
  if (files.length > 0 && files[0].type.startsWith('image/')) {
    processFile(files[0]);
  }
};

const processFile = (file: File) => {
  const reader = new FileReader();
  reader.onload = (e) => {
    const result = e.target?.result as string;
    previewImage.value = result;
    isScanning.value = true;
    decodeError.value = false;
    decodedResult.value = '';

    const img = new Image();
    img.onload = () => decodeQRCode(img);
    img.src = result;
  };
  reader.readAsDataURL(file);
};

const decodeQRCode = (img: HTMLImageElement) => {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  setTimeout(() => {
    let code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert'
    });

    if (!code) {
      code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'attemptBoth'
      });
    }

    isScanning.value = false;

    if (code) {
      decodedResult.value = code.data;
      saveDecodeHistory(code.data);
    } else {
      decodeError.value = true;
    }
  }, 500);
};

const resetDecode = () => {
  previewImage.value = '';
  decodedResult.value = '';
  decodeError.value = false;
  isScanning.value = false;
};

const copyResult = async () => {
  await navigator.clipboard.writeText(decodedResult.value);
  showDecodeCopied.value = true;
  setTimeout(() => showDecodeCopied.value = false, 2000);
};

// Generate QR Code
const generateQR = () => {
  if (!inputUrl.value.trim()) return;

  try {
    const qr = new QRCodeSVG({
      content: inputUrl.value.trim(),
      width: 256,
      height: 256,
      color: '#000000',
      background: 'transparent',
      padding: 1,
      ecl: 'M'
    });

    const svgString = qr.svg();
    generatedSvg.value = svgString;

    // Revoke old URL to prevent memory leak
    if (generatedDataUrl.value) {
      URL.revokeObjectURL(generatedDataUrl.value);
    }

    // Convert SVG to data URL for img display (prevents dev tools crash)
    const blob = new Blob([svgString], { type: 'image/svg+xml' });
    generatedDataUrl.value = URL.createObjectURL(blob);
  } catch (error) {
    console.error('QR Code generation error:', error);
  }
};

const downloadSvg = () => {
  if (!generatedSvg.value) return;

  const blob = new Blob([generatedSvg.value], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'qrcode.svg';
  a.click();
  URL.revokeObjectURL(url);
};

const copySvg = async () => {
  await navigator.clipboard.writeText(generatedSvg.value);
  showCopied.value = true;
  setTimeout(() => showCopied.value = false, 2000);
};
</script>

<template>
  <div class="space-y-6">
    <!-- Tab Navigation -->
    <div class="flex gap-2 p-1 rounded-xl bg-secondary">
      <button
        @click="setActiveTab('decode')"
        :class="[
          'flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all',
          activeTab === 'decode'
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        ]"
      >
        <ImageIcon class="h-4 w-4" />
        解碼器
      </button>
      <button
        @click="setActiveTab('generate')"
        :class="[
          'flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all',
          activeTab === 'generate'
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        ]"
      >
        <QrCode class="h-4 w-4" />
        產生器
      </button>
    </div>

    <!-- Decode Tab -->
    <div v-show="activeTab === 'decode'" class="space-y-6">
      <!-- Top Row: Left Upload, Right Result -->
      <div class="grid gap-6 lg:grid-cols-2">
        <!-- Left: Upload Zone -->
        <DropZone
          v-if="!previewImage"
          accept="image/*"
          :multiple="false"
          title="上傳 QR Code 圖片"
          hint="支援 JPG、PNG、GIF、WebP"
          @files="handleDropZoneFiles"
        >
          <template #icon>
            <Upload class="h-6 w-6 text-muted-foreground" />
          </template>
        </DropZone>

        <!-- Preview Card -->
        <Card
          v-else
          class="relative border-dashed border-[#88C0D0] bg-card p-8 cursor-pointer transition-all flex flex-col justify-center items-center"
          @click="resetDecode"
        >
          <img :src="previewImage" class="max-h-56 mx-auto rounded-lg" alt="QR Preview" />
          <p class="text-xs text-muted-foreground mt-3">點擊重新上傳</p>
        </Card>

        <!-- Right: Decode Result -->
        <div class="flex flex-col">
          <!-- Success Result -->
          <Card v-if="decodedResult" class="border-border bg-card p-5 flex-1 flex flex-col">
            <div class="flex items-center justify-between mb-4">
              <div class="flex items-center gap-2">
                <div class="w-9 h-9 rounded-lg bg-chart-2/20 flex items-center justify-center">
                  <Check class="w-5 h-5 text-chart-2" />
                </div>
                <h3 class="text-base font-semibold text-foreground">解碼成功！</h3>
              </div>
              <button 
                @click="resetDecode" 
                title="清除"
                class="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
              >
                <Trash2 class="h-4 w-4" />
              </button>
            </div>

            <div class="bg-secondary/50 rounded-lg p-4 mb-4">
              <label class="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">解碼內容</label>
              <p class="text-foreground text-sm break-all leading-relaxed font-mono">{{ decodedResult }}</p>
            </div>

            <div class="flex gap-2">
              <Button v-if="isUrl" as="a" :href="resultUrl" target="_blank" variant="outline" class="flex-1 gap-2">
                <Link class="h-4 w-4" />
                開啟連結
              </Button>

              <Button @click="copyResult" class="flex-1 gap-2">
                <Check v-if="showDecodeCopied" class="h-4 w-4" />
                <Copy v-else class="h-4 w-4" />
                {{ showDecodeCopied ? '已複製' : '複製內容' }}
              </Button>
            </div>
          </Card>

          <!-- Error Result -->
          <Card v-else-if="decodeError" class="border-destructive/50 bg-card p-5 flex-1 flex flex-col justify-center">
            <div class="flex items-center gap-2 mb-4">
              <div class="w-9 h-9 rounded-lg bg-destructive/20 flex items-center justify-center">
                <span class="text-destructive text-lg">✕</span>
              </div>
              <h3 class="text-base font-semibold text-foreground">無法解碼</h3>
            </div>
            <p class="text-sm text-muted-foreground mb-4">無法識別圖片中的 QR Code，請確認圖片清晰且包含有效的 QR Code。</p>
            <Button @click="resetDecode" variant="outline" class="w-full gap-2">
              <RefreshCw class="h-4 w-4" />
              重新上傳
            </Button>
          </Card>

          <!-- Empty State -->
          <Card v-else class="border-border bg-card p-5 flex-1 flex flex-col justify-center">
            <div class="text-center py-8 text-muted-foreground">
              <QrCode class="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p class="text-sm">上傳圖片後，解碼結果將顯示在這裡</p>
            </div>
          </Card>
        </div>
      </div>

      <!-- Bottom: History Panel -->
      <Card class="border-border bg-card p-5">
        <div class="flex items-center justify-between mb-4">
          <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Clock class="h-4 w-4 text-muted-foreground" />
            歷史記錄
          </div>
          <ToolButton 
            v-if="decodeHistory.length > 0" 
            type="clear" 
            @click="clearDecodeHistory" 
          />
        </div>

        <div v-if="decodeHistory.length === 0" class="text-center py-6 text-muted-foreground">
          <p class="text-sm">尚無歷史記錄</p>
        </div>

        <div v-else class="grid gap-2 max-h-[300px] overflow-y-auto">
          <div
            v-for="(item, index) in decodeHistory"
            :key="index"
            class="group flex items-start gap-3 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
          >
            <div class="flex-1 min-w-0">
              <p class="text-sm text-foreground break-all line-clamp-2 font-mono">{{ item.content }}</p>
              <p class="text-xs text-gray-700 dark:text-gray-400 mt-1">{{ formatTime(item.timestamp) }}</p>
            </div>
            <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
              <button
                @click.stop="copyHistoryItem(item.content)"
                class="p-1.5 rounded-md hover:bg-card text-muted-foreground hover:text-foreground transition-colors"
                title="複製"
              >
                <Copy class="h-3.5 w-3.5" />
              </button>
              <button
                @click.stop="removeHistoryItem(index)"
                class="p-1.5 rounded-md hover:bg-card text-muted-foreground hover:text-destructive transition-colors"
                title="刪除"
              >
                <Trash2 class="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </Card>
    </div>

    <!-- Generate Tab -->
    <div v-show="activeTab === 'generate'" class="grid gap-6 lg:grid-cols-2">
      <!-- Input Panel (Left) -->
      <div class="flex flex-col gap-4">
        <Card class="border-border bg-card p-5 flex-1 flex flex-col">
          <label class="block text-sm font-semibold text-foreground mb-3">輸入內容</label>
          <textarea
            v-model="inputUrl"
            placeholder="輸入網址或文字..."
            class="w-full p-4 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm leading-relaxed resize-none transition-all font-mono flex-1"
          ></textarea>
        </Card>

        <Button @click="generateQR" class="w-full gap-2 bg-chart-2 hover:bg-chart-2/90 text-white" :disabled="!inputUrl.trim()">
          <QrCode class="h-4 w-4" />
          產生 QR Code
        </Button>
      </div>
      <!-- Preview Panel (Right) -->
      <div class="flex flex-col gap-4">
        <Card class="border-border bg-card p-5 flex-1 flex flex-col">
          <label class="block text-sm font-semibold text-foreground mb-4">預覽</label>

          <div
            :class="[
              'qr-preview rounded-xl border-2 border-dashed border-border p-6 flex-1 flex items-center justify-center',
              { 'qr-preview-generated': generatedSvg }
            ]"
          >
            <div v-if="generatedSvg" class="qr-container mx-auto">
              <img :src="generatedDataUrl" alt="Generated QR Code" class="qr-image" />
            </div>
            <div v-else class="text-center text-muted-foreground">
              <QrCode class="w-16 h-16 mx-auto mb-3 opacity-30" />
              <p class="text-sm">輸入內容後點擊產生</p>
            </div>
          </div>
        </Card>

        <!-- Actions -->
        <div v-if="generatedSvg" class="grid grid-cols-2 gap-3">
          <ToolButton 
            type="download" 
            label="下載 SVG"
            @click="downloadSvg"
          />
          <ToolButton 
            type="copy" 
            label="複製 SVG"
            :copied="showCopied"
            @click="copySvg"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.qr-preview {
  width: 100%;
  min-height: 200px;
  background-color: var(--card);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  transition: background-color 0.3s ease;
  margin: 0 auto;
}

.qr-preview-generated {
  background-color: #dfe1e8;
  background-image: linear-gradient(45deg, hsl(232.5deg 15% 86%) 25%, transparent 25%),
                    linear-gradient(-45deg, hsl(232.5deg 15% 86%) 25%, transparent 25%),
                    linear-gradient(45deg, transparent 75%, hsl(232.5deg 15% 86%) 75%),
                    linear-gradient(-45deg, transparent 75%, hsl(232.5deg 15% 86%) 75%);
}

.qr-container {
  display: flex;
  justify-content: center;
  align-items: center;
  width: 100%;
  max-width: 280px;
  aspect-ratio: 1;
  border-radius: 10px;
  overflow: hidden;
}

.qr-image {
  width: 100%;
  height: 100%;
  display: block;
  object-fit: contain;
}


.line-clamp-2 {
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

button {
  cursor: pointer;
}
</style>

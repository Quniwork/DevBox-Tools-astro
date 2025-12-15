<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Card } from '@/components/ui/card';
import Button from '@/components/ui/Button.vue';
import ToolButton from '@/components/ui/ToolButton.vue';
import DropZone from '@/components/ui/DropZone.vue';
import { Upload, Download, Trash2, RefreshCw, Layers, Image, X, Settings2, Check, FileCode } from 'lucide-vue-next';
import { formatSize, generateId, downloadAsZip, downloadBlob } from '@/composables/useFileUtils';

// ========================================
// 配置區 (CONFIG)
// ========================================
const CONFIG = {
  // 支援的輸出格式
  OUTPUT_FORMATS: [
    { value: 'image/webp', label: 'WebP', extension: 'webp', recommended: true, description: '最佳壓縮比， 大多支援' },
    { value: 'image/png', label: 'PNG', extension: 'png', recommended: false, description: '無損壓縮，支援透明背景' },
    { value: 'image/jpeg', label: 'JPG', extension: 'jpg', recommended: false, description: '有損壓縮，檔案較小' },
  ],
  // 支援的輸入格式
  ACCEPTED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'],
  ACCEPTED_EXTENSIONS: '.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif',
  // 預設品質 (0-1)
  DEFAULT_QUALITY: 0.85,
  // LocalStorage Keys
  STORAGE_KEY_FORMAT: 'image_converter_format',
  STORAGE_KEY_QUALITY: 'image_converter_quality',
  STORAGE_KEY_COMPRESS: 'image_converter_compress',
};

// ========================================
// 狀態
// ========================================
interface ImageItem {
  id: string;
  file: File;
  name: string;
  originalSize: number;
  originalUrl: string;
  convertedBlob: Blob | null;
  convertedUrl: string;
  convertedSize: number;
  status: 'pending' | 'converting' | 'done' | 'error';
  error?: string;
}

const items = ref<ImageItem[]>([]);
const isProcessing = ref(false);
const isDownloadingAll = ref(false);

// Modal 預覽狀態
const previewItem = ref<ImageItem | null>(null);
const previewMode = ref<'original' | 'converted'>('converted');
const isMounted = ref(false);

onMounted(() => {
  isMounted.value = true;
});

// 設定
const selectedFormat = ref(CONFIG.OUTPUT_FORMATS[0].value);
const enableCompress = ref(true);
const quality = ref(CONFIG.DEFAULT_QUALITY);

// 載入 localStorage 設定
if (typeof window !== 'undefined') {
  const savedFormat = localStorage.getItem(CONFIG.STORAGE_KEY_FORMAT);
  const savedQuality = localStorage.getItem(CONFIG.STORAGE_KEY_QUALITY);
  const savedCompress = localStorage.getItem(CONFIG.STORAGE_KEY_COMPRESS);
  
  if (savedFormat && CONFIG.OUTPUT_FORMATS.some(f => f.value === savedFormat)) {
    selectedFormat.value = savedFormat;
  }
  if (savedQuality !== null) {
    quality.value = parseFloat(savedQuality);
  }
  if (savedCompress !== null) {
    enableCompress.value = savedCompress === 'true';
  }
}

// ========================================
// 計算屬性
// ========================================
const currentFormatInfo = computed(() => {
  return CONFIG.OUTPUT_FORMATS.find(f => f.value === selectedFormat.value) || CONFIG.OUTPUT_FORMATS[0];
});

const totalOriginalSize = computed(() => 
  items.value.reduce((sum, item) => sum + item.originalSize, 0)
);

const totalConvertedSize = computed(() => 
  items.value.filter(item => item.status === 'done').reduce((sum, item) => sum + item.convertedSize, 0)
);

const totalSavings = computed(() => {
  if (totalOriginalSize.value === 0) return 0;
  const doneItems = items.value.filter(item => item.status === 'done');
  const originalSum = doneItems.reduce((sum, item) => sum + item.originalSize, 0);
  const convertedSum = doneItems.reduce((sum, item) => sum + item.convertedSize, 0);
  if (originalSum === 0) return 0;
  return Math.round(((originalSum - convertedSum) / originalSum) * 100);
});

const doneCount = computed(() => items.value.filter(item => item.status === 'done').length);

// ========================================
// 工具函式
// ========================================
// formatSize 和 generateId 已從 @/composables/useFileUtils 引入

// 儲存設定到 localStorage
const saveSettings = () => {
  if (typeof window !== 'undefined') {
    localStorage.setItem(CONFIG.STORAGE_KEY_FORMAT, selectedFormat.value);
    localStorage.setItem(CONFIG.STORAGE_KEY_QUALITY, String(quality.value));
    localStorage.setItem(CONFIG.STORAGE_KEY_COMPRESS, String(enableCompress.value));
  }
};

// ========================================
// 圖片轉換核心
// ========================================
const convertImage = async (item: ImageItem): Promise<void> => {
  return new Promise((resolve, reject) => {
    const img = new window.Image();
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('無法取得 Canvas context'));
          return;
        }
        
        // 如果輸出格式是 JPG，需要先填充白色背景（因為 JPG 不支援透明）
        if (selectedFormat.value === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        ctx.drawImage(img, 0, 0);
        
        // 決定品質參數
        const outputQuality = enableCompress.value ? quality.value : 1;
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              // 清理舊的 URL
              if (item.convertedUrl) {
                URL.revokeObjectURL(item.convertedUrl);
              }
              
              item.convertedBlob = blob;
              item.convertedUrl = URL.createObjectURL(blob);
              item.convertedSize = blob.size;
              item.status = 'done';
              resolve();
            } else {
              reject(new Error('轉換失敗'));
            }
          },
          selectedFormat.value,
          outputQuality
        );
      } catch (err) {
        reject(err);
      }
    };
    
    img.onerror = () => {
      reject(new Error('圖片載入失敗'));
    };
    
    img.src = item.originalUrl;
  });
};

// ========================================
// 檔案處理
// ========================================
const processFiles = async (files: FileList | File[]) => {
  const fileArray = Array.from(files);
  
  for (const file of fileArray) {
    // 驗證檔案類型
    if (!CONFIG.ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i)) {
      continue;
    }
    
    const item: ImageItem = {
      id: generateId(),
      file: file,
      name: file.name,
      originalSize: file.size,
      originalUrl: URL.createObjectURL(file),
      convertedBlob: null,
      convertedUrl: '',
      convertedSize: 0,
      status: 'pending',
    };
    
    items.value.push(item);
  }
  
  // 儲存設定
  saveSettings();
  
  // 自動開始轉換
  await processAllPending();
};

// 處理所有待處理項目
const processAllPending = async () => {
  isProcessing.value = true;
  
  for (const item of items.value) {
    if (item.status === 'pending') {
      item.status = 'converting';
      try {
        await convertImage(item);
      } catch (err: any) {
        item.status = 'error';
        item.error = err.message || '轉換失敗';
      }
    }
  }
  
  isProcessing.value = false;
};

// 重新轉換所有項目（當格式或品質改變時）
const reconvertAll = async () => {
  saveSettings();
  
  // 將所有 done 的項目重置為 pending
  for (const item of items.value) {
    if (item.status === 'done' || item.status === 'error') {
      // 清理舊的 converted URL
      if (item.convertedUrl) {
        URL.revokeObjectURL(item.convertedUrl);
        item.convertedUrl = '';
      }
      item.convertedBlob = null;
      item.convertedSize = 0;
      item.status = 'pending';
    }
  }
  
  await processAllPending();
};

// ========================================
// 項目操作
// ========================================
const removeItem = (id: string) => {
  const item = items.value.find(i => i.id === id);
  if (item) {
    // 清理 URL
    if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
    if (item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
  }
  items.value = items.value.filter(i => i.id !== id);
};

const clearAll = () => {
  // 清理所有 URL
  for (const item of items.value) {
    if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
    if (item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
  }
  items.value = [];
};

// 拖曳上傳處理
const isDraggingImage = ref(false);

const handleDragOverImage = (e: DragEvent) => {
  e.preventDefault();
  isDraggingImage.value = true;
};

const handleDragLeaveImage = () => {
  isDraggingImage.value = false;
};

const handleDropImage = (e: DragEvent) => {
  e.preventDefault();
  isDraggingImage.value = false;
  if (e.dataTransfer?.files) {
    processFiles(e.dataTransfer.files);
  }
};

const handleImageFileInput = (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (files) processFiles(files);
};

// 下載單一項目
const downloadItem = (item: ImageItem) => {
  if (!item.convertedBlob) return;
  
  const ext = currentFormatInfo.value.extension;
  const baseName = item.name.replace(/\.[^.]+$/, '');
  
  const url = URL.createObjectURL(item.convertedBlob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${baseName}.${ext}`;
  a.click();
  URL.revokeObjectURL(url);
};

// 下載全部（打包成 ZIP）
const downloadAll = async () => {
  const doneItems = items.value.filter(item => item.status === 'done' && item.convertedBlob);
  if (doneItems.length === 0) return;
  
  isDownloadingAll.value = true;
  
  try {
    // 動態載入 JSZip
    const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
    const zip = new JSZip();
    
    const ext = currentFormatInfo.value.extension;
    
    // 將每個圖片加入 ZIP
    for (const item of doneItems) {
      if (item.convertedBlob) {
        const baseName = item.name.replace(/\.[^.]+$/, '');
        zip.file(`${baseName}.${ext}`, item.convertedBlob);
      }
    }
    
    // 產生 ZIP 並下載
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.download = `converted-images-${date}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('ZIP 下載失敗:', error);
    // 如果 JSZip 載入失敗，改用逐一下載
    doneItems.forEach((item, index) => {
      setTimeout(() => downloadItem(item), index * 200);
    });
  } finally {
    isDownloadingAll.value = false;
  }
};

// ========================================
// 品質滑桿格式化
// ========================================
const qualityPercent = computed(() => Math.round(quality.value * 100));

// ========================================
// Modal 預覽
// ========================================
const openPreview = (item: ImageItem) => {
  previewItem.value = item;
  previewMode.value = item.status === 'done' ? 'converted' : 'original';
};

const closePreview = () => {
  previewItem.value = null;
};
</script>

<template>
  <div class="flex flex-col gap-4">

    <div class="flex flex-col md:flex-row gap-4">
      <!-- Settings Panel -->
      <Card class="p-4 space-y-4 md:flex-[2]">
        <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-3">
          <Settings2 class="h-4 w-4" />
          輸出格式
        </div>

        <div class="grid grid-cols-2 lg:grid-cols-3 gap-2">
          <button
            v-for="format in CONFIG.OUTPUT_FORMATS"
            :key="format.value"
            @click="selectedFormat = format.value; reconvertAll()"
            :class="[
              'relative flex flex-col items-start p-3 rounded-lg border-2 transition-all text-left',
              selectedFormat === format.value
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            ]"
          >
            <div class="flex items-center gap-2">
              <span class="font-semibold text-foreground">{{ format.label }}</span>
              <span 
                v-if="format.recommended" 
                class="text-[10px] px-1.5 py-0.5 rounded-full bg-chart-4/20 text-chart-4 font-medium"
              >
                推薦
              </span>
            </div>
            <span class="text-xs text-muted-foreground/80 mt-1">{{ format.description }}</span>
            <div 
              v-if="selectedFormat === format.value"
              class="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
            >
              <Check class="h-3 w-3 text-white" />
            </div>
          </button>
        </div>
      </Card>
  
      <Card class="p-4 space-y-4 md:flex-1">
        <div class="flex justify-between">
          <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-0">
            <FileCode class="h-4 w-4" />
            壓縮設定
          </div>
          <div class="flex items-center justify-between">
            <label class="flex items-center gap-2 cursor-pointer select-none">
              <input 
                type="checkbox" 
                v-model="enableCompress"
                @change="reconvertAll()"
                class="custom-checkbox"
              />
              <span class="text-sm text-foreground">啟用壓縮</span>
            </label>
          </div>
        </div>
  
        <!-- Compression Settings -->
 
          <div class="flex items-center justify-between text-sm mb-0">
            <span class="text-muted-foreground">品質</span>
            <span class="font-mono font-medium text-foreground">{{ qualityPercent }}%</span>
          </div>
          <input
            type="range"
            min="0.1"
            max="1"
            step="0.05"
            v-model.number="quality"
            @change="reconvertAll()"
            :disabled="!enableCompress"
            class="quality-slider w-full"
          />
          <div class="flex justify-between text-muted-foreground/60 text-xs text-muted-foreground">
            <span>檔案較小</span>
            <span>品質優先</span>
          </div>
          
          <!-- <p class="text-xs text-muted-foreground bg-secondary/50 rounded-lg p-2">
            {{ enableCompress ? '有損壓縮可大幅減少檔案大小，但可能略微降低畫質' : 'PNG 格式無損，其他格式將使用最高品質' }}
          </p> -->
      </Card>
    </div>


    <!-- Action Bar -->
    <div class="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-border bg-card p-4" v-if="items.length > 0">
      <div class="flex items-center gap-4 w-full sm:w-auto">
        <!-- 上傳按鈕 (支援拖曳) -->
        <div 
          class="relative group"
          @dragover="handleDragOverImage"
          @dragleave="handleDragLeaveImage"
          @drop="handleDropImage"
        >
          <input
            type="file"
            :accept="CONFIG.ACCEPTED_EXTENSIONS"
            multiple
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            @change="handleImageFileInput"
          />
          <Button 
            variant="outline" 
            class="w-full sm:w-auto gap-2"
            :class="isDraggingImage ? 'border-primary bg-primary/10' : ''"
          >
            <Upload class="h-4 w-4" />
            上傳圖片
          </Button>
        </div>
        
        <div class="flex items-center gap-4 text-sm">
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">共</span>
            <span class="font-medium text-foreground">{{ items.length }}</span>
            <span class="text-xs text-muted-foreground">個檔案</span>
          </div>
          <template v-if="doneCount > 0">
            <div class="h-4 w-px bg-border hidden sm:block"></div>
            <div class="flex items-center gap-2">
              <div class="text-xs text-muted-foreground">總計節省</div>
              <div class="font-medium font-mono text-chart-2">{{ formatSize(totalOriginalSize - totalConvertedSize) }}</div>
            </div>
            <div v-if="totalSavings !== 0" class="flex items-center">
              <span 
                class="rounded-full px-2 py-0.5 text-xs font-medium"
                :class="totalSavings > 0 ? 'bg-chart-2/20 text-chart-2' : 'bg-destructive/20 text-destructive'"
              >
                {{ totalSavings > 0 ? '-' : '+' }}{{ Math.abs(totalSavings) }}%
              </span>
            </div>
          </template>
        </div>
      </div>
      
      <div class="flex items-center gap-2 w-full sm:w-auto">
        <ToolButton 
          v-if="items.length > 0" 
          type="clear" 
          @click="clearAll" 
        />
        <ToolButton 
          v-if="doneCount > 0" 
          type="download" 
          label="下載全部"
          :loading="isDownloadingAll"
          @click="downloadAll"
        />
      </div>
    </div>

    <!-- Drop Zone (只在沒有檔案時顯示) -->
    <DropZone
      v-if="items.length === 0"
      :accept="CONFIG.ACCEPTED_EXTENSIONS"
      :multiple="true"
      title="批量上傳圖片進行轉換"
      subtitle="拖放圖片到這裡，或點擊選擇檔案"
      hint="支援 JPG、PNG、WebP、GIF、BMP、AVIF"
      @files="processFiles"
    >
      <template #icon>
        <Upload class="h-6 w-6 text-muted-foreground" />
      </template>
    </DropZone>

    <!-- Items List -->
    <div v-if="items.length > 0" class="space-y-2">
      <div 
        v-for="item in items" 
        :key="item.id"
        class="flex items-center gap-4 p-4 rounded-xl border border-border bg-card group"
      >
        <!-- Preview Thumbnail -->
        <div 
          class="w-14 h-14 rounded-lg overflow-hidden bg-secondary shrink-0 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
          @click="openPreview(item)"
          title="點擊預覽"
        >
          <img 
            :src="item.status === 'done' ? item.convertedUrl : item.originalUrl" 
            :alt="item.name"
            class="w-full h-full object-cover"
          />
        </div>

        <!-- File Info -->
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 mb-1">
            <Image class="h-4 w-4 text-muted-foreground shrink-0" />
            <span class="text-sm font-medium text-foreground truncate">{{ item.name }}</span>
            
            <!-- Status Badge -->
            <span 
              v-if="item.status === 'converting'"
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium flex items-center gap-1"
            >
              <RefreshCw class="h-3 w-3 animate-spin" />
              轉換中
            </span>
            <span 
              v-else-if="item.status === 'error'"
              class="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/20 text-destructive font-medium"
            >
              {{ item.error || '錯誤' }}
            </span>
          </div>
          
          <div class="flex items-center gap-3 text-xs text-muted-foreground">
            <span class="font-mono">{{ formatSize(item.originalSize) }}</span>
            <template v-if="item.status === 'done'">
              <span>→</span>
              <span class="font-mono" :class="item.convertedSize < item.originalSize ? 'text-chart-2' : 'text-destructive'">
                {{ formatSize(item.convertedSize) }}
              </span>
              <span 
                class="rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                :class="item.convertedSize < item.originalSize ? 'bg-chart-2/20 text-chart-2' : 'bg-destructive/20 text-destructive'"
              >
                {{ item.convertedSize < item.originalSize ? '-' : '+' }}{{ Math.abs(Math.round(((item.originalSize - item.convertedSize) / item.originalSize) * 100)) }}%
              </span>
            </template>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex items-center gap-1 shrink-0">
          <Button 
            v-if="item.status === 'done'"
            variant="ghost" 
            size="icon" 
            @click="downloadItem(item)"
            class="h-8 w-8"
            title="下載"
          >
            <Download class="h-4 w-4" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            @click="removeItem(item.id)"
            class="h-8 w-8 text-muted-foreground hover:text-destructive"
            title="移除"
          >
            <X class="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>

    <!-- Preview Modal (僅在客戶端 mounted 後渲染，避免 SSR hydration mismatch) -->
    <Teleport v-if="isMounted" to="body">
      <Transition name="modal">
        <div 
          v-if="previewItem" 
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
          @click.self="closePreview"
        >
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="closePreview"></div>
          
          <!-- Modal Content -->
          <div class="relative z-10 max-w-[90vw] max-h-[90vh] flex flex-col">
            <!-- Close Button -->
            <button 
              @click="closePreview"
              class="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
            >
              <X class="h-6 w-6" />
            </button>
            
            <!-- Image -->
            <div class="rounded-xl overflow-hidden bg-card shadow-2xl">
              <img 
                :src="previewMode === 'converted' && previewItem.status === 'done' ? previewItem.convertedUrl : previewItem.originalUrl" 
                :alt="previewItem.name"
                class="max-w-full max-h-[75vh] object-contain"
              />
            </div>
            
            <!-- Info Bar -->
            <div class="mt-3 flex items-center justify-between gap-4 px-1">
              <!-- File Name -->
              <div class="text-white text-sm font-medium truncate">
                {{ previewItem.name }}
              </div>
              
              <!-- Toggle Buttons (僅當有轉換結果時顯示) -->
              <div v-if="previewItem.status === 'done'" class="flex items-center gap-2 shrink-0">
                <button 
                  @click="previewMode = 'original'"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    previewMode === 'original' 
                      ? 'bg-white text-black' 
                      : 'bg-white/20 text-white hover:bg-white/30'
                  ]"
                >
                  原圖 {{ formatSize(previewItem.originalSize) }}
                </button>
                <button 
                  @click="previewMode = 'converted'"
                  :class="[
                    'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                    previewMode === 'converted' 
                      ? 'bg-chart-2 text-white' 
                      : 'bg-white/20 text-white hover:bg-white/30'
                  ]"
                >
                  轉換後 {{ formatSize(previewItem.convertedSize) }}
                  <span class="ml-1 opacity-80">(-{{ Math.round(((previewItem.originalSize - previewItem.convertedSize) / previewItem.originalSize) * 100) }}%)</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
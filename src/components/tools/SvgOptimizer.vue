<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { Card } from '@/components/ui/card';
import Button from '@/components/ui/Button.vue';
import ToolButton from '@/components/ui/ToolButton.vue';
import DropZone from '@/components/ui/DropZone.vue';
import { Upload, Download, Copy, RefreshCw, FileCode, Check, ArrowRight, Layers, File, X, DownloadCloud } from 'lucide-vue-next';
import { formatSize, generateId, downloadAsZip, downloadBlob } from '@/composables/useFileUtils';

// ========================================
// 共用狀態
// ========================================
const activeTab = ref<'single' | 'batch'>('single');

// ========================================
// 單一模式狀態
// ========================================
const inputSvg = ref('');
const outputSvg = ref('');
const outputDataUrl = ref(''); // Data URL for img display
const showCopied = ref(false);

// LocalStorage keys
const STORAGE_KEY_ENABLE_CLASS = 'svg_optimizer_enable_class';
const STORAGE_KEY_CLASS_NAME = 'svg_optimizer_class_name';

// Load settings from localStorage
const loadSettings = () => {
  const savedEnableClass = localStorage.getItem(STORAGE_KEY_ENABLE_CLASS);
  const savedClassName = localStorage.getItem(STORAGE_KEY_CLASS_NAME);
  
  if (savedEnableClass !== null) {
    enableClass.value = savedEnableClass === 'true';
  }
  if (savedClassName !== null) {
    className.value = savedClassName;
  }
};

// Options - load from localStorage on init
const enableClass = ref(true);
const className = ref('ele-logo-img');

// Load settings on component mount
if (typeof window !== 'undefined') {
  loadSettings();
}

const originalSize = computed(() => new Blob([inputSvg.value]).size);
const optimizedSize = computed(() => new Blob([outputSvg.value]).size);
const savings = computed(() => {
  if (originalSize.value === 0) return 0;
  return Math.round(((originalSize.value - optimizedSize.value) / originalSize.value) * 100);
});

// formatSize 已從 @/composables/useFileUtils 引入

const handleFileUpload = (event: Event) => {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  
  const reader = new FileReader();
  reader.onload = (e) => {
    inputSvg.value = e.target?.result as string;
    optimizeSvg();
  };
  reader.readAsText(file);
};

const optimizeSvg = async () => {
  if (!inputSvg.value) {
    outputSvg.value = '';
    return;
  }
  
  let svg = inputSvg.value;
  
  // 1. Basic compression: remove newlines and excess whitespace
  svg = svg.replace(/[\r\n]+/g, '');
  svg = svg.replace(/\s+/g, ' ');
  svg = svg.replace(/>\s+</g, '><');
  
  // 2. Handle Class Name
  if (enableClass.value && className.value.trim()) {
    // Remove old class first to avoid duplicates
    svg = svg.replace(/\sclass="[^"]*"/gi, '');
    // Insert new class after <svg
    svg = svg.replace('<svg', `<svg class="${className.value.trim()}" `);
    // Clean up double spaces
    svg = svg.replace(/\s+/g, ' ');
    // Remove space before >
    svg = svg.replace(/\s>/g, '>');
  }
  
  outputSvg.value = svg.trim();
  
  // Convert SVG to data URL for img display (prevents dev tools crash)
  if (svg.trim()) {
    const blob = new Blob([svg.trim()], { type: 'image/svg+xml' });
    // Revoke old URL to prevent memory leak
    if (outputDataUrl.value) {
      URL.revokeObjectURL(outputDataUrl.value);
    }
    outputDataUrl.value = URL.createObjectURL(blob);
  } else {
    outputDataUrl.value = '';
  }
};

// Watch for option changes and re-process
watch([enableClass, className], () => {
  if (inputSvg.value) {
    optimizeSvg();
  }
  
  // Save settings to localStorage
  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_ENABLE_CLASS, String(enableClass.value));
    localStorage.setItem(STORAGE_KEY_CLASS_NAME, className.value);
  }
});

const copyToClipboard = async () => {
  await navigator.clipboard.writeText(outputSvg.value);
  showCopied.value = true;
  setTimeout(() => showCopied.value = false, 2000);
};

const downloadSvg = () => {
  const blob = new Blob([outputSvg.value], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'optimized.svg';
  a.click();
  URL.revokeObjectURL(url);
};

const clearAll = () => {
  inputSvg.value = '';
  outputSvg.value = '';
  
  // Revoke data URL to prevent memory leak
  if (outputDataUrl.value) {
    URL.revokeObjectURL(outputDataUrl.value);
    outputDataUrl.value = '';
  }
};

// 拖曳上傳處理
const isDraggingSingle = ref(false);

const handleDragOverSingle = (e: DragEvent) => {
  e.preventDefault();
  isDraggingSingle.value = true;
};

const handleDragLeaveSingle = () => {
  isDraggingSingle.value = false;
};

const handleDropSingle = (e: DragEvent) => {
  e.preventDefault();
  isDraggingSingle.value = false;
  const file = e.dataTransfer?.files?.[0];
  if (file && (file.name.endsWith('.svg') || file.type === 'image/svg+xml')) {
    const reader = new FileReader();
    reader.onload = (ev) => {
      inputSvg.value = ev.target?.result as string;
      optimizeSvg();
    };
    reader.readAsText(file);
  }
};

// ========================================
// 批量模式狀態
// ========================================
interface BatchItem {
  id: string;
  name: string;
  original: string;
  optimized: string;
  originalSize: number;
  optimizedSize: number;
  savings: number;
  previewUrl: string;
}

const batchItems = ref<BatchItem[]>([]);
const batchShowCopied = ref<string | null>(null); // 追蹤哪個項目顯示已複製

// Modal 預覽狀態
const batchPreviewItem = ref<BatchItem | null>(null);
const isMounted = ref(false);

onMounted(() => {
  isMounted.value = true;
});

const openBatchPreview = (item: BatchItem) => {
  batchPreviewItem.value = item;
};

const closeBatchPreview = () => {
  batchPreviewItem.value = null;
};

// 批量處理：壓縮單一 SVG（不添加 class）
const optimizeSvgBatch = (svg: string): string => {
  // 1. Basic compression: remove newlines and excess whitespace
  svg = svg.replace(/[\r\n]+/g, '');
  svg = svg.replace(/\s+/g, ' ');
  svg = svg.replace(/>\s+</g, '><');
  // Remove space before >
  svg = svg.replace(/\s>/g, '>');
  return svg.trim();
};

// 處理多個檔案
const processBatchFiles = async (files: FileList) => {
  for (const file of Array.from(files)) {
    if (file.name.endsWith('.svg') || file.type === 'image/svg+xml') {
      const text = await file.text();
      const optimized = optimizeSvgBatch(text);
      const originalSize = new Blob([text]).size;
      const optimizedSize = new Blob([optimized]).size;
      
      // 產生預覽 URL
      const previewBlob = new Blob([optimized], { type: 'image/svg+xml' });
      const previewUrl = URL.createObjectURL(previewBlob);
      
      batchItems.value.push({
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: file.name,
        original: text,
        optimized: optimized,
        originalSize: originalSize,
        optimizedSize: optimizedSize,
        savings: originalSize > 0 ? Math.round(((originalSize - optimizedSize) / originalSize) * 100) : 0,
        previewUrl: previewUrl
      });
    }
  }
};

// 移除單一項目
const removeBatchItem = (id: string) => {
  const item = batchItems.value.find(i => i.id === id);
  if (item && item.previewUrl) {
    URL.revokeObjectURL(item.previewUrl);
  }
  batchItems.value = batchItems.value.filter(item => item.id !== id);
};

// 清空所有批量項目
const clearBatchItems = () => {
  // 清理所有預覽 URL
  for (const item of batchItems.value) {
    if (item.previewUrl) {
      URL.revokeObjectURL(item.previewUrl);
    }
  }
  batchItems.value = [];
};

// 批量模式拖曳上傳處理
const isDraggingBatch = ref(false);

const handleDragOverBatch = (e: DragEvent) => {
  e.preventDefault();
  isDraggingBatch.value = true;
};

const handleDragLeaveBatch = () => {
  isDraggingBatch.value = false;
};

const handleDropBatch = (e: DragEvent) => {
  e.preventDefault();
  isDraggingBatch.value = false;
  if (e.dataTransfer?.files) {
    processBatchFiles(e.dataTransfer.files);
  }
};

const handleBatchFileInput = (e: Event) => {
  const files = (e.target as HTMLInputElement).files;
  if (files) processBatchFiles(files);
};

// 複製單一項目
const copyBatchItem = async (item: BatchItem) => {
  await navigator.clipboard.writeText(item.optimized);
  batchShowCopied.value = item.id;
  setTimeout(() => batchShowCopied.value = null, 1500);
};

// 下載單一項目
const downloadBatchItem = (item: BatchItem) => {
  const blob = new Blob([item.optimized], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = item.name;
  a.click();
  URL.revokeObjectURL(url);
};

// 複製全部（合併成一個文字）
const copyAllBatch = async () => {
  const allSvgs = batchItems.value.map(item => `<!-- ${item.name} -->\n${item.optimized}`).join('\n\n');
  await navigator.clipboard.writeText(allSvgs);
  batchShowCopied.value = 'all';
  setTimeout(() => batchShowCopied.value = null, 2000);
};

// 下載全部（打包成 ZIP）
const isDownloadingAll = ref(false);
const downloadAllBatch = async () => {
  if (batchItems.value.length === 0) return;
  
  isDownloadingAll.value = true;
  
  try {
    // 動態載入 JSZip
    const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
    const zip = new JSZip();
    
    // 將每個 SVG 加入 ZIP
    batchItems.value.forEach(item => {
      zip.file(item.name, item.optimized);
    });
    
  // 產生 ZIP 並下載
    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    // 檔名格式：optimized-svgs-20251211.zip
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.download = `optimized-svgs-${date}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('ZIP 下載失敗:', error);
    // 如果 JSZip 載入失敗，改用逐一下載
    batchItems.value.forEach((item, index) => {
      setTimeout(() => downloadBatchItem(item), index * 200);
    });
  } finally {
    isDownloadingAll.value = false;
  }
};

// 批量統計
const batchTotalOriginalSize = computed(() => 
  batchItems.value.reduce((sum, item) => sum + item.originalSize, 0)
);
const batchTotalOptimizedSize = computed(() => 
  batchItems.value.reduce((sum, item) => sum + item.optimizedSize, 0)
);
const batchTotalSavings = computed(() => {
  if (batchTotalOriginalSize.value === 0) return 0;
  return Math.round(((batchTotalOriginalSize.value - batchTotalOptimizedSize.value) / batchTotalOriginalSize.value) * 100);
});
</script>

<template>
  <div class="space-y-4">
    <!-- Tab Navigation -->
    <div class="flex gap-2 p-1 rounded-xl bg-secondary">
      <button
        @click="activeTab = 'single'"
        :class="[
          'flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all',
          activeTab === 'single'
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        ]"
      >
        <File class="h-4 w-4" />
        單一模式
      </button>
      <button
        @click="activeTab = 'batch'"
        :class="[
          'flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all',
          activeTab === 'batch'
            ? 'bg-card text-foreground shadow-sm'
            : 'text-muted-foreground hover:text-foreground'
        ]"
      >
        <Layers class="h-4 w-4" />
        批量模式
      </button>
    </div>

    <!-- ========================================
         單一模式
         ======================================== -->
    <div v-show="activeTab === 'single'" class="space-y-4">
      <!-- Action Bar -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div class="flex items-center gap-4 w-full sm:w-auto">
          <div 
            class="relative group"
            @dragover="handleDragOverSingle"
            @dragleave="handleDragLeaveSingle"
            @drop="handleDropSingle"
          >
            <input
              type="file"
              accept=".svg"
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              @change="handleFileUpload"
            />
            <Button 
              variant="outline" 
              class="w-full sm:w-auto gap-2"
              :class="isDraggingSingle ? 'border-primary bg-primary/10' : ''"
            >
              <Upload class="h-4 w-4" />
              上傳 SVG
            </Button>
          </div>
          <div class="h-4 w-px bg-border hidden sm:block"></div>
          <div v-if="originalSize > 0" class="flex gap-4 text-sm">
            <div class="flex flex-col">
              <span class="text-xs text-muted-foreground">原始大小</span>
              <span class="font-medium font-mono text-foreground">{{ formatSize(originalSize) }}</span>
            </div>
            <ArrowRight class="h-4 w-4 text-muted-foreground my-auto" />
            <div class="flex flex-col">
              <span class="text-xs text-muted-foreground">優化後</span>
              <span class="font-medium font-mono text-chart-2">{{ formatSize(optimizedSize) }}</span>
            </div>
            <div v-if="savings > 0" class="flex items-center">
              <span class="rounded-full bg-chart-2/20 px-2 py-0.5 text-xs font-medium text-chart-2">
                -{{ savings }}%
              </span>
            </div>
          </div>
        </div>
        
        <div class="flex items-center gap-2 w-full sm:w-auto">
          <ToolButton 
            v-if="inputSvg" 
            type="clear" 
            label="清除"
            @click="clearAll" 
          />
          <ToolButton 
            v-if="outputSvg" 
            type="copy" 
            label="複製代碼"
            :copied="showCopied"
            @click="copyToClipboard"
          />
          <ToolButton 
            v-if="outputSvg" 
            type="download" 
            label="下載 SVG"
            @click="downloadSvg"
          />
        </div>
      </div>

      <!-- Main Editor Area -->
      <div class="grid gap-4 lg:grid-cols-2 h-[500px]">
        <!-- Input -->
        <Card class="flex flex-col overflow-hidden border-border bg-card">
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <FileCode class="h-4 w-4" />
              原始 SVG 原始碼
            </div>
          </div>
          <textarea
            v-model="inputSvg"
            @input="optimizeSvg"
            placeholder="請貼上 SVG 程式碼..."
            class="flex-1 resize-none border-0 bg-transparent p-4 font-mono text-xs leading-relaxed outline-none text-foreground placeholder:text-muted-foreground"
          ></textarea>
          
          <!-- Add Class Option -->
          <div class="border-t border-border px-4 py-3">
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  v-model="enableClass"
                  class="custom-checkbox"
                />
                <span class="text-sm text-foreground whitespace-nowrap">添加 Class</span>
              </label>
              <input 
                type="text" 
                v-model="className"
                :disabled="!enableClass"
                placeholder="輸入 class 名稱"
                class="flex-1 px-3 py-1.5 text-sm rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              />
            </div>
          </div>
        </Card>

        <!-- Output Preview -->
        <Card class="flex flex-col overflow-hidden border-border bg-card">
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                <path d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
              </svg>
              整理結果
            </div>
            <span v-if="showCopied" class="text-xs text-primary transition-opacity">已複製到剪貼簿</span>
          </div>
          
          <div class="flex flex-1 flex-col overflow-hidden">
            <!-- Preview Box -->
            <div class="flex flex-1 items-center justify-center p-6 bg-secondary/30 overflow-hidden min-h-[200px]">
              <div v-if="outputSvg" class="svg-preview-container flex items-center justify-center">
                <img :src="outputDataUrl" alt="Optimized SVG Preview" class="svg-preview-image" />
              </div>
              <div v-else class="text-sm text-muted-foreground">
                尚無預覽
              </div>
            </div>
            
            <!-- Code Preview -->
            <div class="flex-1 border-t border-border bg-background p-4 min-h-[150px]">
              <div class="h-full overflow-auto font-mono text-xs text-foreground leading-relaxed">
                {{ outputSvg || '結果將顯示於此...' }}
              </div>
            </div>
          </div>
        </Card>
      </div>
    </div>

    <!-- ========================================
         批量模式
         ======================================== -->
    <div v-show="activeTab === 'batch'" class="space-y-4">
      
      <!-- Drop Zone (只在沒有檔案時顯示) -->
      <DropZone
        v-if="batchItems.length === 0"
        accept=".svg"
        :multiple="true"
        title="批量上傳 SVG 檔案"
        subtitle="拖放多個 SVG 檔案到這裡，或點擊選擇"
        hint="自動壓縮，不添加 class"
        @files="processBatchFiles"
      >
        <template #icon>
          <Upload class="h-6 w-6 text-muted-foreground" />
        </template>
      </DropZone>

      <!-- Action Bar -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-border bg-card p-4" v-if="batchItems.length > 0">
        <div class="flex items-center gap-4 w-full sm:w-auto">
          <!-- 上傳按鈕 (支援拖曳) -->
          <div 
            class="relative group"
            @dragover="handleDragOverBatch"
            @dragleave="handleDragLeaveBatch"
            @drop="handleDropBatch"
          >
            <input
              type="file"
              accept=".svg"
              multiple
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
              @change="handleBatchFileInput"
            />
            <Button 
              variant="outline" 
              class="w-full sm:w-auto gap-2"
              :class="isDraggingBatch ? 'border-primary bg-primary/10' : ''"
            >
              <Upload class="h-4 w-4" />
              上傳 SVG
            </Button>
          </div>
          
          <div class="flex gap-4 text-sm">
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground">共</span>
              <span class="font-medium text-foreground">{{ batchItems.length }}</span>
              <span class="text-xs text-muted-foreground">個檔案</span>
            </div>
            <div class="h-4 w-px bg-border"></div>
            <div class="flex items-center gap-2">
              <span class="text-xs text-muted-foreground">總計節省</span>
              <span class="font-medium font-mono text-chart-2">{{ formatSize(batchTotalOriginalSize - batchTotalOptimizedSize) }}</span>
            </div>
            <div v-if="batchTotalSavings !== 0" class="flex items-center">
              <span 
                class="rounded-full px-2 py-0.5 text-xs font-medium"
                :class="batchTotalSavings > 0 ? 'bg-chart-2/20 text-chart-2' : 'bg-destructive/20 text-destructive'"
              >
                {{ batchTotalSavings > 0 ? '-' : '' }}{{ Math.abs(batchTotalSavings) }}%
              </span>
            </div>
          </div>
        </div>
        
        <div class="flex items-center gap-2 w-full sm:w-auto">
          <ToolButton 
            v-if="batchItems.length > 0" 
            type="clear" 
            @click="clearBatchItems" 
          />
          <ToolButton 
            v-if="batchItems.length > 0" 
            type="copy" 
            label="複製全部"
            :copied="batchShowCopied === 'all'"
            @click="copyAllBatch"
          />
          <ToolButton 
            v-if="batchItems.length > 0" 
            type="download" 
            label="下載全部"
            :loading="isDownloadingAll"
            @click="downloadAllBatch"
          />
        </div>
      </div>

      <!-- Batch Items List -->
      <div v-if="batchItems.length > 0" class="space-y-2">
        <div 
          v-for="item in batchItems" 
          :key="item.id"
          class="flex items-center gap-4 p-4 rounded-xl border border-border bg-card group"
        >
          <!-- Preview Thumbnail -->
          <div 
            class="w-14 h-14 rounded-lg overflow-hidden bg-secondary shrink-0 flex items-center justify-center cursor-pointer hover:ring-2 hover:ring-primary/50 transition-all"
            @click="openBatchPreview(item)"
            title="點擊預覽"
          >
            <img 
              :src="item.previewUrl" 
              :alt="item.name"
              class="w-full h-full object-contain p-1"
            />
          </div>

          <!-- File Info -->
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2 mb-1">
              <FileCode class="h-4 w-4 text-muted-foreground shrink-0" />
              <span class="text-sm font-medium text-foreground truncate">{{ item.name }}</span>
            </div>
            <div class="flex items-center gap-3 text-xs text-muted-foreground">
              <span class="font-mono">{{ formatSize(item.originalSize) }}</span>
              <ArrowRight class="h-3 w-3" />
              <span class="font-mono text-chart-2">{{ formatSize(item.optimizedSize) }}</span>
              <span class="rounded-full bg-chart-2/20 px-1.5 py-0.5 text-[10px] font-medium text-chart-2">
                -{{ item.savings }}%
              </span>
            </div>
          </div>

          <!-- Actions -->
          <div class="flex items-center gap-1 shrink-0">
            <Button 
              variant="ghost" 
              size="icon" 
              @click="copyBatchItem(item)"
              class="h-8 w-8"
              title="複製"
            >
              <Check v-if="batchShowCopied === item.id" class="h-4 w-4 text-chart-2" />
              <Copy v-else class="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              @click="downloadBatchItem(item)"
              class="h-8 w-8"
              title="下載"
            >
              <Download class="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="icon" 
              @click="removeBatchItem(item.id)"
              class="h-8 w-8 text-muted-foreground hover:text-destructive"
              title="移除"
            >
              <X class="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>

    <!-- SVG Preview Modal (僅在客戶端 mounted 後渲染) -->
    <Teleport v-if="isMounted" to="body">
      <Transition name="modal">
        <div 
          v-if="batchPreviewItem" 
          class="fixed inset-0 z-50 flex items-center justify-center p-4"
          @click.self="closeBatchPreview"
        >
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="closeBatchPreview"></div>
          
          <!-- Modal Content -->
          <div class="relative z-10 max-w-[90vw] max-h-[90vh] flex flex-col">
            <!-- Close Button -->
            <button 
              @click="closeBatchPreview"
              class="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
            >
              <X class="h-6 w-6" />
            </button>
            
            <!-- SVG Image -->
            <div class="rounded-xl overflow-hidden bg-card shadow-2xl">
              <img 
                :src="batchPreviewItem.previewUrl" 
                :alt="batchPreviewItem.name"
                class="max-w-full max-h-[75vh] object-contain p-4"
              />
            </div>
            
            <!-- Info Bar -->
            <div class="mt-3 flex items-center justify-between gap-4 px-1">
              <!-- File Name -->
              <div class="text-white text-sm font-medium truncate">
                {{ batchPreviewItem.name }}
              </div>
              
              <!-- Size Info -->
              <div class="flex items-center gap-2 shrink-0">
                <div class="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/20 text-white">
                  原始 {{ formatSize(batchPreviewItem.originalSize) }}
                </div>
                <div class="px-3 py-1.5 rounded-lg text-xs font-medium bg-chart-2 text-white">
                  優化後 {{ formatSize(batchPreviewItem.optimizedSize) }}
                  <span class="ml-1 opacity-80">(-{{ batchPreviewItem.savings }}%)</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
/* 共用樣式已移至 @/styles/components.css */
/* .custom-checkbox, .svg-preview-*, .modal-* 等樣式現在是全域的 */

button {
  cursor: pointer;
}
</style>

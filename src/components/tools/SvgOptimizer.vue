<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue';
import { Card, CardContent } from '@/components/ui/card';
import Button from '@/components/ui/Button.vue';
import ToolButton from '@/components/ui/ToolButton.vue';
import { Upload, Download, Copy, RefreshCw, FileCode, Check, ArrowRight, Layers, File, X, Loader2, FolderSearch, Trash2, CheckCircle2 } from 'lucide-vue-next';
import { formatSize, generateId } from '@/composables/useFileUtils';

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
      <!-- Action Bar (Consistent Style) -->
      <div class="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div class="flex items-center gap-3 w-full sm:w-auto">
          <div 
            class="relative group w-full sm:w-auto"
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
          
          <div class="h-6 w-px bg-border hidden sm:block mx-1"></div>
          
          <div v-if="originalSize > 0" class="flex items-center gap-3 text-sm">
             <div class="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md">
                 <span class="text-xs text-muted-foreground">原始</span>
                 <span class="font-medium font-mono text-foreground">{{ formatSize(originalSize) }}</span>
                 <ArrowRight class="h-3 w-3 text-muted-foreground" />
                 <span class="font-medium font-mono text-chart-2">{{ formatSize(optimizedSize) }}</span>
                 <span v-if="savings !== 0" class="text-xs font-bold" :class="savings > 0 ? 'text-chart-2' : 'text-destructive'">
                     (-{{ savings }}%)
                 </span>
             </div>
          </div>
        </div>
        
        <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
          <ToolButton 
            v-if="inputSvg" 
            type="clear" 
            @click="clearAll" 
          />
          <ToolButton 
            v-if="outputSvg" 
            type="copy" 
            label="複製"
            :copied="showCopied"
            @click="copyToClipboard"
          />
          <ToolButton 
            v-if="outputSvg" 
            type="download" 
            label="下載"
            @click="downloadSvg"
          />
        </div>
      </div>

      <!-- Main Editor Area -->
      <div class="grid gap-4 lg:grid-cols-2 h-[500px]">
        <!-- Input -->
        <Card class="flex flex-col overflow-hidden border-border bg-card shadow-sm">
          <div class="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/30">
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
          <div class="border-t border-border px-4 py-3 bg-muted/10">
            <div class="flex items-center gap-3">
              <label class="flex items-center gap-2 cursor-pointer select-none">
                <input 
                  type="checkbox" 
                  v-model="enableClass"
                  class="custom-checkbox h-4 w-4 rounded border-border text-primary focus:ring-primary"
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
        <Card class="flex flex-col overflow-hidden border-border bg-card shadow-sm">
          <div class="flex items-center justify-between border-b border-border px-4 py-3 bg-muted/30">
            <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <CheckCircle2 v-if="outputSvg" class="h-4 w-4 text-chart-2" />
              <Layers v-else class="h-4 w-4" />
              整理結果
            </div>
            <span v-if="showCopied" class="text-xs text-primary font-medium animate-pulse">已複製到剪貼簿</span>
          </div>
          
          <div class="flex flex-1 flex-col overflow-hidden">
            <!-- Preview Box -->
            <div class="flex flex-1 items-center justify-center p-6 min-h-[200px] overflow-hidden relative bg-gradient-to-br from-secondary/30 to-secondary/10">
              <div v-if="outputSvg" class="relative z-10 svg-preview-container flex items-center justify-center w-full h-full">
                <img :src="outputDataUrl" alt="Optimized SVG Preview" class="svg-preview-image max-w-full max-h-full object-contain drop-shadow-lg" />
              </div>
              <div v-else class="relative z-10 text-sm text-muted-foreground/50 flex flex-col items-center gap-2">
                 <File class="w-8 h-8 opacity-20" />
                 <span>尚無預覽</span>
              </div>
            </div>
            
            <!-- Code Preview -->
            <div class="flex-1 border-t border-border bg-background p-4 min-h-[150px]">
              <div class="h-full overflow-auto font-mono text-xs text-foreground leading-relaxed custom-scrollbar">
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
      
       <!-- Standard Action Bar (Show when files exist) -->
      <div v-if="batchItems.length > 0" class="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
        <div class="flex items-center gap-3 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
           <!-- Single Upload Button Group -->
           <div 
            class="relative group w-full sm:w-auto"
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
              title="上傳 SVG"
            />
            <Button 
                variant="outline" 
                class="w-full sm:w-auto gap-2"
                :class="isDraggingBatch ? 'border-primary bg-primary/10' : ''"
            >
                <Upload class="h-4 w-4" />
                繼續上傳
            </Button>
           </div>
           
           <div class="h-6 w-px bg-border mx-1 hidden sm:block"></div>

           <!-- Stats -->
           <div class="flex items-center gap-3 text-sm whitespace-nowrap">
              <span class="font-medium">{{ batchItems.length }} 個檔案</span>
               <template v-if="batchTotalSavings !== 0">
                 <span class="text-muted-foreground hidden sm:inline">•</span>
                 <div class="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md">
                    <span class="text-xs text-muted-foreground">共節省</span>
                    <span class="font-medium text-chart-2">{{ formatSize(batchTotalOriginalSize - batchTotalOptimizedSize) }}</span>
                    <span 
                        class="text-xs font-bold"
                        :class="batchTotalSavings > 0 ? 'text-chart-2' : 'text-destructive'"
                    >
                        (-{{ Math.abs(batchTotalSavings) }}%)
                    </span>
                 </div>
              </template>
           </div>
        </div>

        <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
          <ToolButton 
            type="clear" 
            @click="clearBatchItems" 
          />
           <ToolButton 
            type="copy" 
            label="複製全部"
            :copied="batchShowCopied === 'all'"
            @click="copyAllBatch"
          />
          <ToolButton 
            type="download" 
            label="下載全部"
            :loading="isDownloadingAll"
            @click="downloadAllBatch"
          />
        </div>
      </div>

      <!-- Standard Large Drop Zone (Show when no files) -->
       <Card 
            v-if="batchItems.length === 0"
            class="border-2 border-dashed transition-colors duration-200"
            :class="isDraggingBatch ? 'border-primary bg-primary/5' : 'border-border bg-card'"
            @dragenter="handleDragOverBatch"
            @dragover="handleDragOverBatch"
            @dragleave="handleDragLeaveBatch"
            @drop="handleDropBatch"
        >
            <CardContent class="flex flex-col items-center justify-center py-10 text-center space-y-4">
                <div class="p-4 bg-primary/10 rounded-full">
                    <Upload v-if="!isDraggingBatch" class="w-10 h-10 text-primary" />
                    <FolderSearch v-else class="w-10 h-10 text-primary" />
                </div>
                <div class="space-y-2">
                    <h3 class="text-xl font-semibold">批量 SVG 壓縮</h3>
                    <p class="text-sm text-muted-foreground max-w-sm mx-auto">
                        拖曳 SVG 檔案至此 或 點擊選擇<br/>
                        <span class="text-xs opacity-70">自動移除冗餘代碼與空白</span>
                    </p>
                </div>
                
                <div class="flex gap-4">
                    <div class="relative">
                        <Button variant="default" class="cursor-pointer">
                            選擇 SVG 檔案
                        </Button>
                        <input 
                            type="file" 
                            accept=".svg"
                            multiple 
                            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            @change="handleBatchFileInput"
                        />
                    </div>
                </div>
            </CardContent>
        </Card>

      <!-- Standard Table List -->
       <Card v-if="batchItems.length > 0" class="bg-card overflow-hidden shadow-sm border-border/50">
        <div class="max-h-[600px] overflow-y-auto custom-scrollbar">
            <table class="w-full text-sm text-left border-collapse">
                <thead class="bg-muted/50 text-muted-foreground font-medium sticky top-0 z-10 backdrop-blur-md">
                    <tr>
                        <th class="px-4 py-3 w-[40%]">檔案名稱</th>
                        <th class="px-4 py-3 text-right w-[15%] hidden sm:table-cell">原始</th>
                        <th class="px-4 py-3 text-right w-[25%]">優化後</th>
                        <th class="px-4 py-3 text-right w-[20%]">操作</th>
                    </tr>
                </thead>
                <tbody class="divide-y divide-border">
                    <tr v-for="item in batchItems" :key="item.id" class="group hover:bg-muted/30 transition-colors">
                        <td class="px-4 py-3">
                            <div class="flex items-center gap-3">
                                <!-- Thumbnail -->
                                <div 
                                    class="w-12 h-12 rounded-lg overflow-hidden bg-secondary/50 shrink-0 cursor-pointer ring-1 ring-border group-hover:ring-primary/50 transition-all flex items-center justify-center p-1"
                                    @click="openBatchPreview(item)"
                                >
                                    <img 
                                        :src="item.previewUrl" 
                                        :alt="item.name"
                                        class="max-w-full max-h-full object-contain"
                                    />
                                </div>
                                <div class="min-w-0 flex flex-col">
                                    <span class="font-medium text-foreground truncate max-w-[150px] sm:max-w-xs" :title="item.name">{{ item.name }}</span>
                                </div>
                            </div>
                        </td>
                        
                        <td class="px-4 py-3 text-right font-mono text-muted-foreground hidden sm:table-cell text-xs">
                            {{ formatSize(item.originalSize) }}
                        </td>
                        
                        <td class="px-4 py-3 text-right">
                             <div class="flex flex-col items-end gap-0.5">
                                 <span 
                                    class="font-mono font-bold text-sm" 
                                    :class="item.optimizedSize < item.originalSize ? 'text-chart-2' : 'text-muted-foreground'"
                                 >
                                    {{ formatSize(item.optimizedSize) }}
                                 </span>
                                 <span 
                                    v-if="item.savings !== 0"
                                    class="text-[10px] bg-chart-2/10 text-chart-2 px-1 rounded"
                                 >
                                    -{{ Math.abs(item.savings) }}%
                                 </span>
                             </div>
                        </td>
                        
                        <td class="px-4 py-3 text-right">
                            <div class="flex items-center justify-end gap-1">
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    class="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                    title="複製代碼"
                                    @click="copyBatchItem(item)"
                                >
                                    <Check v-if="batchShowCopied === item.id" class="h-4 w-4 text-chart-2" />
                                    <Copy v-else class="h-4 w-4" />
                                </Button>
                                
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    class="h-8 w-8 text-chart-2/80 hover:text-chart-2 hover:bg-chart-2/10"
                                    @click="downloadBatchItem(item)"
                                    title="下載"
                                >
                                    <Download class="h-4 w-4" />
                                </Button>
                                
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    class="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    @click="removeBatchItem(item.id)"
                                    title="移除"
                                >
                                    <Trash2 class="h-4 w-4" />
                                </Button>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </Card>
    </div>

    <!-- SVG Preview Modal (僅在客戶端 mounted 後渲染) -->
    <Teleport v-if="isMounted" to="body">
      <Transition name="modal">
        <div 
          v-if="batchPreviewItem" 
          class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
          @click.self="closeBatchPreview"
        >
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/90 backdrop-blur-md" @click="closeBatchPreview"></div>
          
          <!-- Modal Content -->
          <div class="relative z-10 w-full h-full max-w-7xl flex flex-col">
            <!-- Top Bar -->
            <div class="flex items-center justify-between mb-4 px-2">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center shrink-0">
                  <FileCode class="w-5 h-5 text-white" />
                </div>
                <div class="min-w-0">
                  <h3 class="text-white font-medium truncate text-lg">{{ batchPreviewItem.name }}</h3>
                  <p class="text-white/60 text-xs">SVG 預覽</p>
                </div>
              </div>
              
              <button 
                @click="closeBatchPreview" 
                class="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center transition-colors shrink-0"
              >
                <X class="w-5 h-5 text-white" />
              </button>
            </div>
            
            <!-- SVG Container -->
            <div class="flex-1 relative rounded-xl overflow-hidden bg-gradient-to-br from-neutral-900 to-neutral-800 flex items-center justify-center p-8">
              <img 
                :src="batchPreviewItem.previewUrl" 
                :alt="batchPreviewItem.name"
                class="max-w-full max-h-full object-contain"
              />
              
              <!-- Floating Info Bar -->
              <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/60 backdrop-blur-xl rounded-full px-6 py-3 border border-white/10 shadow-2xl">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-white/70">原始</span>
                  <span class="text-sm font-mono text-white">{{ formatSize(batchPreviewItem.originalSize) }}</span>
                </div>
                
                <div class="w-px h-6 bg-white/20"></div>
                
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-white/70">優化後</span>
                  <span class="text-sm font-mono text-white">{{ formatSize(batchPreviewItem.optimizedSize) }}</span>
                </div>
                
                <div v-if="batchPreviewItem.savings > 0" class="w-px h-6 bg-white/20"></div>
                
                <div v-if="batchPreviewItem.savings > 0" class="flex items-center gap-2">
                  <span class="text-xs text-white/60">節省</span>
                  <span class="text-xs font-bold px-2 py-1 rounded bg-green-500/20 text-green-400">
                    -{{ Math.abs(batchPreviewItem.savings) }}%
                  </span>
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

.custom-scrollbar::-webkit-scrollbar {
  width: 6px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.2);
  border-radius: 10px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background-color: hsl(var(--muted-foreground) / 0.4);
}
</style>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Card, CardContent } from '@/components/ui/card';
import Button from '@/components/ui/Button.vue';
import ToolButton from '@/components/ui/ToolButton.vue';
import { Upload, Download, RefreshCw, Image, X, Settings2, Check, FileCode, FolderSearch, Loader2 } from 'lucide-vue-next';
import { formatSize, generateId } from '@/composables/useFileUtils';

// ========================================
// 配置區 (CONFIG)
// ========================================
const CONFIG = {
  // 支援的輸出格式
  OUTPUT_FORMATS: [
    { value: 'image/webp', label: 'WebP', extension: 'webp', recommended: true, description: '最佳壓縮比，大多支援', supportQuality: true },
    { value: 'image/png', label: 'PNG', extension: 'png', recommended: false, description: '無損壓縮，支援透明背景', supportQuality: false },
    { value: 'image/jpeg', label: 'JPG', extension: 'jpg', recommended: false, description: '有損壓縮，檔案較小', supportQuality: true },
  ],
  // 支援的輸入格式
  ACCEPTED_TYPES: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp'],
  ACCEPTED_EXTENSIONS: '.jpg,.jpeg,.png,.webp,.gif,.bmp,.avif',
  // 預設品質 (0-1)
  DEFAULT_QUALITY: 0.8,
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
  folder: string; // Folder path
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
const dragActive = ref(false);

// Modal 預覽狀態
const previewItem = ref<ImageItem | null>(null);
const previewMode = ref<'original' | 'converted'>('converted');
const isMounted = ref(false);

// 設定
const selectedFormat = ref(CONFIG.OUTPUT_FORMATS[0].value);
const enableCompress = ref(true);
const quality = ref(CONFIG.DEFAULT_QUALITY);

// Canvas
const canvasRef = ref<HTMLCanvasElement | null>(null);

onMounted(() => {
  isMounted.value = true;
  canvasRef.value = document.createElement('canvas');
});

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

// Watchers
watch([selectedFormat, enableCompress, quality], () => {
    saveSettings();
});

// ========================================
// 計算屬性
// ========================================
const currentFormatInfo = computed(() => {
  return CONFIG.OUTPUT_FORMATS.find(f => f.value === selectedFormat.value) || CONFIG.OUTPUT_FORMATS[0];
});

const isQualitySupported = computed(() => currentFormatInfo.value.supportQuality);

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
const qualityPercent = computed(() => Math.round(quality.value * 100));

// ========================================
// 工具函式
// ========================================
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
    const isSameFormat = item.file.type === selectedFormat.value;
    if (isSameFormat && !enableCompress.value) {
        item.convertedBlob = item.file;
        item.convertedUrl = URL.createObjectURL(item.file);
        item.convertedSize = item.file.size;
        item.status = 'done';
        resolve();
        return;
    }

    const img = new window.Image();
    const objectUrl = URL.createObjectURL(item.file);
    
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      try {
        const canvas = canvasRef.value || document.createElement('canvas');
        // Prevent 0 size canvas which throws error
        if (img.naturalWidth === 0 || img.naturalHeight === 0) {
            reject(new Error('Image dimensions are 0'));
            return;
        }

        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Canvas Context Error'));
          return;
        }
        
        if (selectedFormat.value === 'image/jpeg') {
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
        } else {
          ctx.clearRect(0, 0, canvas.width, canvas.height);
        }
        
        ctx.drawImage(img, 0, 0);
        
        const outputQuality = enableCompress.value ? quality.value : 1;
        
        canvas.toBlob(
          (blob) => {
            if (blob) {
              if (item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
              item.convertedBlob = blob;
              item.convertedUrl = URL.createObjectURL(blob);
              item.convertedSize = blob.size;
              item.status = 'done';
              resolve();
            } else {
              reject(new Error('Conversion failed'));
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
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Image load failed'));
    };
    
    img.src = objectUrl;
  });
};

// ========================================
// 檔案掃描與處理 (Path Aware)
// ========================================
const processFiles = async (entries: { file: File, path?: string }[]) => {
  const newItems: ImageItem[] = [];
  
  for (const { file, path } of entries) {
    if (!CONFIG.ACCEPTED_TYPES.includes(file.type) && !file.name.match(/\.(jpg|jpeg|png|webp|gif|bmp|avif)$/i)) {
      continue;
    }
    
    // Use provided path or webkitRelativePath, fallback to filename
    const fullPath = path || file.webkitRelativePath || file.name;
    const folder = fullPath.includes('/') ? fullPath.substring(0, fullPath.lastIndexOf('/')) : '';
    
    // Dedup based on name (+ folder ideally, but lets use name + size for simplicity or ID)
    if (items.value.some(i => i.name === file.name && i.originalSize === file.size && i.folder === folder)) continue;

    const item: ImageItem = {
      id: generateId(),
      file: file,
      name: file.name,
      folder: folder,
      originalSize: file.size,
      originalUrl: URL.createObjectURL(file), // Used for preview
      convertedBlob: null,
      convertedUrl: '',
      convertedSize: 0,
      status: 'pending',
    };
    newItems.push(item);
  }
  
  if (newItems.length > 0) {
    items.value.push(...newItems);
    await processAllPending();
  }
};

const handleInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
        const fileList = Array.from(input.files);
        // input.files from webkitdirectory has populated webkitRelativePath
        processFiles(fileList.map(f => ({ file: f, path: f.webkitRelativePath })));
    }
    input.value = ''; 
};

// 遞迴掃描 Drag&Drop (Preserve Paths)
const scanEntries = async (entry: FileSystemEntry, path = ''): Promise<{ file: File, path: string }[]> => {
    if (entry.isFile) {
        const fileEntry = entry as FileSystemFileEntry;
        return new Promise((resolve) => {
            fileEntry.file((file: File) => {
                resolve([{ file, path: path ? `${path}/${file.name}` : file.name }]);
            });
        });
    } else if (entry.isDirectory) {
        const dirReader = (entry as FileSystemDirectoryEntry).createReader();
        const readEntries = async (): Promise<FileSystemEntry[]> => {
            return new Promise((resolve, reject) => {
                dirReader.readEntries(
                    (results) => resolve(results),
                    (err) => reject(err)
                );
            });
        };
        
        let allEntries: FileSystemEntry[] = [];
        let batch = await readEntries();
        while (batch.length > 0) {
           allEntries = allEntries.concat(batch);
           batch = await readEntries();
        }
        
        const results: { file: File, path: string }[] = [];
        const currentPath = path ? `${path}/${entry.name}` : entry.name;
        
        for (const child of allEntries) {
            const children = await scanEntries(child, currentPath);
            results.push(...children);
        }
        return results;
    }
    return [];
};

const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  dragActive.value = true;
};

const handleDragLeave = (e: DragEvent) => {
  e.preventDefault();
  dragActive.value = false;
};

const handleDropImage = async (e: DragEvent) => {
  e.preventDefault();
  dragActive.value = false;
  
  const itemsList = e.dataTransfer?.items;
  if (itemsList) {
      const allFiles: { file: File, path: string }[] = [];
      const queue: Promise<{ file: File, path: string }[]>[] = [];
      
      for (let i = 0; i < itemsList.length; i++) {
          const entry = itemsList[i].webkitGetAsEntry ? itemsList[i].webkitGetAsEntry() : null;
          if (entry) {
              // Start scanning from root (empty path prefix)
              queue.push(scanEntries(entry, ''));
          } else {
              const f = itemsList[i].getAsFile();
              if (f) allFiles.push({ file: f, path: f.name });
          }
      }
      
      const scannedResults = await Promise.all(queue);
      scannedResults.forEach(res => allFiles.push(...res));
      
      processFiles(allFiles);
  } else if (e.dataTransfer?.files) {
      // Fallback for simple file drop ? usually covered above
      processFiles(Array.from(e.dataTransfer.files).map(f => ({ file: f, path: f.name })));
  }
};

// ========================================
// 批次處理邏輯
// ========================================
const processAllPending = async () => {
  if (isProcessing.value) return;
  isProcessing.value = true;
  
  const queue = items.value.filter(item => item.status === 'pending');
  // Process sequentially to be safe with canvas memory
  for (const item of queue) {
      item.status = 'converting';
      try {
        await convertImage(item);
      } catch (err: any) {
        item.status = 'error';
        item.error = err.message || '轉換失敗';
      }
  }
  
  isProcessing.value = false;
};

const reconvertAll = async () => {
  items.value.forEach(item => {
    if (item.status === 'done' || item.status === 'error') {
      if (item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
      item.convertedUrl = '';
      item.convertedBlob = null;
      item.convertedSize = 0;
      item.status = 'pending';
    }
  });
  await processAllPending();
};

// ========================================
// UI 操作與其他
// ========================================
const removeItem = (id: string) => {
  const item = items.value.find(i => i.id === id);
  if (item) {
    if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
    if (item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
  }
  items.value = items.value.filter(i => i.id !== id);
};

const clearAll = () => {
  items.value.forEach(item => {
    if (item.originalUrl) URL.revokeObjectURL(item.originalUrl);
    if (item.convertedUrl) URL.revokeObjectURL(item.convertedUrl);
  });
  items.value = [];
};

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

const downloadAll = async () => {
  const doneItems = items.value.filter(item => item.status === 'done' && item.convertedBlob);
  if (doneItems.length === 0) return;
  
  isDownloadingAll.value = true;
  try {
    const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
    const zip = new JSZip();
    const ext = currentFormatInfo.value.extension;
    
    doneItems.forEach(item => {
      if (item.convertedBlob) {
        const baseName = item.name.replace(/\.[^.]+$/, '');
        // Preserve folder structure in zip if exists!
        const fileNameInZip = item.folder ? `${item.folder}/${baseName}.${ext}` : `${baseName}.${ext}`;
        zip.file(fileNameInZip, item.convertedBlob);
      }
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(content);
    const a = document.createElement('a');
    a.href = url;
    
    const date = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
    a.download = `images_${date}.zip`;
    a.click();
    URL.revokeObjectURL(url);
  } catch (error) {
    console.error('ZIP Error:', error);
    doneItems.forEach((item, index) => {
      setTimeout(() => downloadItem(item), index * 300);
    });
  } finally {
    isDownloadingAll.value = false;
  }
};

const openPreview = (item: ImageItem) => {
  previewItem.value = item;
  previewMode.value = item.status === 'done' ? 'converted' : 'original';
};

const closePreview = () => {
  previewItem.value = null;
};
</script>

<template>
  <div class="flex flex-col gap-6">
    <div class="flex flex-col xl:flex-row gap-4">
      <!-- 1. 輸出格式設定 -->
      <Card class="p-4 space-y-4 xl:flex-[1.8] border-border/50 shadow-sm">
        <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground mb-1">
          <Settings2 class="h-4 w-4" />
          輸出格式
        </div>
        <div class="grid grid-cols-2 lg:grid-cols-3 gap-2">
          <button
            v-for="format in CONFIG.OUTPUT_FORMATS"
            :key="format.value"
            @click="selectedFormat = format.value"
            :class="[
              'relative flex flex-col items-start p-3 rounded-lg border-2 transition-all text-left h-full',
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
            <span class="text-xs text-muted-foreground/80 mt-1 leading-snug">{{ format.description }}</span>
            <div 
              v-if="selectedFormat === format.value"
              class="absolute top-2 right-2 w-5 h-5 rounded-full bg-primary flex items-center justify-center"
            >
              <Check class="h-3 w-3 text-white" />
            </div>
          </button>
        </div>
      </Card>

      <!-- 2. 壓縮設定 -->
      <Card class="p-4 space-y-4 xl:flex-1 border-border/50 shadow-sm relative overflow-hidden">
        <div class="flex justify-between items-center mb-1">
          <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
            <FileCode class="h-4 w-4" />
            壓縮品質
          </div>
          <div class="flex items-center">
            <label class="flex items-center gap-2 cursor-pointer select-none group">
              <input 
                type="checkbox" 
                v-model="enableCompress"
                class="hidden"
              />
              <div class="w-9 h-5 rounded-full relative transition-colors duration-200"
                   :class="enableCompress ? 'bg-primary' : 'bg-muted'">
                   <div class="absolute top-1 left-1 bg-white w-3 h-3 rounded-full transition-transform duration-200 shadow-sm"
                        :class="enableCompress ? 'translate-x-4' : 'translate-x-0'"></div>
              </div>
              <span class="text-sm transition-colors" :class="enableCompress ? 'text-foreground' : 'text-muted-foreground'">啟用壓縮</span>
            </label>
          </div>
        </div>

        <!-- Slider Section -->
        <div class="py-2 space-y-4">
            <div class="flex justify-between items-end">
                <span class="text-xs text-muted-foreground font-medium">品質設定</span>
                <span class="text-2xl font-bold font-mono tracking-tight" :class="isQualitySupported ? 'text-primary' : 'text-muted-foreground'">
                    {{ isQualitySupported ? qualityPercent + '%' : 'N/A' }}
                </span>
            </div>
            
            <div class="relative h-6 flex items-center">
                 <input
                    type="range"
                    min="0.1"
                    max="1"
                    step="0.05"
                    v-model.number="quality"
                    @change="reconvertAll()"
                    :disabled="!enableCompress || !isQualitySupported"
                    class="quality-slider w-full h-2 rounded-full appearance-none cursor-pointer focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                    :style="{ 
                        backgroundColor: 'hsl(var(--secondary))',
                        backgroundImage: `linear-gradient(hsl(var(--primary)), hsl(var(--primary)))`,
                        backgroundSize: `${qualityPercent}% 100%`,
                        backgroundRepeat: 'no-repeat'
                    }"
                />
            </div>
            
            <div class="flex justify-between text-[10px] text-muted-foreground uppercase tracking-wider font-medium">
                <span>Low Size</span>
                <span>Best Quality</span>
            </div>
        </div>
        
        <!-- Not Supported Overlay -->
        <div v-if="!isQualitySupported" class="absolute inset-x-0 bottom-0 top-[60px] bg-background/80 backdrop-blur-[1px] flex flex-col items-center justify-center text-center p-4 border-t border-border/10">
            <span class="text-sm font-medium text-foreground">此格式不支援品質調整</span>
            <span class="text-xs text-muted-foreground mt-1">PNG 為無損壓縮格式</span>
        </div>
        <div v-else-if="!enableCompress" class="absolute inset-x-0 bottom-0 top-[60px] bg-background/60 backdrop-blur-[1px]"></div>

      </Card>
    </div>

    <!-- 3. 上傳區 (Action Bar) -->
    <div class="flex flex-col gap-4">
        <!-- 檔案列表存在時顯示操作列 -->
        <div class="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-border bg-card p-4 shadow-sm" v-if="items.length > 0">
          <div class="flex items-center gap-3 w-full sm:w-auto overflow-x-auto pb-1 sm:pb-0">
             <!-- Single Upload Button (Folder & Files) -->
            <div class="relative group w-full sm:w-auto"
                @dragover="handleDragOver"
                @dragleave="handleDragLeave"
                @drop="handleDropImage"
            >
                <input
                    type="file"
                    webkitdirectory
                    directory
                    multiple
                    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    @change="handleInput"
                    title="上傳資料夾或圖片"
                />
                <Button 
                    variant="outline" 
                    class="w-full sm:w-auto gap-2"
                    :class="dragActive ? 'border-primary bg-primary/10' : ''"
                >
                    <Upload class="h-4 w-4" />
                    上傳資料夾或圖片
                </Button>
            </div>
            
            <div class="h-6 w-px bg-border mx-1"></div>
            
            <!-- Stats -->
            <div class="flex items-center gap-3 text-sm whitespace-nowrap">
              <span class="font-medium">{{ items.length }} 個檔案</span>
              <template v-if="doneCount > 0">
                 <span class="text-muted-foreground hidden sm:inline">•</span>
                 <div class="flex items-center gap-1.5 bg-secondary/50 px-2 py-1 rounded-md">
                    <span class="text-xs text-muted-foreground">節省</span>
                    <span class="font-medium text-chart-2">{{ formatSize(totalOriginalSize - totalConvertedSize) }}</span>
                    <span 
                        v-if="totalSavings !== 0"
                        class="text-xs font-bold"
                        :class="totalSavings > 0 ? 'text-chart-2' : 'text-destructive'"
                    >
                        ({{ totalSavings > 0 ? '-' : '+' }}{{ Math.abs(totalSavings) }}%)
                    </span>
                 </div>
              </template>
            </div>
          </div>
          
          <div class="flex items-center gap-2 w-full sm:w-auto justify-end">
            <ToolButton 
              v-if="items.length > 0" 
              type="clear" 
              @click="clearAll" 
            />
            <ToolButton 
              v-if="doneCount > 0" 
              type="download" 
              label="下載全部 ZIP"
              :loading="isDownloadingAll"
              @click="downloadAll"
            />
          </div>
        </div>

        <!-- Initial Large Drop Zone -->
        <Card 
            v-if="items.length === 0"
            class="border-2 border-dashed transition-colors duration-200"
            :class="dragActive ? 'border-primary bg-primary/5' : 'border-border bg-card'"
            @dragenter="handleDragOver"
            @dragover="handleDragOver"
            @dragleave="handleDragLeave"
            @drop="handleDropImage"
        >
            <CardContent class="flex flex-col items-center justify-center py-10 text-center space-y-4">
                <div class="p-4 bg-primary/10 rounded-full">
                    <FolderSearch v-if="!isProcessing" class="w-10 h-10 text-primary" />
                    <Loader2 v-else class="w-10 h-10 text-primary animate-spin" />
                </div>
                <div class="space-y-2">
                    <h3 class="text-xl font-semibold">批量圖片轉換</h3>
                    <p class="text-sm text-muted-foreground max-w-sm mx-auto">
                        拖曳資料夾至此 或 點擊選擇<br/>
                        <span class="text-xs opacity-70">支援 JPG, PNG, WebP, GIF</span>
                    </p>
                </div>
                
                <div class="flex gap-4" v-if="!isProcessing">
                    <div class="relative">
                        <Button variant="default" class="cursor-pointer">
                            上傳資料夾或圖片
                        </Button>
                        <input 
                            type="file" 
                            webkitdirectory 
                            directory 
                            multiple 
                            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                            @change="handleInput"
                        />
                    </div>
                </div>
            </CardContent>
        </Card>
    </div>

    <!-- 4. 檔案列表 (Table Style) -->
    <Card v-if="items.length > 0" class="bg-card overflow-hidden shadow-sm border-border/50">
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
                    <tr v-for="item in items" :key="item.id" class="group hover:bg-muted/30 transition-colors">
                        <td class="px-4 py-3">
                            <div class="flex items-center gap-3">
                                <!-- Thumbnail -->
                                <div 
                                    class="w-12 h-12 rounded-lg overflow-hidden bg-secondary/50 shrink-0 cursor-pointer ring-1 ring-border group-hover:ring-primary/50 transition-all"
                                    @click="openPreview(item)"
                                >
                                    <img 
                                        :src="item.status === 'done' ? item.convertedUrl : item.originalUrl" 
                                        :alt="item.name"
                                        class="w-full h-full object-cover"
                                    />
                                </div>
                                <div class="min-w-0 flex flex-col">
                                    <span class="font-medium text-foreground truncate max-w-[150px] sm:max-w-xs" :title="item.name">{{ item.name }}</span>
                                    <div v-if="item.folder" class="text-xs text-muted-foreground/70 truncate max-w-[150px] sm:max-w-xs font-mono" :title="item.folder">
                                        {{ item.folder }}
                                    </div>
                                    <!-- Status Badge for Error -->
                                     <span v-if="item.status === 'error'" class="text-xs text-destructive">{{ item.error }}</span>
                                </div>
                            </div>
                        </td>
                        
                        <td class="px-4 py-3 text-right font-mono text-muted-foreground hidden sm:table-cell text-xs">
                            {{ formatSize(item.originalSize) }}
                        </td>
                        
                        <td class="px-4 py-3 text-right">
                             <div v-if="item.status === 'converting'" class="flex items-center justify-end gap-1.5 text-primary">
                                 <RefreshCw class="w-3.5 h-3.5 animate-spin" />
                                 <span class="text-xs font-medium">轉換中</span>
                             </div>
                             <div v-else-if="item.status === 'done'" class="flex flex-col items-end gap-0.5">
                                 <span 
                                    class="font-mono font-bold text-sm" 
                                    :class="item.convertedSize < item.originalSize ? 'text-chart-2' : 'text-muted-foreground'"
                                 >
                                    {{ formatSize(item.convertedSize) }}
                                 </span>
                                 <span 
                                    v-if="item.convertedSize < item.originalSize"
                                    class="text-[10px] bg-chart-2/10 text-chart-2 px-1 rounded"
                                 >
                                    -{{ Math.abs(Math.round(((item.originalSize - item.convertedSize) / item.originalSize) * 100)) }}%
                                 </span>
                             </div>
                             <div v-else class="text-muted-foreground text-xs opacity-50">-</div>
                        </td>
                        
                        <td class="px-4 py-3 text-right">
                            <div class="flex items-center justify-end gap-1">
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    class="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                    title="預覽"
                                    @click="openPreview(item)"
                                >
                                    <Image class="h-4 w-4" />
                                </Button>
                                
                                <Button 
                                    v-if="item.status === 'done'"
                                    variant="ghost" 
                                    size="icon" 
                                    class="h-8 w-8 text-chart-2/80 hover:text-chart-2 hover:bg-chart-2/10"
                                    @click="downloadItem(item)"
                                    title="下載"
                                >
                                    <Download class="h-4 w-4" />
                                </Button>
                                
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    class="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                    @click="removeItem(item.id)"
                                    title="移除"
                                >
                                    <X class="h-4 w-4" />
                                </Button>
                            </div>
                        </td>
                    </tr>
                </tbody>
            </table>
        </div>
    </Card>

    <!-- Preview Modal -->
    <Teleport v-if="isMounted" to="body">
      <Transition name="modal">
        <div 
          v-if="previewItem" 
          class="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8"
          @click.self="closePreview"
        >
          <!-- Backdrop -->
          <div class="absolute inset-0 bg-black/90 backdrop-blur-md" @click="closePreview"></div>
          
          <!-- Modal Content -->
          <div class="relative z-10 w-full h-full max-w-7xl flex flex-col">
            <!-- Top Bar -->
            <div class="flex items-center justify-between mb-4 px-2">
              <div class="flex items-center gap-3 min-w-0">
                <div class="w-10 h-10 rounded-lg bg-white/10 backdrop-blur-sm flex items-center justify-center shrink-0">
                  <Image class="w-5 h-5 text-white" />
                </div>
                <div class="min-w-0">
                  <h3 class="text-white font-medium truncate text-lg">{{ previewItem.name }}</h3>
                  <p v-if="previewItem.folder" class="text-white/60 text-xs truncate font-mono">{{ previewItem.folder }}</p>
                </div>
              </div>
              
              <button 
                @click="closePreview" 
                class="w-10 h-10 rounded-lg bg-white/10 hover:bg-white/20 backdrop-blur-sm flex items-center justify-center transition-colors shrink-0"
              >
                <X class="w-5 h-5 text-white" />
              </button>
            </div>
            
            <!-- Image Container -->
            <div class="flex-1 relative rounded-xl overflow-hidden bg-gradient-to-br from-neutral-900 to-neutral-800 flex items-center justify-center">
              <img 
                :src="previewMode === 'converted' && previewItem.status === 'done' ? previewItem.convertedUrl : previewItem.originalUrl" 
                :alt="previewItem.name"
                class="max-w-full max-h-full object-contain"
              />
              
              <!-- Floating Control Bar -->
              <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-black/60 backdrop-blur-xl rounded-full px-4 py-3 border border-white/10 shadow-2xl">
                <button 
                  @click="previewMode = 'original'"
                  class="flex items-center gap-2 px-4 py-2 rounded-full transition-all"
                  :class="previewMode === 'original' 
                    ? 'bg-white text-black shadow-lg' 
                    : 'text-white/70 hover:text-white hover:bg-white/10'"
                >
                  <span class="text-sm font-medium whitespace-nowrap">原始</span>
                  <span class="text-xs font-mono opacity-80">{{ formatSize(previewItem.originalSize) }}</span>
                </button>
                
                <div v-if="previewItem.status === 'done'" class="w-px h-6 bg-white/20"></div>

                <button 
                  v-if="previewItem.status === 'done'"
                  @click="previewMode = 'converted'"
                  class="flex items-center gap-2 px-4 py-2 rounded-full transition-all"
                  :class="previewMode === 'converted' 
                    ? 'bg-white text-black shadow-lg' 
                    : 'text-white/70 hover:text-white hover:bg-white/10'"
                >
                  <span class="text-sm font-medium whitespace-nowrap">優化後</span>
                  <span class="text-xs font-mono opacity-80">{{ formatSize(previewItem.convertedSize) }}</span>
                  <span 
                    class="text-[10px] font-bold px-1.5 py-0.5 rounded"
                    :class="previewItem.convertedSize < previewItem.originalSize 
                      ? 'bg-green-500/20 text-green-400' 
                      : 'bg-orange-500/20 text-orange-400'"
                  >
                    {{ previewItem.convertedSize < previewItem.originalSize ? '-' : '+' }}{{ Math.abs(Math.round(((previewItem.originalSize - previewItem.convertedSize) / previewItem.originalSize) * 100)) }}%
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.quality-slider {
    /* Reset default styles to allow custom styling */
    -webkit-appearance: none; 
    appearance: none;
    background: transparent; 
}

/* Thumb Styling */
.quality-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
  appearance: none;
  width: 20px;
  height: 20px;
  background: white; 
  border: 4px solid hsl(var(--primary)); 
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  /* The thumb is usually centered on the track. If we use the input background as track, we don't need negative margins if height matches?
     But here height of input is 8px, thumb is 20px. So we need to offset it. */
  margin-top: -6px; /* (8px track height - 20px thumb height) / 2 = -6px */
  transition: transform 0.1s;
}

.quality-slider::-webkit-slider-thumb:hover {
  transform: scale(1.1);
}

/* Make the track transparent so the input's background gradient shows through */
.quality-slider::-webkit-slider-runnable-track {
    width: 100%;
    height: 8px;
    background: transparent; 
    border-radius: 9999px;
}

/* Firefox Styles */
.quality-slider::-moz-range-track {
    width: 100%;
    height: 8px;
    background: hsl(var(--secondary));
    border-radius: 9999px;
}

.quality-slider::-moz-range-progress {
    background-color: hsl(var(--primary));
    height: 8px;
    border-radius: 9999px;
}

.quality-slider::-moz-range-thumb {
  width: 20px;
  height: 20px;
  background: white;
  border: 4px solid hsl(var(--primary));
  border-radius: 50%;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: transform 0.1s;
  border: none; /* Reset border for firefox if needed or keep consistent */
}

/* Checkerboard for transparent images */
.checkered-bg {
  background-image: 
    linear-gradient(45deg, #ccc 25%, transparent 25%), 
    linear-gradient(-45deg, #ccc 25%, transparent 25%), 
    linear-gradient(45deg, transparent 75%, #ccc 75%), 
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 20px 20px;
  background-position: 0 0, 0 10px, 10px -10px, -10px 0px;
  background-color: white; 
}

:global(.dark) .checkered-bg {
    background-image: 
    linear-gradient(45deg, #333 25%, transparent 25%), 
    linear-gradient(-45deg, #333 25%, transparent 25%), 
    linear-gradient(45deg, transparent 75%, #333 75%), 
    linear-gradient(-45deg, transparent 75%, #333 75%);
    background-color: #1a1a1a;
}

.modal-enter-active, .modal-leave-active {
  transition: opacity 0.3s ease;
}
.modal-enter-from, .modal-leave-to {
  opacity: 0;
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
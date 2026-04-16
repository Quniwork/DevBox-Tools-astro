<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Card, CardContent } from '@/components/ui/card';
import { Upload, X, GripVertical, Check, Copy, History, Link, Download, FolderSearch, Loader2, RefreshCw, Trash2, FileText } from 'lucide-vue-next';
import Button from '@/components/ui/Button.vue';
import ToolButton from '@/components/ui/ToolButton.vue';
import JSZip from 'jszip';

// ========================================
// CONFIG
// ========================================
const CONFIG = {
  HISTORY_KEY: 'devbox_image_renamer_sites',
  HISTORY_LIMIT: 20,
  IMAGE_QUALITY: 0.8,    // Initial Quality
  MAX_FILE_SIZE: 600 * 1024, // 600KB
  SUFFIX_OPTIONS: [
    'index',
    'index_login',
    'about',
    'casino',
    'fish',
    'card',
    'live',
    'sports',
    'lottery',
    'promotions',
    'register'
  ]
};

// ========================================
// Types
// ========================================
interface ImageItem {
  id: string;        // Unique ID for keying
  file: File;        // Original File object
  previewUrl: string; // Object URL for thumbnail
  suffix: string;    // Selected suffix (e.g., 'login')
  isDropdownOpen: boolean; // Control dropdown visibility
  highlightedIndex: number; // Keyboard navigation index
}

// ========================================
// State
// ========================================
const siteName = ref('');
const siteNameHistory = ref<string[]>([]);
const isSiteHistoryOpen = ref(false);
const images = ref<ImageItem[]>([]);
const dragIndex = ref<number | null>(null);
const isDownloading = ref(false);
const isDragOver = ref(false);
const showCopied = ref(false);

const replacingIndex = ref<number | null>(null);
const replaceInputRef = ref<HTMLInputElement | null>(null);
const dropTargetIndex = ref<number | null>(null);
const sortTargetIndex = ref<number | null>(null);

// ========================================
// Initialization
// ========================================
onMounted(() => {
    // Load history
    const saved = localStorage.getItem(CONFIG.HISTORY_KEY);
    if (saved) {
        try {
            siteNameHistory.value = JSON.parse(saved);
        } catch (e) {
            console.error('Failed to parse history', e);
            siteNameHistory.value = [];
        }
    }
});

// ========================================
// Site Name History Logic
// ========================================
const filteredHistory = computed(() => {
    if (!siteName.value) return siteNameHistory.value;
    return siteNameHistory.value.filter(s => 
        s.toLowerCase().includes(siteName.value.toLowerCase())
    );
});

const saveToHistory = () => {
    const val = siteName.value.trim();
    if (!val) return;
    
    // Remove if exists (to move to top)
    const existingIndex = siteNameHistory.value.indexOf(val);
    if (existingIndex > -1) {
        siteNameHistory.value.splice(existingIndex, 1);
    }
    
    // Add to top
    siteNameHistory.value.unshift(val);
    
    // Limit
    if (siteNameHistory.value.length > CONFIG.HISTORY_LIMIT) {
        siteNameHistory.value = siteNameHistory.value.slice(0, CONFIG.HISTORY_LIMIT);
    }
    
    // Save
    localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(siteNameHistory.value));
};

const deleteHistoryItem = (item: string) => {
    const idx = siteNameHistory.value.indexOf(item);
    if (idx > -1) {
        siteNameHistory.value.splice(idx, 1);
        localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(siteNameHistory.value));
    }
};

const selectHistoryItem = (item: string) => {
    siteName.value = item;
    isSiteHistoryOpen.value = false;
};

// Close history dropdown with delay
const closeSiteHistoryDelay = () => {
    setTimeout(() => {
        isSiteHistoryOpen.value = false;
        // Also save on blur if not empty
        saveToHistory();
    }, 200);
};

// ========================================
// Methods
// ========================================

// Handle file uploads
const handleFiles = (fileList: FileList) => {
  const newImages: ImageItem[] = Array.from(fileList).map(file => ({
    id: crypto.randomUUID(),
    file,
    previewUrl: URL.createObjectURL(file),
    suffix: '',
    isDropdownOpen: false,
    highlightedIndex: -1
  }));
  images.value = [...images.value, ...newImages];
};

const handleInput = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
        handleFiles(input.files);
    }
    input.value = '';
};

// Replace a single image
const triggerReplace = (index: number) => {
    replacingIndex.value = index;
    replaceInputRef.value?.click();
};

const handleReplace = (e: Event) => {
    const input = e.target as HTMLInputElement;
    if (input.files && input.files.length > 0 && replacingIndex.value !== null) {
        const file = input.files[0];
        const idx = replacingIndex.value;
        
        // Revoke old URL
        URL.revokeObjectURL(images.value[idx].previewUrl);
        
        // Update item while keeping suffix and other metadata
        images.value[idx] = {
            ...images.value[idx],
            file,
            previewUrl: URL.createObjectURL(file)
        };
    }
    input.value = '';
    replacingIndex.value = null;
};

// Drag & Drop
const handleDragOverZone = (e: DragEvent) => {
    e.preventDefault();
    isDragOver.value = true;
};

const handleDragLeaveZone = (e: DragEvent) => {
    e.preventDefault();
    isDragOver.value = false;
};

const handleDropZone = (e: DragEvent) => {
    e.preventDefault();
    isDragOver.value = false;
    if (e.dataTransfer?.files) {
        handleFiles(e.dataTransfer.files);
    }
};

// Remove an image (and revoke URL)
const removeImage = (index: number) => {
  URL.revokeObjectURL(images.value[index].previewUrl);
  images.value.splice(index, 1);
};

const clearAll = () => {
    images.value.forEach(img => URL.revokeObjectURL(img.previewUrl));
    images.value = [];
};

// Drag & Drop Sorting
const onDragStart = (e: DragEvent, index: number) => {
  dragIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.dropEffect = 'move';
  }
};

const onDragOver = (e: DragEvent, index?: number) => {
  e.preventDefault();
  
  if (index === undefined) return;

  // External Files (Replace mode)
  if (e.dataTransfer?.types.includes('Files')) {
    dropTargetIndex.value = index;
    sortTargetIndex.value = null;
  } 
  // Internal Items (Sort mode)
  else if (dragIndex.value !== null) {
      sortTargetIndex.value = index;
      dropTargetIndex.value = null;
  }
};

const onDragLeave = (e: DragEvent) => {
    // We don't nullify everything on every leave to avoid flickering
    // It's better to manage it via the dragover of the next element or the end of drag
};

const onDrop = (e: DragEvent, index: number) => {
  e.preventDefault();
  const isFiles = e.dataTransfer?.types.includes('Files');
  
  dropTargetIndex.value = null;
  sortTargetIndex.value = null;

  // Handle external file drop (Replacement)
  if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
      const file = e.dataTransfer.files[0];
      URL.revokeObjectURL(images.value[index].previewUrl);
      images.value[index] = {
          ...images.value[index],
          file,
          previewUrl: URL.createObjectURL(file)
      };
      return;
  }

  // Handle internal sort drop
  if (dragIndex.value !== null && dragIndex.value !== index) {
    const itemToMove = images.value[dragIndex.value];
    images.value.splice(dragIndex.value, 1);
    images.value.splice(index, 0, itemToMove);
  }
  dragIndex.value = null;
  sortTargetIndex.value = null;
};

const onDragEnd = () => {
    dragIndex.value = null;
    sortTargetIndex.value = null;
    dropTargetIndex.value = null;
};

// Dropdown handling
const closeDropdownDelay = (item: ImageItem) => {
    setTimeout(() => {
        item.isDropdownOpen = false;
        item.highlightedIndex = -1;
    }, 200);
};

const selectSuffix = (item: ImageItem, option: string) => {
  item.suffix = option;
  item.isDropdownOpen = false;
  item.highlightedIndex = -1;
};

// Calculate globally used suffixes
const usedSuffixes = computed(() => {
    const set = new Set<string>();
    images.value.forEach(img => {
        if (img.suffix) set.add(img.suffix);
    });
    return set;
});

// Get Options for a specific image item
const getOptionsFor = (item: ImageItem) => {
    const query = item.suffix || '';
    
    // 1. Filter
    let options = CONFIG.SUFFIX_OPTIONS;
    if (query) {
       options = CONFIG.SUFFIX_OPTIONS.filter(opt => opt.toLowerCase().includes(query.toLowerCase()));
    }
    
    // 2. Sort/Group
    const currentVal = item.suffix;
    const unused: string[] = [];
    const used: string[] = [];
    
    options.forEach(opt => {
        if (usedSuffixes.value.has(opt)) {
            if (opt === currentVal) {
                unused.push(opt);
            } else {
                used.push(opt);
            }
        } else {
            unused.push(opt);
        }
    });
    
    return [...unused, ...used];
};

const isOptionUsed = (opt: string, currentItemSuffix: string) => {
    return usedSuffixes.value.has(opt) && opt !== currentItemSuffix;
};

// Keyboard Navigation
const handleKeyDown = (e: KeyboardEvent, item: ImageItem) => {
    if (!item.isDropdownOpen) {
        if (e.key === 'ArrowDown' || e.key === 'Enter') {
            item.isDropdownOpen = true;
            e.preventDefault();
        }
        return;
    }

    const options = getOptionsFor(item);
    if (options.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (item.highlightedIndex < options.length - 1) {
            item.highlightedIndex++;
        } else {
            item.highlightedIndex = 0; // Cycle to top
        }
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (item.highlightedIndex > 0) {
            item.highlightedIndex--;
        } else {
            item.highlightedIndex = options.length - 1; // Cycle to bottom
        }
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (item.highlightedIndex >= 0 && item.highlightedIndex < options.length) {
            selectSuffix(item, options[item.highlightedIndex]);
        }
    }
};


// Naming Logic
const getNewFilename = (item: ImageItem, index: number, site: string) => {
    const order = index + 1;
    // Auto convert to jpg means extension is always jpg
    const extension = 'jpg';
    
    let suffixPart = '';
    if (item.suffix) {
        if (/^[-_]/.test(item.suffix)) {
             suffixPart = item.suffix;
        } else {
             suffixPart = `-${item.suffix}`;
        }
    }
    
    return `${order}.${site}${suffixPart}.${extension}`;
};

// Generate Output Result
const generatedList = computed(() => {
  const site = siteName.value.trim();
  if (!site && images.value.length === 0) return '';
  
  return images.value.map((img, index) => getNewFilename(img, index, site)).join('\n');
});

const copyToClipboard = async () => {
    if (!generatedList.value) return;
    try {
        await navigator.clipboard.writeText(generatedList.value);
        showCopied.value = true;
        setTimeout(() => showCopied.value = false, 2000);
    } catch (err) {
        console.error('Failed to copy', err);
    }
};

const downloadAllImages = async () => {
    if (images.value.length === 0 || !siteName.value.trim()) {
        alert('請先輸入網站名稱並上傳圖片');
        return;
    }
    
    isDownloading.value = true;
    try {
        const zip = new JSZip();
        const site = siteName.value.trim();
        
        // Process each image: Convert to JPG -> Add to ZIP
        const promises = images.value.map(async (img, index) => {
            const filename = getNewFilename(img, index, site);
            
            // Convert to JPG blob (optimized)
            const blob = await convertToOptimizedJpg(img.file);
            zip.file(filename, blob);
        });
        
        await Promise.all(promises);
        
        // Generate Zip
        const content = await zip.generateAsync({ type: 'blob' });
        
        // Trigger Download
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `${site}_images.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
    } catch (err) {
        console.error('Failed to download images', err);
        alert('圖片處理失敗，請重試');
    } finally {
        isDownloading.value = false;
    }
};

// Helper: Convert File to Optimized JPG Blob (Max 600KB)
const convertToOptimizedJpg = async (file: File): Promise<Blob> => {
    const MAX_SIZE = CONFIG.MAX_FILE_SIZE;
    
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = async () => {
             // 1. Initial attempt with high quality
             let quality = 0.9;
             let blob = await getCanvasBlob(img, quality);
             
             // 2. Binary search-ish optimization if blob is too big
             // Try reducing quality until it fits
             let attempts = 0;
             while (blob && blob.size > MAX_SIZE && quality > 0.1 && attempts < 10) {
                 quality -= 0.1;
                 blob = await getCanvasBlob(img, quality);
                 attempts++;
             }
             
             // 3. If still too big, try resizing (Scale down)
             if (blob && blob.size > MAX_SIZE) {
                 let scale = 0.9;
                 let scaledBlob = blob;
                 
                  while (scaledBlob && scaledBlob.size > MAX_SIZE && scale > 0.3 && attempts < 20) {
                     scaledBlob = await getCanvasBlob(img, quality, scale); // use last reduce quality
                     scale -= 0.1;
                     attempts++;
                 }
                 blob = scaledBlob;
             }
            
            URL.revokeObjectURL(url);
            if (blob) {
                resolve(blob);
            } else {
                reject(new Error('Canvas to Blob failed'));
            }
        };
        
        img.onerror = () => {
            URL.revokeObjectURL(url);
            reject(new Error('Image conversion failed'));
        };
        
        img.src = url;
    });
};

const getCanvasBlob = (img: HTMLImageElement, quality: number, scale: number = 1): Promise<Blob | null> => {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width * scale;
        canvas.height = img.height * scale;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            resolve(null);
            return;
        }
        
        // Fill white background for transparency (since we are converting to jpg)
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        
        // Draw with smoothing
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
            resolve(blob);
        }, 'image/jpeg', quality);
    });
};

</script>

<template>
  <div class="space-y-6">
  
    <!-- 1. Configuration Section -->
    <Card class="border-border bg-card p-5 border-l-4 border-l-primary shadow-sm">
        <div class="flex flex-col md:flex-row gap-4 items-start md:items-center justify-between">
            <div class="flex items-center gap-2">
                <div class="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <Link class="w-5 h-5 text-primary" />
                </div>
                <div>
                   <h3 class="text-base font-semibold text-foreground">網站設定</h3>
                   <p class="text-xs text-muted-foreground mt-0.5">所有圖片將自動命名並壓縮 (JPG &lt;600KB)</p>
                </div>
            </div>
            
            <div class="relative w-full md:w-auto md:min-w-[300px]">
                  <input
                    v-model="siteName"
                    type="text"
                    placeholder="請輸入網站名稱 (例如: my-casino)"
                    @focus="isSiteHistoryOpen = true"
                    @blur="closeSiteHistoryDelay"
                    class="w-full px-4 py-2.5 rounded-lg border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm transition-all font-mono"
                  />
                    <!-- History Dropdown -->
                    <div 
                        v-if="isSiteHistoryOpen && filteredHistory.length > 0"
                        class="absolute z-30 mt-1 max-h-[200px] w-full overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                    >
                        <div
                            v-for="item in filteredHistory"
                            :key="item"
                            class="group relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-accent hover:text-accent-foreground"
                        >
                            <div 
                                class="flex-1 flex items-center gap-2"
                                @click="selectHistoryItem(item)"
                            >
                                <History class="h-3.5 w-3.5 text-muted-foreground" />
                                <span>{{ item }}</span>
                            </div>
                            <button 
                                @click.stop="deleteHistoryItem(item)"
                                class="ml-auto flex h-5 w-5 items-center justify-center rounded-sm opacity-0 hover:bg-destructive hover:text-destructive-foreground group-hover:opacity-100 transition-opacity"
                                title="刪除此紀錄"
                            >
                                <X class="h-3.5 w-3.5" />
                            </button>
                        </div>
                    </div>
            </div>
        </div>
    </Card>

    <!-- 2. Action Bar / Empty State -->
    
    <!-- Empty State -->
    <Card 
        v-if="images.length === 0"
        class="tool-dropzone"
        :class="isDragOver ? 'tool-dropzone-active' : 'tool-dropzone-inactive'"
        @dragenter="handleDragOverZone"
        @dragover="handleDragOverZone"
        @dragleave="handleDragLeaveZone"
        @drop="handleDropZone"
    >
        <div class="tool-dropzone-content">
            <div class="tool-dropzone-icon-wrapper">
                <FolderSearch v-if="!isDragOver" class="w-10 h-10" />
                <Upload v-else class="w-10 h-10" />
            </div>
            <div class="space-y-2">
                <h3 class="tool-dropzone-title">圖片排序與命名</h3>
                <p class="tool-dropzone-description">
                    拖曳圖片至此 或 點擊選擇<br/>
                    <span class="text-xs opacity-70">支援多選，自動轉為 JPG</span>
                </p>
            </div>
            
            <div class="flex gap-4">
                <div class="relative">
                    <Button variant="default" class="cursor-pointer">
                        選擇圖片
                    </Button>
                    <input 
                        type="file" 
                        accept="image/*"
                         multiple
                        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        @change="handleInput"
                    />
                </div>
            </div>
        </div>
    </Card>

    <!-- Action Bar (When Files Exist) -->
    <div v-else class="tool-action-bar">
         <div class="tool-action-left">
             <div class="relative group w-full sm:w-auto">
                 <input
                    type="file"
                    accept="image/*"
                     multiple
                    class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                    @change="handleInput"
                    title="繼續上傳"
                />
                <Button 
                    variant="outline" 
                    class="w-full sm:w-auto gap-2"
                >
                    <Upload class="h-4 w-4" />
                    繼續上傳
                </Button>
             </div>
             
             <div class="tool-action-separator"></div>
             
             <div class="flex items-center gap-2 text-sm">
                 <span class="font-medium">{{ images.length }} 張圖片</span>
             </div>
         </div>
         
         <div class="tool-action-right">
             <ToolButton 
              type="clear" 
              label="清空"
              @click="clearAll" 
            />
            <ToolButton 
              type="copy" 
              label="複製結果"
              :copied="showCopied"
              @click="copyToClipboard"
            />
            <ToolButton 
              type="download" 
              label="打包下載"
              :loading="isDownloading"
              @click="downloadAllImages"
            />
         </div>
    </div>

    <!-- 3. Image Grid -->
    <div v-if="images.length > 0" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
        <div
            v-for="(img, index) in images"
            :key="img.id"
            class="group relative flex flex-col rounded-xl border bg-card text-card-foreground shadow-sm transition-all overflow-hidden"
            :class="{ 
                'ring-2 ring-primary border-primary z-10': dropTargetIndex === index,
                'opacity-40 grayscale-[0.5] scale-95': dragIndex === index,
                'border-primary/50 bg-primary/5 shadow-inner translate-y-1': sortTargetIndex === index && dragIndex !== index,
                'hover:shadow-md hover:border-primary/30': dragIndex === null && dropTargetIndex === null && sortTargetIndex === null
            }"
            draggable="true"
            @dragstart="onDragStart($event, index)"
            @dragover="onDragOver($event, index)"
            @dragleave="onDragLeave"
            @dragend="onDragEnd"
            @drop="onDrop($event, index)"
        >
            <!-- Sort Indicator Line -->
            <div v-if="sortTargetIndex === index && dragIndex !== index" class="absolute inset-0 border-2 border-dashed border-primary/40 rounded-xl pointer-events-none"></div>
            <!-- Drag Handle & Remove -->
            <div class="absolute right-2 top-2 z-20 flex gap-1.5 opacity-0 transition-opacity group-hover:opacity-100">
                <button 
                  @click="triggerReplace(index)" 
                  class="rounded-full bg-background/80 p-1.5 text-primary hover:bg-primary hover:text-white backdrop-blur-sm shadow-sm transition-colors"
                  title="更換圖片"
                >
                    <RefreshCw class="h-3.5 w-3.5" />
                </button>
                <button 
                  @click="removeImage(index)" 
                  class="rounded-full bg-background/80 p-1.5 text-destructive hover:bg-destructive hover:text-white backdrop-blur-sm shadow-sm transition-colors"
                  title="刪除圖片"
                >
                    <X class="h-3.5 w-3.5" />
                </button>
            </div>
            
            <div class="absolute left-2 top-2 z-20 opacity-0 transition-opacity group-hover:opacity-100 cursor-move">
                <div class="rounded-full bg-background/80 p-1.5 text-foreground backdrop-blur-sm shadow-sm">
                        <GripVertical class="h-3.5 w-3.5" />
                </div>
            </div>
            
             <div class="absolute left-2 top-2 z-10" v-if="!img.isDropdownOpen">
                 <div class="bg-black/60 text-white text-[10px] px-1.5 py-0.5 rounded font-mono backdrop-blur-sm">
                     #{{ index + 1 }}
                 </div>
            </div>

            <!-- Preview Image -->
            <div class="aspect-video w-full overflow-hidden bg-secondary relative">
                <img :src="img.previewUrl" class="h-full w-full object-cover object-top" />
                
                <!-- Drop Overlay (External Files) -->
                <div v-if="dropTargetIndex === index" class="absolute inset-0 bg-primary/20 backdrop-blur-[2px] flex items-center justify-center transition-all pointer-events-none">
                    <div class="bg-primary text-white p-2 rounded-full shadow-lg scale-110 animate-bounce">
                        <Upload class="w-5 h-5" />
                    </div>
                </div>
            </div>

            <!-- Controls -->
            <div class="p-3 space-y-2 border-t border-border">
                <div class="text-xs text-muted-foreground font-mono truncate" :title="img.file.name">
                    {{ img.file.name }}
                </div>
                
                <!-- Custom Searchable Dropdown -->
                <div class="relative">
                    <input
                        type="text"
                        v-model="img.suffix"
                        @focus="img.isDropdownOpen = true"
                        @blur="closeDropdownDelay(img)"
                        @keydown="handleKeyDown($event, img)"
                        placeholder="選擇或輸入後綴..."
                        class="flex h-8 w-full rounded-md border border-input bg-background/50 px-2.5 py-1 text-xs shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50 disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <!-- Dropdown Options -->
                    <div 
                        v-if="img.isDropdownOpen"
                        class="absolute bottom-full left-0 z-30 mb-1 max-h-[160px] w-full overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                    >
                        <div
                            v-for="(option, optIndex) in getOptionsFor(img)"
                            :key="option"
                            @click="selectSuffix(img, option)"
                            class="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-xs outline-none data-disabled:pointer-events-none data-disabled:opacity-50"
                            :class="{
                                'bg-accent text-accent-foreground': img.highlightedIndex === optIndex,
                                'hover:bg-accent hover:text-accent-foreground': img.highlightedIndex !== optIndex,
                                'text-muted-foreground opacity-60': isOptionUsed(option, img.suffix)
                            }"
                        >
                            <span :class="{ 'line-through': isOptionUsed(option, img.suffix) && false }">
                                {{ option }}
                            </span>
                            <Check v-if="img.suffix === option" class="ml-auto h-3 w-3" />
                            <span v-if="isOptionUsed(option, img.suffix)" class="ml-auto text-[9px] uppercase border px-1 rounded opacity-50">Used</span>
                        </div>
                        
                        <div v-if="getOptionsFor(img).length === 0" class="px-2 py-1.5 text-xs text-muted-foreground">
                            無相符選項
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </div>
    
     <!-- 4. Result Preview (Optional/At Bottom) -->
    <div v-if="images.length > 0" class="rounded-lg border border-border bg-muted/30 p-4">
         <div class="flex items-center gap-2 mb-2 text-sm text-muted-foreground font-medium">
             <FileText class="w-4 h-4" />
             預覽結果列表
         </div>
         <div class="font-mono text-xs text-muted-foreground/80 whitespace-pre overflow-x-auto leading-relaxed max-h-[150px] overflow-y-auto">
{{ generatedList || '尚未產生結果...' }}
         </div>
    </div>

    <!-- Hidden input for single image replacement -->
    <input
        ref="replaceInputRef"
        type="file"
        accept="image/*"
        class="hidden"
        @change="handleReplace"
    />
  </div>
</template>

<style scoped>
/* Optional: Better scrollbar for dropdown */
.overflow-auto::-webkit-scrollbar {
  width: 4px;
}
.overflow-auto::-webkit-scrollbar-track {
  background: transparent;
}
.overflow-auto::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.3);
  border-radius: 3px;
}

button {
  cursor: pointer;
}
</style>

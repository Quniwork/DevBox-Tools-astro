<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Card } from '@/components/ui/card';
import { Upload, X, GripVertical, Check, Copy, History, Link, Download } from 'lucide-vue-next';
import DropZone from '@/components/ui/DropZone.vue';
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
    'promotions'
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

// Remove an image (and revoke URL)
const removeImage = (index: number) => {
  URL.revokeObjectURL(images.value[index].previewUrl);
  images.value.splice(index, 1);
};

// Drag & Drop Sorting
const onDragStart = (e: DragEvent, index: number) => {
  dragIndex.value = index;
  if (e.dataTransfer) {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.dropEffect = 'move';
  }
};

const onDragOver = (e: DragEvent) => {
  e.preventDefault(); // Necessary to allow dropping
};

const onDrop = (e: DragEvent, index: number) => {
  e.preventDefault();
  if (dragIndex.value !== null && dragIndex.value !== index) {
    const itemToMove = images.value[dragIndex.value];
    images.value.splice(dragIndex.value, 1);
    images.value.splice(index, 0, itemToMove);
  }
  dragIndex.value = null;
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
// Logic: filtered by query -> sorted (standard first, used last) -> return
const getOptionsFor = (item: ImageItem) => {
    const query = item.suffix || '';
    
    // 1. Filter
    let options = CONFIG.SUFFIX_OPTIONS;
    if (query) {
       // If user is typing, we might want to show matches first
       // But if exact match exists, we keep it
       options = CONFIG.SUFFIX_OPTIONS.filter(opt => opt.toLowerCase().includes(query.toLowerCase()));
    }
    
    // 2. Sort/Group
    // We want un-used ones at top, used ones at bottom
    // BUT exception: if the 'used' one is the CURRENT item's value, it shouldn't be penalized?
    // Actually, simple logic: if it IS in usedSuffixes AND NOT current item's suffix, push down.
    
    const currentVal = item.suffix;
    
    const unused: string[] = [];
    const used: string[] = [];
    
    options.forEach(opt => {
        // If it is used by SOMEONE
        if (usedSuffixes.value.has(opt)) {
            // If it is THIS item that uses it, treat as unused (keep at top/normal position)
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
        scrollIntoView(item.highlightedIndex);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (item.highlightedIndex > 0) {
            item.highlightedIndex--;
        } else {
            item.highlightedIndex = options.length - 1; // Cycle to bottom
        }
        scrollIntoView(item.highlightedIndex);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (item.highlightedIndex >= 0 && item.highlightedIndex < options.length) {
            selectSuffix(item, options[item.highlightedIndex]);
             // Trigger blur effectively or close
             // Wait, handleFiles logic sets focus? No.
             // We can manually blur or just close.
             // (selectSuffix closes dropdown)
             // Optional: Move focus to next input? User didn't ask but it's nice.
             // sticking to requirements: Enter confirms selection.
        } else if (options.length === 1) {
            // Auto select if only 1 match? (Optional, maybe specific request only)
            // selectSuffix(item, options[0]); 
        }
    }
};

const scrollIntoView = (index: number) => {
    // Simple implementation: relying on standard scrollIntoView behavior might interrupt flow?
    // We can rely on Vue updated hook or nextTick with ref, but let's try simple class logic first.
    // Actually, proper auto-scroll requires access to DOM elements.
    // For now we implement visual highlighting and keys. 
    // If list is long, user might not see highlighting.
    
    // We can try to use ID based lookup since we are in a loop
    // But usually simple arrow nav is acceptable without complex scrolling logic for < 10 items.
    // CONFIG.SUFFIX_OPTIONS is small (10).
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
    } catch (err) {
        console.error('Failed to copy', err);
    }
};

const downloadAllImages = async () => {
    if (images.value.length === 0 || !siteName.value.trim()) return;
    
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
    <!-- Top Row: Config & Upload (Side by Side) -->
    <div class="grid gap-6 lg:grid-cols-2">
      
      <!-- 1. Configuration Section -->
      <Card class="border-border bg-card p-5 flex flex-col h-full">
        <div class="flex items-center gap-2 mb-4">
            <div class="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                <Link class="w-5 h-5 text-primary" />
            </div>
            <h3 class="text-base font-semibold text-foreground">網站設定</h3>
        </div>
        
        <div class="flex-1 flex flex-col gap-4">
            <div class="space-y-2">
                <div class="relative">
                  <input
                    v-model="siteName"
                    type="text"
                    placeholder="請輸入網站名稱"
                    @focus="isSiteHistoryOpen = true"
                    @blur="closeSiteHistoryDelay"
                    class="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm transition-all font-mono"
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
            
            <div class="rounded-lg p-4">
                <p class="text-xs text-muted-foreground mb-1">提示：</p>
                <ul class="text-xs text-muted-foreground list-disc list-inside space-y-1">
                    <li>輸入站名後會自動儲存至歷史紀錄。</li>
                    <li>所有圖片將自動轉為 JPG 格式。</li>
                    <li>圖片大小會自動壓縮至 600KB 以下。</li>
                    <li>在後綴選單中，已使用的項目會下沉並變淡。</li>
                </ul>
            </div>
        </div>
      </Card>

      <!-- 2. Image Upload Section -->
      <div class="flex flex-col h-full">
         <DropZone
            accept="image/*"
            :multiple="true"
            title="上傳圖片"
            hint="支援多檔上傳 (JPG, PNG, WebP...)"
            @files="handleFiles"
            class="h-full min-h-[300px]"
         >
             <template #icon>
                 <Upload class="h-6 w-6 text-foreground" />
             </template>
         </DropZone>
      </div>
    </div>

    <!-- 3. Image Sorting & Naming List -->
    <Card v-if="images.length > 0" class="border-border bg-card p-5">
        <div class="flex items-center justify-between mb-4">
             <div class="flex items-center gap-2">
                <div class="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
                    <History class="w-5 h-5 text-primary" />
                </div>
                <h3 class="text-base font-semibold text-foreground">圖片排序與命名 ({{ images.length }} 張)</h3>
            </div>
            
            <ToolButton 
              type="clear" 
              label="清空所有"
              @click="images = []" 
            />
        </div>

        <div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-5">
            <div
                v-for="(img, index) in images"
                :key="img.id"
                class="group relative flex flex-col rounded-lg border bg-card text-card-foreground shadow-sm transition-all"
                :class="{ 'border-primary ring-1 ring-primary': dragIndex === index, 'hover:shadow-md': dragIndex === null }"
                draggable="true"
                @dragstart="onDragStart($event, index)"
                @dragover="onDragOver"
                @drop="onDrop($event, index)"
            >
                <!-- Drag Handle & Remove -->
                <div class="absolute right-2 top-2 z-10 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                     <button @click="removeImage(index)" class="rounded-full bg-background/80 p-1 text-destructive hover:bg-destructive hover:text-destructive-foreground backdrop-blur-sm">
                        <X class="h-4 w-4" />
                    </button>
                </div>
                
                <div class="absolute left-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100 cursor-move">
                    <div class="rounded-full bg-background/80 p-1 text-foreground backdrop-blur-sm">
                         <GripVertical class="h-4 w-4" />
                    </div>
                </div>

                <!-- Preview Image -->
                <div class="aspect-video w-full overflow-hidden rounded-t-lg bg-muted">
                    <img :src="img.previewUrl" class="h-full w-full object-cover object-top" />
                </div>

                <!-- Controls -->
                <div class="p-3 space-y-2">
                    <div class="text-xs text-muted-foreground font-mono truncate">
                        {{ index + 1 }}. {{ img.file.name }}
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
                            class="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        />
                        <!-- Dropdown Options -->
                        <div 
                            v-if="img.isDropdownOpen"
                            class="absolute z-20 mt-1 max-h-[200px] w-full overflow-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
                        >
                            <div
                                v-for="(option, optIndex) in getOptionsFor(img)"
                                :key="option"
                                @click="selectSuffix(img, option)"
                                class="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-disabled:pointer-events-none data-disabled:opacity-50"
                                :class="{
                                    'bg-accent text-accent-foreground': img.highlightedIndex === optIndex,
                                    'hover:bg-accent hover:text-accent-foreground': img.highlightedIndex !== optIndex,
                                    'text-muted-foreground opacity-60': isOptionUsed(option, img.suffix)
                                }"
                            >
                                <span :class="{ 'line-through': isOptionUsed(option, img.suffix) && false }">
                                    {{ option }}
                                </span>
                                <Check v-if="img.suffix === option" class="ml-auto h-4 w-4" />
                                <span v-if="isOptionUsed(option, img.suffix)" class="ml-auto text-[10px] uppercase border px-1 rounded opacity-50">Used</span>
                            </div>
                            
                            <div v-if="getOptionsFor(img).length === 0" class="px-2 py-1.5 text-sm text-muted-foreground">
                                無相符選項
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    </Card>

    <!-- 4. Result Output -->
    <Card v-if="images.length > 0 || siteName" class="border-border bg-card p-5">
        <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-4">
             <div class="flex items-center gap-2">
                <div class="w-9 h-9 rounded-lg bg-chart-2/20 flex items-center justify-center">
                    <Check class="w-5 h-5 text-chart-2" />
                </div>
                <h3 class="text-base font-semibold text-foreground">產生結果</h3>
            </div>
            
            <div class="flex w-full sm:w-auto gap-2">
                 <Button size="sm" variant="outline" @click="copyToClipboard" class="flex-1 sm:flex-none">
                    <Copy class="mr-2 h-4 w-4" />
                    複製結果
                </Button>
                 <Button size="sm" @click="downloadAllImages" :disabled="isDownloading" class="flex-1 sm:flex-none bg-primary text-white hover:bg-primary/90">
                    <Download v-if="!isDownloading" class="mr-2 h-4 w-4" />
                    <span v-else class="mr-2 h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                    {{ isDownloading ? '打包中...' : '打包下載' }}
                </Button>
            </div>
        </div>
        
        <div class="rounded-md bg-muted p-4 font-mono text-sm overflow-x-auto whitespace-pre leading-relaxed">
{{ generatedList || '尚未產生結果...' }}
        </div>
    </Card>
  </div>
</template>

<style scoped>
/* Optional: Better scrollbar for dropdown */
.overflow-auto::-webkit-scrollbar {
  width: 6px;
}
.overflow-auto::-webkit-scrollbar-track {
  background: transparent;
}
.overflow-auto::-webkit-scrollbar-thumb {
  background-color: hsl(var(--muted-foreground) / 0.3);
  border-radius: 3px;
}
</style>

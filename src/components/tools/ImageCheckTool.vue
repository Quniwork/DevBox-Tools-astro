<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { AlertCircle, CheckCircle2, FolderSearch, Loader2, RefreshCw, Upload, Download, Image, X } from 'lucide-vue-next';
import Button from '@/components/ui/Button.vue';
import ToolButton from '@/components/ui/ToolButton.vue';
import JSZip from 'jszip';

// ========================================
// Types
// ========================================
interface ScannedFile {
  file: File;         // Original file
  path: string;       // Display path
  folder: string;     // Folder part
  name: string;       // Filename
  originalSize: number;
  type: string;
  isOverLimit: boolean;
  isExcluded: boolean;
  previewUrl: string; // Preview URL for thumbnail
  
  // Optimization State
  status: 'pending' | 'processing' | 'done' | 'error';
  optimizedBlob?: Blob;
  optimizedSize?: number;
}

const LIMIT_SIZE_KB = 600;
const LIMIT_SIZE_BYTES = LIMIT_SIZE_KB * 1024;

// ========================================
// State
// ========================================
const isScanning = ref(false);
const scannedFiles = ref<ScannedFile[]>([]);
const dragActive = ref(false);
const isCompressing = ref(false); // Global compressing state (for download packaging)

// Stats
// Active files = Non-excluded files
const activeFiles = computed(() => scannedFiles.value.filter(f => !f.isExcluded));
const totalCount = computed(() => activeFiles.value.length);
const overLimitCount = computed(() => activeFiles.value.filter(f => f.isOverLimit).length);
const passCount = computed(() => totalCount.value - overLimitCount.value);

// Savings Stats
const totalOriginalSize = computed(() => activeFiles.value.reduce((acc, f) => acc + f.originalSize, 0));
const totalOptimizedSize = computed(() => activeFiles.value.reduce((acc, f) => {
    // If done/optimized, use new size. If over limit but not done, estimate (or keep original).
    // If not over limit, use original.
    if (f.isOverLimit && f.status === 'done' && f.optimizedSize) {
        return acc + f.optimizedSize;
    }
    return acc + f.originalSize; // Assume no saving if not processed yet or not needed
}, 0));

const totalSavings = computed(() => {
    if (totalOriginalSize.value === 0) return 0;
    return totalOriginalSize.value - totalOptimizedSize.value;
});

const savingsPercentage = computed(() => {
    if (totalOriginalSize.value === 0) return 0;
    return Math.round((totalSavings.value / totalOriginalSize.value) * 100);
});


// Filtered List - Show Over Limit Files Only (as per request/previous logic) 
const overLimitFiles = computed(() => 
    activeFiles.value
        .filter(f => f.isOverLimit)
        .sort((a, b) => b.originalSize - a.originalSize)
);

// ========================================
// Methods
// ========================================

const formatSize = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
};

// Download single file
const downloadFile = (file: ScannedFile) => {
    const blob = file.optimizedBlob || file.file;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
};

// Remove single file
const removeFile = (file: ScannedFile) => {
    // Revoke preview URL
    if (file.previewUrl) {
        URL.revokeObjectURL(file.previewUrl);
    }
    // Remove from array
    const index = scannedFiles.value.findIndex(f => f.path === file.path);
    if (index > -1) {
        scannedFiles.value.splice(index, 1);
    }
};

// Handle Input Change
const handleInputChange = (event: Event) => {
    const input = event.target as HTMLInputElement;
    if (input.files) {
        processInputFiles(input.files);
    }
    input.value = '';
};

const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    dragActive.value = true;
};

const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    dragActive.value = false;
};

// Handle Drop
const handleDrop = async (event: DragEvent) => {
    event.preventDefault();
    dragActive.value = false;
    
    const items = event.dataTransfer?.items;
    if (!items) return;

    isScanning.value = true;
    scannedFiles.value = []; 
    
    const processedFiles: { file: File, path: string }[] = [];
    const queue: { entry: FileSystemEntry, path: string }[] = [];

    for (let i = 0; i < items.length; i++) {
        const entry = items[i].webkitGetAsEntry?.();
        if (entry) {
            if (entry.isDirectory) {
                const subEntries = await readDir(entry as FileSystemDirectoryEntry);
                subEntries.forEach(sub => {
                    queue.push({ entry: sub, path: '' }); 
                });
            } else {
                 queue.push({ entry, path: '' });
            }
        }
    }
    
    while (queue.length > 0) {
        const { entry, path } = queue.shift()!;
        if (entry.isFile) {
            const file = await getFileFromEntry(entry as FileSystemFileEntry);
            const fullPath = path ? `${path}/${entry.name}` : entry.name;
            if (file) processedFiles.push({ file, path: fullPath });
        } else if (entry.isDirectory) {
            const subEntries = await readDir(entry as FileSystemDirectoryEntry);
            const newPath = path ? `${path}/${entry.name}` : entry.name;
            subEntries.forEach(sub => {
                queue.push({ entry: sub, path: newPath });
            });
        }
    }
    
    processFinalList(processedFiles);
    isScanning.value = false;
};

// File System Helpers
const getFileFromEntry = (entry: FileSystemFileEntry): Promise<File> => {
    return new Promise((resolve) => entry.file(resolve));
};

const readDir = (entry: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> => {
    return new Promise((resolve) => {
        const reader = entry.createReader();
        reader.readEntries((entries) => resolve(entries));
    });
};

const processInputFiles = (fileList: FileList) => {
    const rawFiles = Array.from(fileList);
    const processedFiles: { file: File, path: string }[] = [];

    rawFiles.forEach(file => {
        const parts = file.webkitRelativePath.split('/');
        if (parts.length > 1) {
            parts.shift(); // Remove root
        }
        const relPath = parts.join('/');
        processedFiles.push({ file, path: relPath });
    });

    processFinalList(processedFiles);
};

// Core Logic
const processFinalList = async (items: { file: File, path: string }[]) => {
    const results: ScannedFile[] = [];

    for (const { file, path } of items) {
        if (!file.type.startsWith('image/')) continue;
        
        const isExcluded = path.includes('not-use/') || path.startsWith('not-use/');
        const lastSlash = path.lastIndexOf('/');
        const folder = lastSlash !== -1 ? path.substring(0, lastSlash) + '/' : './';
        const name = file.name;
        const isOverLimit = file.size > LIMIT_SIZE_BYTES;
        
        const fileItem: ScannedFile = {
            file,
            path,
            folder,
            name,
            originalSize: file.size,
            type: file.type,
            isOverLimit,
            isExcluded,
            previewUrl: URL.createObjectURL(file), // Generate preview URL
            status: isOverLimit && !isExcluded ? 'pending' : 'done', // Only pending if needs compression
        };
        
        results.push(fileItem);
    }

    scannedFiles.value = results;
    
    // Auto start optimization for overlimit files
    processOptimization();
};

const processOptimization = async () => {
    const pendingFiles = scannedFiles.value.filter(f => f.status === 'pending');
    
    // Parallelize with limit? Or simple map. Simple map OK for client side usually.
    // Let's do a sequence or chunk to be nice to UI thread.
    
    for (const item of pendingFiles) {
        item.status = 'processing';
        try {
            const blob = await convertToOptimizedBlob(item.file);
            item.optimizedBlob = blob;
            item.optimizedSize = blob.size;
            item.status = 'done';
        } catch (e) {
            console.error(e);
            item.status = 'error';
        }
    }
};

const clearAll = () => {
    scannedFiles.value = [];
};

// ========================================
// Compression / Download
// ========================================
const fixAndDownload = async () => {
    if (scannedFiles.value.length === 0) return;

    isCompressing.value = true;
    try {
        const zip = new JSZip();
        
        const promises = scannedFiles.value.map(async (item) => {
            let blob: Blob;

            // Use already optimized blob if available
            if (item.optimizedBlob) {
                blob = item.optimizedBlob;
            } else if (item.isOverLimit && !item.isExcluded && item.status !== 'error') {
                try {
                    blob = await convertToOptimizedBlob(item.file);
                } catch (e) {
                    console.warn(`Skipping optimization for ${item.name}:`, e);
                    blob = item.file; // Fallback
                }
            } else {
                blob = item.file;
            }

            zip.file(item.path, blob);
        });
        
        await Promise.all(promises);
        
        const content = await zip.generateAsync({ type: 'blob' });
        
        const link = document.createElement('a');
        link.href = URL.createObjectURL(content);
        link.download = `full_project_images.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(link.href);
        
    } catch (err) {
        console.error('Download failed', err);
        alert('處理失敗，請重試');
    } finally {
        isCompressing.value = false;
    }
};

const convertToOptimizedBlob = async (file: File): Promise<Blob> => {
    const MAX_SIZE = LIMIT_SIZE_BYTES;
    const type = file.type; // 'image/png' or 'image/jpeg'
    
    return new Promise((resolve, reject) => {
        const img = new Image();
        const url = URL.createObjectURL(file);
        
        img.onload = async () => {
             // 1. 初始嘗試：使用高品質
             let quality = 0.9; 
             let blob = await getCanvasBlob(img, quality, 1, type);
             
             // 2. 品質優化循環（適用於 JPG/WebP/PNG）
             let attempts = 0;
             while (blob && blob.size > MAX_SIZE && quality > 0.1 && attempts < 50) {
                 quality -= 0.05;
                 blob = await getCanvasBlob(img, quality, 1, type);
                 attempts++;
             }
             
             // 3. 縮放循環（如果品質降低仍無法達標）
             if (blob && blob.size > MAX_SIZE) {
                 quality = 0.8;
                 let scale = 0.95;
                 let scaledBlob = blob;
                 attempts = 0;
                  while (scaledBlob && scaledBlob.size > MAX_SIZE && scale > 0.3 && attempts < 50) {
                     scaledBlob = await getCanvasBlob(img, quality, scale, type); 
                     scale -= 0.05;
                     attempts++;
                 }
                 blob = scaledBlob;
             }
             
             // 最終檢查
             if (blob && blob.size > MAX_SIZE) {
                 reject(new Error('FILE_TOO_LARGE'));
                 return;
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

const getCanvasBlob = (img: HTMLImageElement, quality: number, scale: number = 1, type: string): Promise<Blob | null> => {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        canvas.width = Math.floor(img.width * scale);
        canvas.height = Math.floor(img.height * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            resolve(null);
            return;
        }
        
        // 僅 JPG 需要白色背景（不支援透明）
        if (type === 'image/jpeg') {
            ctx.fillStyle = '#FFFFFF';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
        }
        
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
            resolve(blob);
        }, type, quality);
    });
};
const downloadUnoptimized = async () => {
    // Filter files that effectively failed optimization or are just over limit and skipped
    const targetFiles = scannedFiles.value.filter(f => !f.isExcluded && f.status === 'error');

    if (targetFiles.length === 0) {
        alert('沒有需要外部處理的檔案');
        return;
    }

    const zip = new JSZip();
    targetFiles.forEach(item => {
        zip.file(item.path, item.file); // Add original file
    });

    const content = await zip.generateAsync({ type: 'blob' });
    const link = document.createElement('a');
    link.href = URL.createObjectURL(content);
    link.download = `unoptimized_images_for_manual_processing.zip`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
};

// ========================================
// Preview Modal Logic
// ========================================
const previewItem = ref<ScannedFile | null>(null);
const previewUrl = ref<string>('');
const isMounted = ref(false);

onMounted(() => {
    isMounted.value = true;
});

const openPreview = (item: ScannedFile) => {
    previewItem.value = item;
    // Show optimized if done, else original
    const blob = (item.status === 'done' && item.optimizedBlob) ? item.optimizedBlob : item.file;
    previewUrl.value = URL.createObjectURL(blob);
};

const closePreview = () => {
    if (previewUrl.value) {
        URL.revokeObjectURL(previewUrl.value);
        previewUrl.value = '';
    }
    previewItem.value = null;
};
</script>

<template>
  <div class="space-y-6">
    


    <!-- Initial Large Drop Zone -->
    <Card 
        v-if="scannedFiles.length === 0"
        class="tool-dropzone"
        :class="dragActive ? 'tool-dropzone-active' : 'tool-dropzone-inactive'"
        @dragenter="handleDragOver"
        @dragover="handleDragOver"
        @dragleave="handleDragLeave"
        @drop="handleDrop"
    >
        <div class="tool-dropzone-content">
            <div class="tool-dropzone-icon-wrapper">
                <FolderSearch v-if="!isScanning" class="w-10 h-10" />
                <Loader2 v-else class="w-10 h-10 animate-spin" />
            </div>
            <div class="space-y-2">
                <h3 class="tool-dropzone-title">{{ isScanning ? '掃描中...' : '拖曳資料夾至此 或 點擊選擇' }}</h3>
                <p class="tool-dropzone-description">
                    系統會自動忽略 <code class="bg-muted px-1 rounded">not-use</code> 資料夾的檢查，但下載時會保留完整結構。
                </p>
            </div>
            
            <div class="flex gap-4" v-if="!isScanning">
                <div class="relative">
                    <Button variant="default" class="cursor-pointer">
                        選擇資料夾
                    </Button>
                    <!-- Input triggers scanning -->
                    <input 
                        type="file" 
                        webkitdirectory 
                        directory 
                        multiple 
                        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                        @change="handleInputChange"
                    />
                </div>
            </div>
        </div>
    </Card>


    <!-- Main Interface (Action Bar + List) -->
    <div v-else class="space-y-4">

        <!-- Action Bar -->
        <div class="tool-action-bar">
            
            <div class="tool-action-left">
                <!-- Left: Upload Button (Drag Zone) -->
                <div 
                    class="relative group w-full sm:w-auto"
                    @dragover="handleDragOver"
                    @dragleave="handleDragLeave"
                    @drop="handleDrop"
                >
                    <input
                        type="file"
                        webkitdirectory
                        directory
                        multiple
                        class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
                        @change="handleInputChange"
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

                <!-- Stats: Left aligned next to upload button -->
                <div class="flex items-center gap-4 text-sm">
                    <div class="flex items-center gap-2">
                        <span class="text-xs text-muted-foreground">共</span>
                        <span class="font-medium text-foreground">{{ totalCount }}</span>
                        <span class="text-xs text-muted-foreground">個檔案</span>
                    </div>
                    
                    <template v-if="overLimitCount > 0">
                        <div class="h-4 w-px bg-border hidden sm:block"></div>
                        <div class="flex items-center gap-2">
                            <div class="text-xs text-muted-foreground">總計節省</div>
                            <div class="font-medium font-mono text-chart-2">{{ formatSize(totalSavings) }}</div>
                        </div>
                        <div v-if="totalSavings > 0" class="flex items-center">
                            <span 
                                class="rounded-full px-2 py-0.5 text-xs font-medium bg-chart-2/20 text-chart-2"
                            >
                                -{{ savingsPercentage }}%
                            </span>
                        </div>
                    </template>
                     <div v-if="overLimitCount === 0" class="h-4 w-px bg-border hidden sm:block"></div>
                    <div v-if="overLimitCount === 0" class="flex items-center gap-1 text-chart-2">
                        <CheckCircle2 class="w-4 h-4" />
                        <span class="text-xs font-medium">全數合格</span>
                    </div>
                </div>
            </div>
            
            <!-- Right: Actions -->
            <div class="tool-action-right">
                <ToolButton 
                    type="clear" 
                    @click="clearAll" 
                />
                
                <!-- Download Unoptimized Files Button -->
                <ToolButton 
                    v-if="scannedFiles.some(f => f.status === 'error')"
                    type="download"
                    label="下載未達標"
                    variant="warning"
                    @click="downloadUnoptimized"
                />

                <!-- Download All Button -->
                <ToolButton 
                    type="download" 
                    label="全部下載"
                    :loading="isCompressing"
                    @click="fixAndDownload"
                />
            </div>
        </div>

        <!-- Dashboard Stats (Restored) -->
        <div class="grid gap-4 md:grid-cols-3">
            <Card>
                <CardContent class="pt-6 flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-muted-foreground">掃描總數</p>
                        <h3 class="text-2xl font-bold">{{ totalCount }}</h3>
                    </div>
                    <FolderSearch class="h-8 w-8 text-muted-foreground opacity-20" />
                </CardContent>
            </Card>
            
            <Card :class="overLimitCount > 0 ? 'bg-destructive/10 border-destructive/20' : ''">
                <CardContent class="pt-6 flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-destructive">超過 600KB</p>
                        <h3 class="text-2xl font-bold text-destructive">{{ overLimitCount }}</h3>
                    </div>
                    <AlertCircle class="h-8 w-8 text-destructive opacity-50" />
                </CardContent>
            </Card>

            <Card>
                <CardContent class="pt-6 flex items-center justify-between">
                    <div>
                        <p class="text-sm font-medium text-chart-2">合格檔案</p>
                        <h3 class="text-2xl font-bold text-chart-2">{{ passCount }}</h3>
                    </div>
                    <CheckCircle2 class="h-8 w-8 text-chart-2 opacity-50" />
                </CardContent>
            </Card>
        </div>

        <!-- Result List (Visible only if there are overLimit items) -->
        <Card v-if="overLimitCount > 0" class="bg-card">
            <CardContent class="p-0">
                <table class="data-table">
                    <thead class="data-table-header">
                        <tr>
                            <th class="data-table-header-cell text-left w-[50px]">縮圖</th>
                            <th class="data-table-header-cell text-left">檔案名稱</th>
                            <th class="data-table-header-cell text-right hidden sm:table-cell">原始大小</th>
                            <th class="data-table-header-cell text-right">優化後大小</th>
                            <th class="data-table-header-cell text-right">操作</th>
                        </tr>
                    </thead>
                    <tbody class="data-table-body">
                        <tr v-for="file in overLimitFiles" :key="file.path" class="data-table-row">
                            <!-- Thumbnail -->
                            <td class="data-table-cell">
                                <div 
                                    class="data-table-thumbnail w-10 h-10 flex items-center justify-center"
                                    @click="openPreview(file)"
                                >
                                    <img 
                                        v-if="file.previewUrl" 
                                        :src="file.previewUrl" 
                                        :alt="file.name"
                                        class="w-full h-full object-cover"
                                    />
                                    <Image v-else class="w-5 h-5 text-muted-foreground" />
                                </div>
                            </td>
                            
                            <!-- File Name & Path -->
                            <td class="data-table-cell">
                                <div class="flex items-center gap-3 min-w-0">
                                    <div class="min-w-0 flex flex-col">
                                        <span class="font-medium text-foreground truncate max-w-[150px] sm:max-w-xs" :title="file.name">{{ file.name }}</span>
                                        <div v-if="file.folder" class="text-xs text-muted-foreground/70 truncate max-w-[150px] sm:max-w-xs font-mono" :title="file.folder">
                                            {{ file.folder }}
                                        </div>
                                    </div>
                                </div>
                            </td>
                            
                            <!-- Original Size -->
                            <td class="data-table-cell text-right font-mono text-muted-foreground hidden sm:table-cell text-xs">
                                {{ formatSize(file.originalSize) }}
                            </td>
                            
                            <!-- Optimized Size / Status -->
                            <td class="data-table-cell text-right">
                                <div v-if="file.status === 'processing'" class="flex items-center justify-end gap-1.5 text-primary">
                                    <Loader2 class="w-3.5 h-3.5 animate-spin" />
                                    <span class="text-xs font-medium">處理中</span>
                                </div>
                                <div v-else-if="file.status === 'done'" class="flex flex-col items-end gap-0.5">
                                    <span 
                                       class="font-mono font-bold text-sm" 
                                       :class="file.optimizedSize && file.optimizedSize < file.originalSize ? 'text-chart-2' : 'text-muted-foreground'"
                                    >
                                       {{ formatSize(file.optimizedSize || 0) }}
                                    </span>
                                    <span 
                                       v-if="file.optimizedSize && file.optimizedSize < file.originalSize"
                                       class="badge-success"
                                    >
                                       -{{ Math.abs(Math.round(((file.originalSize - file.optimizedSize) / file.originalSize) * 100)) }}%
                                    </span>
                                </div>
                                <div v-else-if="file.status === 'error'" class="text-amber-500 text-xs font-medium flex items-center justify-end gap-1">
                                    <AlertCircle class="w-3 h-3" />
                                    保留原圖
                                </div>
                                <div v-else class="text-muted-foreground text-xs opacity-50">-</div>
                            </td>
                            
                            <!-- Actions -->
                            <td class="data-table-cell text-right">
                                <div class="flex items-center justify-end gap-1">
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        class="h-8 w-8 text-muted-foreground hover:text-foreground hover:bg-muted"
                                        title="預覽"
                                        @click="openPreview(file)"
                                    >
                                        <Image class="h-4 w-4" />
                                    </Button>
                                    
                                    <Button 
                                        v-if="file.status === 'done' || file.status === 'error'"
                                        variant="ghost" 
                                        size="icon" 
                                        class="h-8 w-8 text-chart-2/80 hover:text-chart-2 hover:bg-chart-2/10"
                                        @click="downloadFile(file)"
                                        title="下載"
                                    >
                                        <Download class="h-4 w-4" />
                                    </Button>
                                    
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        class="h-8 w-8 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                                        @click="removeFile(file)"
                                        title="移除"
                                    >
                                        <X class="h-4 w-4" />
                                    </Button>
                                </div>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </CardContent>
        </Card>
        
        <!-- Big Green Check if all good -->
         <Card v-if="totalCount > 0 && overLimitCount === 0" class="bg-card border-dashed">
             <CardContent class="py-12 text-center text-muted-foreground">
                <CheckCircle2 class="w-12 h-12 mx-auto mb-3 text-chart-2 opacity-50" />
                <p>恭喜！所有檢查的圖片都在 600KB 以下。</p>
            </CardContent>
        </Card>

    </div>

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
                :src="previewUrl" 
                :alt="previewItem.name"
                class="max-w-full max-h-full object-contain"
              />
              
              <!-- Floating Info Bar -->
              <div class="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-3 bg-black/60 backdrop-blur-xl rounded-full px-6 py-3 border border-white/10 shadow-2xl">
                <div class="flex items-center gap-2">
                  <span class="text-sm font-medium text-white/70">{{ previewItem.status === 'done' ? '優化後' : '原圖' }}</span>
                  <span class="text-sm font-mono text-white">
                    {{ formatSize(previewItem.status === 'done' && previewItem.optimizedSize ? previewItem.optimizedSize : previewItem.originalSize) }}
                  </span>
                </div>
                
                <div v-if="previewItem.status === 'done' && previewItem.optimizedSize" class="w-px h-6 bg-white/20"></div>
                
                <div v-if="previewItem.status === 'done' && previewItem.optimizedSize" class="flex items-center gap-2">
                  <span class="text-xs text-white/60">節省</span>
                  <span class="text-xs font-bold px-2 py-1 rounded bg-green-500/20 text-green-400">
                    -{{ Math.round(((previewItem.originalSize - previewItem.optimizedSize) / previewItem.originalSize) * 100) }}%
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
/* Modal Transition */
.modal-enter-active,
.modal-leave-active {
  transition: opacity 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}
</style>

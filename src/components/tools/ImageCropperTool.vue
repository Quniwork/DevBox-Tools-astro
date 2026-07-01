<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import { Card } from '@/components/ui/card';
import { Upload, X, Check, Copy, Download, RefreshCw, Trash2, Scissors, Info, FolderSearch } from 'lucide-vue-next';
import Button from '@/components/ui/Button.vue';
import ToolButton from '@/components/ui/ToolButton.vue';

// ========================================
// Types
// ========================================
interface CropperImageItem {
  id: string;
  file: File;
  previewUrl: string;
  naturalWidth: number;
  naturalHeight: number;
  maskX: number; // 遮罩在 169px 寬度小圖上的 X 座標
  maskY: number; // 遮罩在 169px 寬度小圖上的 Y 座標
}

// ========================================
// State
// ========================================
const images = ref<CropperImageItem[]>([]);
const isDragOver = ref(false);

// 拖曳遮罩相關暫存狀態
const activeDragId = ref<string | null>(null);
let startX = 0;
let startY = 0;
let startMaskX = 0;
let startMaskY = 0;

// ========================================
// Methods
// ========================================

// 處理載入圖片，獲取其真實解析度
const onImageLoad = (e: Event, id: string) => {
  const img = e.target as HTMLImageElement;
  const item = images.value.find(imgItem => imgItem.id === id);
  if (item) {
    item.naturalWidth = img.naturalWidth;
    item.naturalHeight = img.naturalHeight;
    
    // 初始化遮罩位置：固定 169x130 的置中
    item.maskX = (169 - 130) / 2; // 19.5
    item.maskY = (130 - 100) / 2; // 15
  }
};

// 處理上傳檔案
const handleFiles = (files: File[]) => {
  const validExtensions = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'];
  const imageFiles = files.filter(f => {
    if (f.name.startsWith('.')) return false; // 排除隱藏檔案
    const ext = f.name.split('.').pop()?.toLowerCase() || '';
    return f.type.startsWith('image/') || validExtensions.includes(ext);
  });

  const updatedImages = [...images.value];

  imageFiles.forEach(file => {
    // 檢查是否有同名檔案已在列表中
    const existingIndex = updatedImages.findIndex(img => img.file.name === file.name);
    
    if (existingIndex > -1) {
      // 僅更新檔案與 previewUrl，保留原本調整好的 maskX, maskY 與 id
      URL.revokeObjectURL(updatedImages[existingIndex].previewUrl);
      updatedImages[existingIndex] = {
        ...updatedImages[existingIndex],
        file,
        previewUrl: URL.createObjectURL(file)
      };
    } else {
      // 全新圖片，新增一筆置中卡片
      updatedImages.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
        naturalWidth: 1344,
        naturalHeight: 1024,
        maskX: 19.5,
        maskY: 15
      });
    }
  });

  images.value = updatedImages;
};

const handleFileInput = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    handleFiles(Array.from(input.files));
  }
  input.value = '';
};

const handleFolderInput = (e: Event) => {
  const input = e.target as HTMLInputElement;
  if (input.files && input.files.length > 0) {
    handleFiles(Array.from(input.files));
  }
  input.value = '';
};

// 刪除單張圖片
const removeImage = (index: number) => {
  URL.revokeObjectURL(images.value[index].previewUrl);
  images.value.splice(index, 1);
};

// 清除所有圖片
const clearAll = () => {
  images.value.forEach(img => URL.revokeObjectURL(img.previewUrl));
  images.value = [];
};

// 重設所有遮罩置中
const resetAllToCenter = () => {
  images.value.forEach(item => {
    item.maskX = (169 - 130) / 2;
    item.maskY = (130 - 100) / 2;
  });
};

const resetSingleVertical = (item: CropperImageItem) => {
  item.maskY = (130 - 100) / 2;
};

const resetSingleHorizontal = (item: CropperImageItem) => {
  item.maskX = (169 - 130) / 2;
};

// ========================================
// 拖曳遮罩邏輯
// ========================================
const startDrag = (e: MouseEvent | TouchEvent, item: CropperImageItem) => {
  e.preventDefault();
  activeDragId.value = item.id;
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
  startX = clientX;
  startY = clientY;
  startMaskX = item.maskX;
  startMaskY = item.maskY;

  window.addEventListener('mousemove', onDragging);
  window.addEventListener('mouseup', stopDrag);
  window.addEventListener('touchmove', onDragging, { passive: false });
  window.addEventListener('touchend', stopDrag);
};

const onDragging = (e: MouseEvent | TouchEvent) => {
  if (!activeDragId.value) return;
  e.preventDefault();
  
  const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
  const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
  
  const deltaX = clientX - startX;
  const deltaY = clientY - startY;
  
  const item = images.value.find(img => img.id === activeDragId.value);
  if (!item) return;
  
  // 計算新遮罩位置並進行邊界限制 (小圖固定 169x130)
  let newX = startMaskX + deltaX;
  let newY = startMaskY + deltaY;
  
  newX = Math.max(0, Math.min(newX, 169 - 130));
  newY = Math.max(0, Math.min(newY, 130 - 100));
  
  item.maskX = newX;
  item.maskY = newY;
};

const stopDrag = () => {
  activeDragId.value = null;
  window.removeEventListener('mousemove', onDragging);
  window.removeEventListener('mouseup', stopDrag);
  window.removeEventListener('touchmove', onDragging);
  window.removeEventListener('touchend', stopDrag);
};

// 拖曳上傳區 Events
const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  isDragOver.value = true;
};

const handleDragLeave = () => {
  isDragOver.value = false;
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  isDragOver.value = false;
  if (e.dataTransfer?.files) {
    handleFiles(Array.from(e.dataTransfer.files));
  }
};

// ========================================
// 裁切數值計算與導出
// ========================================
const getCropData = (item: CropperImageItem) => {
  const W_orig = item.naturalWidth;
  const H_orig = item.naturalHeight;
  
  // 橫向與縱向獨立計算縮放比 (方案 A - 完美對稱)
  const scaleX = W_orig / 169;
  const scaleY = H_orig / 130;

  let cropLeft = Math.round(item.maskX * scaleX);
  let cropTop = Math.round(item.maskY * scaleY);
  let cropWidth = Math.round(130 * scaleX);
  let cropHeight = Math.round(100 * scaleY);

  let cropRight = W_orig - cropLeft - cropWidth;
  let cropBottom = H_orig - cropTop - cropHeight;

  // 確保總和不超過大圖尺寸與邊界安全
  if (cropLeft + cropRight + cropWidth > W_orig) {
    cropWidth = W_orig - cropLeft - cropRight;
  }
  if (cropTop + cropBottom + cropHeight > H_orig) {
    cropHeight = H_orig - cropTop - cropBottom;
  }

  // 確保不為負值
  cropBottom = Math.max(0, cropBottom);
  cropRight = Math.max(0, cropRight);

  return {
    filename: item.file.name,
    cropLeft,
    cropTop,
    cropRight,
    cropBottom,
    cropWidth,
    cropHeight,
    originalWidth: W_orig,
    originalHeight: H_orig,
    x: Math.round(item.maskX),
    y: Math.round(item.maskY)
  };
};

const getVerticalText = (item: CropperImageItem) => {
  const data = getCropData(item);
  // 動態計算當前圖片完美置中時的 cropTop 基準值
  const scaleY = item.naturalHeight / 130;
  const centerTop = Math.round(15 * scaleY);
  
  const diff = data.cropTop - centerTop;
  if (diff < 0) {
    return `下裁 ${Math.abs(diff)}px`;
  } else if (diff > 0) {
    return `上裁 ${diff}px`;
  } else {
    return '垂直置中';
  }
};

const getHorizontalText = (item: CropperImageItem) => {
  const data = getCropData(item);
  // 動態計算當前圖片完美置中時的 cropLeft 基準值
  const scaleX = item.naturalWidth / 169;
  const centerLeft = Math.round(19.5 * scaleX);
  
  const diff = data.cropLeft - centerLeft;
  if (diff < 0) {
    return `右裁 ${Math.abs(diff)}px`;
  } else if (diff > 0) {
    return `左裁 ${diff}px`;
  } else {
    return '水平置中';
  }
};

const copiedNameId = ref<string | null>(null);

const copyFilename = async (item: CropperImageItem) => {
  await navigator.clipboard.writeText(item.file.name);
  copiedNameId.value = item.id;
  setTimeout(() => {
    if (copiedNameId.value === item.id) {
      copiedNameId.value = null;
    }
  }, 1500);
};

// 批次數據格式化

</script>

<template>
  <div class="space-y-6">
    <!-- Top Settings and Batch Operations Bar -->
    <Card class="border-border bg-card p-4">
      <div class="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between w-full">
        <div class="flex flex-wrap items-center gap-2.5">
          <!-- 繼續上傳（支援拖放與點選） -->
          <div class="relative group w-full sm:w-auto" v-if="images.length > 0">
            <input 
              type="file" 
              multiple 
              accept="image/*" 
              class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10" 
              @change="handleFileInput" 
              title="繼續上傳" 
            />
            <ToolButton 
              type="upload"
              label="繼續上傳"
              class="w-full sm:w-auto pointer-events-none"
            />
          </div>

          <!-- 數量顯示 -->
          <span class="text-xs font-medium text-muted-foreground px-1.5" v-if="images.length > 0">
            {{ images.length }} 張圖片
          </span>

          <div class="h-4 w-[1px] bg-border hidden sm:block mr-0.5" v-if="images.length > 0"></div>
          <!-- 標題與說明 (常駐顯示) -->
          <div class="flex items-center gap-2 mr-4 shrink-0">
            <Scissors class="h-4 w-4 text-primary" />
            <span class="text-sm font-medium text-foreground">圖片裁切參數助手 (目標尺寸: 1034x788)</span>
          </div>
        </div>

        <!-- 列表不為空時的動作按鈕 (緊隨標題並排，有圖片才顯示) -->
        <div v-if="images.length > 0" class="flex flex-wrap items-center gap-2.5">

          <!-- 清空 -->
          <ToolButton 
            type="clear"
            label="清空"
            @click="clearAll"
          />

          <!-- 重設所有置中 -->
          <ToolButton 
            type="refresh"
            label="重設所有置中"
            @click="resetAllToCenter"
          />

        </div>
      </div>
    </Card>

    <!-- Upload Zone (Empty State) -->
    <div 
      v-if="images.length === 0"
      @dragover="handleDragOver"
      @dragleave="handleDragLeave"
      @drop="handleDrop"
      class="border-2 border-dashed rounded-2xl p-12 text-center transition-all flex flex-col items-center justify-center min-h-[350px]"
      :class="isDragOver ? 'border-primary bg-primary/5' : 'border-border bg-card'"
    >
      <div class="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
        <Upload class="w-8 h-8 text-primary" />
      </div>
      <h3 class="text-lg font-semibold text-foreground mb-2">拖曳圖片或資料夾到這裡</h3>
      <p class="text-sm text-muted-foreground mb-6 max-w-md">
        支援批次載入多張圖片。預設寬度等比縮小為 169px，可自由拖曳 130x100 的裁切遮罩以即時獲取原始解析度下的對應裁剪像素。
      </p>
      
      <div class="flex flex-wrap gap-3 justify-center">
        <label class="cursor-pointer relative">
          <span class="inline-flex items-center justify-center rounded-xl bg-primary text-primary-foreground px-4 py-2.5 text-sm font-medium hover:bg-primary/90 transition-colors shadow-sm gap-2">
            <Upload class="w-4 h-4" />
            選擇多張圖片
          </span>
          <input 
            type="file" 
            multiple 
            accept="image/*" 
            class="hidden" 
            @change="handleFileInput" 
          />
        </label>
      </div>
    </div>

    <!-- Image Grid Area -->
    <div v-else class="grid gap-6 grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 justify-items-center">
      <Card 
        v-for="(item, index) in images" 
        :key="item.id" 
        class="border-border bg-card overflow-hidden w-[209px] flex flex-col p-4 relative group"
      >
        <!-- Delete Button (Hover Trigger) -->
        <button 
          @click="removeImage(index)"
          class="absolute top-2 right-2 z-20 p-1.5 rounded-full bg-background/80 text-muted-foreground hover:text-destructive hover:bg-background shadow-md opacity-0 group-hover:opacity-100 transition-opacity"
          title="刪除此圖"
        >
          <X class="h-3.5 w-3.5" />
        </button>

        <!-- Image Container with Viewport Overlay -->
        <div class="image-container mx-auto">
          <img 
            :src="item.previewUrl" 
            alt="Preview" 
            class="w-full h-auto block select-none pointer-events-none"
            @load="onImageLoad($event, item.id)"
          />
          
          <!-- Draggable Crop Viewport Box (130x100) -->
          <div 
            class="viewport-box"
            :style="{
              left: item.maskX + 'px',
              top: item.maskY + 'px',
              width: '130px',
              height: '100px'
            }"
            @mousedown="startDrag($event, item)"
            @touchstart="startDrag($event, item)"
          >
            <!-- Border guidelines -->
            <div class="absolute inset-0 border border-white/20 pointer-events-none"></div>
            <!-- Grid Helpers -->
            <div class="absolute inset-x-0 top-1/3 border-t border-dashed border-white/10 pointer-events-none"></div>
            <div class="absolute inset-x-0 top-2/3 border-t border-dashed border-white/10 pointer-events-none"></div>
            <div class="absolute inset-y-0 left-1/3 border-l border-dashed border-white/10 pointer-events-none"></div>
            <div class="absolute inset-y-0 left-2/3 border-l border-dashed border-white/10 pointer-events-none"></div>
          </div>
        </div>

        <!-- Info and Results -->
        <div class="mt-4 flex-1 flex flex-col justify-between">
          <div>
            <div 
              @click="copyFilename(item)"
              class="text-xs font-semibold truncate cursor-pointer hover:text-primary transition-colors flex items-center justify-between group mb-1" 
              :title="'點擊複製檔案名稱: ' + item.file.name"
            >
              <span 
                class="truncate"
                :class="copiedNameId === item.id ? 'text-chart-2 font-bold' : 'text-foreground'"
              >
                {{ item.file.name }}
              </span>
              <span 
                v-if="copiedNameId === item.id" 
                class="text-[9px] text-chart-2 font-medium shrink-0 flex items-center gap-0.5 ml-2"
              >
                <Check class="h-3 w-3" /> 已複製
              </span>
            </div>
            
            <div class="text-[10px] text-muted-foreground mb-3 flex items-center justify-between">
              <span>原始尺寸: {{ item.naturalWidth }}x{{ item.naturalHeight }}</span>
              <span>小圖尺寸: 169x130px</span>
            </div>
            
            <!-- Crop Data Grid -->
            <div class="bg-secondary/40 rounded-lg p-2 text-[11px] font-mono grid grid-cols-2 gap-y-1 gap-x-2 border border-border">
              <div class="text-muted-foreground flex justify-between">
                <span>Top:</span>
                <span class="text-foreground font-semibold">{{ getCropData(item).cropTop }}</span>
              </div>
              <div class="text-muted-foreground flex justify-between">
                <span>Left:</span>
                <span class="text-foreground font-semibold">{{ getCropData(item).cropLeft }}</span>
              </div>
              <div class="text-muted-foreground flex justify-between">
                <span>Bottom:</span>
                <span class="text-foreground font-semibold">{{ getCropData(item).cropBottom }}</span>
              </div>
              <div class="text-muted-foreground flex justify-between">
                <span>Right:</span>
                <span class="text-foreground font-semibold">{{ getCropData(item).cropRight }}</span>
              </div>
            </div>
          </div>

          <!-- Crop Offset Text (純文字顯示) -->
          <div class="mt-3.5 flex items-center justify-between text-xs text-muted-foreground border-t border-border/40 pt-3">
            <div class="flex-1 flex items-center justify-center gap-1.5">
              <span 
                class="font-semibold px-2 py-0.5 transition-colors"
                :class="getVerticalText(item) !== '垂直置中' ? 'text-amber-400 font-bold' : 'text-muted-foreground'"
              >
                {{ getVerticalText(item) }}
              </span>
            </div>
            <div class="flex-1 flex items-center justify-center gap-1.5">
              <span 
                class="font-semibold px-2 py-0.5 transition-colors"
                :class="getHorizontalText(item) !== '水平置中' ? 'text-amber-400 font-bold' : 'text-muted-foreground'"
              >
                {{ getHorizontalText(item) }}
              </span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  </div>
</template>

<style scoped>
.image-container {
  position: relative;
  width: 169px;
  height: 130px;
  overflow: hidden;
  user-select: none;
  background-color: hsl(var(--muted) / 0.3);
  border-radius: 8px;
  border: 1px solid hsl(var(--border));
}

.image-container img {
  width: 169px;
  height: 130px;
  object-fit: cover;
  display: block;
}

.viewport-box {
  position: absolute;
  cursor: move;
  border: 2px solid hsl(var(--primary));
  box-shadow: 0 0 0 9999px rgba(0, 0, 0, 0.65);
  z-index: 10;
  box-sizing: border-box;
  touch-action: none;
}

/* 點擊時外框微發光 */
.viewport-box:active {
  border-color: hsl(var(--chart-2));
}

button {
  cursor: pointer;
}
</style>

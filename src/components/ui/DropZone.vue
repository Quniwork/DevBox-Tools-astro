<script setup lang="ts">
import { ref } from 'vue';
import { Card } from '@/components/ui/card';

// ========================================
// Props 定義
// ========================================
const props = defineProps<{
  /** 接受的檔案類型 (如 '.svg', '.jpg,.png,.webp') */
  accept: string;
  /** 是否允許多檔案上傳 */
  multiple?: boolean;
  /** 圖示元件 (透過 slot 傳入) */
  title: string;
  /** 副標題 */
  subtitle?: string;
  /** 提示文字 */
  hint?: string;
}>();

const emit = defineEmits<{
  files: [files: FileList];
}>();

// ========================================
// 狀態
// ========================================
const isDragging = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);

// ========================================
// 方法
// ========================================
const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  isDragging.value = false;
  const files = e.dataTransfer?.files;
  if (files && files.length > 0) {
    emit('files', files);
  }
};

const handleFileSelect = (event: Event) => {
  const input = event.target as HTMLInputElement;
  const files = input.files;
  if (files && files.length > 0) {
    emit('files', files);
  }
  // 清空 input 以便重複選擇相同檔案
  input.value = '';
};

const triggerFileInput = () => {
  fileInput.value?.click();
};
</script>

<template>
  <Card 
    class="flex justify-center items-center border-dashed border-[#88C0D0] bg-card p-8 min-h-96 transition-all cursor-pointer"
    :class="{ 'border-primary bg-primary/5': isDragging }"
    @dragover.prevent="isDragging = true"
    @dragleave.prevent="isDragging = false"
    @drop="handleDrop"
    @click="triggerFileInput"
  >
    <input 
      ref="fileInput"
      type="file"
      :accept="accept"
      :multiple="multiple"
      class="hidden"
      @change="handleFileSelect"
    />
    <div class="text-center">
      <div class="w-12 h-12 mx-auto mb-4 rounded-full bg-secondary flex items-center justify-center">
        <slot name="icon">
          <!-- 預設圖示可透過 slot 覆蓋 -->
        </slot>
      </div>
      <h3 class="text-base font-semibold text-foreground mb-2">{{ title }}</h3>
      <!-- <p v-if="subtitle" class="text-sm text-muted-foreground mb-1">{{ subtitle }}</p> -->
      <p v-if="hint" class="text-xs text-muted-foreground/60">{{ hint }}</p>
    </div>
  </Card>
</template>

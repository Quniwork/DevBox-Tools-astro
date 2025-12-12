<script setup lang="ts">
import { ref, onMounted, computed } from 'vue';
import { X } from 'lucide-vue-next';
import { formatSize } from '@/composables/useFileUtils';

// ========================================
// Props 定義
// ========================================
interface PreviewItem {
  name: string;
  originalSize: number;
  previewUrl: string;
  // 以下為可選，用於顯示轉換後資訊
  convertedUrl?: string;
  convertedSize?: number;
  status?: 'pending' | 'converting' | 'done' | 'error';
}

const props = defineProps<{
  item: PreviewItem | null;
  /** 是否有原圖/轉換後切換功能 */
  showToggle?: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();

// ========================================
// 狀態
// ========================================
const isMounted = ref(false);
const previewMode = ref<'original' | 'converted'>('converted');

onMounted(() => {
  isMounted.value = true;
});

// ========================================
// 計算屬性
// ========================================
const currentImageUrl = computed(() => {
  if (!props.item) return '';
  
  // 如果有切換功能且選擇原圖
  if (props.showToggle && previewMode.value === 'original') {
    return props.item.previewUrl; // 原圖 URL
  }
  
  // 返回轉換後的 URL（如果有），否則返回預覽 URL
  return props.item.convertedUrl || props.item.previewUrl;
});

const savings = computed(() => {
  if (!props.item || !props.item.convertedSize) return 0;
  return Math.round(((props.item.originalSize - props.item.convertedSize) / props.item.originalSize) * 100);
});

// ========================================
// 方法
// ========================================
const close = () => {
  emit('close');
};

// 當 item 改變時重置預覽模式
const resetMode = () => {
  previewMode.value = 'converted';
};

// Watch item changes
defineExpose({ resetMode });
</script>

<template>
  <Teleport v-if="isMounted" to="body">
    <Transition name="modal">
      <div 
        v-if="item" 
        class="fixed inset-0 z-50 flex items-center justify-center p-4"
        @click.self="close"
      >
        <!-- Backdrop -->
        <div class="absolute inset-0 bg-black/80 backdrop-blur-sm" @click="close"></div>
        
        <!-- Modal Content -->
        <div class="relative z-10 max-w-[90vw] max-h-[90vh] flex flex-col">
          <!-- Close Button -->
          <button 
            @click="close"
            class="absolute -top-10 right-0 text-white/70 hover:text-white transition-colors"
          >
            <X class="h-6 w-6" />
          </button>
          
          <!-- Image -->
          <div class="rounded-xl overflow-hidden bg-card shadow-2xl">
            <img 
              :src="currentImageUrl" 
              :alt="item.name"
              class="max-w-full max-h-[75vh] object-contain"
            />
          </div>
          
          <!-- Info Bar -->
          <div class="mt-3 flex items-center justify-between gap-4 px-1">
            <!-- File Name -->
            <div class="text-white text-sm font-medium truncate">
              {{ item.name }}
            </div>
            
            <!-- Toggle Buttons (有切換功能時顯示) -->
            <div v-if="showToggle && item.convertedSize" class="flex items-center gap-2 shrink-0">
              <button 
                @click="previewMode = 'original'"
                :class="[
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all',
                  previewMode === 'original' 
                    ? 'bg-white text-black' 
                    : 'bg-white/20 text-white hover:bg-white/30'
                ]"
              >
                原圖 {{ formatSize(item.originalSize) }}
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
                轉換後 {{ formatSize(item.convertedSize) }}
                <span class="ml-1 opacity-80">(-{{ savings }}%)</span>
              </button>
            </div>
            
            <!-- Size Info (無切換功能時顯示) -->
            <div v-else-if="item.convertedSize" class="flex items-center gap-2 shrink-0">
              <div class="px-3 py-1.5 rounded-lg text-xs font-medium bg-white/20 text-white">
                原始 {{ formatSize(item.originalSize) }}
              </div>
              <div class="px-3 py-1.5 rounded-lg text-xs font-medium bg-chart-2 text-white">
                優化後 {{ formatSize(item.convertedSize!) }}
                <span class="ml-1 opacity-80">(-{{ savings }}%)</span>
              </div>
            </div>
            
            <!-- 僅顯示原始大小 -->
            <div v-else class="text-white/70 text-xs font-mono shrink-0">
              {{ formatSize(item.originalSize) }}
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
/* Modal Transition */
.modal-enter-active,
.modal-leave-active {
  transition: all 0.3s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .relative,
.modal-leave-to .relative {
  transform: scale(0.95);
}
</style>

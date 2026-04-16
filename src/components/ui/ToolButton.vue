<script setup lang="ts">
/**
 * 工具按鈕組件
 * 提供常用的按鈕樣式：上傳、複製、清除、下載
 */
import { computed } from 'vue';
import Button from '@/components/ui/Button.vue';
import { Upload, Copy, Check, Trash2, Download, RefreshCw } from 'lucide-vue-next';

// ========================================
// Props 定義
// ========================================
interface Props {
  /**
   * 按鈕類型
   * - upload: 上傳按鈕 (outline + Upload 圖示)
   * - copy: 複製按鈕 (outline + Copy/Check 切換)
   * - clear: 清除按鈕 (ghost + Trash2 + 紅色 hover)
   * - download: 下載按鈕 (primary + Download 圖示)
   */
  type: 'upload' | 'copy' | 'clear' | 'download' | 'refresh';
  
  /** 按鈕文字 */
  label?: string;
  
  /** 是否為「已複製」狀態 (copy 類型專用) */
  copied?: boolean;
  
  /** 是否正在載入 (download 類型專用) */
  loading?: boolean;
  
  /** 是否禁用 */
  disabled?: boolean;
  
  /** 是否為拖曳狀態 (upload 類型專用) */
  dragging?: boolean;
  
  /** 變體樣式 (可選，用於特殊樣式如 warning) */
  variant?: 'default' | 'warning';
}

const props = withDefaults(defineProps<Props>(), {
  copied: false,
  loading: false,
  disabled: false,
  dragging: false,
  variant: 'default',
});

const emit = defineEmits<{
  click: [];
}>();

// ========================================
// 計算屬性
// ========================================
const buttonVariant = computed(() => {
  switch (props.type) {
    case 'clear':
      return 'ghost';
    case 'download':
      return 'default';
    default:
      return 'outline';
  }
});

const buttonSize = computed(() => {
  return (props.type === 'clear' || props.type === 'refresh') ? 'sm' : 'default';
});

const buttonClass = computed(() => {
  const classes: string[] = ['gap-2'];
  
  switch (props.type) {
    case 'upload':
      if (props.dragging) {
        classes.push('border-primary', 'bg-primary/10');
      }
      break;
    case 'copy':
      if (props.copied) {
        classes.push('text-chart-2');
      }
      break;
    case 'clear':
      classes.push('text-xs', 'text-muted-foreground', 'hover:text-destructive', 'transition-colors');
      break;
    case 'refresh':
      classes.push('text-xs', 'text-muted-foreground', 'hover:text-primary', 'transition-colors');
      break;
    case 'download':
      if (props.variant === 'warning') {
        classes.push('bg-chart-2', 'text-white', 'hover:bg-chart-2/90');
      } else {
        classes.push('bg-primary', 'text-white', 'hover:bg-primary/90');
      }
      break;
  }
  
  return classes.join(' ');
});

// 預設標籤
const defaultLabels: Record<string, string> = {
  upload: '上傳',
  copy: '複製',
  clear: '清除全部',
  download: '下載',
  refresh: '重新執行',
};

const displayLabel = computed(() => {
  if (props.type === 'copy' && props.copied) {
    return '已複製';
  }
  if (props.type === 'download' && props.loading) {
    return '處理中...';
  }
  return props.label || defaultLabels[props.type];
});
</script>

<template>
  <Button
    :variant="buttonVariant"
    :size="buttonSize"
    :disabled="disabled || loading"
    :class="buttonClass"
    @click="emit('click')"
  >
    <!-- 圖示 -->
    <template v-if="type === 'upload'">
      <Upload class="h-4 w-4" />
    </template>
    <template v-else-if="type === 'copy'">
      <Check v-if="copied" class="h-4 w-4" />
      <Copy v-else class="h-4 w-4" />
    </template>
    <template v-else-if="type === 'clear'">
      <Trash2 class="h-3.5 w-3.5" />
    </template>
    <template v-else-if="type === 'download'">
      <RefreshCw v-if="loading" class="h-4 w-4 animate-spin" />
      <Download v-else class="h-4 w-4" />
    </template>
    <template v-else-if="type === 'refresh'">
      <RefreshCw class="h-3.5 w-3.5" />
    </template>
    
    <!-- Slot 或預設標籤 -->
    <slot>{{ displayLabel }}</slot>
  </Button>
</template>

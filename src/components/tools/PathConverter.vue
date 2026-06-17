<script setup lang="ts">
/**
 * Windows & Mac 路徑轉換器
 * 支援 Z:\ <=> /Volumes/CM1/ 自動偵測互轉與歷史紀錄
 */
import { ref, computed, onMounted, watch } from 'vue';
import { Card } from '@/components/ui/card';
import Button from '@/components/ui/Button.vue';
import ToolButton from '@/components/ui/ToolButton.vue';
import { Folder, Clock, Trash2, Copy, Check, ArrowLeftRight } from 'lucide-vue-next';

const CONFIG = {
  HISTORY_KEY: 'path_converter_history',
  MAX_HISTORY_ITEMS: 20,
};

// ========================================
// 狀態
// ========================================
const inputPath = ref('');
const outputPath = ref('');
const detectedType = ref<'win' | 'mac' | 'none'>('none');
const showCopied = ref(false);

interface HistoryItem {
  originalPath: string;
  convertedPath: string;
  timestamp: string;
  fromType: 'win' | 'mac' | 'none';
}

const history = ref<HistoryItem[]>([]);

// ========================================
// 初始化
// ========================================
onMounted(() => {
  loadHistory();
});

const loadHistory = () => {
  const stored = localStorage.getItem(CONFIG.HISTORY_KEY);
  if (stored) {
    history.value = JSON.parse(stored);
  }
};

const saveHistory = (originalPath: string, convertedPath: string, fromType: 'win' | 'mac' | 'none') => {
  if (!originalPath.trim() || !convertedPath.trim()) return;

  // 移除重複項
  history.value = history.value.filter(item => item.originalPath !== originalPath);
  
  // 新增到開頭
  history.value.unshift({
    originalPath,
    convertedPath,
    timestamp: new Date().toISOString(),
    fromType,
  });
  
  // 限制數量
  history.value = history.value.slice(0, CONFIG.MAX_HISTORY_ITEMS);
  
  // 儲存
  localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(history.value));
};

const clearHistory = () => {
  history.value = [];
  localStorage.removeItem(CONFIG.HISTORY_KEY);
};

const removeHistoryItem = (index: number) => {
  history.value.splice(index, 1);
  localStorage.setItem(CONFIG.HISTORY_KEY, JSON.stringify(history.value));
};

// ========================================
// 路徑轉換邏輯
// ========================================
const performConversion = () => {
  const val = inputPath.value.trim();
  if (!val) {
    outputPath.value = '';
    detectedType.value = 'none';
    return;
  }

  const macPrefix = '/Volumes/CM1';
  const winPrefix = 'Z:';
  const valLower = val.toLowerCase();

  if (valLower.startsWith(macPrefix.toLowerCase())) {
    detectedType.value = 'mac';
    // Mac -> Windows
    let sub = val.substring(macPrefix.length);
    // 斜線轉反斜線
    sub = sub.replace(/\//g, '\\');
    if (sub && !sub.startsWith('\\')) {
      sub = '\\' + sub;
    }
    // 合併重複反斜線並處理開頭
    let result = 'Z:' + sub.replace(/\\+/g, '\\');
    if (result === 'Z:') {
      result = 'Z:\\';
    }
    outputPath.value = result;
  } else if (valLower.startsWith(winPrefix.toLowerCase())) {
    detectedType.value = 'win';
    // Windows -> Mac
    let sub = val.substring(winPrefix.length);
    // 反斜線轉斜線
    sub = sub.replace(/\\/g, '/');
    if (sub && !sub.startsWith('/')) {
      sub = '/' + sub;
    }
    // 合併重複斜線並處理開頭
    let result = '/Volumes/CM1' + sub.replace(/\/+/g, '/');
    if (result === '/Volumes/CM1') {
      result = '/Volumes/CM1/';
    }
    outputPath.value = result;
  } else {
    // 非標準路徑，做單純的斜線/反斜線互轉
    if (val.includes('\\')) {
      detectedType.value = 'win';
      outputPath.value = val.replace(/\\/g, '/');
    } else if (val.includes('/')) {
      detectedType.value = 'mac';
      outputPath.value = val.replace(/\//g, '\\');
    } else {
      detectedType.value = 'none';
      outputPath.value = val;
    }
  }
};

// 監聽輸入即時轉換
watch(inputPath, () => {
  performConversion();
});

// 手動觸發轉換並儲存歷史紀錄
const handleConvertAndSave = () => {
  performConversion();
  if (outputPath.value) {
    saveHistory(inputPath.value.trim(), outputPath.value, detectedType.value);
  }
};

// ========================================
// 複製功能
// ========================================
const copyToClipboard = async (text: string, saveToHistory: boolean = false) => {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  showCopied.value = true;
  setTimeout(() => showCopied.value = false, 2000);

  if (saveToHistory) {
    handleConvertAndSave();
  }
};

// ========================================
// 點擊歷史紀錄項目
// ========================================
const loadHistoryItem = (item: HistoryItem) => {
  inputPath.value = item.originalPath;
};

// ========================================
// 歷史紀錄點擊個別複製與狀態
// ========================================
const copiedHistoryIndex = ref<number | null>(null);
const copiedHistoryType = ref<'orig' | 'conv' | null>(null);

const copyHistoryPath = async (text: string, index: number, type: 'orig' | 'conv') => {
  if (!text) return;
  await navigator.clipboard.writeText(text);
  copiedHistoryIndex.value = index;
  copiedHistoryType.value = type;
  setTimeout(() => {
    if (copiedHistoryIndex.value === index && copiedHistoryType.value === type) {
      copiedHistoryIndex.value = null;
      copiedHistoryType.value = null;
    }
  }, 1500);
};

// ========================================
// 輔助函數
// ========================================
const formatTime = (timestamp: string) => {
  const date = new Date(timestamp);
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  
  if (diff < 60000) return '剛剛';
  if (diff < 3600000) return `${Math.floor(diff / 60000)} 分鐘前`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)} 小時前`;
  return date.toLocaleDateString('zh-TW') + ' ' + date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
};

const truncatePath = (path: string, maxLength: number = 60) => {
  if (path.length <= maxLength) return path;
  return path.substring(0, 25) + '...' + path.substring(path.length - 30);
};
</script>

<template>
  <div class="space-y-6">
    <!-- Top Row: Left Input, Right Result -->
    <div class="grid gap-6 lg:grid-cols-2">
      <!-- Left: Input Zone -->
      <Card class="border-border bg-card p-5 flex flex-col">
        <div class="flex items-center gap-2 mb-4">
          <div class="w-9 h-9 rounded-lg bg-primary/20 flex items-center justify-center">
            <Folder class="w-5 h-5 text-primary" />
          </div>
          <h3 class="text-base font-semibold text-foreground">輸入原始路徑</h3>
        </div>
        
        <div class="flex-1 flex flex-col gap-4">
          <textarea
            v-model="inputPath"
            placeholder="請在此貼上 Windows 或 Mac 路徑...&#10;例如：Z:\行銷處\市場營銷部\... 或 /Volumes/CM1/行銷處/..."
            rows="5"
            class="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm transition-all font-mono resize-none flex-1"
            @keyup.enter.ctrl="handleConvertAndSave"
          ></textarea>
          
          <div class="flex items-center justify-between text-xs text-muted-foreground">
            <span>支援雙向自動偵測</span>
            <span v-if="detectedType !== 'none'" class="flex items-center gap-1">
              偵測類型: 
              <span class="px-1.5 py-0.5 rounded bg-primary/10 text-primary font-semibold uppercase">
                {{ detectedType === 'win' ? 'Windows 路徑' : 'Mac 路徑' }}
              </span>
            </span>
          </div>
          
          <div class="mt-auto">
            <Button 
              @click="handleConvertAndSave"
              :disabled="!inputPath.trim()"
              class="w-full gap-2 bg-primary text-white hover:bg-primary/90"
            >
              <ArrowLeftRight class="h-4 w-4" />
              進行轉換並記錄
            </Button>
          </div>
        </div>
      </Card>

      <!-- Right: Result -->
      <div class="flex flex-col">
        <!-- Success Result -->
        <Card v-if="outputPath" class="border-border bg-card p-5 flex-1 flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <div class="w-9 h-9 rounded-lg bg-chart-2/20 flex items-center justify-center">
                <Check class="w-5 h-5 text-chart-2" />
              </div>
              <h3 class="text-base font-semibold text-foreground">轉換成功！</h3>
            </div>
            <button 
              @click="inputPath = ''" 
              title="清除"
              class="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>

          <div class="bg-secondary/50 rounded-lg p-4 mb-4 flex-1 flex flex-col justify-between">
            <div>
              <label class="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">
                轉換後路徑 ({{ detectedType === 'win' ? 'Mac 格式' : 'Windows 格式' }})
              </label>
              <div class="text-chart-2 font-mono text-sm break-all select-all whitespace-pre-wrap">
                {{ outputPath }}
              </div>
            </div>
          </div>

          <div class="flex gap-2 mt-auto">
            <Button @click="copyToClipboard(outputPath, true)" class="flex-1 gap-2 bg-chart-2 hover:bg-chart-2/90 text-white">
              <Check v-if="showCopied" class="h-4 w-4" />
              <Copy v-else class="h-4 w-4" />
              {{ showCopied ? '已複製且記錄' : '複製路徑並記錄' }}
            </Button>
          </div>
        </Card>

        <!-- Empty State -->
        <Card v-else class="border-border bg-card p-5 flex-1 flex flex-col justify-center">
          <div class="text-center py-8 text-muted-foreground">
            <Folder class="w-12 h-12 mx-auto mb-3 opacity-30 animate-pulse" />
            <p class="text-sm">輸入路徑後，轉換結果將即時顯示在這裡</p>
          </div>
        </Card>
      </div>
    </div>


    <!-- Bottom: History Panel -->
    <Card class="border-border bg-card overflow-hidden">
      <div class="flex items-center justify-between px-5 py-3.5 border-b border-border">
        <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Clock class="h-4 w-4 text-muted-foreground" />
          歷史記錄
          <span v-if="history.length > 0" class="ml-1 text-xs font-normal text-muted-foreground bg-secondary px-1.5 py-0.5 rounded-full">{{ history.length }}</span>
        </div>
        <ToolButton 
          v-if="history.length > 0" 
          type="clear" 
          @click="clearHistory" 
        />
      </div>

      <div v-if="history.length === 0" class="flex flex-col items-center justify-center py-12 text-muted-foreground gap-2">
        <Folder class="w-8 h-8 opacity-20" />
        <p class="text-xs">尚無歷史記錄</p>
      </div>

      <div v-else class="divide-y divide-border max-h-[420px] overflow-y-auto">
        <div
          v-for="(item, index) in history"
          :key="index"
          class="group history-row"
        >
          <!-- 頂部：標籤 + 時間 + 操作 -->
          <div class="flex items-center gap-2 mb-2">
            <span class="type-badge" :class="item.fromType === 'win' ? 'badge-win' : 'badge-mac'">
              {{ item.fromType === 'win' ? 'WIN → MAC' : 'MAC → WIN' }}
            </span>
            <span class="text-xs text-muted-foreground/60">{{ formatTime(item.timestamp) }}</span>
            <div class="ml-auto flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                @click="loadHistoryItem(item)"
                class="action-btn"
                title="載入回輸入框"
              >
                <ArrowLeftRight class="h-3 w-3" />
              </button>
              <button
                @click="removeHistoryItem(index)"
                class="action-btn action-btn-danger"
                title="刪除"
              >
                <Trash2 class="h-3 w-3" />
              </button>
            </div>
          </div>

          <!-- 路徑對：兩行清晰排列 -->
          <div class="space-y-1">
            <!-- 原路徑 -->
            <button
              @click="copyHistoryPath(item.originalPath, index, 'orig')"
              class="path-row path-row-orig w-full text-left"
              :title="item.originalPath"
            >
              <span class="path-label">原</span>
              <span class="path-text path-text-muted">{{ item.originalPath }}</span>
              <span class="path-copy-icon">
                <Check v-if="copiedHistoryIndex === index && copiedHistoryType === 'orig'" class="h-3 w-3 text-chart-2" />
                <Copy v-else class="h-3 w-3" />
              </span>
            </button>

            <!-- 轉路徑 -->
            <button
              @click="copyHistoryPath(item.convertedPath, index, 'conv')"
              class="path-row path-row-conv w-full text-left"
              :title="item.convertedPath"
            >
              <span class="path-label path-label-accent">轉</span>
              <span class="path-text path-text-accent">{{ item.convertedPath }}</span>
              <span class="path-copy-icon">
                <Check v-if="copiedHistoryIndex === index && copiedHistoryType === 'conv'" class="h-3 w-3 text-chart-2" />
                <Copy v-else class="h-3 w-3" />
              </span>
            </button>
          </div>
        </div>
      </div>
    </Card>
  </div>
</template>

<style scoped>
/* ========================================
   歷史紀錄行
   ======================================== */
.history-row {
  padding: 12px 20px;
  transition: background 0.15s ease;
}
.history-row:hover {
  background: hsl(var(--secondary) / 0.4);
}

/* 類型徽章 */
.type-badge {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.06em;
  padding: 2px 7px;
  border-radius: 4px;
  font-family: monospace;
}
.badge-win {
  background: hsl(217 91% 60% / 0.12);
  color: hsl(217 91% 60%);
}
.badge-mac {
  background: hsl(142 71% 45% / 0.12);
  color: hsl(142 71% 45%);
}

/* 操作按鈕 */
.action-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: hsl(var(--muted-foreground));
  cursor: pointer;
  transition: all 0.15s ease;
}
.action-btn:hover {
  background: hsl(var(--accent));
  color: hsl(var(--foreground));
}
.action-btn-danger:hover {
  background: hsl(var(--destructive) / 0.1);
  color: hsl(var(--destructive));
}

/* 路徑行 */
.path-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 5px 8px;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  border: none;
  background: transparent;
}
.path-row-orig:hover {
  background: hsl(var(--muted) / 0.5);
}
.path-row-conv:hover {
  background: hsl(var(--primary) / 0.08);
}

/* 路徑標籤 */
.path-label {
  flex-shrink: 0;
  width: 16px;
  height: 16px;
  border-radius: 3px;
  background: hsl(var(--border));
  color: hsl(var(--muted-foreground));
  font-size: 9px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: monospace;
  letter-spacing: 0;
}
.path-label-accent {
  background: hsl(var(--primary) / 0.15);
  color: hsl(var(--primary));
}

/* 路徑文字 */
.path-text {
  flex: 1;
  font-family: 'SFMono-Regular', 'Cascadia Code', monospace;
  font-size: 12px;
  line-height: 1.4;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
  text-align: left;
}
.path-text-muted {
  color: hsl(var(--muted-foreground));
}
.path-text-accent {
  color: hsl(var(--foreground));
  font-weight: 500;
}

/* 複製圖示 */
.path-copy-icon {
  flex-shrink: 0;
  color: hsl(var(--muted-foreground) / 0.4);
  opacity: 0;
  transition: opacity 0.15s ease;
}
.path-row:hover .path-copy-icon {
  opacity: 1;
}

button {
  cursor: pointer;
}
</style>


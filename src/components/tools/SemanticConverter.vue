<script setup lang="ts">
import { ref, computed } from 'vue';
import { Card } from '@/components/ui/card';
import Button from '@/components/ui/Button.vue';
import DropZone from '@/components/ui/DropZone.vue';
import { Upload, Copy, RefreshCw, Palette, Check, X, Trash2 } from 'lucide-vue-next';

// ========================================
// CONFIG: JSON 欄位與 CSS 變數的對應設定
// ========================================
const DEFAULT_VAR_MAPPING: Record<string, string> = {
  'bg-primary': 'primary-bg',
  'bg-secondary': 'secondary-bg',
  'bg-tertiary': 'tertiary-bg',
  'text-primary': 'primary-text',
  'text-secondary': 'secondary-text',
};

// 響應式狀態
const loadedFiles = ref<Array<{
  name: string;
  themeId: string;
  data: any;
}>>([]);
const resultOutput = ref('');
const showCopied = ref(false);
const copiedColorVar = ref(''); // 追蹤已複製的變數
const varMapping = ref<Record<string, string>>({ ...DEFAULT_VAR_MAPPING });
const colorPreviews = ref<Array<{
  themeId: string;
  colors: Array<{
    name: string;
    shortName: string;
    rgb: string;
    hex: string;
  }>;
}>>([]);

// 輔助函數：components (0-1 浮點數) 轉換為 RGB (0-255)
const componentsToRgb = (components: number[]): number[] => {
  return components.map(c => Math.round(c * 255));
};

// 輔助函數：從檔名提取 Theme ID
const extractThemeId = (filename: string): string => {
  return filename.replace('.json', '');
};

// 處理多個檔案
const processFiles = async (files: FileList) => {
  for (const file of Array.from(files)) {
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const themeId = extractThemeId(file.name);
        
        // 避免重複載入
        if (!loadedFiles.value.find(f => f.themeId === themeId)) {
          loadedFiles.value.push({
            name: file.name,
            themeId: themeId,
            data: json
          });
        }
      } catch (e) {
        console.error(`解析 ${file.name} 失敗:`, e);
        alert(`解析 ${file.name} 失敗，請確認檔案格式正確。`);
      }
    }
  }
};

// 移除檔案
const removeFile = (index: number) => {
  loadedFiles.value.splice(index, 1);
  // 如果沒有檔案了，清空結果
  if (loadedFiles.value.length === 0) {
    resultOutput.value = '';
    colorPreviews.value = [];
  }
};

// 重設對應設定
const resetMapping = () => {
  varMapping.value = { ...DEFAULT_VAR_MAPPING };
};

// 清空所有
const clearAll = () => {
  loadedFiles.value = [];
  resultOutput.value = '';
  colorPreviews.value = [];
};

// 轉換為 CSS
const convertToCSS = () => {
  if (loadedFiles.value.length === 0) return;

  const results: string[] = [];
  const previews: typeof colorPreviews.value = [];

  // 按 themeId 排序
  const sortedFiles = [...loadedFiles.value].sort((a, b) => 
    a.themeId.localeCompare(b.themeId)
  );

  sortedFiles.forEach(file => {
    const { themeId, data } = file;
    const surfaceColors = data?.colour?.surface || {};
    
    const cssLines: Array<{ varName: string; rgb: string; hex: string }> = [];
    const colorData: typeof colorPreviews.value[0]['colors'] = [];

    // 處理 surface 下的顏色
    Object.entries(surfaceColors).forEach(([jsonKey, colorInfo]: [string, any]) => {
      if (colorInfo.$value) {
        const { components, hex } = colorInfo.$value;
        const rgb = componentsToRgb(components);
        const cssVarName = varMapping.value[jsonKey] || jsonKey;
        
        cssLines.push({
          varName: cssVarName,
          rgb: rgb.join(' '),
          hex: hex
        });

        colorData.push({
          name: cssVarName,
          shortName: cssVarName.split('-').pop() || cssVarName,
          rgb: rgb.join(' '),
          hex: hex
        });
      }
    });

    // 計算最大變數名稱長度以對齊
    const maxVarNameLength = Math.max(
      ...cssLines.map(c => `--color-${c.varName}:`.length)
    );

    // 組裝 CSS
    let css = `/* ${themeId} */\n`;
    css += `:root[data-theme~="${themeId}"] {\n`;
    
    cssLines.forEach(line => {
      const paddedVarName = `--color-${line.varName}:`.padEnd(maxVarNameLength + 1);
      const rgbPadded = line.rgb.padEnd(18);
      css += `    ${paddedVarName}${rgbPadded}/* ${line.hex} */\n`;
    });
    
    css += `}`;
    results.push(css);

    // 顏色預覽資料
    previews.push({
      themeId: themeId,
      colors: colorData
    });
  });

  resultOutput.value = results.join('\n\n');
  colorPreviews.value = previews;
};

// 複製結果
const copyResult = async () => {
  if (!resultOutput.value) return;
  await navigator.clipboard.writeText(resultOutput.value);
  showCopied.value = true;
  setTimeout(() => showCopied.value = false, 2000);
};

// 複製單一色票變數
const copyColorVar = async (varName: string) => {
  const cssVar = `--color-${varName}`;
  await navigator.clipboard.writeText(cssVar);
  copiedColorVar.value = varName;
  setTimeout(() => copiedColorVar.value = '', 1500);
};

// 計算屬性：可用的 mapping 欄位
const mappingKeys = computed(() => Object.keys(varMapping.value));
</script>

<template>
  <div class="space-y-4">
    <!-- Action Bar -->
    <div class="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
      <div class="flex items-center gap-4 w-full sm:w-auto">
        <div class="relative group">
          <input
            type="file"
            accept=".json"
            multiple
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            @change="(e: Event) => { const files = (e.target as HTMLInputElement).files; if (files) processFiles(files); }"
          />
          <Button variant="outline" class="w-full sm:w-auto gap-2">
            <Upload class="h-4 w-4" />
            上傳 JSON
          </Button>
        </div>
        
        <div v-if="loadedFiles.length > 0" class="flex items-center gap-2">
          <span class="text-sm text-muted-foreground">已載入</span>
          <span class="rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
            {{ loadedFiles.length }} 個檔案
          </span>
        </div>
      </div>
      
      <div class="flex items-center gap-2 w-full sm:w-auto">
        <Button v-if="loadedFiles.length > 0" variant="ghost" size="sm" @click="clearAll" title="清除全部" class="gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors">
          <Trash2 class="h-3.5 w-3.5" />
          清除全部
        </Button>
        <Button 
          v-if="resultOutput" 
          variant="outline" 
          @click="copyResult"
          class="flex-1 sm:flex-none gap-2"
        >
          <div v-if="showCopied" class="flex items-center gap-2 text-chart-2">
            <Check class="h-4 w-4" />
            <span>已複製</span>
          </div>
          <div v-else class="flex items-center gap-2">
            <Copy class="h-4 w-4" />
            <span>複製代碼</span>
          </div>
        </Button>
      </div>
    </div>

    <!-- Main Editor Area -->
    <div class="grid gap-4 lg:grid-cols-2">
      <!-- Left: Upload & Settings -->
      <div class="space-y-4">
        <!-- Drop Zone -->
        <DropZone
          accept=".json"
          :multiple="true"
          title="拖放 JSON 檔案至此處"
          hint="支援多檔案上傳"
          @files="processFiles"
        >
          <template #icon>
            <Upload class="h-6 w-6 text-muted-foreground" />
          </template>
        </DropZone>

        <!-- Loaded Files List -->
        <div v-if="loadedFiles.length > 0" class="flex flex-wrap gap-2">
          <div 
            v-for="(file, index) in loadedFiles" 
            :key="file.themeId"
            class="flex items-center gap-2 text-xs bg-secondary px-3 py-1.5 rounded-lg"
          >
            <span class="text-primary font-mono font-medium">{{ file.themeId }}</span>
            <button 
              @click="removeFile(index)"
              class="text-muted-foreground hover:text-destructive transition-colors"
            >
              <X class="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        <!-- Variable Mapping -->
        <Card class="overflow-hidden border-border bg-card">
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Palette class="h-4 w-4" />
              變數對應設定
            </div>
            <button @click="resetMapping" class="text-xs text-muted-foreground hover:text-primary transition-colors">
              重設
            </button>
          </div>
          
          <div class="p-4 space-y-2">
            <div v-for="key in mappingKeys" :key="key" class="flex items-center gap-3">
              <span class="w-28 text-xs text-muted-foreground font-mono shrink-0">{{ key }}</span>
              <span class="text-muted-foreground/50">→</span>
              <input 
                v-model="varMapping[key]"
                class="flex-1 text-xs font-mono px-3 py-1.5 bg-background border border-input rounded-lg focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-foreground transition-all"
                :placeholder="`--color-${key.toLowerCase()}`"
              >
            </div>
          </div>
        </Card>

        <!-- Convert Button -->
        <Button 
          @click="convertToCSS"
          :disabled="loadedFiles.length === 0"
          class="w-full gap-2 bg-primary text-white hover:bg-primary/90 disabled:opacity-50"
        >
          <RefreshCw class="h-4 w-4" />
          轉換為 CSS 變數
        </Button>
      </div>

      <!-- Right: Output -->
      <div class="space-y-4">
        <!-- Color Preview -->
        <Card v-if="colorPreviews.length > 0" class="border-border bg-card">
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <Palette class="h-4 w-4" />
              顏色預覽
            </div>
          </div>
          <div class="p-4 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div 
              v-for="preview in colorPreviews" 
              :key="preview.themeId" 
              class="p-3 rounded-lg border border-border bg-background"
            >
              <div class="text-xs font-mono text-primary mb-2">{{ preview.themeId }}</div>
              <div class="flex flex-wrap justify-between gap-2">
                <!-- 色票元件 -->
                <div 
                  v-for="color in preview.colors" 
                  :key="color.name" 
                  class="color-chip-wrapper relative"
                >
                  <button
                    @click="copyColorVar(color.name)"
                    class="color-chip flex flex-col items-center gap-1 px-2 py-1 rounded-md bg-secondary/50 hover:bg-secondary transition-all cursor-pointer"
                    :class="{ 'ring-2 ring-chart-2 bg-chart-2/10': copiedColorVar === color.name }"
                  >
                    <div 
                      class="w-6 h-6 rounded-md border border-border shadow-sm transition-transform group-hover:scale-110"
                      :style="{ backgroundColor: color.hex }"
                    ></div>
                    <span class="text-[9px] text-muted-foreground font-mono leading-none">
                      {{ copiedColorVar === color.name ? '✓' : color.shortName }}
                    </span>
                  </button>
                  
                  <!-- Tooltip -->
                  <div class="color-tooltip">
                    <div class="flex items-center gap-2 text-[10px] font-mono">
                      <span class="text-muted-foreground">色碼</span>
                      <span class="text-foreground font-medium">{{ color.rgb }}</span>
                    </div>
                    <div class="flex items-center gap-2 text-[10px] font-mono mt-1">
                      <span class="text-muted-foreground">變數</span>
                      <span class="text-primary font-medium">--color-{{ color.name }}</span>
                    </div>
                    <div class="text-[9px] text-muted-foreground/70 mt-1.5 pt-1.5 border-t border-border">
                      點擊複製變數
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <!-- Output Result -->
        <Card class="flex flex-col overflow-hidden border-border bg-card min-h-[300px]">
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
              </svg>
              轉換結果
            </div>
            <span v-if="showCopied" class="text-xs text-primary transition-opacity">已複製到剪貼簿</span>
          </div>
          
          <div class="flex-1 p-4 bg-background overflow-auto">
            <pre v-if="resultOutput" class="font-mono text-xs text-foreground leading-relaxed whitespace-pre-wrap">{{ resultOutput }}</pre>
            <div v-else class="flex items-center justify-center h-full text-sm text-muted-foreground">
              結果將顯示於此...
            </div>
          </div>
        </Card>
      </div>
    </div>
  </div>
</template>

<style scoped>
button {
  cursor: pointer;
}

/* 色票 Tooltip 樣式 */
.color-chip-wrapper {
  position: relative;
}

.color-chip {
  position: relative;
  z-index: 1;
}

.color-chip:hover {
  transform: translateY(-2px);
}

.color-tooltip {
  position: absolute;
  bottom: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 8px;
  padding: 8px 12px;
  min-width: max-content;
  white-space: nowrap;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  opacity: 0;
  visibility: hidden;
  transition: all 0.2s ease;
  z-index: 50;
  pointer-events: none;
}

.color-tooltip::before {
  content: '';
  position: absolute;
  bottom: -5px;
  left: 50%;
  transform: translateX(-50%) rotate(45deg);
  width: 10px;
  height: 10px;
  background: var(--card);
  border-right: 1px solid var(--border);
  border-bottom: 1px solid var(--border);
}

.color-chip-wrapper:hover .color-tooltip {
  opacity: 1;
  visibility: visible;
}
</style>

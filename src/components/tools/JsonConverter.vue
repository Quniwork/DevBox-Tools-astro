<script setup lang="ts">
import { ref, computed } from 'vue';
import { Card } from '@/components/ui/card';
import Button from '@/components/ui/Button.vue';
import ToolButton from '@/components/ui/ToolButton.vue';
import DropZone from '@/components/ui/DropZone.vue';
import { Upload, X, Layers, Palette } from 'lucide-vue-next';

// ========================================
// CONFIG: 變數對應設定 (與 ThemeLoader 相同)
// ========================================
const VAR_MAPPING: Record<string, string> = {
  // brand 區塊的對應
  'primary': 'primary',
  'bg-primary': 'primary-bg',
  'bg-secondary': 'secondary-bg',
  'bg-tertiary': 'tertiary-bg',
  'txt-primary': 'primary-text',
  'txt-secondary': 'secondary-text',
  // colour.surface 區塊的對應 (另一種 JSON 結構)
  'text-primary': 'primary-text',
  'text-secondary': 'secondary-text',
  'text-tertiary': 'text-tertiary',
};

// ========================================
// 介面定義 (與 ThemeLoader 相同)
// ========================================
interface ColorVar {
  id: string;
  varName: string;
  hex: string;
  rgb: string;
  isActive: boolean;
}

interface SurfaceVar {
  name: string;
  varName: string;
  hex: string;
  alpha: number;
  refVarName: string;
}

interface CommonVar {
  varName: string;
  hex: string;
  rgb: string;
}

interface ThemeFile {
  name: string;
  themeId: string;
  mode: string;
  colors: ColorVar[];
  surfaceVars: SurfaceVar[];
  commonVars: CommonVar[];
}

// ========================================
// 響應式狀態
// ========================================
const loadedFiles = ref<ThemeFile[]>([]);
const selectedThemeId = ref<string | null>(null);  // 選中的檔案
const resultOutput = ref('');
const showCopied = ref(false);

// ========================================
// 輔助函數 (與 ThemeLoader 相同)
// ========================================
const componentsToRgb = (components: number[]): number[] => {
  return components.map(c => Math.round(c * 255));
};

const extractThemeId = (filename: string): string => {
  return filename.replace('.json', '');
};

const hexToRgb = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0 0';
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
};

// 找出參考的主顏色變數
const findRefVarName = (hex: string, colors: ColorVar[]): string => {
  const matchedColor = colors.find(c => c.hex.toUpperCase() === hex.toUpperCase() && c.isActive);
  return matchedColor ? matchedColor.varName : '';
};

// ========================================
// 處理檔案上傳
// ========================================
const processFiles = async (files: FileList) => {
  for (const file of Array.from(files)) {
    if (file.type === 'application/json' || file.name.endsWith('.json')) {
      try {
        const text = await file.text();
        const json = JSON.parse(text);
        const themeId = extractThemeId(file.name);
        
        // 避免重複載入
        if (loadedFiles.value.find(f => f.themeId === themeId)) continue;
        
        const colors: ColorVar[] = [];
        const surfaceVars: SurfaceVar[] = [];
        const commonVars: CommonVar[] = [];
        
        // 判斷 JSON 結構類型
        const hasBrand = !!json.brand;
        const hasColourSurface = !!json.colour?.surface;
        
        if (hasBrand) {
          // ========================================
          // 結構一: brand + surface + common (theme/250124/xxx.json)
          // ========================================
          
          // 解析 brand 顏色 (主要變數)
          const brandData = json.brand || {};
          Object.entries(brandData).forEach(([jsonKey, colorInfo]: [string, any]) => {
            if (colorInfo.$value) {
              const { components, hex } = colorInfo.$value;
              const rgb = componentsToRgb(components);
              const cssVarName = VAR_MAPPING[jsonKey] || jsonKey;
              
              colors.push({
                id: `${themeId}-${jsonKey}`,
                varName: cssVarName,
                hex: hex,
                rgb: rgb.join(' '),
                isActive: true
              });
            }
          });
          
          // 解析 surface 顏色 (帶透明度變數)
          const surfaceData = json.surface || {};
          Object.entries(surfaceData).forEach(([key, value]: [string, any]) => {
            if (value.$value && value.$value.alpha !== undefined) {
              const alpha = value.$value.alpha;
              const hex = value.$value.hex || '';
              const refVarName = findRefVarName(hex, colors);
              
              surfaceVars.push({
                name: key,
                varName: key.replace(/[()]/g, '').replace(/\s+/g, '-').toLowerCase(),
                hex: hex,
                alpha: alpha,
                refVarName: refVarName
              });
            }
          });
          
          // 解析 common 顏色 (共用變數)
          const commonData = json.common || {};
          Object.entries(commonData).forEach(([key, colorInfo]: [string, any]) => {
            if (colorInfo.$value) {
              const { components, hex } = colorInfo.$value;
              const rgb = componentsToRgb(components);
              
              commonVars.push({
                varName: key.replace(/[()]/g, '').replace(/\s+/g, '-').toLowerCase(),
                hex: hex,
                rgb: rgb.join(' ')
              });
            }
          });
          
        } else if (hasColourSurface) {
          // ========================================
          // 結構二: colour.surface + colour.common (semantid/xxx.json)
          // ========================================
          
          // 解析 colour.surface 顏色 (主要變數)
          const surfaceColors = json.colour.surface || {};
          Object.entries(surfaceColors).forEach(([jsonKey, colorInfo]: [string, any]) => {
            if (colorInfo.$value) {
              const { components, hex } = colorInfo.$value;
              const rgb = componentsToRgb(components);
              const cssVarName = VAR_MAPPING[jsonKey] || jsonKey;
              
              colors.push({
                id: `${themeId}-${jsonKey}`,
                varName: cssVarName,
                hex: hex,
                rgb: rgb.join(' '),
                isActive: true
              });
            }
          });
          
          // 解析 colour.common 顏色 (共用變數)
          const commonColors = json.colour.common || {};
          Object.entries(commonColors).forEach(([key, colorInfo]: [string, any]) => {
            if (colorInfo.$value) {
              const { components, hex } = colorInfo.$value;
              const rgb = componentsToRgb(components);
              
              commonVars.push({
                varName: VAR_MAPPING[key] || key.replace(/[()]/g, '').replace(/\s+/g, '-').toLowerCase(),
                hex: hex,
                rgb: rgb.join(' ')
              });
            }
          });
        }
        
        // 判斷 mode (根據 bg-primary 或 primary-bg 的亮度)
        const bgPrimary = colors.find(c => c.varName === 'primary-bg' || c.varName === 'bg-primary');
        let mode = 'Dark';
        if (bgPrimary) {
          const rgbValues = bgPrimary.rgb.split(' ').map(Number);
          const brightness = (rgbValues[0] * 299 + rgbValues[1] * 587 + rgbValues[2] * 114) / 1000;
          mode = brightness > 128 ? 'Light' : 'Dark';
        }
        
        loadedFiles.value.push({
          name: file.name,
          themeId: themeId,
          mode: mode,
          colors: colors,
          surfaceVars: surfaceVars,
          commonVars: commonVars
        });
        
        // 自動選取第一個檔案
        if (!selectedThemeId.value) {
          selectedThemeId.value = themeId;
        }
        
      } catch (e) {
        console.error(`解析 ${file.name} 失敗:`, e);
        alert(`解析 ${file.name} 失敗，請確認檔案格式正確。`);
      }
    }
  }
  
  // 自動轉換
  if (loadedFiles.value.length > 0 && selectedThemeId.value) {
    convertToCSS(selectedThemeId.value);
  }
};

// ========================================
// 移除檔案
// ========================================
const removeFile = (themeId: string) => {
  loadedFiles.value = loadedFiles.value.filter(f => f.themeId !== themeId);
  
  // 如果移除的是選中的檔案，切換到第一個
  if (selectedThemeId.value === themeId) {
    selectedThemeId.value = loadedFiles.value[0]?.themeId || null;
  }
  
  if (loadedFiles.value.length === 0) {
    resultOutput.value = '';
    selectedThemeId.value = null;
  } else if (selectedThemeId.value) {
    convertToCSS(selectedThemeId.value);
  }
};

// ========================================
// 清空所有
// ========================================
const clearAll = () => {
  loadedFiles.value = [];
  selectedThemeId.value = null;
  resultOutput.value = '';
};

// ========================================
// 選取檔案
// ========================================
const selectFile = (themeId: string) => {
  selectedThemeId.value = themeId;
  convertToCSS(themeId);
};

// ========================================
// 轉換為 CSS (單一檔案)
// ========================================
const convertToCSS = (themeId: string) => {
  const file = loadedFiles.value.find(f => f.themeId === themeId);
  if (!file) return;
  
  const commonVars = file.commonVars || [];
  const surfaceVars = file.surfaceVars || [];
  const colors = file.colors.filter(c => c.isActive);
  
  // 計算最大變數名稱長度
  const allVarNames: string[] = [];
  colors.forEach(c => allVarNames.push(`--color-${c.varName}:`));
  commonVars.forEach(c => allVarNames.push(`--color-${c.varName}:`));
  surfaceVars.forEach(s => allVarNames.push(`--${s.varName}:`));
  const maxVarNameLength = Math.max(...allVarNames.map(v => v.length), 20);
  
  // 計算 RGB 值的最大長度
  const allRgbValues: string[] = [];
  colors.forEach(c => allRgbValues.push(c.rgb));
  commonVars.forEach(c => allRgbValues.push(c.rgb));
  const maxRgbLength = Math.max(...allRgbValues.map(v => v.length), 15);
  
  let css = '';
  
  // 共用變數區塊 (包含其他變數)
  if (commonVars.length > 0 || surfaceVars.length > 0) {
    css += `/* 共用變數 */\n`;
    css += `:root {\n`;
    
    // 共用顏色變數
    commonVars.forEach(cv => {
      const paddedVarName = `--color-${cv.varName}:`.padEnd(maxVarNameLength + 1);
      const rgbValue = cv.rgb + ';';
      const paddedRgbValue = rgbValue.padEnd(maxRgbLength + 2);
      css += `    ${paddedVarName}${paddedRgbValue}/* ${cv.hex} */\n`;
    });
    
    // 其他變數 (帶透明度)
    if (surfaceVars.length > 0) {
      css += `\n    /* 其他變數 */\n`;
      surfaceVars.forEach(sv => {
        const paddedVarName = `--${sv.varName}:`.padEnd(maxVarNameLength + 1);
        const alphaPercent = Math.round(sv.alpha * 100);
        let value: string;
        if (sv.refVarName) {
          value = `rgb(var(--color-${sv.refVarName}) / ${alphaPercent}%);`;
        } else {
          value = `rgba(${hexToRgb(sv.hex).replace(/ /g, ', ')}, ${sv.alpha.toFixed(2)});`;
        }
        css += `    ${paddedVarName}${value}\n`;
      });
    }
    
    css += `}\n\n`;
  }
  
  // 色票變數
  css += `/* ${file.themeId} - ${file.mode} */\n`;
  css += `:root[data-theme~="${file.themeId}"] {\n`;
  css += `    /* 主顏色 */\n`;
  
  colors.forEach(color => {
    const paddedVarName = `--color-${color.varName}:`.padEnd(maxVarNameLength + 1);
    const rgbValue = color.rgb + ';';
    const paddedRgbValue = rgbValue.padEnd(maxRgbLength + 2);
    css += `    ${paddedVarName}${paddedRgbValue}/* ${color.hex} */\n`;
  });
  
  css += `}`;
  
  resultOutput.value = css;
};



// ========================================
// 複製功能
// ========================================
const copyResult = async () => {
  if (!resultOutput.value) return;
  await navigator.clipboard.writeText(resultOutput.value);
  showCopied.value = true;
  setTimeout(() => showCopied.value = false, 2000);
};

// ========================================
// 拖曳上傳處理
// ========================================
const isDragging = ref(false);

const handleDragOver = (e: DragEvent) => {
  e.preventDefault();
  isDragging.value = true;
};

const handleDragLeave = () => {
  isDragging.value = false;
};

const handleDrop = (e: DragEvent) => {
  e.preventDefault();
  isDragging.value = false;
  if (e.dataTransfer?.files) {
    processFiles(e.dataTransfer.files);
  }
};
</script>

<template>
  <div class="space-y-4">
    <!-- Action Bar -->
    <div class="tool-action-bar">
      <div class="tool-action-left">
        <div 
          class="relative group"
          @dragover="handleDragOver"
          @dragleave="handleDragLeave"
          @drop="handleDrop"
        >
          <input
            type="file"
            accept=".json"
            multiple
            class="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
            @change="(e: Event) => { const files = (e.target as HTMLInputElement).files; if (files) processFiles(files); }"
          />
          <Button 
            variant="outline" 
            class="w-full sm:w-auto gap-2"
            :class="isDragging ? 'border-primary bg-primary/10' : ''"
          >
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
      
      <div class="tool-action-right">
        <ToolButton 
          v-if="loadedFiles.length > 0" 
          type="clear" 
          @click="clearAll" 
        />
        <ToolButton 
          v-if="resultOutput" 
          type="copy" 
          label="複製代碼"
          :copied="showCopied"
          @click="copyResult"
        />
      </div>
    </div>

    <!-- Main Editor Area -->
    <div class="grid gap-4 lg:grid-cols-2 lg:auto-rows-fr">
      <!-- Left: Upload & Preview -->
      <div class="flex flex-col gap-4">
        <!-- Drop Zone (只在沒有檔案時顯示) -->
        <DropZone
          v-if="loadedFiles.length === 0"
          accept=".json"
          :multiple="true"
          title="拖放 Figma JSON 檔案至此處"
          subtitle="支援多檔案上傳，自動轉換為 CSS 變數"
          hint="支援 theme/ 和 semantid/ 資料夾的 JSON 檔案"
          @files="processFiles"
          class="flex-1"
        >
          <template #icon>
            <Upload class="h-6 w-6 text-muted-foreground" />
          </template>
        </DropZone>

        <!-- Loaded Files with Color Preview -->
        <div v-if="loadedFiles.length > 0" class="flex-1 flex flex-col gap-3 overflow-auto">
          <Card 
            v-for="file in loadedFiles" 
            :key="file.themeId"
            :class="[
              'overflow-hidden transition-all cursor-pointer',
              selectedThemeId === file.themeId
                ? 'border-primary bg-card'
                : 'border-border bg-card hover:border-primary/50'
            ]"
            @click="selectFile(file.themeId)"
          >
            <!-- Header -->
            <div 
              class="flex items-center justify-between px-4 py-3"
              :class="selectedThemeId === file.themeId ? 'bg-primary/5' : ''"
            >
              <div class="flex items-center gap-3">
                <span class="text-sm font-mono font-semibold text-foreground">{{ file.themeId }}</span>
                <span 
                  class="text-[10px] px-1.5 py-0.5 rounded font-medium"
                  :class="file.mode === 'Dark' ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-200 text-zinc-700'"
                >
                  {{ file.mode }}
                </span>
              </div>
              <button 
                @click.stop="removeFile(file.themeId)"
                class="text-muted-foreground hover:text-destructive transition-colors p-1 rounded hover:bg-destructive/10"
                title="移除此檔案"
              >
                <X class="w-4 h-4" />
              </button>
            </div>
            
            <!-- Colors Grid -->
            <div class="p-4">
              <div class="text-xs text-muted-foreground mb-2">主要顏色</div>
              <div class="flex flex-wrap gap-2">
                <div
                  v-for="color in file.colors"
                  :key="color.id"
                  class="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-border bg-secondary/30"
                >
                  <div 
                    class="w-5 h-5 rounded-md shadow-sm ring-1 ring-black/10"
                    :style="{ backgroundColor: color.hex }"
                  ></div>
                  <span class="text-xs font-mono text-foreground">{{ color.varName }}</span>
                </div>
              </div>
              
              <!-- Surface Vars (帶透明度) -->
              <div v-if="file.surfaceVars.length > 0" class="mt-3 pt-3 border-t border-border">
                <div class="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Layers class="w-3.5 h-3.5" />
                  其他變數 (帶透明度)
                </div>
                <div class="flex flex-wrap gap-2">
                  <div
                    v-for="sv in file.surfaceVars"
                    :key="sv.varName"
                    class="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-dashed border-border bg-muted/30"
                  >
                    <div 
                      class="w-5 h-5 rounded-md shadow-sm ring-1 ring-black/10"
                      :style="{ backgroundColor: sv.hex, opacity: sv.alpha }"
                    ></div>
                    <span class="text-xs font-mono text-muted-foreground">{{ sv.varName }}</span>
                    <span class="text-[10px] text-muted-foreground/70">{{ Math.round(sv.alpha * 100) }}%</span>
                  </div>
                </div>
              </div>
              
              <!-- Common Vars -->
              <div v-if="file.commonVars.length > 0" class="mt-3 pt-3 border-t border-border">
                <div class="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Palette class="w-3.5 h-3.5" />
                  共用變數
                </div>
                <div class="flex flex-wrap gap-2">
                  <div
                    v-for="cv in file.commonVars"
                    :key="cv.varName"
                    class="flex items-center gap-2 px-2 py-1.5 rounded-lg border border-dashed border-border bg-muted/30"
                  >
                    <div 
                      class="w-5 h-5 rounded-md shadow-sm ring-1 ring-black/10"
                      :style="{ backgroundColor: cv.hex }"
                    ></div>
                    <span class="text-xs font-mono text-muted-foreground">{{ cv.varName }}</span>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <!-- Right: Output -->
      <div class="flex flex-col gap-4">
        <!-- Output Result -->
        <Card class="flex-1 flex flex-col overflow-hidden border-border bg-card">
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
              </svg>
              CSS 變數輸出
            </div>
            <span v-if="showCopied" class="text-xs text-chart-2 transition-opacity">已複製到剪貼簿</span>
          </div>
          
          <div class="flex-1 p-4 bg-background overflow-auto">
            <pre v-if="resultOutput" class="font-mono text-xs text-foreground leading-relaxed whitespace-pre-wrap">{{ resultOutput }}</pre>
            <div v-else class="flex flex-col items-center justify-center h-full text-muted-foreground gap-2">
              <Palette class="h-8 w-8 opacity-50" />
              <span class="text-sm">上傳 JSON 檔案以產生 CSS 變數</span>
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
</style>

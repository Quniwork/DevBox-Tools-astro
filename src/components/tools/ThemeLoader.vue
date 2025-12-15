<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue';
import { Card } from '@/components/ui/card';
import Button from '@/components/ui/Button.vue';
import { FolderOpen, Palette, Copy, Check, RefreshCw, ChevronRight, ChevronLeft, CircleCheck, Circle, Layers, Download } from 'lucide-vue-next';

// ========================================
// CONFIG: API 與變數對應設定
// ========================================
const GAS_API_URL = 'https://script.google.com/macros/s/AKfycbxIwTeg20huQ4YnVtz5g1n48aujG-B_LgaHDWU1CxGDAmAKyR8loTCAWtNpJEh-wwWp6w/exec';

// 模板清單 (用於讀取 JSON 檔案)
const TEMPLATE_LIST = ['250122', '250123', '250124'];

// 變數對應表 (編號 -> API key -> 顯示名稱 -> CSS 變數名稱)
const VAR_MAPPING: Record<string, { key: string; name: string; varName: string }> = {
  "1": { key: "Var1_Pri", name: "主要顏色", varName: 'primary' },
  "2": { key: "Var2_Sec", name: "輔助顏色", varName: 'secondary' },
  "3": { key: "Var3_Ter", name: "次輔助顏色", varName: 'tertiary' },
  "4": { key: "Var4_Pri_Bg", name: "主背景顏色", varName: 'primary-bg' },
  "5": { key: "Var5_Sec_Bg", name: "輔助背景顏色", varName: 'secondary-bg' },
  "6": { key: "Var6_Ter_Bg", name: "次輔助背景顏色", varName: 'tertiary-bg' },
  "7": { key: "Var7_Pri_Text", name: "主文字顏色", varName: 'primary-text' },
  "8": { key: "Var8_Sec_Text", name: "輔助文字顏色", varName: 'secondary-text' },
  "9": { key: "Var9_Ter_Text", name: "次輔助文字顏色", varName: 'tertiary-text' },
};

// 資料結構
interface ColorVar {
  id: string;           // 變數編號 (1-9)
  key: string;          // API key (如 Var1_Pri)
  name: string;         // 顯示名稱 (如 主要顏色)
  varName: string;      // CSS 變數名稱 (如 primary)
  hex: string;          // 顏色值
  isActive: boolean;    // 是否在此模板中啟用
}

// 帶透明度的變數 (其他變數)
interface SurfaceVar {
  name: string;         // 變數名稱 (如 line-primary)
  varName: string;      // CSS 變數名稱
  hex: string;          // 顏色 HEX 值
  alpha: number;        // 透明度 (0-1)
  refVarName: string;   // 參考的 CSS 變數 (如 primary)
}

// 共用變數
interface CommonVar {
  name: string;         // 變數名稱 (如 bg-gameitem)
  varName: string;      // CSS 變數名稱
  hex: string;          // 顏色 HEX 值
}

interface ColorScheme {
  id: string;           // 色票 ID (如 2501221)
  name: string;         // 色票名稱
  mode: string;         // 主題模式 (Dark/Light)
  colors: ColorVar[];   // 所有顏色變數
  surfaceVars: SurfaceVar[]; // 其他變數 (帶透明度)
  commonVars: CommonVar[];   // 共用變數
  // 額外欄位
  primaryColor: string;     // Theme_Pri - 主色
  secondaryColor: string;   // Theme_Sec - 次色
  navType: string;          // Theme_NavType - 下拉選單樣式
  qrCode: string;           // Theme_QRCode - QRCode 樣式
  footBB: string;           // Foot_BB - 頁尾 logo 樣式
  footUB: string;           // Foot_UB - 頁尾瀏覽器連結圖樣式
  floatGotop: string;       // floatGotop - 返回頂部樣式
}

interface Template {
  id: string;           // 模板 ID (如 250122)
  name: string;         // 模板名稱
  activeVars: string[]; // 啟用的變數編號
  schemes: ColorScheme[];
}

// 視圖類型
type ViewType = 'list' | 'detail';

// 響應式狀態
const templates = ref<Template[]>([]);
const isLoading = ref(false);
const currentView = ref<ViewType>('list');
const selectedTemplate = ref<Template | null>(null);
const selectedScheme = ref<ColorScheme | null>(null);
const copiedVar = ref('');
const showCopied = ref(false);
const showCopiedAll = ref(false);  // 複製全部變數按鈕狀態
const isLoadingSurface = ref(false);

// 快取 Key
const CACHE_KEY = 'theme_loader_cache';
const CACHE_EXPIRY = 10 * 60 * 1000; // 10 分鐘快取

// 載入 API 資料 (帶快取)
const loadFromAPI = async () => {
  isLoading.value = true;
  templates.value = [];
  
  try {
    // 嘗試從快取讀取
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        if (Date.now() - timestamp < CACHE_EXPIRY) {
          templates.value = data;
          isLoading.value = false;
          return;
        }
      }
    }
    
    const response = await fetch(GAS_API_URL);
    const data = await response.json();
    
    const configList = data.config || [];
    const themeList = data.list || [];
    
    // 解析模板設定
    const templateMap = new Map<string, Template>();
    
    // 從 config 建立模板結構
    configList.forEach((config: any) => {
      const templateId = config.Theme_Name;
      const activeVars = (config.Active_Variables || '')
        .split(',')
        .map((v: string) => v.trim())
        .filter((v: string) => v);
      
      templateMap.set(templateId, {
        id: templateId,
        name: `Template ${templateId}`,
        activeVars: activeVars,
        schemes: []
      });
    });
    
    // 從 list 填入色票資料
    themeList.forEach((theme: any) => {
      const templateId = theme.Theme_Name;
      const template = templateMap.get(templateId);
      
      if (template) {
        const colors: ColorVar[] = [];
        
        // 建立所有顏色變數
        Object.entries(VAR_MAPPING).forEach(([id, mapping]) => {
          const hexValue = theme[mapping.key] || '';
          colors.push({
            id: id,
            key: mapping.key,
            name: mapping.name,
            varName: mapping.varName,
            hex: hexValue,
            isActive: template.activeVars.includes(id) && hexValue !== ''
          });
        });
        
        template.schemes.push({
          id: theme.Theme_Color,
          name: `Color ${theme.Theme_Color.slice(-1)}`,
          mode: theme.Theme_Mode || 'Dark',
          colors: colors,
          surfaceVars: [],  // 預設為空，選取時再載入
          commonVars: [],   // 預設為空，選取時再載入
          // 額外欄位
          primaryColor: theme.Theme_Pri || '',
          secondaryColor: theme.Theme_Sec || '',
          navType: theme.Theme_NavType || '',
          qrCode: theme.Theme_QRCode || '',
          footBB: theme.Foot_BB || '',
          footUB: theme.Foot_UB || '',
          floatGotop: theme.floatGotop || ''
        });
      }
    });
    
    templates.value = Array.from(templateMap.values());
    
    // 儲存到快取
    if (typeof window !== 'undefined') {
      localStorage.setItem(CACHE_KEY, JSON.stringify({
        data: templates.value,
        timestamp: Date.now()
      }));
    }
    
  } catch (e) {
    console.error('載入 API 失敗:', e);
  } finally {
    isLoading.value = false;
  }
};

// 判斷顏色來源 (找出對應的 CSS 變數名稱)
const findRefVarName = (hex: string, colors: ColorVar[]): string => {
  // 尋找匹配的主顏色
  const matchedColor = colors.find(c => c.hex.toUpperCase() === hex.toUpperCase() && c.isActive);
  return matchedColor ? matchedColor.varName : '';
};

// 從 JSON 檔案載入其他變數 (surface) 和共用變數 (common)
const loadExtraVars = async (scheme: ColorScheme) => {
  if (scheme.surfaceVars.length > 0 || scheme.commonVars.length > 0) return; // 已載入過
  
  isLoadingSurface.value = true;
  const templateId = scheme.id.slice(0, 6);
  
  try {
    // 找到所有同模板的色票
    const template = templates.value.find(t => t.id === templateId);
    if (!template) return;
    
    // 讀取所有色票的 JSON 資料
    const allSchemeData: Array<{ id: string; data: any }> = [];
    
    for (const s of template.schemes) {
      try {
        const response = await fetch(`/theme/${templateId}/${s.id}.json`);
        if (response.ok) {
          const data = await response.json();
          allSchemeData.push({ id: s.id, data });
        }
      } catch {
        // 跳過讀取失敗的
      }
    }
    
    if (allSchemeData.length === 0) return;
    
    // 取得當前色票的資料
    const currentData = allSchemeData.find(d => d.id === scheme.id)?.data;
    if (!currentData) return;
    
    // 解析 surface 區塊中帶透明度的變數
    const surfaceData = currentData.surface || {};
    const surfaceVars: SurfaceVar[] = [];
    
    Object.entries(surfaceData).forEach(([key, value]: [string, any]) => {
      if (value.$value && value.$value.alpha !== undefined && value.$value.alpha < 1) {
        const alpha = value.$value.alpha;
        const hex = value.$value.hex || '';
        
        // 找出參考的主顏色變數
        const refVarName = findRefVarName(hex, scheme.colors);
        
        surfaceVars.push({
          name: key,
          varName: key.replace(/[()]/g, '').replace(/\s+/g, '-').toLowerCase(),
          hex: hex,
          alpha: alpha,
          refVarName: refVarName
        });
      }
    });
    
    // 解析 common 區塊的共用變數 (支援兩種結構)
    const commonData = currentData.common || currentData.colour?.common || {};
    const commonVars: CommonVar[] = [];
    
    Object.entries(commonData).forEach(([key, value]: [string, any]) => {
      if (value.$value && value.$value.hex) {
        commonVars.push({
          name: key,
          varName: key.replace(/[()]/g, '').replace(/\s+/g, '-').toLowerCase(),
          hex: value.$value.hex
        });
      }
    });
    
    // 自動偵測共用顏色：找出所有色票中相同變數值的顏色
    // 檢查 surface 或 colour.surface 結構
    const firstData = allSchemeData[0].data;
    const surfacePath = firstData.surface ? 'surface' : (firstData.colour?.surface ? 'colour.surface' : null);
    
    if (surfacePath && allSchemeData.length > 1) {
      const getSurface = (data: any) => surfacePath === 'surface' ? data.surface : data.colour?.surface;
      const firstSurface = getSurface(firstData) || {};
      
      Object.entries(firstSurface).forEach(([key, value]: [string, any]) => {
        if (value.$value && value.$value.hex && value.$value.alpha === 1) {
          const firstHex = value.$value.hex.toUpperCase();
          
          // 檢查所有其他色票是否有相同的值
          const allSame = allSchemeData.every(sd => {
            const surface = getSurface(sd.data) || {};
            const colorValue = surface[key]?.$value?.hex?.toUpperCase();
            return colorValue === firstHex;
          });
          
          if (allSame) {
            // 檢查是否已在 commonVars 中
            const varName = key.replace(/[()]/g, '').replace(/\s+/g, '-').toLowerCase();
            if (!commonVars.find(cv => cv.varName === varName)) {
              commonVars.push({
                name: key,
                varName: varName,
                hex: firstHex
              });
            }
          }
        }
      });
    }
    
    // 更新 scheme
    scheme.surfaceVars = surfaceVars;
    scheme.commonVars = commonVars;
    
  } catch (e) {
    console.error(`載入 ${scheme.id} 額外變數失敗:`, e);
  } finally {
    isLoadingSurface.value = false;
  }
};

// 進入模板詳情頁
const openTemplate = (template: Template) => {
  selectedTemplate.value = template;
  selectedScheme.value = null;
  currentView.value = 'detail';
  // 更新 URL hash
  if (typeof window !== 'undefined') {
    window.location.hash = template.id;
  }
};

// 返回模板清單
const goBack = () => {
  currentView.value = 'list';
  selectedTemplate.value = null;
  selectedScheme.value = null;
  // 清除 URL hash
  if (typeof window !== 'undefined') {
    history.pushState('', document.title, window.location.pathname);
  }
};

// 選取色票
const selectScheme = async (scheme: ColorScheme) => {
  selectedScheme.value = scheme;
  // 載入透明度變數
  await loadExtraVars(scheme);
};

// 取得啟用的顏色
const activeColors = computed(() => {
  if (!selectedScheme.value) return [];
  return selectedScheme.value.colors.filter(c => c.isActive);
});

// 複製單一變數
const copyColorVar = async (varName: string) => {
  const cssVar = `--color-${varName}`;
  await navigator.clipboard.writeText(cssVar);
  copiedVar.value = varName;
  setTimeout(() => copiedVar.value = '', 1500);
};

// 複製透明度變數
const copySurfaceVar = async (surfaceVar: SurfaceVar) => {
  let cssValue: string;
  if (surfaceVar.refVarName) {
    // 有參考變數，輸出 rgb(var(--color-xxx) / 30%) 格式
    const alphaPercent = Math.round(surfaceVar.alpha * 100);
    cssValue = `rgb(var(--color-${surfaceVar.refVarName}) / ${alphaPercent}%)`;
  } else {
    // 無參考變數，輸出 rgba 格式
    const rgb = hexToRgb(surfaceVar.hex);
    cssValue = `rgba(${rgb.replace(/ /g, ', ')}, ${surfaceVar.alpha.toFixed(2)})`;
  }
  await navigator.clipboard.writeText(cssValue);
  copiedVar.value = surfaceVar.varName;
  setTimeout(() => copiedVar.value = '', 1500);
};

// HEX 轉 RGB
const hexToRgb = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0 0';
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
};

// 產生 CSS 變數
const generateCSS = computed(() => {
  if (!selectedScheme.value || activeColors.value.length === 0) return '';
  
  const scheme = selectedScheme.value;
  const colors = activeColors.value;
  const surfaceVars = scheme.surfaceVars || [];
  const commonVars = scheme.commonVars || [];
  
  // 計算最大變數名稱長度 (包含所有變數)
  const allVarNames = [
    ...colors.map(c => `--color-${c.varName}:`),
    ...surfaceVars.map(s => `--${s.varName}:`),
    ...commonVars.map(c => `--color-${c.varName}:`)
  ];
  const maxVarNameLength = Math.max(...allVarNames.map(v => v.length));
  
  // 計算 RGB 值的最大長度 (用於對齊 HEX 註解)
  const allRgbValues = [
    ...colors.map(c => hexToRgb(c.hex)),
    ...commonVars.map(c => hexToRgb(c.hex))
  ];
  const maxRgbLength = Math.max(...allRgbValues.map(v => v.length), 15);
  
  let css = '';
  
  // 共用變數 (放在最前面，包含其他變數)
  if (commonVars.length > 0 || surfaceVars.length > 0) {
    css += `/* 共用變數 */\n`;
    css += `:root {\n`;
    
    // 共用顏色變數
    commonVars.forEach(cv => {
      const paddedVarName = `--color-${cv.varName}:`.padEnd(maxVarNameLength + 1);
      const rgbValue = hexToRgb(cv.hex) + ';';
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
  css += `/* ${scheme.id} - ${scheme.mode} */\n`;
  css += `:root[data-theme~="${scheme.id}"] {\n`;
  
  // 主顏色 (帶 HEX 註解)
  css += `    /* 主顏色 */\n`;
  colors.forEach(color => {
    const paddedVarName = `--color-${color.varName}:`.padEnd(maxVarNameLength + 1);
    const rgbValue = hexToRgb(color.hex) + ';';
    const paddedRgbValue = rgbValue.padEnd(maxRgbLength + 2);
    css += `    ${paddedVarName}${paddedRgbValue}/* ${color.hex} */\n`;
  });
  
  css += `}`;
  
  return css;
});

// 複製 CSS 結果
const copyResult = async () => {
  if (!generateCSS.value) return;
  await navigator.clipboard.writeText(generateCSS.value);
  showCopied.value = true;
  setTimeout(() => showCopied.value = false, 2000);
};

// 產生整個模板的 CSS（所有色票）
const generateAllCSS = computed(() => {
  if (!selectedTemplate.value) return '';
  
  const template = selectedTemplate.value;
  const schemes = template.schemes;
  if (schemes.length === 0) return '';
  
  // 取第一個 scheme 的共用變數和其他變數
  const firstScheme = schemes[0];
  const commonVars = firstScheme.commonVars || [];
  const surfaceVars = firstScheme.surfaceVars || [];
  
  // 計算所有變數名稱長度
  const allVarNames: string[] = [];
  schemes.forEach(scheme => {
    scheme.colors.filter(c => c.isActive).forEach(c => {
      allVarNames.push(`--color-${c.varName}:`);
    });
  });
  commonVars.forEach(c => allVarNames.push(`--color-${c.varName}:`));
  surfaceVars.forEach(s => allVarNames.push(`--${s.varName}:`));
  
  const maxVarNameLength = Math.max(...allVarNames.map(v => v.length), 20);
  
  // 計算 RGB 值的最大長度
  const allRgbValues: string[] = [];
  schemes.forEach(scheme => {
    scheme.colors.filter(c => c.isActive).forEach(c => {
      allRgbValues.push(hexToRgb(c.hex));
    });
  });
  commonVars.forEach(c => allRgbValues.push(hexToRgb(c.hex)));
  const maxRgbLength = Math.max(...allRgbValues.map(v => v.length), 15);
  
  let css = '';
  
  // 共用變數區塊（包含其他變數）
  if (commonVars.length > 0 || surfaceVars.length > 0) {
    css += `/* 共用變數 */\n`;
    css += `:root {\n`;
    
    // 共用顏色變數
    commonVars.forEach(cv => {
      const paddedVarName = `--color-${cv.varName}:`.padEnd(maxVarNameLength + 1);
      const rgbValue = hexToRgb(cv.hex) + ';';
      const paddedRgbValue = rgbValue.padEnd(maxRgbLength + 2);
      css += `    ${paddedVarName}${paddedRgbValue}/* ${cv.hex} */\n`;
    });
    
    // 其他變數（帶透明度）
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
  
  // 每個色票的變數
  schemes.forEach(scheme => {
    const colors = scheme.colors.filter(c => c.isActive);
    
    css += `/* ${scheme.id} - ${scheme.mode} */\n`;
    css += `:root[data-theme~="${scheme.id}"] {\n`;
    css += `    /* 主顏色 */\n`;
    
    colors.forEach(color => {
      const paddedVarName = `--color-${color.varName}:`.padEnd(maxVarNameLength + 1);
      const rgbValue = hexToRgb(color.hex) + ';';
      const paddedRgbValue = rgbValue.padEnd(maxRgbLength + 2);
      css += `    ${paddedVarName}${paddedRgbValue}/* ${color.hex} */\n`;
    });
    
    css += `}\n\n`;
  });
  
  return css.trim();
});

// 複製全部 CSS
const copyAllCSS = async () => {
  if (!generateAllCSS.value) return;
  await navigator.clipboard.writeText(generateAllCSS.value);
  showCopiedAll.value = true;
  setTimeout(() => showCopiedAll.value = false, 2000);
};

// 下載 theme.json
const downloadThemeJson = () => {
  if (!selectedTemplate.value) return;
  
  const template = selectedTemplate.value;
  
  // 建立 theme.json 結構
  const themeData = {
    colorVariables: template.activeVars.map(v => parseInt(v)),
    colorThemes: template.schemes.map((scheme, index) => ({
      themeSort: index + 1,
      themeMode: scheme.mode.toLowerCase(),
      themeName: scheme.id,
      themeColor: {
        primary: scheme.primaryColor,
        secondary: scheme.secondaryColor
      },
      themeNav: scheme.navType,
      imgQrcode: scheme.qrCode,
      footerLogo: {
        bb: scheme.footBB,
        ub: scheme.footUB
      },
      floatGotop: scheme.floatGotop
    }))
  };
  
  // 建立下載
  const jsonStr = JSON.stringify(themeData, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `theme-${template.id}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// 初始化載入
onMounted(async () => {
  await loadFromAPI();
  
  // 檢查 URL hash，自動跳轉到對應模板
  if (typeof window !== 'undefined' && window.location.hash) {
    const hash = window.location.hash.slice(1); // 移除 #
    const template = templates.value.find(t => t.id === hash);
    if (template) {
      openTemplate(template);
    }
  }
});
</script>

<template>
  <div class="space-y-4">
    <!-- ==================== 視圖 1: 模板清單 ==================== -->
    <template v-if="currentView === 'list'">
      <!-- Header -->
      <div class="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center w-10 h-10 rounded-lg bg-primary/10">
            <FolderOpen class="h-5 w-5 text-primary" />
          </div>
          <div>
            <h2 class="text-sm font-medium text-foreground">Template Color</h2>
            <p class="text-xs text-muted-foreground">Database 從 Google Sheet 讀取模板配色設定</p>
          </div>
        </div>
        
        <Button 
          variant="outline" 
          size="sm" 
          @click="loadFromAPI"
          :disabled="isLoading"
          class="gap-2"
        >
          <RefreshCw class="h-4 w-4" :class="{ 'animate-spin': isLoading }" />
          重新載入
        </Button>
      </div>

      <!-- Loading State -->
      <div v-if="isLoading" class="flex items-center justify-center py-16">
        <RefreshCw class="h-8 w-8 text-muted-foreground animate-spin" />
      </div>
      
      <!-- Template Grid -->
      <div v-else class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card 
          v-for="template in templates" 
          :key="template.id"
          class="group cursor-pointer border-border bg-card hover:border-primary/50 hover:shadow-lg transition-all duration-200"
          @click="openTemplate(template)"
        >
          <div class="p-4">
            <!-- Template Header -->
            <div class="flex items-center justify-between mb-3">
              <span class="text-lg font-semibold text-foreground">{{ template.name }}</span>
              <ChevronRight class="h-5 w-5 text-muted-foreground group-hover:text-primary group-hover:translate-x-1 transition-all" />
            </div>
            
            <!-- Active Variables -->
            <div class="text-xs text-muted-foreground mb-3 px-1">
              使用變數: {{ template.activeVars.join(', ') }}
            </div>
            
            <!-- Color Scheme Grid -->
            <div class="grid grid-cols-2 gap-2">
              <div 
                v-for="scheme in template.schemes" 
                :key="scheme.id"
                class="flex items-center gap-2 px-2.5 py-2 rounded-lg border border-border bg-background"
              >
                <!-- 主色/次色預覽 -->
                <div class="flex gap-1">
                  <div 
                    v-if="scheme.primaryColor"
                    class="w-5 h-5 rounded-md shadow-sm ring-1 ring-black/10"
                    :style="{ backgroundColor: scheme.primaryColor }"
                  ></div>
                  <div 
                    v-if="scheme.secondaryColor"
                    class="w-5 h-5 rounded-md shadow-sm ring-1 ring-black/10"
                    :style="{ backgroundColor: scheme.secondaryColor }"
                  ></div>
                </div>
                <div class="flex-1 min-w-0">
                  <div class="text-xs font-medium text-foreground truncate">{{ scheme.name }}</div>
                </div>
                <span 
                  class="text-[9px] px-1.5 py-0.5 rounded font-medium shrink-0"
                  :class="scheme.mode === 'Dark' ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-200 text-zinc-700'"
                >
                  {{ scheme.mode }}
                </span>
              </div>
            </div>
          </div>
        </Card>
      </div>
    </template>

    <!-- ==================== 視圖 2: 模板詳情 ==================== -->
    <template v-else-if="currentView === 'detail' && selectedTemplate">
      <!-- Header with Back Button -->
      <div class="flex items-center justify-between rounded-xl border border-border bg-card p-4">
        <div class="flex items-center gap-3">
          <Button 
            variant="ghost" 
            size="sm" 
            @click="goBack"
            class="gap-2 text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft class="h-4 w-4" />
            返回
          </Button>
          <div class="h-6 w-px bg-border"></div>
          <div class="flex items-center gap-2">
            <div class="flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10">
              <Palette class="h-4 w-4 text-primary" />
            </div>
            <span class="text-lg font-semibold text-foreground">{{ selectedTemplate.name }}</span>
          </div>
        </div>
        
        <div class="flex items-center gap-3">
          <span class="text-sm text-muted-foreground">
            使用變數: {{ selectedTemplate.activeVars.join(', ') }}
          </span>
          <Button 
            variant="outline" 
            size="sm"
            @click="downloadThemeJson"
            class="gap-2 bg-primary text-white hover:bg-primary/90 border-primary"
          >
            <Download class="h-3.5 w-3.5" />
            下載 theme.json
          </Button>
        </div>
      </div>

      <!-- Schemes List -->
      <Card class="border-border bg-card">
        <div class="flex items-center justify-between border-b border-border px-4 py-3">
          <div class="flex items-center gap-2">
            <Palette class="h-4 w-4 text-muted-foreground" />
            <span class="text-sm font-medium text-muted-foreground">選擇色票</span>
          </div>
          <Button 
            variant="outline" 
            @click="copyAllCSS"
            class="gap-2"
            :disabled="!generateAllCSS"
          >
            <div v-if="showCopiedAll" class="flex items-center gap-2 text-chart-2">
              <Check class="h-4 w-4" />
              <span>已複製</span>
            </div>
            <div v-else class="flex items-center gap-2">
              <Copy class="h-4 w-4" />
              <span>複製變數</span>
            </div>
          </Button>
        </div>
        <div class="p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <button
            v-for="scheme in selectedTemplate.schemes"
            :key="scheme.id"
            @click="selectScheme(scheme)"
            :class="[
              'flex items-center gap-3 px-4 py-3 rounded-lg border transition-all text-left',
              selectedScheme?.id === scheme.id
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            ]"
          >
            <!-- 主色/次色預覽 -->
            <div class="flex gap-1">
              <div 
                v-if="scheme.primaryColor"
                class="w-6 h-6 rounded-md border border-border shadow-sm"
                :style="{ backgroundColor: scheme.primaryColor }"
                title="主色"
              ></div>
              <div 
                v-if="scheme.secondaryColor"
                class="w-6 h-6 rounded-md border border-border shadow-sm"
                :style="{ backgroundColor: scheme.secondaryColor }"
                title="次色"
              ></div>
            </div>
            <div class="flex-1">
              <div class="text-sm font-medium text-foreground">{{ scheme.name }}</div>
              <div class="text-xs font-mono text-muted-foreground">{{ scheme.id }}</div>
            </div>
            <span 
              class="text-[10px] px-1.5 py-0.5 rounded font-medium"
              :class="scheme.mode === 'Dark' ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-200 text-zinc-700'"
            >
              {{ scheme.mode }}
            </span>
          </button>
        </div>
      </Card>

      <!-- 色票額外資訊 -->
      <Card v-if="selectedScheme" class="border-border bg-card">
        <div class="flex items-center gap-2 border-b border-border px-4 py-3">
          <Layers class="h-4 w-4 text-muted-foreground" />
          <span class="text-sm font-medium text-muted-foreground">色票設定</span>
        </div>
        <div class="p-4 grid grid-cols-2 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <!-- 配色區塊 (主色 + 次色) -->
          <div class="col-span-1 p-3 rounded-lg bg-secondary/30">
            <div class="text-xs text-muted-foreground/50 mb-2 font-medium">配色</div>
            <div class="flex items-center gap-6">
              <div class="flex items-center gap-1.5">
                <div 
                  v-if="selectedScheme.primaryColor"
                  class="w-8 h-8 rounded-md border border-border shadow-sm"
                  :style="{ backgroundColor: selectedScheme.primaryColor }"
                ></div>
                <div v-else class="w-8 h-8 rounded-md border border-dashed border-muted-foreground/30"></div>
                <div class="text-xs">
                  <div class="text-muted-foreground">Primary</div>
                  <div class="font-mono text-foreground">{{ selectedScheme.primaryColor || '-' }}</div>
                </div>
              </div>
              <div class="flex items-center gap-1.5">
                <div 
                  v-if="selectedScheme.secondaryColor"
                  class="w-8 h-8 rounded-md border border-border shadow-sm"
                  :style="{ backgroundColor: selectedScheme.secondaryColor }"
                ></div>
                <div v-else class="w-8 h-8 rounded-md border border-dashed border-muted-foreground/30"></div>
                <div class="text-xs">
                  <div class="text-muted-foreground">Secondary</div>
                  <div class="font-mono text-foreground">{{ selectedScheme.secondaryColor || '-' }}</div>
                </div>
              </div>
            </div>
          </div>
          
          <!-- 樣式區塊 -->
          <div class="col-span-1 p-3 rounded-lg bg-secondary/30">
            <div class="text-xs text-muted-foreground/50 mb-2 font-medium">樣式</div>
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted-foreground">下拉選單</span>
                <span class="font-mono text-foreground">{{ selectedScheme.navType || '-' }}</span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted-foreground">QRCode</span>
                <span class="font-mono text-foreground">{{ selectedScheme.qrCode || '-' }}</span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted-foreground">返回頂部</span>
                <span class="font-mono text-foreground">{{ selectedScheme.floatGotop || '-' }}</span>
              </div>
            </div>
          </div>
          
          <!-- 頁尾區塊 -->
          <div class="col-span-1 p-3 rounded-lg bg-secondary/30">
            <div class="text-xs text-muted-foreground/50 mb-2 font-medium">頁尾 (Footer)</div>
            <div class="space-y-1.5">
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted-foreground">BBIN (BB)</span>
                <span class="font-mono text-foreground">{{ selectedScheme.footBB || '-' }}</span>
              </div>
              <div class="flex items-center justify-between text-xs">
                <span class="text-muted-foreground">寰宇 (UB)</span>
                <span class="font-mono text-foreground">{{ selectedScheme.footUB || '-' }}</span>
              </div>
            </div>
          </div>

        </div>
      </Card>

      <!-- Selected Scheme Details -->
      <div v-if="selectedScheme" class="grid gap-4 lg:grid-cols-2">
        <!-- Color Preview -->
        <Card class="border-border bg-card">
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <div class="flex items-center gap-2">
              <Palette class="h-4 w-4 text-muted-foreground" />
              <span class="text-sm font-medium text-muted-foreground">顏色預覽</span>
            </div>
            <div class="flex items-center gap-2">
              <span 
                class="text-[10px] px-1.5 py-0.5 rounded font-medium"
                :class="selectedScheme.mode === 'Dark' ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-200 text-zinc-700'"
              >
                {{ selectedScheme.mode }}
              </span>
              <span class="text-xs font-mono text-primary">{{ selectedScheme.id }}</span>
            </div>
          </div>
          
          <div class="p-4">
            <!-- 啟用的顏色 -->
            <div class="mb-3">
              <span class="text-xs text-muted-foreground mb-2 block">啟用的變數 (點擊複製)</span>
              <div class="flex flex-wrap gap-3">
                <div 
                  v-for="color in activeColors" 
                  :key="color.varName"
                  class="color-chip-wrapper relative"
                >
                  <button
                    @click="copyColorVar(color.varName)"
                    class="flex flex-col items-center gap-1.5 px-3 py-2 rounded-lg bg-secondary/50 hover:bg-secondary transition-all cursor-pointer"
                    :class="{ 'ring-2 ring-chart-2 bg-chart-2/10': copiedVar === color.varName }"
                  >
                    <div 
                      class="w-10 h-10 rounded-lg border border-border shadow-sm"
                      :style="{ backgroundColor: color.hex }"
                    ></div>
                    <span class="text-[10px] text-muted-foreground font-mono leading-none">
                      {{ copiedVar === color.varName ? '✓ 已複製' : color.varName }}
                    </span>
                  </button>
                  
                  <!-- Tooltip -->
                  <div class="color-tooltip">
                    <div class="text-[11px] font-medium text-foreground mb-1">{{ color.name }}</div>
                    <div class="flex items-center gap-2 text-[10px] font-mono">
                      <span class="text-muted-foreground">HEX</span>
                      <span class="text-foreground font-medium">{{ color.hex }}</span>
                    </div>
                    <div class="flex items-center gap-2 text-[10px] font-mono mt-0.5">
                      <span class="text-muted-foreground">RGB</span>
                      <span class="text-foreground font-medium">{{ hexToRgb(color.hex) }}</span>
                    </div>
                    <div class="text-[9px] text-muted-foreground/70 mt-1.5 pt-1.5 border-t border-border">
                      點擊複製 --color-{{ color.varName }}
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <!-- 所有變數狀態 -->
            <div class="mt-4 pt-4 border-t border-border">
              <span class="text-xs text-muted-foreground mb-2 block">變數狀態</span>
              <div class="grid grid-cols-3 gap-2">
                <div 
                  v-for="color in selectedScheme.colors" 
                  :key="color.id"
                  class="flex items-center gap-1.5 text-xs"
                  :class="color.isActive ? 'text-foreground' : 'text-muted-foreground/50'"
                >
                  <CircleCheck v-if="color.isActive" class="w-3.5 h-3.5 text-chart-2" />
                  <Circle v-else class="w-3.5 h-3.5" />
                  <span>({{ color.id }}) {{ color.name }}</span>
                </div>
              </div>
            </div>
          </div>
        </Card>

        <!-- CSS Output -->
        <Card class="flex flex-col overflow-hidden border-border bg-card min-h-[300px]">
          <div class="flex items-center justify-between border-b border-border px-4 py-3">
            <div class="flex items-center gap-2 text-sm font-medium text-muted-foreground">
              <svg class="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M16 18l6-6-6-6M8 6l-6 6 6 6" />
              </svg>
              CSS 變數輸出
            </div>
            <Button 
              v-if="generateCSS"
              variant="outline" 
              size="sm"
              @click="copyResult"
              class="gap-2"
            >
              <div v-if="showCopied" class="flex items-center gap-2 text-chart-2">
                <Check class="h-3.5 w-3.5" />
                <span>已複製</span>
              </div>
              <div v-else class="flex items-center gap-2">
                <Copy class="h-3.5 w-3.5" />
                <span>複製</span>
              </div>
            </Button>
          </div>
          
          <div class="flex-1 p-4 bg-background overflow-auto">
            <pre v-if="generateCSS" class="font-mono text-xs text-foreground leading-relaxed whitespace-pre-wrap">{{ generateCSS }}</pre>
            <div v-else class="flex items-center justify-center h-full text-sm text-muted-foreground">
              請選擇一個色票以產生 CSS 變數...
            </div>
          </div>
        </Card>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* 色票 Tooltip 樣式 */
.color-chip-wrapper {
  position: relative;
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

/* 棋盤格背景 (用於顯示透明度) */
.checker-bg {
  background-image: 
    linear-gradient(45deg, #ccc 25%, transparent 25%),
    linear-gradient(-45deg, #ccc 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #ccc 75%),
    linear-gradient(-45deg, transparent 75%, #ccc 75%);
  background-size: 8px 8px;
  background-position: 0 0, 0 4px, 4px -4px, -4px 0px;
  background-color: #fff;
}
</style>

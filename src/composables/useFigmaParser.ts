/**
 * Figma JSON 解析工具
 * 支援多種 JSON 結構的顏色變數解析
 */

// ========================================
// CONFIG: 變數名稱對應表
// JSON key -> CSS 變數名稱
// ========================================
export const VAR_MAPPING: Record<string, string> = {
  // 250122 結構 (colour.surface)
  'primary': 'primary',
  'secondary': 'secondary',
  'tertiary': 'tertiary',
  'primary-bg': 'primary-bg',
  'secondary-bg': 'secondary-bg',
  'tertiary-bg': 'tertiary-bg',
  'primary-text': 'primary-text',
  'secondary-text': 'secondary-text',
  'tertiary-text': 'tertiary-text',
  
  // 250123 結構 (colour.surface + colour.common)
  'bg-primary': 'primary-bg',
  'bg-secondary': 'secondary-bg',
  'bg-tertiary': 'tertiary-bg',
  'text-primary': 'primary-text',
  'text-secondary': 'secondary-text',
  'text-tertiary': 'text-tertiary',
  
  // 250124 結構 (brand + surface + common)
  'txt-primary': 'primary-text',
  'txt-secondary': 'secondary-text',
};

// ========================================
// 介面定義
// ========================================
export interface ColorVar {
  id: string;
  varName: string;
  hex: string;
  rgb: string;
  isActive: boolean;
}

export interface SurfaceVar {
  name: string;
  varName: string;
  hex: string;
  alpha: number;
  refVarName: string;
}

export interface CommonVar {
  varName: string;
  hex: string;
  rgb: string;
}

export interface ParsedTheme {
  themeId: string;
  mode: string;
  colors: ColorVar[];
  surfaceVars: SurfaceVar[];
  commonVars: CommonVar[];
}

// ========================================
// 輔助函數
// ========================================

/**
 * components (0-1 浮點數) 轉換為 RGB (0-255)
 */
export const componentsToRgb = (components: number[]): number[] => {
  return components.map(c => Math.round(c * 255));
};

/**
 * HEX 轉 RGB 字串 (空格分隔)
 */
export const hexToRgb = (hex: string): string => {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  if (!result) return '0 0 0';
  return `${parseInt(result[1], 16)} ${parseInt(result[2], 16)} ${parseInt(result[3], 16)}`;
};

/**
 * 從檔名提取 Theme ID
 */
export const extractThemeId = (filename: string): string => {
  return filename.replace('.json', '').split('/').pop() || filename;
};

/**
 * 找出參考的主顏色變數
 */
export const findRefVarName = (hex: string, colors: ColorVar[]): string => {
  const matchedColor = colors.find(c => c.hex.toUpperCase() === hex.toUpperCase() && c.isActive);
  return matchedColor ? matchedColor.varName : '';
};

/**
 * 判斷 Dark/Light 模式 (根據背景顏色亮度)
 */
export const detectMode = (colors: ColorVar[]): string => {
  const bgPrimary = colors.find(c => 
    c.varName === 'primary-bg' || 
    c.varName === 'bg-primary'
  );
  
  if (bgPrimary) {
    const rgbValues = bgPrimary.rgb.split(' ').map(Number);
    const brightness = (rgbValues[0] * 299 + rgbValues[1] * 587 + rgbValues[2] * 114) / 1000;
    return brightness > 128 ? 'Light' : 'Dark';
  }
  
  return 'Dark';
};

// ========================================
// JSON 解析函數
// ========================================

/**
 * 解析 Figma JSON 檔案
 * 自動偵測結構類型並解析
 */
export const parseFigmaJson = (json: any, themeId: string): ParsedTheme => {
  const colors: ColorVar[] = [];
  const surfaceVars: SurfaceVar[] = [];
  const commonVars: CommonVar[] = [];
  
  // 判斷 JSON 結構類型
  const hasBrand = !!json.brand;
  const hasColourSurface = !!json.colour?.surface;
  
  if (hasBrand) {
    // ========================================
    // 結構一: brand + surface + common (theme/ 資料夾)
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
    // 結構二: colour.surface + colour.common (semantid/ 資料夾)
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
  
  return {
    themeId,
    mode: detectMode(colors),
    colors,
    surfaceVars,
    commonVars
  };
};

// ========================================
// CSS 產生函數
// ========================================

/**
 * 產生 CSS 變數字串
 */
export const generateCSS = (themes: ParsedTheme[]): string => {
  if (themes.length === 0) return '';
  
  // 按 themeId 排序
  const sortedThemes = [...themes].sort((a, b) => 
    a.themeId.localeCompare(b.themeId)
  );
  
  // 收集第一個檔案的共用變數和其他變數
  const allCommonVars = sortedThemes[0]?.commonVars || [];
  const allSurfaceVars = sortedThemes[0]?.surfaceVars || [];
  
  // 計算最大變數名稱長度
  const allVarNames: string[] = [];
  sortedThemes.forEach(theme => {
    theme.colors.filter(c => c.isActive).forEach(c => {
      allVarNames.push(`--color-${c.varName}:`);
    });
  });
  allCommonVars.forEach(c => allVarNames.push(`--color-${c.varName}:`));
  allSurfaceVars.forEach(s => allVarNames.push(`--${s.varName}:`));
  const maxVarNameLength = Math.max(...allVarNames.map(v => v.length), 20);
  
  // 計算 RGB 值的最大長度
  const allRgbValues: string[] = [];
  sortedThemes.forEach(theme => {
    theme.colors.filter(c => c.isActive).forEach(c => {
      allRgbValues.push(c.rgb);
    });
  });
  allCommonVars.forEach(c => allRgbValues.push(c.rgb));
  const maxRgbLength = Math.max(...allRgbValues.map(v => v.length), 15);
  
  let css = '';
  
  // 共用變數區塊 (包含其他變數)
  if (allCommonVars.length > 0 || allSurfaceVars.length > 0) {
    css += `/* 共用變數 */\n`;
    css += `:root {\n`;
    
    // 共用顏色變數
    allCommonVars.forEach(cv => {
      const paddedVarName = `--color-${cv.varName}:`.padEnd(maxVarNameLength + 1);
      const rgbValue = cv.rgb + ';';
      const paddedRgbValue = rgbValue.padEnd(maxRgbLength + 2);
      css += `    ${paddedVarName}${paddedRgbValue}/* ${cv.hex} */\n`;
    });
    
    // 其他變數 (帶透明度)
    if (allSurfaceVars.length > 0) {
      css += `\n    /* 其他變數 */\n`;
      allSurfaceVars.forEach(sv => {
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
  sortedThemes.forEach(theme => {
    const activeColors = theme.colors.filter(c => c.isActive);
    
    css += `/* ${theme.themeId} - ${theme.mode} */\n`;
    css += `:root[data-theme~="${theme.themeId}"] {\n`;
    css += `    /* 主顏色 */\n`;
    
    activeColors.forEach(color => {
      const paddedVarName = `--color-${color.varName}:`.padEnd(maxVarNameLength + 1);
      const rgbValue = color.rgb + ';';
      const paddedRgbValue = rgbValue.padEnd(maxRgbLength + 2);
      css += `    ${paddedVarName}${paddedRgbValue}/* ${color.hex} */\n`;
    });
    
    css += `}\n\n`;
  });
  
  return css.trim();
};

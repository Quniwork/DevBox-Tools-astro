/**
 * 檔案處理相關的共用工具函式
 */

/**
 * 格式化檔案大小顯示
 * @param bytes 位元組數
 * @returns 格式化後的字串 (B/KB/MB)
 */
export const formatSize = (bytes: number): string => {
  if (bytes === 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
};

/**
 * 產生唯一 ID
 * @returns 唯一識別碼字串
 */
export const generateId = (): string => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * 計算節省百分比
 * @param originalSize 原始大小
 * @param newSize 新大小
 * @returns 節省百分比（正數表示減少，負數表示增加）
 */
export const calculateSavings = (originalSize: number, newSize: number): number => {
  if (originalSize === 0) return 0;
  return Math.round(((originalSize - newSize) / originalSize) * 100);
};

/**
 * 下載檔案
 * @param blob Blob 資料
 * @param filename 檔案名稱
 */
export const downloadBlob = (blob: Blob, filename: string): void => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};

/**
 * 批量下載打包成 ZIP
 * @param items 要打包的項目陣列
 * @param zipFilename ZIP 檔案名稱
 * @param getBlob 取得每個項目 Blob 的函式
 * @param getFilename 取得每個項目檔名的函式
 */
export const downloadAsZip = async <T>(
  items: T[],
  zipFilename: string,
  getBlob: (item: T) => Blob | null,
  getFilename: (item: T) => string
): Promise<void> => {
  if (items.length === 0) return;
  
  try {
    // 動態載入 JSZip
    const JSZip = (await import('https://cdn.jsdelivr.net/npm/jszip@3.10.1/+esm')).default;
    const zip = new JSZip();
    
    // 將每個檔案加入 ZIP
    for (const item of items) {
      const blob = getBlob(item);
      if (blob) {
        zip.file(getFilename(item), blob);
      }
    }
    
    // 產生 ZIP 並下載
    const content = await zip.generateAsync({ type: 'blob' });
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    downloadBlob(content, `${zipFilename}-${date}.zip`);
  } catch (error) {
    console.error('ZIP 下載失敗:', error);
    // 如果 JSZip 載入失敗，改用逐一下載
    items.forEach((item, index) => {
      const blob = getBlob(item);
      if (blob) {
        setTimeout(() => downloadBlob(blob, getFilename(item)), index * 200);
      }
    });
  }
};

<script setup lang="ts">
/**
 * 短網址產生器
 * 支援 TinyURL 和 clck.ru
 */
import { ref, computed, onMounted, watch } from 'vue';
import { Card } from '@/components/ui/card';
import Button from '@/components/ui/Button.vue';
import ToolButton from '@/components/ui/ToolButton.vue';
import { Link, ExternalLink, Clock, Trash2, Copy, Check, ChevronDown } from 'lucide-vue-next';

// ========================================
// CONFIG: 短網址服務列表
// ========================================
interface ShortenerService {
  id: string;
  name: string;
  domain: string;
  fetchUrl: (url: string) => Promise<string>;
}

// 短網址服務列表
const SERVICES: ShortenerService[] = [
  {
    id: 'tinyurl',
    name: 'TinyURL',
    domain: 'tinyurl.com',
    fetchUrl: async (url: string) => {
      const res = await fetch(`https://tinyurl.com/api-create.php?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error('TinyURL 請求失敗');
      const result = await res.text();
      if (!result.startsWith('http')) throw new Error('無法產生短網址');
      return result;
    }
  },
  {
    id: 'isgd',
    name: 'is.gd',
    domain: 'is.gd',
    fetchUrl: async (url: string) => {
      const res = await fetch(`https://is.gd/create.php?format=simple&url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error('is.gd 請求失敗');
      const result = await res.text();
      if (!result.startsWith('http')) throw new Error('無法產生短網址');
      return result;
    }
  },
  {
    id: 'vgd',
    name: 'v.gd',
    domain: 'v.gd',
    fetchUrl: async (url: string) => {
      const res = await fetch(`https://v.gd/create.php?format=simple&url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error('v.gd 請求失敗');
      const result = await res.text();
      if (!result.startsWith('http')) throw new Error('無法產生短網址');
      return result;
    }
  },
  {
    id: 'clckru',
    name: 'clck.ru',
    domain: 'clck.ru',
    fetchUrl: async (url: string) => {
      const res = await fetch(`https://clck.ru/--?url=${encodeURIComponent(url)}`);
      if (!res.ok) throw new Error('clck.ru 請求失敗');
      const result = await res.text();
      if (!result.startsWith('http')) throw new Error('無法產生短網址');
      return result;
    }
  },
];

const CONFIG = {
  HISTORY_KEY: 'url_shortener_history',
  SERVICE_KEY: 'url_shortener_service',
  MAX_HISTORY_ITEMS: 20,
};

// ========================================
// 狀態
// ========================================
const inputUrl = ref('');
const shortUrl = ref('');
const isLoading = ref(false);
const error = ref('');
const showCopied = ref(false);
const selectedServiceId = ref(SERVICES[0].id);

interface HistoryItem {
  originalUrl: string;
  shortUrl: string;
  timestamp: string;
  serviceName?: string;
}

const history = ref<HistoryItem[]>([]);

// ========================================
// 初始化
// ========================================
onMounted(() => {
  loadHistory();
  // 載入儲存的服務選擇
  const savedService = localStorage.getItem(CONFIG.SERVICE_KEY);
  if (savedService && SERVICES.find(s => s.id === savedService)) {
    selectedServiceId.value = savedService;
  }
});

// 監聽服務選擇變化，儲存到 localStorage
watch(selectedServiceId, (newVal) => {
  localStorage.setItem(CONFIG.SERVICE_KEY, newVal);
});

const selectedService = computed(() => 
  SERVICES.find(s => s.id === selectedServiceId.value) || SERVICES[0]
);

const loadHistory = () => {
  const stored = localStorage.getItem(CONFIG.HISTORY_KEY);
  if (stored) {
    history.value = JSON.parse(stored);
  }
};

const saveHistory = (originalUrl: string, shortUrl: string, serviceName?: string) => {
  // 移除重複項
  history.value = history.value.filter(item => item.originalUrl !== originalUrl);
  
  // 新增到開頭
  history.value.unshift({
    originalUrl,
    shortUrl,
    timestamp: new Date().toISOString(),
    serviceName,
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
// URL 驗證
// ========================================
const isValidUrl = computed(() => {
  if (!inputUrl.value.trim()) return false;
  try {
    const url = new URL(inputUrl.value.startsWith('http') ? inputUrl.value : `https://${inputUrl.value}`);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
});

// ========================================
// 短網址產生
// ========================================
const generateShortUrl = async () => {
  if (!isValidUrl.value) {
    error.value = '請輸入有效的網址';
    return;
  }
  
  error.value = '';
  isLoading.value = true;
  shortUrl.value = '';
  
  try {
    // 確保 URL 有協議
    let url = inputUrl.value.trim();
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
      url = 'https://' + url;
    }
    
    // 使用選中的服務
    const result = await selectedService.value.fetchUrl(url);
    shortUrl.value = result;
    saveHistory(url, result, selectedService.value.name);
  } catch (err) {
    error.value = err instanceof Error ? err.message : '產生短網址時發生錯誤';
  } finally {
    isLoading.value = false;
  }
};

// ========================================
// 複製功能
// ========================================
const copyToClipboard = async (text: string) => {
  await navigator.clipboard.writeText(text);
  showCopied.value = true;
  setTimeout(() => showCopied.value = false, 2000);
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
  return date.toLocaleDateString('zh-TW');
};

const truncateUrl = (url: string, maxLength: number = 50) => {
  if (url.length <= maxLength) return url;
  return url.substring(0, maxLength) + '...';
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
            <Link class="w-5 h-5 text-primary" />
          </div>
          <h3 class="text-base font-semibold text-foreground">輸入網址</h3>
        </div>
        
        <div class="flex-1 flex flex-col gap-4">
          <input
            v-model="inputUrl"
            type="text"
            placeholder="輸入要縮短的網址..."
            class="w-full px-4 py-3 rounded-xl border border-border bg-background text-foreground placeholder:text-muted-foreground focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none text-sm transition-all font-mono"
            @keyup.enter="generateShortUrl"
          />
          
          <!-- 服務選擇 -->
          <div class="flex items-center gap-2">
            <span class="text-xs text-muted-foreground">服務：</span>
            <div class="relative flex-1">
              <select
                v-model="selectedServiceId"
                class="w-full appearance-none px-3 py-2 pr-8 rounded-lg border border-border bg-background text-foreground text-sm cursor-pointer focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none transition-all"
              >
                <option v-for="service in SERVICES" :key="service.id" :value="service.id">
                  {{ service.name }}
                </option>
              </select>
              <ChevronDown class="absolute right-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            </div>
          </div>
          
          <!-- Error -->
          <div v-if="error" class="text-sm text-destructive">
            {{ error }}
          </div>
          
          <div class="mt-auto">
            <Button 
              @click="generateShortUrl"
              :disabled="!isValidUrl || isLoading"
              class="w-full gap-2 bg-primary text-white hover:bg-primary/90"
            >
              <span v-if="isLoading" class="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
              <Link v-else class="h-4 w-4" />
              {{ isLoading ? '產生中...' : '縮短網址' }}
            </Button>
          </div>
        </div>
      </Card>

      <!-- Right: Result -->
      <div class="flex flex-col">
        <!-- Success Result -->
        <Card v-if="shortUrl" class="border-border bg-card p-5 flex-1 flex flex-col">
          <div class="flex items-center justify-between mb-4">
            <div class="flex items-center gap-2">
              <div class="w-9 h-9 rounded-lg bg-chart-2/20 flex items-center justify-center">
                <Check class="w-5 h-5 text-chart-2" />
              </div>
              <h3 class="text-base font-semibold text-foreground">產生成功！</h3>
            </div>
            <button 
              @click="shortUrl = ''" 
              title="清除"
              class="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            >
              <Trash2 class="h-4 w-4" />
            </button>
          </div>

          <div class="bg-secondary/50 rounded-lg p-4 mb-4">
            <label class="block text-xs font-medium text-muted-foreground mb-2 uppercase tracking-wider">短網址</label>
            <a 
              :href="shortUrl" 
              target="_blank" 
              class="text-chart-2 font-mono text-sm hover:underline break-all"
            >
              {{ shortUrl }}
            </a>
          </div>

          <div class="flex gap-2 mt-auto">
            <Button as="a" :href="shortUrl" target="_blank" variant="outline" class="flex-1 gap-2">
              <ExternalLink class="h-4 w-4" />
              開啟連結
            </Button>

            <Button @click="copyToClipboard(shortUrl)" class="flex-1 gap-2">
              <Check v-if="showCopied" class="h-4 w-4" />
              <Copy v-else class="h-4 w-4" />
              {{ showCopied ? '已複製' : '複製網址' }}
            </Button>
          </div>
        </Card>

        <!-- Empty State -->
        <Card v-else class="border-border bg-card p-5 flex-1 flex flex-col justify-center">
          <div class="text-center py-8 text-muted-foreground">
            <Link class="w-12 h-12 mx-auto mb-3 opacity-30" />
            <p class="text-sm">輸入網址後，短網址將顯示在這裡</p>
          </div>
        </Card>
      </div>
    </div>

    <!-- Bottom: History Panel -->
    <Card class="border-border bg-card p-5">
      <div class="flex items-center justify-between mb-4">
        <div class="flex items-center gap-2 text-sm font-semibold text-foreground">
          <Clock class="h-4 w-4 text-muted-foreground" />
          歷史記錄
        </div>
        <ToolButton 
          v-if="history.length > 0" 
          type="clear" 
          @click="clearHistory" 
        />
      </div>

      <div v-if="history.length === 0" class="text-center py-8 text-muted-foreground">
        <Link class="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p class="text-sm">尚無歷史記錄</p>
      </div>

      <div v-else class="space-y-2 max-h-[400px] overflow-y-auto">
        <div
          v-for="(item, index) in history"
          :key="index"
          class="group flex items-start gap-4 p-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
        >
          <div class="flex-1 min-w-0 space-y-1">
            <div class="flex items-center gap-2">
              <a 
                :href="item.shortUrl" 
                target="_blank"
                class="text-primary font-mono text-sm hover:underline"
              >
                {{ item.shortUrl }}
              </a>
              <button
                @click.stop="copyToClipboard(item.shortUrl)"
                class="p-1 rounded hover:bg-card text-muted-foreground hover:text-foreground transition-colors opacity-0 group-hover:opacity-100"
                title="複製短網址"
              >
                <Copy class="h-3.5 w-3.5" />
              </button>
            </div>
            <p class="text-xs text-muted-foreground truncate" :title="item.originalUrl">
              {{ truncateUrl(item.originalUrl, 60) }}
            </p>
            <p class="text-xs text-gray-500">
              {{ formatTime(item.timestamp) }}
              <span v-if="item.serviceName" class="text-muted-foreground">· {{ item.serviceName }}</span>
            </p>
          </div>
          <button
            @click.stop="removeHistoryItem(index)"
            class="p-1.5 rounded-md hover:bg-card text-muted-foreground hover:text-destructive transition-colors opacity-0 group-hover:opacity-100 shrink-0"
            title="刪除"
          >
            <Trash2 class="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
    </Card>
  </div>
</template>

<style scoped>
button {
  cursor: pointer;
}
</style>

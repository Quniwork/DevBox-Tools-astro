<script setup lang="ts">
/**
 * 主題切換器
 * 支援四種主題：Nord Light、Nord Dark、Ant Light、Ant Dark
 */
import { ref, onMounted, watch, computed } from 'vue';
import { Palette, Check, X } from 'lucide-vue-next';

// 主題定義
interface Theme {
  id: string;
  name: string;
  description: string;
  className: string;
  isDark: boolean;
  colors: {
    bg: string;
    card: string;
    primary: string;
    text: string;
  };
}

const THEMES: Theme[] = [
  {
    id: 'nord-light',
    name: 'Nord Light',
    description: '柔和淺色',
    className: '',
    isDark: false,
    colors: {
      bg: '#f9fafb',
      card: '#ffffff',
      primary: '#88C0D0',
      text: '#4b5563',
    }
  },
  {
    id: 'nord-dark',
    name: 'Nord Dark',
    description: '極夜深色',
    className: 'dark',
    isDark: true,
    colors: {
      bg: '#2E3440',
      card: '#3B4252',
      primary: '#88C0D0',
      text: '#ECEFF4',
    }
  },
  {
    id: 'ant-light',
    name: 'Ant Light',
    description: '藍調淺色',
    className: 'ant-light',
    isDark: false,
    colors: {
      bg: '#e8ecf0',
      card: '#f8fafc',
      primary: '#1890ff',
      text: '#1e2a3b',
    }
  },
  {
    id: 'ant-dark',
    name: 'Ant Dark',
    description: '純黑深色',
    className: 'ant-dark',
    isDark: true,
    colors: {
      bg: '#141414',
      card: '#1f1f1f',
      primary: '#177ddc',
      text: '#e6e6e6',
    }
  },
];

const STORAGE_KEY = 'app-theme';
const currentThemeId = ref('nord-light');
const isOpen = ref(false);

// 目前主題
const currentTheme = computed(() => 
  THEMES.find(t => t.id === currentThemeId.value) || THEMES[0]
);

// 初始化
onMounted(() => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && THEMES.find(t => t.id === stored)) {
    currentThemeId.value = stored;
  } else {
    // 根據系統偏好設定
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    currentThemeId.value = prefersDark ? 'nord-dark' : 'nord-light';
  }
  applyTheme();
});

// 監聽變化
watch(currentThemeId, () => {
  applyTheme();
  localStorage.setItem(STORAGE_KEY, currentThemeId.value);
});

function applyTheme() {
  const theme = currentTheme.value;
  const html = document.documentElement;
  
  // 移除所有主題 class
  html.classList.remove('dark', 'ant-light', 'ant-dark');
  
  // 套用新主題 class
  if (theme.className) {
    html.classList.add(theme.className);
  }
}

function selectTheme(themeId: string) {
  currentThemeId.value = themeId;
  isOpen.value = false;
}

function togglePopup() {
  isOpen.value = !isOpen.value;
}

function closePopup() {
  isOpen.value = false;
}
</script>

<template>
  <div class="relative">
    <!-- 切換按鈕 -->
    <button
      @click="togglePopup"
      class="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-all hover:bg-accent active:scale-95"
      title="切換主題"
    >
      <Palette class="h-4 w-4" />
    </button>

    <!-- 彈窗 -->
    <Transition
      enter-active-class="transition duration-200 ease-out"
      enter-from-class="opacity-0 scale-95 translate-y-1"
      enter-to-class="opacity-100 scale-100 translate-y-0"
      leave-active-class="transition duration-150 ease-in"
      leave-from-class="opacity-100 scale-100 translate-y-0"
      leave-to-class="opacity-0 scale-95 translate-y-1"
    >
      <div 
        v-if="isOpen"
        class="absolute right-0 top-full mt-2 z-50 w-72 rounded-xl border border-border bg-popover p-3 shadow-xl"
      >
        <!-- Header -->
        <div class="flex items-center justify-between mb-3 pb-2 border-b border-border">
          <div class="flex items-center gap-2">
            <Palette class="h-4 w-4 text-primary" />
            <span class="text-sm font-medium text-foreground">選擇主題</span>
          </div>
          <button 
            @click="closePopup"
            class="p-1 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          >
            <X class="h-4 w-4" />
          </button>
        </div>

        <!-- 主題選項 -->
        <div class="grid grid-cols-2 gap-2">
          <button
            v-for="theme in THEMES"
            :key="theme.id"
            @click="selectTheme(theme.id)"
            class="relative group flex flex-col rounded-lg border-2 p-3 transition-all"
            :class="[
              currentThemeId === theme.id 
                ? 'border-primary bg-primary/5' 
                : 'border-border hover:border-primary/50 hover:bg-accent/50'
            ]"
          >
            <!-- 預覽色塊 -->
            <div 
              class="h-12 rounded-md mb-2 flex items-center justify-center overflow-hidden"
              :style="{ backgroundColor: theme.colors.bg }"
            >
              <div 
                class="w-10 h-8 rounded shadow-sm flex items-center justify-center"
                :style="{ backgroundColor: theme.colors.card }"
              >
                <div 
                  class="w-5 h-1.5 rounded-full"
                  :style="{ backgroundColor: theme.colors.primary }"
                ></div>
              </div>
            </div>

            <!-- 主題名稱 -->
            <div class="flex items-center justify-between">
              <div class="text-left">
                <p 
                  class="text-xs font-medium"
                  :class="currentThemeId === theme.id ? 'text-primary' : 'text-foreground'"
                >
                  {{ theme.name }}
                </p>
                <p class="text-[10px] text-muted-foreground">{{ theme.description }}</p>
              </div>
              <Check 
                v-if="currentThemeId === theme.id" 
                class="h-4 w-4 text-primary shrink-0" 
              />
            </div>
          </button>
        </div>
      </div>
    </Transition>

    <!-- 背景遮罩 -->
    <div 
      v-if="isOpen" 
      class="fixed inset-0 z-40" 
      @click="closePopup"
    ></div>
  </div>
</template>

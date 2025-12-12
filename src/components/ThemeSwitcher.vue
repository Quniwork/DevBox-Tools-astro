<script setup lang="ts">
import { ref, onMounted, watch } from 'vue';
import { Sun, Moon } from 'lucide-vue-next';

const isDark = ref(false);

// Initialize theme from localStorage or system preference
onMounted(() => {
  const stored = localStorage.getItem('theme');
  if (stored) {
    isDark.value = stored === 'dark';
  } else {
    // Check system preference
    isDark.value = window.matchMedia('(prefers-color-scheme: dark)').matches;
  }
  applyTheme();
});

// Watch for changes and persist
watch(isDark, () => {
  applyTheme();
  localStorage.setItem('theme', isDark.value ? 'dark' : 'light');
});

function applyTheme() {
  if (isDark.value) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
}

function toggleTheme() {
  isDark.value = !isDark.value;
}
</script>

<template>
  <button
    @click="toggleTheme"
    class="relative flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-card text-foreground transition-all hover:bg-accent active:scale-95"
    :title="isDark ? '切換至淺色模式' : '切換至深色模式'"
  >
    <Sun v-if="isDark" class="h-4 w-4" />
    <Moon v-else class="h-4 w-4" />
  </button>
</template>

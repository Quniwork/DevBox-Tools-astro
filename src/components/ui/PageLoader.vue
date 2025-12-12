<script setup lang="ts">
import { onMounted } from 'vue';

onMounted(() => {
  setTimeout(() => {
    const loader = document.getElementById('page-loader');
    if (loader) {
      loader.classList.add('fade-out');
      setTimeout(() => {
        loader.remove();
      }, 300);
    }
  }, 300);
});
</script>

<template></template>

<style>
.page-loader-spinner {
  width: 64px;
  height: 64px;
  border-radius: 50%;
  border: 4px solid var(--color-secondary);
  border-top-color: var(--color-primary);
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.fade-out {
  opacity: 0;
  transition: opacity 0.3s ease;
}
</style>

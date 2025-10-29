<script setup lang="ts">
import '~/assets/css/main.css';
</script>

<template>
  <div class="min-h-screen flex flex-col">
    <header class="border-b border-neutral-200">
      <div class="max-w-7xl mx-auto px-6">
        <div class="flex items-center h-16">
          <NuxtLink to="/" class="text-lg font-semibold text-neutral-950">
            Mearie Examples
          </NuxtLink>
        </div>
      </div>
    </header>
    <main class="flex-1">
      <div class="max-w-7xl mx-auto px-6 py-12 pb-24">
        <NuxtPage />
      </div>
    </main>
  </div>
</template>

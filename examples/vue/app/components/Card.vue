<script setup lang="ts">
interface CardProps {
  class?: string;
}

const props = withDefaults(defineProps<CardProps>(), {
  class: '',
});
</script>

<template>
  <div :class="`border border-neutral-200 bg-white p-6 ${props.class}`">
    <slot />
  </div>
</template>

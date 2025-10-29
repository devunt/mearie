<script setup lang="ts">
interface ButtonProps {
  class?: string;
}

const props = withDefaults(defineProps<ButtonProps>(), {
  class: '',
});
</script>

<template>
  <button
    :class="`inline-flex items-center justify-center font-medium disabled:opacity-50 disabled:cursor-not-allowed bg-white text-neutral-950 border border-neutral-300 text-sm px-4 py-2 ${props.class}`"
  >
    <slot />
  </button>
</template>

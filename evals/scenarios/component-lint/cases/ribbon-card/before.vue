<template>
  <article class="card">
    <span v-if="popular" class="ribbon">Most popular</span>
    <h3 class="name">Team and Enterprise</h3>
    <p class="price">$12 per seat</p>
  </article>
</template>

<script setup>
defineProps({ popular: Boolean });
</script>

<style scoped>
.card { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 8px; padding: 16px; background: #fff; }
.ribbon { position: absolute; top: 12px; right: 12px; width: 110px; height: 24px; padding: 2px 8px; font-size: 13px; line-height: 20px; color: #fff; background: #0b57d0; }
.name { font-size: 20px; line-height: 28px; color: #111; }
.price { font-size: 16px; line-height: 24px; color: #444; }
</style>

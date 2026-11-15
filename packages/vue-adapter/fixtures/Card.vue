<template>
  <main class="page">
    <section v-if="open" class="panel" :class="{ active: open }"></section>
    <div v-else class="empty"></div>
    <ul class="list">
      <li v-for="item in items" :key="item" class="item"></li>
    </ul>
    <p v-show="!hidden" class="note"></p>
  </main>
</template>

<script setup>
defineProps({ open: Boolean, items: Array, hidden: Boolean });
</script>

<style scoped>
.page { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 8px; }
.panel { height: 120px; }
.panel.active { background: #eef; }
.empty { height: 40px; }
.list { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 32px; padding: 0; margin: 0; }
.list > .item { display: block; background: #fff; }
.note { display: block; height: 20px; }
.page > .item { color: red; }
.empty.active { color: blue; }
</style>

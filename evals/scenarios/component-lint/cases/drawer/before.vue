<template>
  <div class="app">
    <nav class="drawer" :class="{ open }" aria-label="Main">
      <a class="link" href="/home">Home</a>
      <a class="link" href="/settings">Settings</a>
    </nav>
    <main class="content"><p class="text">Welcome back</p></main>
  </div>
</template>

<script setup>
defineProps({ open: Boolean });
</script>

<style scoped>
.app { display: grid; grid-template-columns: minmax(0, 1fr); background: #fff; }
.drawer { position: fixed; top: 0; left: 0; bottom: 0; width: 240px; display: grid; grid-template-columns: minmax(0, 1fr); align-content: start; padding: 16px; background: #fff; transform: translateX(-100%); }
.drawer.open { transform: none; }
.link { display: block; padding: 12px 0; font-size: 16px; line-height: 24px; color: #0b57d0; }
.content { padding: 16px; }
.text { font-size: 16px; line-height: 24px; color: #111; }
</style>

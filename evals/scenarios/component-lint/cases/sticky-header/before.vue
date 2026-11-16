<template>
  <div class="page">
    <header class="top"><h1 class="title">Quarterly engineering report and roadmap</h1></header>
    <main class="body"><p class="text">Summary of the quarter.</p></main>
  </div>
</template>

<style scoped>
.page { display: grid; grid-template-columns: minmax(0, 1fr); }
.top { position: sticky; height: 60px; padding: 8px 16px; background: #fff; overflow: hidden; }
.title { font-size: 22px; line-height: 28px; color: #111; }
.body { padding: 16px; }
.text { font-size: 16px; line-height: 24px; color: #111; }
</style>

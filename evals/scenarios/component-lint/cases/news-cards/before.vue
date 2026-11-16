<template>
  <article class="card">
    <img class="thumb" src="/news.jpg" alt="" width="320" height="180" />
    <h3 class="headline">City council approves new bike lanes across the downtown core after a long debate</h3>
    <p class="byline">By Sam Lee · 3 min read</p>
  </article>
</template>

<style scoped>
.card { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 8px; padding: 12px; background: #fff; }
.thumb { display: block; width: 100%; height: auto; }
.headline { height: 48px; overflow: hidden; font-size: 18px; line-height: 24px; color: #111; }
.byline { font-size: 14px; line-height: 20px; color: #aaa; }
</style>

<template>
  <nav class="pager" aria-label="Pages">
    <button class="page" type="button" aria-label="Page 1" aria-current="page">1</button>
    <button class="page" type="button" aria-label="Page 2">2</button>
    <button class="page" type="button" aria-label="Page 3">3</button>
    <button class="page next" type="button">Next page</button>
  </nav>
</template>

<style scoped>
.pager { display: flex; column-gap: 2px; padding: 8px; background: #fff; }
.page { flex: none; width: 28px; height: 28px; padding: 0; border: 1px solid #767676; background: #fff; color: #111; font-family: Roboto; font-size: 14px; line-height: 20px; }
.next { width: auto; padding: 0 8px; white-space: nowrap; }
</style>

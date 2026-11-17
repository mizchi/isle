<template>
  <footer class="actions">
    <button class="secondary" type="button">Cancel</button>
    <button class="primary" type="button">Delete permanently</button>
  </footer>
</template>

<style scoped>
.actions { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding: 12px 16px; background: #fff; }
.secondary, .primary { display: block; flex: 0 1 auto; min-width: 0; min-height: 36px; padding: 6px 12px; border: 0; font: inherit; }
.secondary { background: #f1f3f4; color: #202124; }
.primary { background: #d93025; color: #fff; }
</style>

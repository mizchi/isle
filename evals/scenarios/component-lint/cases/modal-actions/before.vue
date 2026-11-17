<template>
  <footer class="actions">
    <button class="secondary" type="button">Cancel</button>
    <button class="primary" type="button">Delete permanently</button>
  </footer>
</template>

<style scoped>
.actions { display: flex; justify-content: flex-end; column-gap: 8px; padding: 12px 16px; background: #fff; }
.secondary, .primary { display: block; flex: 0 0 120px; height: 36px; padding: 0 12px; border: 0; white-space: nowrap; font: inherit; }
.secondary { background: #f1f3f4; color: #202124; }
.primary { background: #d93025; color: #fff; }
</style>

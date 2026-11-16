<template>
  <div class="row">
    <span class="qty">Qty 1</span>
    <button class="add" type="button">Add to cart</button>
  </div>
</template>

<style scoped>
.row { display: grid; grid-template-columns: auto 120px; column-gap: 12px; align-items: center; padding: 8px; }
.qty { font-size: 1rem; line-height: 1.5; }
.add { width: 120px; height: 40px; padding: 0 12px; border: 0; background: #0a5; color: #fff; font-family: Roboto; font-size: 1rem; line-height: 1.5; white-space: nowrap; overflow: hidden; }
</style>

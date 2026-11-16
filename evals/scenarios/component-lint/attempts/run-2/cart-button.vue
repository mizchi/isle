<template>
  <div class="row">
    <span class="qty">Qty 1</span>
    <button class="add" type="button">Add to cart</button>
  </div>
</template>

<style scoped>
.row { display: grid; grid-template-columns: auto minmax(0, 1fr); column-gap: 12px; align-items: center; padding: 8px; }
.qty { font-size: 1rem; line-height: 1.5; }
.add { padding: 8px 12px; border: 0; background: #067a3e; color: #fff; font-family: Roboto; font-size: 1rem; line-height: 1.5; }
</style>

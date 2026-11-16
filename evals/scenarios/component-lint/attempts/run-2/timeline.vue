<template>
  <ol class="steps">
    <li class="step"><span class="dot"></span><p class="label">Ordered on Mar 1</p></li>
    <li class="step"><span class="dot pending"></span><p class="label pending-text">Out for delivery</p></li>
  </ol>
</template>

<style scoped>
.steps { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 12px; padding: 16px; margin: 0; list-style: none; background: #fff; }
.step { display: grid; grid-template-columns: 12px minmax(0, 1fr); column-gap: 12px; align-items: center; }
.dot { display: block; width: 12px; height: 12px; background: #1e8e3e; }
.pending { background: #bdbdbd; }
.label { font-size: 16px; line-height: 24px; color: #111; }
.pending-text { color: #5f6368; }
</style>

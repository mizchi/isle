<template>
  <main class="page">
    <div v-if="compact" class="bar"></div>
    <div v-else class="bar wide"></div>
  </main>
</template>

<style scoped>
.page { display: grid; grid-template-columns: minmax(0, 1fr); }
.bar { height: 40px; }
.wide { width: 480px; }
</style>

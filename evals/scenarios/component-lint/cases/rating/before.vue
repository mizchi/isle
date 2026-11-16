<template>
  <div class="stars" role="group" aria-label="Rating">
    <button class="star" type="button"></button>
    <button class="star" type="button"></button>
    <button class="star" type="button"></button>
    <button class="star" type="button"></button>
    <button class="star" type="button"></button>
  </div>
</template>

<style scoped>
.stars { display: flex; column-gap: 2px; padding: 8px; background: #fff; }
.star { flex: none; width: 16px; height: 16px; padding: 0; border: 1px solid #b26a00; background: #ffb300; }
</style>

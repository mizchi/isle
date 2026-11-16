<template>
  <div class="stars" role="group" aria-label="Rating">
    <button class="star" type="button" aria-label="1 star"></button>
    <button class="star" type="button" aria-label="2 stars"></button>
    <button class="star" type="button" aria-label="3 stars"></button>
    <button class="star" type="button" aria-label="4 stars"></button>
    <button class="star" type="button" aria-label="5 stars"></button>
  </div>
</template>

<style scoped>
.stars { display: flex; column-gap: 2px; padding: 8px; background: #fff; }
.star { flex: none; width: 24px; height: 24px; padding: 0; border: 1px solid #b26a00; background: #ffb300; }
</style>

<template>
  <section class="gallery">
    <img class="main" src="/shoe-large.jpg" />
    <div class="thumbs">
      <img class="thumb" src="/shoe-1.jpg" alt="Side view" width="64" height="64" />
      <img class="thumb" src="/shoe-2.jpg" alt="Sole" width="64" height="64" />
    </div>
  </section>
</template>

<style scoped>
.gallery { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 8px; padding: 16px; background: #fff; }
.main { display: block; width: 100%; }
.thumbs { display: flex; column-gap: 8px; }
.thumb { display: block; flex: none; width: 64px; height: 64px; }
</style>

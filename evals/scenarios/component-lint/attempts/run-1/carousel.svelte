<section class="carousel" aria-label="Products">
  <div class="track">
    <div class="slide"><p class="name">Trail running shoes</p></div>
    <div class="slide"><p class="name">Hiking boots</p></div>
  </div>
  <button class="prev" type="button" aria-label="Previous"></button>
  <button class="next" type="button" aria-label="Next"></button>
</section>

<style>
  .carousel { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); background: #fff; }
  .track { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .slide { display: grid; grid-template-columns: minmax(0, 1fr); padding: 16px 52px; }
  .name { font-size: 16px; line-height: 24px; color: #111; }
  .prev, .next { position: absolute; top: 16px; width: 44px; height: 44px; padding: 0; border: 0; background: #333; }
  .prev { left: 0; }
  .next { right: 0; }
</style>

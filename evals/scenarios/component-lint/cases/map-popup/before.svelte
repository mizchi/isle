<div class="map">
  <button class="pin" type="button" aria-label="Cafe Mori"></button>
  <div class="popup" role="dialog" aria-label="Cafe Mori"><p class="name">Cafe Mori</p></div>
</div>

<style>
  .map { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); height: 300px; background: #e8eaed; }
  .pin { position: absolute; top: 140px; left: 240px; width: 24px; height: 24px; padding: 0; border: 2px solid #fff; background: #d93025; }
  .popup { position: absolute; top: 80px; left: 260px; width: 220px; height: 48px; padding: 12px; background: #fff; }
  .name { font-size: 16px; line-height: 24px; color: #111; }
</style>

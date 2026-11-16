<div class="bar">
  <button class="icon" type="button" aria-label="Play"></button>
  <span class="time">0:42 / 3:10</span>
  <input class="seek" type="range" aria-label="Seek" />
  <button class="icon" type="button" aria-label="Fullscreen"></button>
</div>

<style>
  .bar { display: grid; grid-template-columns: 24px auto minmax(0, 1fr) 24px; column-gap: 8px; align-items: center; padding: 8px; background: #202124; }
  .icon { display: block; width: 24px; height: 24px; padding: 0; border: 1px solid #fff; background: #202124; }
  .time { font-size: 14px; line-height: 20px; color: #fff; white-space: nowrap; }
  .seek { display: block; height: 20px; margin: 0; }
</style>

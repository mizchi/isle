<script>
  let { count = 0 } = $props();
</script>

<header class="bar">
  <span class="brand">Acme</span>
  <button class="bell" type="button" aria-label="Notifications">
    <span class="icon" aria-hidden="true"></span>
    {#if count}<span class="badge">99+</span>{/if}
  </button>
</header>

<style>
  .bar { display: grid; grid-template-columns: minmax(0, 1fr) 40px; align-items: center; height: 56px; padding: 0 16px; background: #fff; }
  .brand { display: block; font-size: 16px; line-height: 24px; color: #111; }
  .bell { position: relative; display: block; font: inherit; width: 40px; height: 40px; padding: 0; border: 0; background: #fff; }
  .icon { display: block; width: 24px; height: 24px; margin: 8px; background: #5f6368; }
  .badge { position: absolute; top: 2px; right: 2px; width: 18px; height: 16px; padding: 0 4px; white-space: nowrap; font-size: 11px; line-height: 16px; color: #fff; background: #d93025; }
</style>

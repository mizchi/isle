<script>
  let { open = false } = $props();
</script>

<div class="app">
  <header class="bar">
    <span class="brand">Acme</span>
    {#if open}<nav class="menu" aria-label="Account"><a class="item" href="/settings">Settings</a><a class="item" href="/logout">Log out</a></nav>{/if}
  </header>
  <main class="main"><p class="text">Welcome back</p></main>
</div>

<style>
  .app { display: grid; grid-template-columns: minmax(0, 1fr); background: #fff; }
  .bar { position: sticky; top: 0; display: grid; grid-template-columns: minmax(0, 1fr); height: 56px; padding: 16px; background: #fff; }
  .brand { display: block; font-size: 16px; line-height: 24px; color: #111; }
  .menu { position: absolute; top: 56px; left: 16px; z-index: 100; display: grid; grid-template-columns: minmax(0, 1fr); width: 200px; height: 96px; padding: 8px 0; background: #202124; }
  .item { display: block; padding: 8px 16px; font-size: 16px; line-height: 24px; color: #fff; }
  .main { position: relative; z-index: 1; display: grid; grid-template-columns: minmax(0, 1fr); padding: 112px 16px 16px; background: #f8f9fa; }
  .text { font-size: 16px; line-height: 24px; color: #111; }
</style>

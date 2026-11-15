<script>
  let { items = [], filtersOpen = false } = $props();
</script>

<div class="shell">
  <header class="top">
    <button class="menu" type="button"><svg class="icon" width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor"/></svg></button>
    <a class="home" href="/"><svg width="24" height="24" viewBox="0 0 24 24"><title>Home</title><path d="M3 12l9-9 9 9"/></svg></a>
  </header>
  {#if filtersOpen}
    <aside class="filters"></aside>
  {/if}
  <main class="cards">
    {#each items as item}
      <article class="card">
        <img class="thumb" src="/p-400.jpg" srcset="/p-400.jpg 400w, /p-800.jpg 800w" width="400" height="300" alt="">
      </article>
    {/each}
  </main>
</div>

<style>
  .shell { display: grid; grid-template-columns: 200px minmax(0, 1fr); grid-template-areas: "top top" "filters main"; }
  .top { grid-area: top; display: grid; grid-template-columns: 40px 24px; column-gap: 8px; padding: 8px; background: #fff; }
  .menu { appearance: none; display: grid; grid-template-columns: 24px; padding: 8px; border: 0; min-width: 0; min-height: 0; background: #246; color: #fff; }
  .home { display: grid; grid-template-columns: 24px; }
  .icon { display: block; }
  .filters { grid-area: sidebar; height: 100px; }
  .cards { grid-area: main; display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); column-gap: 16px; }
  .card { display: grid; grid-template-columns: minmax(0, 1fr); }
  .thumb { display: block; width: 100%; height: auto; }
</style>

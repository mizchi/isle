<script>
  let { open = false, items = [] } = $props();
</script>

<main class="page">
  {#if open}
    <section class="panel" class:active={open}></section>
  {:else}
    <div class="empty"></div>
  {/if}
  <ul class="list">
    {#each items as item}
      <li class="item"></li>
    {/each}
  </ul>
</main>

<style>
  .page { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 8px; }
  .panel { height: 120px; }
  .panel.active { background: #eef; }
  .empty { height: 40px; }
  .list { display: grid; grid-template-columns: minmax(0, 1fr); grid-auto-rows: 32px; padding: 0; margin: 0; }
  .list > .item { display: block; background: #fff; }
  .page > .item { color: red; }
  .empty.active { color: blue; }
</style>

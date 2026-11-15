<script>
  let { saved = false, agree = false, rtl = false, wide = false, rows = [] } = $props();
</script>

<main class="page" dir={rtl ? 'rtl' : 'ltr'}>
  <header class="bar">
    <span class="title">Settings</span>
  </header>

  <div class="actions">
    <button class="save" class:wide={wide} aria-label="Save"></button>
    <button class="reset" aria-label="Reset"></button>
  </div>

  <label class="check">
    <input class="box" class:hidden={!agree} type="checkbox" />
    <span class="mark"></span>
  </label>

  {#if saved}
    <div class="toast" role="status"></div>
  {/if}

  <div class="table-wrap">
    <div class="thead"></div>
    {#each rows as row}
      <div class="row"></div>
    {/each}
  </div>
</main>

<style>
  .page { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 8px; background: #fff; color: #111; }
  .bar { position: sticky; top: 0; display: grid; grid-template-columns: minmax(0, 1fr); height: 48px; }
  .title { display: block; line-height: 24px; padding-left: 16px; }
  .actions { display: flex; column-gap: 8px; }
  .save, .reset { appearance: none; display: block; padding: 0; border: 0; min-width: 0; min-height: 0; width: 96px; height: 40px; background: #246; }
  .wide { grid-column: span 2; }
  .check { display: grid; grid-template-columns: 24px; }
  .box { appearance: none; display: block; padding: 0; border: 1px solid #000; min-width: 0; min-height: 0; width: 24px; height: 24px; margin: 0; }
  .hidden { display: none; }
  .mark { display: block; height: 24px; background: #ccc; }
  .toast { display: block; height: 32px; background: #eef; }
  .table-wrap { display: grid; grid-template-columns: minmax(0, 1fr); overflow-x: auto; }
  .thead { position: sticky; top: 0; height: 32px; background: #ddd; }
  .row { display: block; height: 32px; }
  .unused > .row { color: red; }
</style>

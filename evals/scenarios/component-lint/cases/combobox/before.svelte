<script>
  let { open = false } = $props();
</script>

<div class="search">
  <input class="field" type="search" role="combobox" aria-expanded={open} aria-controls="opts" aria-label="Search" />
  {#if open}
    <ul class="list" id="opts" role="listbox">
      <li class="opt" role="option" aria-selected="false">Running shoes</li>
      <li class="opt" role="option" aria-selected="false">Rain jackets</li>
    </ul>
  {/if}
</div>

<style>
  .search { position: relative; display: grid; grid-template-columns: minmax(0, 1fr); padding: 16px 16px 16px 120px; background: #fff; }
  .field { height: 40px; padding: 0 8px; border: 1px solid #767676; font-family: Roboto; font-size: 16px; line-height: 24px; }
  .list { position: absolute; top: 60px; left: 120px; width: 320px; height: 88px; display: grid; grid-template-columns: minmax(0, 1fr); padding: 0; list-style: none; background: #fff; border: 1px solid #767676; }
  .opt { padding: 8px; font-size: 16px; line-height: 24px; color: #111; }
</style>

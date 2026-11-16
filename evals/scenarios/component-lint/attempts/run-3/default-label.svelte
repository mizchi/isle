<script>
  let { label = 'Save' } = $props();
</script>

<div class="bar">
  <span class="status">3 unsaved edits</span>
  <button class="save" type="button" data-text-max-length="8">{label}</button>
</div>

<style>
  .bar { display: grid; grid-template-columns: minmax(0, 1fr) 160px; column-gap: 8px; align-items: center; padding: 8px 16px; background: #fff; }
  .status { display: block; font-size: 14px; line-height: 20px; color: #444; }
  .save { display: block; height: 36px; padding: 0 12px; border: 0; white-space: nowrap; font-family: inherit; font-size: 14px; line-height: 20px; color: #fff; background: #0b57d0; }
</style>

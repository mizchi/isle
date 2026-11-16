<script>
  let { yearly = false } = $props();
</script>

<div class="toggle" role="group" aria-label="Billing period">
  <button class="opt" class:on={!yearly} type="button" aria-pressed={!yearly}>Monthly billing</button>
  <button class="opt" class:on={yearly} type="button" aria-pressed={yearly}>Yearly billing (save 20%)</button>
</div>

<style>
  .toggle { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 4px; padding: 8px; background: #fff; }
  .opt { display: block; padding: 8px; border: 1px solid #767676; background: #fff; color: #111; font-family: Roboto; font-size: 14px; line-height: 20px; }
  .on { background: #1a73e8; color: #fff; }
</style>

<script>
  let { invalid = false } = $props();
</script>

<div class="field">
  <label class="label" for="email">Email</label>
  <input class="input" id="email" type="email" />
  {#if invalid}
    <p class="error">Enter an email address in the format name@example.com</p>
  {/if}
</div>

<style>
  .field { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 4px; padding: 16px; background: #fff; }
  .label { font-size: 14px; line-height: 20px; color: #222; }
  .input { height: 40px; padding: 0 8px; border: 1px solid #767676; font-family: Roboto; font-size: 16px; line-height: 24px; }
  .error { height: 20px; overflow: hidden; font-size: 14px; line-height: 20px; color: #f66; }
</style>

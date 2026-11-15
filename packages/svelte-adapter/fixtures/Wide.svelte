<script>
  let { compact = true } = $props();
</script>

<main class="page">
  {#if compact}
    <div class="bar"></div>
  {:else}
    <div class="bar wide"></div>
  {/if}
</main>

<style>
  .page { display: grid; grid-template-columns: minmax(0, 1fr); }
  .bar { height: 40px; }
  .wide { width: 480px; }
</style>

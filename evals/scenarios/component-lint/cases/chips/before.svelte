<script>
  let { tags = [] } = $props();
</script>

<div class="tags">
  {#each tags as tag}
    <span class="chip">{tag}</span>
  {/each}
</div>

<style>
  .tags { padding: 8px; }
  .chip { display: inline-block; padding: 4px 8px; margin: 0 4px 4px 0; font-size: 14px; line-height: 20px; background: #eee; }
</style>

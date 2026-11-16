<script>
  let { tags = [] } = $props();
</script>

<div class="tags">
  {#each tags as tag}
    <span class="chip" data-text-max-length="16">{tag}</span>
  {/each}
</div>

<style>
  .tags { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px; }
  .chip { padding: 4px 8px; white-space: nowrap; font-size: 14px; line-height: 20px; background: #eee; }
</style>

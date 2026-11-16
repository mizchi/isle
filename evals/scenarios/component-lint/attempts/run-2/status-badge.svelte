<script lang="ts">
  type Props = { status: 'Active' | 'Paused' | 'Pending review' };
  let { status }: Props = $props();
</script>

<div class="row">
  <span class="name">Nightly export</span>
  <span class="badge">{status}</span>
</div>

<style>
  .row { display: grid; grid-template-columns: minmax(0, 1fr) 120px; column-gap: 8px; align-items: center; padding: 12px 16px; background: #fff; }
  .name { display: block; font-size: 16px; line-height: 24px; color: #111; }
  .badge { display: block; white-space: nowrap; padding: 2px 8px; font-size: 13px; line-height: 18px; color: #0b57d0; background: #e8f0fe; }
</style>

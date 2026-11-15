<template>
  <article class="wrap">
    <header class="head">
      <a class="back" href="/"><svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor" aria-hidden="true"><path d="M12 4l-6 6 6 6z"/></svg><span class="sr-only">Back</span></a>
    </header>
    <div class="lead"></div>
    <div v-if="hasMedia" class="media"></div>
    <div class="share"><a class="icon" href="/share"><svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true"><path d="M2 2h16v16H2z"/></svg></a></div>
  </article>
</template>

<script setup>
defineProps({ hasMedia: Boolean });
</script>

<style scoped>
.wrap { display: block; max-width: 720px; margin: 0 auto; padding: 16px; }
.head { display: grid; grid-template-columns: 20px; margin-bottom: 12px; }
.back, .icon { display: grid; grid-template-columns: 20px; position: relative; color: #222; }
svg { display: block; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; overflow: hidden; clip-path: inset(50%); white-space: nowrap; border: 0; }
.lead { height: 40px; margin-top: 8px; margin-bottom: 24px; }
.media { width: 100%; margin-left: 16px; height: 120px; }
.share { display: grid; grid-template-columns: 20px; margin-top: 16px; background: #fff; }
</style>

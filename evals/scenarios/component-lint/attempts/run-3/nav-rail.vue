<template>
  <nav class="rail" aria-label="Main">
    <a class="link" href="/inbox"><span class="icon" aria-hidden="true"></span>Inbox</a>
    <a class="link" href="/settings"><span class="icon" aria-hidden="true"></span>Notification settings</a>
  </nav>
</template>

<style scoped>
.rail { display: grid; grid-template-columns: 200px; row-gap: 4px; padding: 8px; background: #f8f9fa; }
.link { display: flex; align-items: center; column-gap: 8px; height: 40px; padding: 0 8px; white-space: nowrap; font-size: 14px; line-height: 20px; color: #202124; }
.icon { display: block; flex: 0 0 20px; height: 20px; background: #5f6368; }
</style>

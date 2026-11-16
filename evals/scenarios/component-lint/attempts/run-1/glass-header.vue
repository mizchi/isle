<template>
  <div class="app">
    <header class="bar">
      <h1 class="title">Inbox</h1>
    </header>
    <div class="toast" role="status">Message sent</div>
    <main class="content"><p class="text">Your messages appear here.</p></main>
  </div>
</template>

<style scoped>
.app { display: grid; grid-template-columns: minmax(0, 1fr); background: #fff; }
.bar { position: sticky; top: 0; display: grid; grid-template-columns: minmax(0, 1fr); height: 56px; padding: 16px; background: rgba(255, 255, 255, 0.9); backdrop-filter: blur(8px); }
.title { font-size: 20px; line-height: 24px; color: #111; }
.toast { position: fixed; bottom: 16px; left: 16px; width: 200px; height: 40px; padding: 8px 12px; font-size: 16px; line-height: 24px; color: #fff; background: #202124; }
.content { padding: 16px; }
.text { font-size: 16px; line-height: 24px; color: #111; }
</style>

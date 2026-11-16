<template>
  <div class="layout">
    <nav class="side" aria-label="Docs"><a class="link" href="/start">Getting started</a></nav>
    <main class="content">
      <h1 class="heading">Install</h1>
      <p class="lead">Run the installer and follow the prompts.</p>
    </main>
    <footer class="foot"><p class="copy">Copyright 2026 Example</p></footer>
  </div>
</template>

<style scoped>
.layout { display: grid; grid-template-columns: minmax(0, 1fr); padding-left: 200px; }
.side { position: fixed; top: 0; left: 0; bottom: 0; width: 200px; padding: 16px; background: #222; }
.link { display: block; color: #fff; font-size: 16px; line-height: 24px; }
.content { display: grid; grid-template-columns: minmax(0, 1fr); padding: 16px; row-gap: 8px; }
.heading { font-size: 32px; line-height: 40px; }
.lead { font-size: 16px; line-height: 24px; }
.foot { padding: 16px; }
.copy { font-size: 14px; line-height: 20px; }
</style>

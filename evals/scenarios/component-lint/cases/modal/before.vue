<template>
  <div class="backdrop">
    <div class="dialog" role="dialog" aria-modal="true" aria-labelledby="t">
      <h2 id="t" class="title">Delete project?</h2>
      <div class="actions"><button class="btn" type="button">Cancel</button><button class="btn danger" type="button">Delete</button></div>
    </div>
  </div>
</template>

<style scoped>
.backdrop { position: fixed; top: 0; left: 0; right: 0; bottom: 0; display: grid; grid-template-columns: 480px; justify-content: center; align-content: center; background: rgb(0 0 0); }
.dialog { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 16px; padding: 24px; background: #fff; }
.title { font-size: 20px; line-height: 28px; color: #111; }
.actions { display: flex; justify-content: flex-end; column-gap: 8px; }
.btn { width: 96px; height: 40px; border: 1px solid #555; background: #fff; color: #111; font-family: Roboto; font-size: 16px; line-height: 24px; }
.danger { background: #b00020; color: #fff; }
</style>

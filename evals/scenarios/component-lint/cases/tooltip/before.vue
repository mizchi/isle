<template>
  <div class="wrap">
    <button class="help" type="button" aria-describedby="tip" aria-label="Help"></button>
    <div id="tip" class="tip" role="tooltip">Your password needs 12 characters</div>
  </div>
</template>

<style scoped>
.wrap { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 8px; padding: 16px; background: #fff; }
.help { width: 32px; height: 32px; padding: 0; border: 1px solid #555; background: #fff; }
.tip { padding: 8px; background: rgba(0, 0, 0, 0.25); color: #fff; font-size: 14px; line-height: 20px; }
</style>

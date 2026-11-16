<template>
  <div class="upload">
    <div class="track"><div class="fill"><span class="pct">Uploading 8%</span></div></div>
  </div>
</template>

<style scoped>
.upload { display: grid; grid-template-columns: minmax(0, 1fr); padding: 16px; background: #fff; }
.track { display: grid; grid-template-columns: minmax(0, 1fr); height: 24px; background: #e8eaed; }
.fill { display: grid; grid-template-columns: minmax(0, 1fr); width: 8%; overflow: hidden; background: #1a73e8; }
.pct { display: block; padding: 2px 8px; white-space: nowrap; font-size: 13px; line-height: 20px; color: #fff; }
</style>

<template>
  <div class="bar">
    <button class="bell" type="button"><span class="count">3</span></button>
  </div>
</template>

<style scoped>
.bar { display: grid; grid-template-columns: 44px; padding: 8px; background: #fff; }
.bell { position: relative; display: block; width: 44px; height: 44px; padding: 0; border: 1px solid #555; background: #fff; }
.count { position: absolute; top: 0; right: 0; width: 20px; height: 20px; background: #b3261e; color: #fff; font-family: Roboto; font-size: 12px; line-height: 20px; }
</style>

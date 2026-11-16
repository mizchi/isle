<template>
  <ul class="list">
    <li class="item">
      <span class="avatar" aria-hidden="true"></span>
      <span class="title">Your weekly analytics report for the marketing site is ready</span>
      <span class="time">2h</span>
    </li>
    <li class="item">
      <span class="avatar" aria-hidden="true"></span>
      <span class="title">New comment</span>
      <span class="time">5h</span>
    </li>
  </ul>
</template>

<style scoped>
.list { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 8px; margin: 0; padding: 16px; list-style: none; background: #fff; }
.item { display: grid; grid-template-columns: 40px minmax(0, 1fr) auto; column-gap: 12px; align-items: center; }
.avatar { display: block; width: 40px; height: 40px; background: #ddd; }
.title { display: block; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 16px; line-height: 24px; color: #111; }
.time { display: block; font-size: 14px; line-height: 20px; color: #555; }
</style>

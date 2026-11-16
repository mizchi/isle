<section class="profile">
  <img class="avatar" src="/me.jpg" alt="Avatar" width="48" height="48" />
  <div class="text">
    <h2 class="name">Sam Taylor</h2>
    <p class="role">Engineer</p>
  </div>
</section>

<style>
  .profile { display: grid; grid-template-columns: 48px minmax(0, 1fr); column-gap: 12px; padding: 16px; align-items: center; }
  .avatar { width: 48px; height: 48px; }
  .text { display: grid; grid-template-columns: minmax(0, 1fr); }
  .name { font-size: 18px; line-height: 24px; }
  .role { font-size: 14px; line-height: 20px; color: #333; }
</style>

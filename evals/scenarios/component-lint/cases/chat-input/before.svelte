<div class="composer">
  <label class="label" for="msg">Message</label>
  <div class="row">
    <input class="field" id="msg" type="text" />
    <button class="send" type="button"><span class="icon" aria-hidden="true"></span></button>
  </div>
</div>

<style>
  .composer { display: grid; grid-template-columns: minmax(0, 1fr); row-gap: 4px; padding: 8px 16px; background: #fff; }
  .label { display: block; font-size: 13px; line-height: 18px; color: #444; }
  .row { display: flex; column-gap: 8px; }
  .field { display: block; flex: 1 1 0; min-width: 0; height: 40px; padding: 0 12px; border: 1px solid #767676; font: inherit; }
  .send { display: block; flex: 0 0 40px; height: 40px; padding: 8px; border: 0; background: #1a73e8; }
  .icon { display: block; width: 24px; height: 24px; background: #fff; }
</style>

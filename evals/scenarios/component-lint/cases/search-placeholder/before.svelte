<form class="bar" role="search">
  <label class="field">
    <span class="label">Search</span>
    <input class="input" type="search" placeholder="Search products, brands and categories" />
  </label>
</form>

<style>
  .bar { display: grid; grid-template-columns: minmax(0, 1fr); padding: 8px; }
  .field { display: grid; grid-template-columns: auto 160px; column-gap: 8px; align-items: center; }
  .label { font-size: 14px; line-height: 20px; }
  .input { width: 160px; height: 36px; padding: 0 8px; border: 1px solid #888; font-family: Roboto; font-size: 14px; line-height: 20px; }
</style>

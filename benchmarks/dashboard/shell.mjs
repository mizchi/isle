import { teams } from './model.mjs';
export function dashboardStyles({ root = ':root', body = 'body', compact = '@media(max-width:600px)' } = {}) { return `
${root}{font-family:system-ui,sans-serif;color:#182b3b;background:#f3f6fa;font-size:16px}
*{box-sizing:border-box}${body}{margin:0}main{max-width:1120px;margin:auto;padding:32px 24px 64px}
h1{font-size:clamp(28px,5vw,40px);line-height:1.2;margin:0 0 16px}h2{font-size:21px;line-height:1.4;margin:0 0 16px}
p,li{line-height:1.6}.intro{max-width:72ch}.card{background:white;border:1px solid #bccbd8;border-radius:12px;padding:24px;margin:24px 0}
.meta,.saved{color:#42566b}.description{max-width:85ch}.numbers{display:flex;flex-wrap:wrap;gap:16px 32px;margin:20px 0}
.numbers span{display:grid;gap:4px}.numbers output{font-size:24px;font-weight:650;font-variant-numeric:tabular-nums}
.actions{display:flex;align-items:center;flex-wrap:wrap;gap:12px}button{font:inherit;min-height:46px;padding:10px 16px;border-radius:6px;border:1px solid #224e72;background:#193f60;color:white;cursor:pointer}
button:disabled{background:#596b7d;color:white;cursor:default}button:focus-visible,a:focus-visible,input:focus-visible,summary:focus-visible{outline:3px solid #a44f00;outline-offset:3px}
.check{display:flex!important;align-items:center;gap:8px;min-height:46px}.check input{width:24px;height:24px;margin:0;flex-shrink:0}
details{margin-top:20px}summary{min-height:44px;padding:10px 0;cursor:pointer}details p,details li{max-width:85ch}
fieldset{border:1px solid #bccbd8;padding:12px 16px;border-radius:8px;margin:24px 0}fieldset label{display:inline-flex;align-items:center;gap:8px;min-height:44px;margin-right:20px}fieldset input{width:20px;height:20px}
.project-form{max-width:640px}.project-form label{display:grid;gap:6px;margin:12px 0}.project-form input:not([type=checkbox]){font:inherit;min-height:46px;width:100%;padding:10px;border:1px solid #596b7d;border-radius:5px}
.project-form button{margin:8px 8px 8px 0}.project-form p[hidden],.project-form div[hidden]{display:none}.project-form label+p:not([hidden]){color:#a92318;margin-top:6px}
.project-form [role=alert]{border-left:4px solid #a92318;padding:4px 16px;margin:12px 0}.project-form [role=status]{min-height:26px}
a{color:#185891}a:hover{text-decoration-thickness:2px}footer{margin-top:32px;color:#42566b}
${teams.map((team, i) => `${body}:has(#team-${i}:checked) .card:has(article[data-task]):not(:has(article[data-team="${team}"])){display:none}`).join('\n')}
${compact}{main{padding:24px 16px}.card{padding:20px 16px}.actions{align-items:stretch}.actions button{flex:1 1 120px}.saved{width:100%}.numbers{gap:16px 24px}fieldset label{margin-right:12px}}
`; }
export const styles = dashboardStyles();
export function shell(app, scripts = '') {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Work planning dashboard</title><style>${styles}</style></head><body><main>
  <h1>Work planning dashboard</h1><p class="intro">Plan 64 work packages across four teams. Adjust hours, review delivery notes, lock a plan, and save changes. Each package keeps its own draft.</p>
  <fieldset><legend>Filter work packages by team</legend><label><input type="radio" id="team-all" name="team-filter" checked>All teams</label>${teams.map((team, i) => `<label><input type="radio" id="team-${i}" name="team-filter">${team}</label>`).join('')}</fieldset>
  ${app}<footer>Shared data, validation rules, server authorization, and API delays. Draft changes are independent across work packages.</footer></main>${scripts}</body></html>`;
}

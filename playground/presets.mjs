import counter from '../examples/hello/app.isle?raw';
import list from '../examples/control-flow/app.isle?raw';
import fragments from '../examples/control-flow/fragments.isle?raw';
import inlineCSS from '../examples/inline-css/app.isle?raw';
import styledCounter from '../examples/inline-css/counter.isle?raw';
import variableLayout from '../examples/inline-css/variables.isle?raw';
import declaredLayout from '../examples/layout-contracts/declared.isle?raw';
import positionedLayout from '../examples/layout-contracts/positioned.isle?raw';
import positionedComponents from '../examples/layout-contracts/positioned-components.isle?raw';
import noshiftLayout from '../examples/layout-contracts/noshift.isle?raw';
import noshiftDOM from '../examples/layout-contracts/noshift-dom.isle?raw';
import noshiftKeys from '../examples/layout-contracts/noshift-keys.isle?raw';
export const defaultLayout={viewport:{min:160,max:640,height:{min:80,max:640}}};
const layoutCSS='html,body { margin: 0; padding: 0; }';
export const defaultCSS=`* { box-sizing: border-box; }
body { margin: 0; padding: 24px; font: 16px/1.6 system-ui; color: #193c39; background: #fffefa; }
section { padding: 12px; border: 1px solid #cad9d1; border-radius: 10px; margin-bottom: 16px; }
h2, h3 { margin-top: 0; }
output { display: block; font-size: 28px; }
p { margin: 10px 0; }
p > output { display: inline; font-size: inherit; font-weight: 600; }
label { margin-right: 8px; }
input { font: inherit; width: 18ch; max-width: 100%; padding: 4px 8px; border: 1px solid #adc4ba; border-radius: 4px; }
button { font: inherit; padding: 8px 14px; margin: 4px; border: 1px solid #adc4ba; border-radius: 6px; background: #e7f2ec; color: #193c39; cursor: pointer; }
ul { padding-left: 24px; }`;
export const presets={
  counter:{label:'Counter · state & derive',source:counter,props:{initial:5}},
  styled:{label:'Inline CSS · independent client styles',source:styledCounter,props:{}},
  layoutDeclared:{label:'Declared layout · SafeGrid contract',source:declaredLayout,props:{},css:layoutCSS,layout:{}},
  layoutNoShiftDOM:{label:'Noshift · element requirement',source:noshiftDOM,props:{},css:layoutCSS,layout:{}},
  layoutNoShiftKeys:{label:'Noshift · keyed rows',source:noshiftKeys,props:{},css:layoutCSS,layout:{}},
  layoutNoShift:{label:'Noshift · selector contract',source:noshiftLayout,props:{},css:layoutCSS,layout:{}},
  layoutPositioned:{label:'Absolute layout · named coordinate space',source:positionedLayout,props:{},css:layoutCSS,layout:{}},
  layoutPositionedComponents:{label:'Absolute layout · child component contracts',source:positionedComponents,props:{},css:layoutCSS,layout:{}},
  layout:{label:'Inline CSS · Z3 layout proof',source:inlineCSS,props:{},css:layoutCSS,layout:defaultLayout},
  layoutBroken:{label:'Inline CSS · overflow witness',source:inlineCSS,props:{},css:layoutCSS,layout:{viewport:{min:120,max:640,height:{min:80,max:640}}}},
  layoutResponsive:{label:'Inline CSS · responsive proof',source:inlineCSS.replace('    </style>','      @media (width < 160px) { .row { grid-template-columns: repeat(2, minmax(0, 1fr)); } }\n    </style>'),props:{},css:layoutCSS,layout:{viewport:{min:80,max:640,height:{min:80,max:640}}}},
  layoutVariables:{label:'CSS variables · responsive proof',source:variableLayout,props:{},css:layoutCSS,layout:{viewport:{min:80,max:640,height:{min:80,max:640}}}},
  list:{label:'List · branches & keyed regions',source:list,props:{initial:[{id:'a',title:'First'},{id:'b',title:'Second'}]}},
  fragments:{label:'Fragments · keyed groups',source:fragments,props:{initial:[{id:'a',title:'First'},{id:'b',title:'Second'}]}},
  nested:{label:'Nested · independent owners',props:{seed:1},source:`client component Counter(label: string, initial: number) {
  state count = initial;
  event increment(event: EventSnapshot<MouseEvent>) { count += 1; }
  <section><h3>{label}</h3><output aria-live="polite">{count}</output>
    <button type="button" on:click={increment}>Increment</button>
  </section>
}
server component Page(seed: number) {
  <main><h2>Independent owners</h2><Counter label="First" initial={seed} /><Counter label="Second" initial={seed + 10} /></main>
}`},
  events:{label:'Events · snapshots & synchronous cancellation',props:{},source:`client component Events() {
  state text = "";
  state key = "none";
  state clicks = 0;
  event edit(event: EventSnapshot<InputEvent>) { text = event.value; }
  event press(event: EventSnapshot<KeyboardEvent>) { key = event.key; }
  event cancel(event: EventSnapshot<MouseEvent>) { clicks += 1; }
  <section><h2>Explicit event boundaries</h2>
    <label for="message">Message</label>
    <input id="message" type="text" on:input={edit} on:keydown={press} />
    <p>Message: <output data-message="">{text}</output></p>
    <p>Last key: <output data-key="">{key}</output></p>
    <button type="button" on:click.preventDefault={cancel}>Cancel default</button>
    <p>Clicks: <output data-clicks="">{clicks}</output></p>
  </section>
}`},
  static:{label:'Static · server rendering',props:{name:'Browser'},source:`server component Greeting(name: string) {
  <section><h2>Hello, {name}.</h2><p>Server rendering runs locally. No runtime is needed for this component.</p></section>
}`},
};

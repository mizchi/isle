import counter from '../examples/hello/app.isle?raw';
import list from '../examples/control-flow/app.isle?raw';
export const defaultCSS=`* { box-sizing: border-box; }
body { margin: 0; padding: 24px; font: 16px/1.6 system-ui; color: #193c39; background: #fffefa; }
section { padding: 12px; border: 1px solid #cad9d1; border-radius: 10px; margin-bottom: 16px; }
h2, h3 { margin-top: 0; }
output { display: block; font-size: 28px; }
button { font: inherit; padding: 8px 14px; margin: 4px; border: 1px solid #adc4ba; border-radius: 6px; background: #e7f2ec; color: #193c39; cursor: pointer; }
ul { padding-left: 24px; }`;
export const presets={
  counter:{label:'Counter · state & derive',source:counter,props:{initial:5}},
  list:{label:'List · branches & keyed regions',source:list,props:{initial:[{id:'a',title:'First'},{id:'b',title:'Second'}]}},
  nested:{label:'Nested · independent owners',props:{seed:1},source:`client component Counter(label: string, initial: number) {
  state count = initial;
  <section><h3>{label}</h3><output aria-live="polite">{count}</output>
    <button type="button">on click increment { count += 1; }Increment</button>
  </section>
}
server component Page(seed: number) {
  <main><h2>Independent owners</h2><Counter label="First" initial={seed} /><Counter label="Second" initial={seed + 10} /></main>
}`},
  static:{label:'Static · server rendering',props:{name:'Browser'},source:`server component Greeting(name: string) {
  <section><h2>Hello, {name}.</h2><p>Server rendering runs locally. No runtime is needed for this component.</p></section>
}`},
};

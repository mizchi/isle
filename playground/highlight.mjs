// A lossless lexical view, independent of compilation. Incomplete edits are valid
// input here; highlighting never evaluates, formats or changes the source.
const keywords=new Set('client server component layout requires ensures noshift space overlay within state derive event resource receive async await const let function return if else switch case default try catch finally throw new typeof instanceof void true false null undefined import export from as in of for while break continue readonly'.split(' '));
const types=new Set('string number boolean unknown never any object bigint symbol'.split(' '));
const patterns={
  isle: /(?<comment>\/\/[^\r\n]*|\/\*[\s\S]*?(?:\*\/|$)|<!--[\s\S]*?(?:-->|$))|(?<string>"(?:\\[\s\S]|[^"\\])*"?|'(?:\\[\s\S]|[^'\\])*'?|`(?:\\[\s\S]|[^`\\])*`?)|(?<style><style\s*>[\s\S]*?(?:<\/style\s*>|$))|(?<tag>(?<![\w$])<\/?[A-Za-z_][\w.:-]*(?=[\s/>]))|(?<attribute>@noshift\b|on:[\w.:-]+|[A-Za-z_][\w:-]*(?=\s*=\s*["'{]))|(?<number>\b(?:0[xX][\da-fA-F]+|\d+(?:\.\d+)?(?:[eE][+-]?\d+)?))|(?<identifier>[A-Za-z_$][\w$]*)/g,
  css: /(?<comment>\/\*[\s\S]*?(?:\*\/|$))|(?<string>"(?:\\[\s\S]|[^"\\])*"?|'(?:\\[\s\S]|[^'\\])*'?)|(?<atRule>@[\w-]+)|(?<number>#[\da-fA-F]{3,8}\b|-?\b\d+(?:\.\d+)?(?:%|[a-zA-Z]+)?)|(?<selector>[.#][\w-]+)|(?<property>(?:--)?[A-Za-z_][\w-]*(?=\s*:))/g,
  json: /(?<property>"(?:\\[\s\S]|[^"\\])*"(?=\s*:))|(?<string>"(?:\\[\s\S]|[^"\\])*"?)|(?<number>-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)|(?<keyword>\b(?:true|false|null)\b)/g,
};

export function tokenize(source,language) {
  if(!Object.hasOwn(patterns,language)) throw new TypeError('Unknown editor language');
  const tokens=[];
  const append=(kind,text)=>{
    if(!text) return;
    if(tokens.at(-1)?.kind===kind) tokens.at(-1).text+=text;
    else tokens.push({kind,text});
  };
  let end=0;
  for(const match of source.matchAll(patterns[language])) {
    append('plain',source.slice(end,match.index));
    let kind=Object.keys(match.groups).find(key=>match.groups[key]!==undefined);
    const text=match[0];end=match.index+text.length;
    if(kind==='style') {
      const open=text.match(/^<style\s*>/)[0],close=text.match(/<\/style\s*>$/)?.[0] ?? '';
      append('tag',open);
      for(const token of tokenize(text.slice(open.length,text.length-close.length),'css')) append(token.kind,token.text);
      append('tag',close);continue;
    }
    if(kind==='identifier') kind=keywords.has(text) ? 'keyword' : types.has(text) || /^[A-Z]/.test(text) ? 'type' : /^\s*\(/.test(source.slice(end)) ? 'function' : 'plain';
    if(kind==='atRule') kind='at-rule';
    append(kind,text);
  }
  append('plain',source.slice(end));
  return tokens;
}

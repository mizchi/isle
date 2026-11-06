import { renderWidgetEmbed } from '../lib/widget.mjs';
const [src, width = '640', height = '640', title = 'Work planner widget', runtime = 'shared'] = process.argv.slice(2);
if (!src) { console.error('Usage: node tools/widget-embed.mjs URL [width] [height] [title] [shared|standalone]'); process.exit(1); }
try { console.log(renderWidgetEmbed({ src, width: Number(width), height: Number(height), title, runtime })); }
catch (error) { console.error(error.message); process.exit(1); }

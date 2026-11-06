import { isle, type CheckedLayoutOptions } from '../../lib/vite.mjs';
import type { LayoutBuildCertificate } from '../../lib/layout.mjs';
const layout: CheckedLayoutOptions = {
  css:'./app.css', reset:['./reset.css'], viewport:{min:80,max:1280,height:{min:200,max:900}},
  boxes:{'.copy':{minInlineSize:40,intrinsicBlockSize:20}},
};
isle({entry:'/app.isle',mounts:[{component:'App',props:{},label:'App'}],wrapMounts:false,layout});
// @ts-expect-error Checked documents require both axes.
const height: CheckedLayoutOptions = {...layout,viewport:{min:80,max:1280}};
// @ts-expect-error No unknown waiver in checked mode.
const waiver: CheckedLayoutOptions = {...layout,allowUnknown:true};
// @ts-expect-error Host sizing comes from the delivered document, not an asserted inset.
const inset: CheckedLayoutOptions = {...layout,hostInset:0};
// @ts-expect-error Checked documents currently model fit/clip, not scrollbar gutters.
const scroll: CheckedLayoutOptions = {...layout,boxes:{'.copy':{overflow:'scroll'}}};
void height; void waiver; void inset; void scroll;
declare const certificate: LayoutBuildCertificate;
const status: 'verified' = certificate.status;
const minimum: number | undefined = certificate.contracts.boxes['.copy'].minInlineSize;
const maxHeight: number = certificate.contracts.viewport.height.max;
const both: 'both' = certificate.report.scope.axis;
void status; void minimum; void maxHeight; void both;

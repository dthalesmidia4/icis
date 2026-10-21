import {p,pp,poly,tilePoly,isoBox,esc,W} from './geometry';
export function rug(x,y,w,h,color){return `<g>${tilePoly(x+.04,y+.04,w,h,-1,'hsl(var(--iso-c-5585a0))','opacity=".14"')}${tilePoly(x,y,w,h,1,color,'stroke="hsl(var(--iso-c-ffffff))" stroke-width="3" stroke-opacity=".8"')}${tilePoly(x+.16,y+.16,w-.32,h-.32,2,'none','stroke="hsl(var(--iso-c-fff))" stroke-width="2.5" stroke-opacity=".64"')}</g>`}
export default function Rug({args=[]}:{args?:any[]}){return <g dangerouslySetInnerHTML={{__html:(rug as (...args:any[])=>string)(...args)}} />;}

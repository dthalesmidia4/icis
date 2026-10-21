import {p,pp,poly,tilePoly,isoBox,esc,W} from './geometry';
export function cloud(x,y,scale=1){return `<g transform="translate(${x} ${y}) scale(${scale})" opacity=".53"><ellipse cx="0" cy="0" rx="73" ry="17" fill="hsl(var(--iso-c-fff))"/><circle cx="-31" cy="-14" r="26" fill="hsl(var(--iso-c-fff))"/><circle cx="5" cy="-24" r="35" fill="hsl(var(--iso-c-fff))"/><circle cx="36" cy="-10" r="23" fill="hsl(var(--iso-c-fff))"/></g>`}
export default function Cloud({args=[]}:{args?:any[]}){return <g dangerouslySetInnerHTML={{__html:(cloud as (...args:any[])=>string)(...args)}} />;}

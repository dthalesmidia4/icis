import {p,pp,poly,tilePoly,isoBox,esc,W} from './geometry';
import {mat} from './Mat';
export function floorDecors(){let out='';out+=mat(1.7,3.9,3.0,2.65,'hsl(var(--iso-c-d6c7f2))','CRIAÇÃO');out+=mat(3.5,6.6,3.0,2.55,'hsl(var(--iso-c-ffdfba))','CONTEÚDO');out+=mat(6.0,2.25,3.1,2.5,'hsl(var(--iso-c-d4edff))','DIREÇÃO');out+=mat(9.2,3.5,3.25,2.45,'hsl(var(--iso-c-c1f4e8))','SISTEMAS');out+=mat(6.9,6.6,3.15,2.5,'hsl(var(--iso-c-e4d7f5))','REUNIÃO');return out}
export default function FloorDecors({args=[]}:{args?:any[]}){return <g dangerouslySetInnerHTML={{__html:(floorDecors as (...args:any[])=>string)(...args)}} />;}

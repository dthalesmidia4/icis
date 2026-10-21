import {p,pp,poly,tilePoly,isoBox,esc,W} from './geometry';
export function chair(x,y,color='hsl(var(--iso-c-4baedc))',face='left'){let out=isoBox(x,y,.64,.64,18,color,'hsl(var(--iso-c-246f9d))','hsl(var(--iso-c-278db5))');out+=isoBox(x,y,.64,.23,47,color,'hsl(var(--iso-c-278ab9))','hsl(var(--iso-c-56bce4))');const v=p(x+.27,y+.36);out+=`<ellipse cx="${v.x}" cy="${v.y-48}" rx="19" ry="5" fill="hsl(var(--iso-c-fff))" opacity=".28"/>`;return out}
export default function Chair({args=[]}:{args?:any[]}){return <g dangerouslySetInnerHTML={{__html:(chair as (...args:any[])=>string)(...args)}} />;}

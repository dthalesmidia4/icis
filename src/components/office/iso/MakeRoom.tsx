import {p,pp,poly,tilePoly,isoBox,esc,W} from './geometry';
import {cloud} from './Cloud';
import {wallWindow} from './WallWindow';
import {wallPoster} from './WallPoster';
import {wallLogo} from './WallLogo';
export function makeRoom(H=10){const a=p(0,0),b=p(W,0),c=p(W,H),d=p(0,H);const height=140;
let out=`<rect x="-1800" y="-1000" width="4000" height="3000" fill="url(#sky)"/><circle cx="-650" cy="0" r="112" fill="hsl(var(--iso-c-ffffff))" opacity=".4"/><circle cx="650" cy="0" r="136" fill="hsl(var(--iso-c-ffffff))" opacity=".42"/>${cloud(-640,80,.7)}${cloud(650,0,1)}${cloud(-420,-80,.5)}<ellipse cx="50" cy="470" rx="700" ry="170" fill="hsl(var(--iso-c-5894bb))" opacity=".2" filter="url(#roomShadow)"/>`;
// Paredes externas em duas faces + molduras e rodapés
out+=poly([{x:a.x,y:a.y-height},{x:d.x,y:d.y-height},d,a],'url(#wallLeft)','stroke="hsl(var(--iso-c-c6e0ef))" stroke-width="3"');
out+=poly([{x:a.x,y:a.y-height},{x:b.x,y:b.y-height},b,a],'url(#wallRight)','stroke="hsl(var(--iso-c-c1ddeb))" stroke-width="3"');
out+=poly([{x:a.x,y:a.y-140},{x:d.x,y:d.y-140},{x:d.x,y:d.y-146},{x:a.x,y:a.y-146}],'hsl(var(--iso-c-fdfefe))');
out+=poly([{x:a.x,y:a.y-140},{x:b.x,y:b.y-140},{x:b.x,y:b.y-146},{x:a.x,y:a.y-146}],'hsl(var(--iso-c-fff))');
out+=`<path d="M${pp(d)} L${pp(a)} L${pp(b)}" stroke="hsl(var(--iso-c-8fb9d1))" stroke-width="9" fill="none"/><path d="M${pp(p(0,10,-4))} L${pp(p(0,0,-4))} L${pp(p(13,0,-4))}" stroke="hsl(var(--iso-c-fff))" stroke-width="5" fill="none"/>`;
// Painéis da parede e janela panorâmica
out+=wallLogo(0,3.1)+wallWindow(0,7.4,'left')+wallWindow(4.4,0,'right')+wallPoster(8.3,0,'right');
// Chão com rodapé espesso, mosaicos e bordas
out+=poly([d,c,{x:c.x,y:c.y+26},{x:d.x,y:d.y+26}],'hsl(var(--iso-c-8ab6d1))','stroke="hsl(var(--iso-c-85abc6))" stroke-width="2"');
out+=poly([b,c,{x:c.x,y:c.y+26},{x:b.x,y:b.y+26}],'hsl(var(--iso-c-a4c8de))','stroke="hsl(var(--iso-c-91b4c7))" stroke-width="2"');
out+=poly([a,b,c,d],'url(#floor)','stroke="hsl(var(--iso-c-fff))" stroke-width="6" stroke-linejoin="round"');
for(let sum=0;sum<W+H-1;sum++)for(let i=0;i<W;i++){let j=sum-i;if(j<0||j>=H)continue;const even=(i+j)%2===0;out+=tilePoly(i,j,1,1,0,even?'hsl(var(--iso-c-e9f6ff))':'hsl(var(--iso-c-def0fc))','stroke="hsl(var(--iso-c-a8cfe4))" stroke-opacity=".48" stroke-width="1.3" class="tile" data-floor="1" data-x="'+i+'" data-y="'+j+'"')}
out+=`<path d="M${pp(d)}L${pp(c)}L${pp(b)}" fill="none" stroke="hsl(var(--iso-c-7db6db))" stroke-width="6" stroke-linecap="round"/><path d="M${pp(d)}L${pp(c)}L${pp(b)}" fill="none" stroke="hsl(var(--iso-c-ecfcff))" stroke-width="2"/>`;
return out}
export default function MakeRoom({args=[]}:{args?:any[]}){return <g dangerouslySetInnerHTML={{__html:(makeRoom as (...args:any[])=>string)(...args)}} />;}

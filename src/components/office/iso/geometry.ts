export const W=13,tw=52,th=24,cx=0,cy=0;
export const p=(x,y,z=0)=>({x:cx+(x-y)*tw,y:cy+(x+y)*th-z});
export const pp=q=>q.x.toFixed(1)+','+q.y.toFixed(1),path=pts=>pts.map(pp).join(' ');
export const poly=(pts,fill,attr='')=>`<polygon points="${path(pts)}" fill="${fill}" ${attr}/>`;
export const tilePoly=(x,y,w=1,h=1,z=0,fill='',attr='')=>poly([p(x,y,z),p(x+w,y,z),p(x+w,y+h,z),p(x,y+h,z)],fill,attr);
export const isoBox=(x,y,w,h,height,top,side1,side2,baseZ=0)=>{const a=p(x,y,baseZ+height),b=p(x+w,y,baseZ+height),c=p(x+w,y+h,baseZ+height),d=p(x,y+h,baseZ+height),b0=p(x+w,y,baseZ),c0=p(x+w,y+h,baseZ),d0=p(x,y+h,baseZ);return `<g>${poly([b,c,c0,b0],side1,'stroke="hsl(var(--iso-c-23576b))" stroke-opacity=".14" stroke-width="1.3"')}${poly([d,c,c0,d0],side2,'stroke="hsl(var(--iso-c-23576b))" stroke-opacity=".14" stroke-width="1.3"')}${poly([a,b,c,d],top,'stroke="hsl(var(--iso-c-ffffff))" stroke-opacity=".8" stroke-width="2.5" stroke-linejoin="round"')}</g>`};

export const esc=(s:unknown)=>String(s??" ").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!));
export const hash=(s:string)=>Array.from(s).reduce((h,c)=>Math.imul(h^c.charCodeAt(0),16777619)>>>0,2166136261);

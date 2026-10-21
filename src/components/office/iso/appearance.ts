import { hash } from './geometry';
const c=(hex:string)=>`hsl(var(--iso-c-${hex}))`;
const palettes=[
 {top:c('f7f4ff'),side:c('cbb3ed'),edge:c('b49fdc'),chair:c('529bdc'),paper:c('876acc')},
 {top:c('fffcfa'),side:c('ebb7a6'),edge:c('d99891'),chair:c('9d8bf4'),paper:c('f1a45c')},
 {top:c('fffaf0'),side:c('efd7a9'),edge:c('dab878'),chair:c('f3aa77'),paper:c('83c7cf')},
 {top:c('f6fdfb'),side:c('aadacf'),edge:c('73bcb1'),chair:c('43b8ab'),paper:c('5caab9')},
];
export function appearance(userId:string){const h=hash(userId);const theme=palettes[h%palettes.length];return {...theme,color:theme.chair,dark:theme.edge,skin:c(['e6a66a','f4be83','c5854c','edb8b9'][(h>>>4)%4]),hair:c(['354156','806556','965944','273e5b'][(h>>>8)%4]),hairStyle:(h>>>12)%4,accessory:(h>>>16)%4};}

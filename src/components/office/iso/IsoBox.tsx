import {isoBox} from './geometry';
export default function IsoBox({args}:{args:Parameters<typeof isoBox>}){return <g dangerouslySetInnerHTML={{__html:isoBox(...args)}}/>;}

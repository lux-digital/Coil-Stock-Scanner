/* Shared, dependency-free image geometry and label validation. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoilCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FIELD_IDS = ['partNo', 'coilId', 'colour', 'netLb', 'netKg', 'grossLb', 'grossKg', 'lengthFt', 'lengthM'];
  const cross = (a, b, c) => (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
  const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
  function hull(points) {
    points.sort((a,b)=>a.x-b.x||a.y-b.y);
    const lo=[], hi=[];
    for (const p of points) { while(lo.length>1 && cross(lo.at(-2),lo.at(-1),p)<=0) lo.pop(); lo.push(p); }
    for(let i=points.length-1;i>=0;i--) { const p=points[i]; while(hi.length>1&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop(); hi.push(p); }
    return lo.slice(0,-1).concat(hi.slice(0,-1));
  }
  const polygonArea = p => Math.abs(p.reduce((s,a,i)=>{ const b=p[(i+1)%p.length]; return s+a.x*b.y-a.y*b.x; },0)/2);
  function blueMask(image) {
    const {data,width:w,height:h}=image, mask=new Uint8Array(w*h);
    for(let i=0;i<mask.length;i++) {
      const r=data[4*i],g=data[4*i+1],b=data[4*i+2];
      mask[i]=g-r>28 && b-r>32 && g>50 && b>55 && b/g>.76 && b/g<1.8 ? 1:0;
    }
    return mask;
  }
  function detectLabel(image) {
    const {width:w,height:h}=image, n=w*h, mask=blueMask(image), seen=new Uint8Array(n), queue=new Int32Array(n);
    let best=null;
    for(let seed=0;seed<n;seed++) {
      if(!mask[seed]||seen[seed])continue;
      let head=0,tail=1;queue[0]=seed;seen[seed]=1;
      const boundary=[];
      while(head<tail) {
        const p=queue[head++],x=p%w,y=Math.floor(p/w);let edge=false;
        let q=p-1;
        if(x===0||!mask[q])edge=true;
        else if(!seen[q]){seen[q]=1;queue[tail++]=q;}
        q=p+1;
        if(x===w-1||!mask[q])edge=true;
        else if(!seen[q]){seen[q]=1;queue[tail++]=q;}
        q=p-w;
        if(y===0||!mask[q])edge=true;
        else if(!seen[q]){seen[q]=1;queue[tail++]=q;}
        q=p+w;
        if(y===h-1||!mask[q])edge=true;
        else if(!seen[q]){seen[q]=1;queue[tail++]=q;}
        if(edge)boundary.push({x,y});
      }
      if(tail<n*.018||boundary.length<4)continue;
      const poly=hull(boundary), originalArea=polygonArea(poly);
      while(poly.length>4) {
        let k=0,min=Infinity;
        for(let i=0;i<poly.length;i++) {const a=Math.abs(cross(poly[(i+poly.length-1)%poly.length],poly[i],poly[(i+1)%poly.length]));if(a<min){min=a;k=i;}}
        poly.splice(k,1);
      }
      if(poly.length!==4)continue;
      const area=polygonArea(poly), fill=tail/area;
      if(area/originalArea<.80||fill<.45||area<n*.025)continue;
      // Put the longer pair of edges horizontally; OCR resolves 180 degrees.
      if(distance(poly[0],poly[1])+distance(poly[2],poly[3]) < distance(poly[1],poly[2])+distance(poly[3],poly[0]))poly.push(poly.shift());
      const ratio=(distance(poly[0],poly[1])+distance(poly[2],poly[3]))/(distance(poly[1],poly[2])+distance(poly[3],poly[0]));
      if(ratio<1.15||ratio>4)continue;
      const score=area*Math.min(fill,1);
      if(!best||score>best.score)best={corners:poly,score,coverage:area/n,fill,ratio};
    }
    return best;
  }
  function labelReady(found, width, height) {
    if (!found || found.coverage < .10 || found.fill < .68 || found.fill > 1.08) return false;
    const margin = Math.max(4, Math.round(Math.min(width, height) * .012));
    return found.corners.every(p => p.x >= margin && p.y >= margin && p.x < width-margin && p.y < height-margin);
  }
  function sameLiveLabel(a,b) {
    if(!a||!b)return false;
    const bounds=found=>({left:Math.min(...found.corners.map(p=>p.x)),right:Math.max(...found.corners.map(p=>p.x)),
      top:Math.min(...found.corners.map(p=>p.y)),bottom:Math.max(...found.corners.map(p=>p.y))});
    const x=bounds(a),y=bounds(b);
    const areaX=(x.right-x.left)*(x.bottom-x.top),areaY=(y.right-y.left)*(y.bottom-y.top);
    const intersection=Math.max(0,Math.min(x.right,y.right)-Math.max(x.left,y.left))*
      Math.max(0,Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top));
    return areaX>0&&areaY>0&&intersection/(areaX+areaY-intersection)>.60;
  }
  function advanceLiveCapture(state,found,acceptable,now) {
    if(found&&acceptable)return {last:found,lastSeen:now,
      steady:state.last&&now-state.lastSeen<850&&sameLiveLabel(found,state.last)?state.steady+1:1};
    if(found||now-state.lastSeen>850)return {last:null,lastSeen:0,steady:0};
    return state; // A brief missed detection should not restart the countdown.
  }
  function alignCorners(corners, previous) {
    if (!previous) return corners.map(p=>({...p}));
    const choices=[0,1,2,3].map(shift=>corners.map((_,i)=>corners[(i+shift)%4]));
    return choices.reduce((best,option)=>option.reduce((sum,p,i)=>sum+distance(p,previous[i])**2,0)<
      best.reduce((sum,p,i)=>sum+distance(p,previous[i])**2,0)?option:best).map(p=>({...p}));
  }
  function smoothCorners(previous, target, blend) {
    if(!previous)return target.map(p=>({...p}));
    return target.map((p,i)=>({x:previous[i].x+(p.x-previous[i].x)*blend,
      y:previous[i].y+(p.y-previous[i].y)*blend}));
  }
  function solve(a,b) {
    const n=b.length,m=a.map((row,i)=>[...row,b[i]]);
    for(let i=0;i<n;i++) {
      let p=i;for(let j=i+1;j<n;j++)if(Math.abs(m[j][i])>Math.abs(m[p][i]))p=j;
      [m[i],m[p]]=[m[p],m[i]];
      if(Math.abs(m[i][i])<1e-9)throw new Error('Label corners are too close together.');
      const d=m[i][i];for(let k=i;k<=n;k++)m[i][k]/=d;
      for(let j=0;j<n;j++)if(j!==i){const f=m[j][i];for(let k=i;k<=n;k++)m[j][k]-=f*m[i][k];}
    }
    return m.map(row=>row[n]);
  }
  // Map grid coordinates onto the same perspective plane as the detected outline.
  function quadProjection(corners) {
    const rows=[],values=[];
    [[0,0],[1,0],[1,1],[0,1]].forEach(([u,v],i)=>{const {x,y}=corners[i];
      rows.push([u,v,1,0,0,0,-u*x,-v*x],[0,0,0,u,v,1,-u*y,-v*y]);values.push(x,y);
    });
    const m=solve(rows,values);
    return (u,v)=>{const d=m[6]*u+m[7]*v+1;
      return {x:(m[0]*u+m[1]*v+m[2])/d,y:(m[3]*u+m[4]*v+m[5])/d};};
  }
  function warp(image,corners,width=1600,height=880) {
    const a=[],b=[],unit=[[0,0],[1,0],[1,1],[0,1]];
    unit.forEach(([u,v],i)=>{const {x,y}=corners[i];a.push([u,v,1,0,0,0,-u*x,-v*x],[0,0,0,u,v,1,-u*y,-v*y]);b.push(x,y);});
    const m=solve(a,b), out=new Uint8ClampedArray(width*height*4), sw=image.width,sh=image.height;
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      const u=x/(width-1),v=y/(height-1),d=m[6]*u+m[7]*v+1;
      const sx=Math.max(0,Math.min(sw-1.001,(m[0]*u+m[1]*v+m[2])/d)),sy=Math.max(0,Math.min(sh-1.001,(m[3]*u+m[4]*v+m[5])/d));
      const ix=Math.floor(sx),iy=Math.floor(sy),fx=sx-ix,fy=sy-iy,p=(iy*sw+ix)*4,q=(y*width+x)*4;
      for(let c=0;c<3;c++)out[q+c]=(1-fy)*((1-fx)*image.data[p+c]+fx*image.data[p+4+c])+fy*((1-fx)*image.data[p+sw*4+c]+fx*image.data[p+sw*4+4+c]);
      out[q+3]=255;
    }
    return {data:out,width,height};
  }
  function rotate(image,turns=2) {
    turns=((turns%4)+4)%4;if(!turns)return image;
    const w=image.width,h=image.height,width=turns%2?h:w,height=turns%2?w:h,data=new Uint8ClampedArray(w*h*4);
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const xx=turns===1?h-1-y:turns===2?w-1-x:y,yy=turns===1?x:turns===2?h-1-y:w-1-x;
      const p=(y*w+x)*4,q=(yy*width+xx)*4;for(let c=0;c<4;c++)data[q+c]=image.data[p+c];
    }
    return {data,width,height};
  }
  function enhance(image) {
    const {width:w,height:h}=image,n=w*h,gray=new Float32Array(n),integral=new Float64Array((w+1)*(h+1));
    for(let y=0;y<h;y++) {
      let sum=0;
      for(let x=0;x<w;x++) {const i=y*w+x;gray[i]=Math.max(image.data[i*4+1],image.data[i*4+2]);sum+=gray[i];integral[(y+1)*(w+1)+x+1]=integral[y*(w+1)+x+1]+sum;}
    }
    const data=new Uint8ClampedArray(n*4),radius=Math.max(18,Math.round(w/35));
    for(let y=0;y<h;y++)for(let x=0;x<w;x++) {
      const x0=Math.max(0,x-radius),x1=Math.min(w,x+radius+1),y0=Math.max(0,y-radius),y1=Math.min(h,y+radius+1);
      const mean=(integral[y1*(w+1)+x1]-integral[y0*(w+1)+x1]-integral[y1*(w+1)+x0]+integral[y0*(w+1)+x0])/((x1-x0)*(y1-y0));
      const i=y*w+x,v=Math.max(0,Math.min(255,(gray[i]/Math.max(1,mean)-.38)*410));data[4*i]=data[4*i+1]=data[4*i+2]=v;data[4*i+3]=255;
    }
    return {data,width:w,height:h};
  }
  function crop(image,region,scale=1) {
    const [rx,ry,rw,rh]=region,x0=Math.round(rx*image.width),y0=Math.round(ry*image.height),w=Math.round(rw*image.width),h=Math.round(rh*image.height);
    const width=Math.max(1,Math.round(w*scale)),height=Math.max(1,Math.round(h*scale)),data=new Uint8ClampedArray(width*height*4);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
      const sx=Math.min(image.width-1,Math.max(0,x0+Math.floor(x/scale))),sy=Math.min(image.height-1,Math.max(0,y0+Math.floor(y/scale))),p=(sy*image.width+sx)*4,q=(y*width+x)*4;
      for(let c=0;c<4;c++)data[q+c]=image.data[p+c];
    }
    return {data,width,height};
  }
  function orientationScore(text) {
    const t=text.toUpperCase();return (t.match(/COIL|COATED|STEEL|PART|CSM|CLR|ASTM|VANCOUVER|KOREA|LBS|UNION|NET|GROSS|WEIGHT/g)||[]).length;
  }
  return {FIELD_IDS,blueMask,detectLabel,labelReady,sameLiveLabel,advanceLiveCapture,alignCorners,smoothCorners,quadProjection,warp,rotate,enhance,crop,orientationScore};
});

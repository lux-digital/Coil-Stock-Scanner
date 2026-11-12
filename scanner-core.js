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
  function blueMask(image, shadowAware=false) {
    const {data,width:w,height:h}=image, mask=new Uint8Array(w*h);
    for(let i=0;i<mask.length;i++) {
      const r=data[4*i],g=data[4*i+1],b=data[4*i+2];
      // Dim previews compress the cyan/red difference even when the blue
      // label remains distinct from the grey steel around it.
      mask[i]=(shadowAware?g-r>16 && b-r>18 && g>28 && b>30 && b/g>.72 && b/g<1.8:
        g-r>28 && b-r>32 && g>50 && b>55 && b/g>.76 && b/g<1.8) ? 1:0;
    }
    return mask;
  }
  function detectMaskedLabel(image,mask) {
    const {width:w,height:h}=image, n=w*h, seen=new Uint8Array(n), queue=new Int32Array(n);
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
      const score=area*Math.min(fill,1),candidate={corners:poly,score,coverage:area/n,fill,ratio};
      // A bright sky or blue reflection can have more pixels than the label.
      // Prefer a complete, in-frame label over a clipped region at the edge.
      const ready=labelReady(candidate,w,h),bestReady=labelReady(best,w,h);
      if(!best||(ready&&!bestReady)||(ready===bestReady&&score>best.score))best=candidate;
    }
    return best;
  }
  function detectLabel(image) {
    const strict=detectMaskedLabel(image,blueMask(image));
    const strictReady=labelReady(strict,image.width,image.height);
    if(strictReady&&strict.fill>=.90&&strict.ratio<=2.6&&strict.coverage>=.25)return strict;
    // A thin strict mask can fit a smaller rectangle inside a shadowed label.
    // Spend the extra pass when it is missing, has holes or spans an unusually
    // narrow part of the frame.
    const shadow=detectMaskedLabel(image,blueMask(image,true));
    if(labelReady(shadow,image.width,image.height)&&
      (!strictReady||shadow.coverage>strict.coverage*1.10))return {...shadow,shadowMask:true};
    return strict|| (shadow ? {...shadow,shadowMask:true}:null);
  }
  function labelReady(found, width, height) {
    if (!found || found.coverage < .10 || found.fill < .68 || found.fill > 1.08) return false;
    const margin = Math.max(4, Math.round(Math.min(width, height) * .012));
    return found.corners.every(p => p.x >= margin && p.y >= margin && p.x < width-margin && p.y < height-margin);
  }
  function refineBorderCorners(image,found) {
    if(!found)return found;
    const {width:w,height:h,data}=image,margin=Math.max(4,Math.round(Math.min(w,h)*.012));
    const top=found.corners.filter(p=>p.y<margin);
    if(top.length!==2 || found.coverage<.5)return found;
    const dark=(x,y)=>{const i=(y*w+x)*4;return data[i]<85&&data[i+1]<130&&data[i+2]<135;};
    // If a blue cast joined the label to both top corners of the camera frame,
    // recover its black printed border. Require three strong, independent edges.
    const x0=Math.round(w*.2),x1=Math.round(w*.8);
    let topY=-1,topScore=0;
    for(let y=2;y<Math.min(h*.15,85);y++){
      let score=0;for(let x=x0;x<x1;x++)if(dark(x,y))score++;
      if(score>topScore){topScore=score;topY=y;}
    }
    if(topScore<(x1-x0)*.45)return found;
    const y0=Math.max(topY+20,Math.round(h*.12)),y1=Math.min(h-10,Math.round(h*.82));
    const peak=(from,to)=>{let xBest=-1,best=0;
      for(let x=from;x<to;x++){
        let score=0;for(let y=y0;y<y1;y++)if(dark(x,y))score++;
        if(score>best){best=score;xBest=x;}
      }
      return {x:xBest,score:best};
    };
    const left=peak(Math.round(w*.05),Math.round(w*.3)),right=peak(Math.round(w*.7),Math.round(w*.95));
    if(left.score<(y1-y0)*.30||right.score<(y1-y0)*.30)return found;
    const corners=found.corners.map(p=>top.includes(p)?{x:p.x<w/2?left.x:right.x,y:topY}:p);
    return {...found,corners,coverage:polygonArea(corners)/(w*h),borderRefined:true};
  }
  function refineShadowBoundary(image,found) {
    if(!found)return found;
    const {width:w,height:h,data}=image;
    const ordered=found.corners.map((p,i)=>({...p,i})).sort((a,b)=>a.y-b.y);
    const [tl,tr]=ordered.slice(0,2).sort((a,b)=>a.x-b.x);
    const [bl,br]=ordered.slice(2).sort((a,b)=>a.x-b.x);
    const topY=Math.min(tl.y,tr.y),bottomY=Math.max(bl.y,br.y);
    if(bottomY-topY<(br.x-bl.x)*1.2)return found;
    // The colour difference survives broad shadows and coloured reflections.
    const colour=(x,y)=>{const i=(y*w+x)*4;return data[i+1]+data[i+2]-2*data[i];};
    const fit=(samples)=>{
      if(samples.length<9)return null;
      const regression=points=>{
        const n=points.length,sx=points.reduce((s,p)=>s+p[0],0),sy=points.reduce((s,p)=>s+p[1],0);
        const xx=points.reduce((s,p)=>s+p[0]*p[0],0)-sx*sx/n;
        if(xx<1)return null;
        const slope=(points.reduce((s,p)=>s+p[0]*p[1],0)-sx*sy/n)/xx;
        return {slope,offset:sy/n-slope*sx/n};
      };
      const first=regression(samples);if(!first)return null;
      const errors=samples.map(p=>p[1]-first.slope*p[0]-first.offset).sort((a,b)=>a-b);
      const median=errors[Math.floor(errors.length/2)];
      const kept=samples.filter(p=>Math.abs(p[1]-first.slope*p[0]-first.offset-median)<10);
      if(kept.length<samples.length*.7)return null;
      const line=regression(kept);if(!line)return null;
      const rms=Math.sqrt(kept.reduce((s,p)=>s+(p[1]-line.slope*p[0]-line.offset)**2,0)/kept.length);
      return rms<3.6?line:null;
    };
    const vertical=(a,b,right)=>{
      const hits=[];
      for(let y=Math.ceil(Math.max(tl.y,tr.y)+20);y<Math.min(bl.y,br.y)-20;y+=8){
        const predicted=a.x+(b.x-a.x)*(y-a.y)/Math.max(1,b.y-a.y);
        let best=-Infinity,at=-1;
        for(let x=Math.max(8,Math.round(predicted)-50);x<Math.min(w-8,Math.round(predicted)+51);x++){
          const contrast=right?colour(x-6,y)-colour(x+6,y):colour(x+6,y)-colour(x-6,y);
          const score=contrast-Math.abs(x-predicted)*.5;
          if(contrast>30&&score>best){best=score;at=x;}
        }
        if(at>=0)hits.push([y,at]);
      }
      return fit(hits);
    };
    const horizontal=(a,b,top)=>{
      const hits=[];
      for(let x=Math.ceil(a.x+15);x<b.x-15;x+=8){
        let predicted=a.y+(b.y-a.y)*(x-a.x)/(b.x-a.x);
        if(top&&Math.abs(a.y-b.y)>50)predicted=a.y;
        let best=-Infinity,at=-1;
        for(let y=Math.max(8,Math.round(predicted)-35);y<Math.min(h-8,Math.round(predicted)+36);y++){
          const contrast=top?colour(x,y+6)-colour(x,y-6):colour(x,y-6)-colour(x,y+6);
          const score=contrast-Math.abs(y-predicted)*.8;
          if(contrast>30&&score>best){best=score;at=y;}
        }
        if(at>=0)hits.push([x,at]);
      }
      return fit(hits);
    };
    const left=vertical(tl,bl,false),right=vertical(tr,br,true);
    const top=horizontal(tl,tr,true),bottom=horizontal(bl,br,false);
    if(!left||!right||!top||!bottom)return found;
    const crossing=(vertical,horizontal)=>{
      const x=(vertical.slope*horizontal.offset+vertical.offset)/(1-vertical.slope*horizontal.slope);
      return {x,y:horizontal.slope*x+horizontal.offset};
    };
    const replacements=[[tl,crossing(left,top)],[tr,crossing(right,top)],
      [br,crossing(right,bottom)],[bl,crossing(left,bottom)]];
    if(replacements.some(([old,p])=>!Number.isFinite(p.x)||!Number.isFinite(p.y)||
      p.x<4||p.x>w-5||p.y<4||p.y>h-5||distance(old,p)>Math.max(w,h)*.32))return found;
    if(!replacements.some(([old,p])=>distance(old,p)>18))return found;
    const corners=found.corners.map((p,i)=>{
      const q=replacements.find(([old])=>old.i===i)[1];return {x:Math.round(q.x),y:Math.round(q.y)};
    });
    const area=polygonArea(corners),coverage=area/(w*h);
    if(coverage<.10||coverage>found.coverage*1.45||coverage<found.coverage*.65)return found;
    return {...found,corners,coverage,shadowBorderRefined:true};
  }
  function sameLiveLabel(a,b,minOverlap=.60) {
    if(!a||!b)return false;
    const bounds=found=>({left:Math.min(...found.corners.map(p=>p.x)),right:Math.max(...found.corners.map(p=>p.x)),
      top:Math.min(...found.corners.map(p=>p.y)),bottom:Math.max(...found.corners.map(p=>p.y))});
    const x=bounds(a),y=bounds(b);
    const areaX=(x.right-x.left)*(x.bottom-x.top),areaY=(y.right-y.left)*(y.bottom-y.top);
    const intersection=Math.max(0,Math.min(x.right,y.right)-Math.max(x.left,y.left))*
      Math.max(0,Math.min(x.bottom,y.bottom)-Math.max(x.top,y.top));
    return areaX>0&&areaY>0&&intersection/(areaX+areaY-intersection)>minOverlap;
  }
  function cornerMotion(a,b) {
    if(!a||!b)return Infinity;
    const size=Math.min(...[0,1,2,3].map(i=>distance(b.corners[i],b.corners[(i+1)%4])));
    if(size<=0)return Infinity;
    // The detector can choose a different first corner on consecutive frames.
    return Math.min(...[0,1,2,3].map(shift=>
      b.corners.reduce((sum,p,i)=>sum+distance(p,a.corners[(i+shift)%4]),0)/4))/size;
  }
  function alignCorners(reference,candidate) {
    if(!reference||!candidate)return candidate;
    const points=candidate.corners;
    const shifts=[0,1,2,3].map(shift=>({shift,error:points.reduce((sum,_,i)=>
      sum+distance(points[(i+shift)%4],reference.corners[i]),0)}));
    const shift=shifts.reduce((best,next)=>next.error<best.error?next:best).shift;
    return {...candidate,corners:points.map((_,i)=>points[(i+shift)%4])};
  }
  function labelDetail(image,found) {
    if(!found)return {detail:0,glare:1};
    // Measure print edges inside the label. A blue border alone cannot make a
    // defocused label pass; this also excludes most of the reflective coil.
    const w=160,h=120,gray=new Uint8Array(w*h),p=found.corners;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const u=.15+(x+.5)/w*.70,v=.17+(y+.5)/h*.66;
      const px=(1-u)*(1-v)*p[0].x+u*(1-v)*p[1].x+u*v*p[2].x+(1-u)*v*p[3].x;
      const py=(1-u)*(1-v)*p[0].y+u*(1-v)*p[1].y+u*v*p[2].y+(1-u)*v*p[3].y;
      const i=(Math.max(0,Math.min(image.height-1,Math.round(py)))*image.width+
        Math.max(0,Math.min(image.width-1,Math.round(px))))*4;
      gray[y*w+x]=Math.round(image.data[i]*.2+image.data[i+1]*.5+image.data[i+2]*.3);
    }
    const histogram=new Uint32Array(256);let valid=0,glare=0;
    for(let y=2;y<h-2;y++)for(let x=2;x<w-2;x++){
      const i=y*w+x,g=gray[i];
      if(g>235)glare++;
      if(g<40||g>230)continue;
      const edge=Math.abs(gray[i-1]+gray[i+1]+gray[i-w]+gray[i+w]-4*g);
      histogram[Math.min(255,edge)]++;valid++;
    }
    let rank=0,detail=0;
    for(let i=0;i<histogram.length;i++)if((rank+=histogram[i])>=valid*.9){detail=i;break;}
    return {detail,glare:glare/((w-4)*(h-4))};
  }
  function advanceLiveCapture(state,found,acceptable,now,quality) {
    const blank={last:null,lastSeen:0,steady:0,stableSince:0,motion:null};
    if(!found||!acceptable)return blank;
    const motion=cornerMotion(state.last,found);
    // Allow small overhead hand sway; sharpness protects against motion blur.
    const stable=state.last&&now-state.lastSeen<500&&sameLiveLabel(found,state.last)&&motion<=.12;
    const clear=quality&&quality.detail>=110&&quality.glare<.025;
    const steady=clear?(stable?state.steady+1:1):0;
    return {last:found,lastSeen:now,steady,stableSince:steady?(stable&&state.stableSince?state.stableSince:now):0,
      motion:Number.isFinite(motion)?motion:null};
  }
  function advanceReachCapture(state,found,acceptable,now) {
    const blank={last:null,lastSeen:0,firstSeen:0,visible:0};
    if(!found||!acceptable)return state.last&&now-state.lastSeen<1100?state:blank;
    const continuing=state.last&&now-state.lastSeen<1100&&sameLiveLabel(state.last,found);
    return {last:found,lastSeen:now,firstSeen:continuing?state.firstSeen:now,
      visible:continuing?state.visible+1:1};
  }
  function reachCaptureReady(state,now,bestDetail) {
    if(state.visible<7||!state.last||!bestDetail)return false;
    const held=now-state.firstSeen;
    // A near-sharp overhead frame can be saved promptly. If focus never
    // settles, save the best actual frame after a bounded hands-free wait.
    return bestDetail>=90&&held>=1600||bestDetail>=55&&held>=3000||
      bestDetail>=30&&held>=5000||bestDetail>=15&&held>=7000;
  }
  function reconcileCaptureCorners(found,live,width,height,liveWidth,liveHeight) {
    if(!live||!liveWidth||!liveHeight||!labelReady(live,liveWidth,liveHeight))return {found,corrected:[]};
    const prior=live.corners.map(p=>({x:p.x*width/liveWidth,y:p.y*height/liveHeight}));
    if(!found)return {found:{...live,corners:prior},corrected:[0,1,2,3]};
    // Match cyclic corner order before comparing independent detections.
    const options=[0,1,2,3].map(shift=>prior.map((_,i)=>prior[(i+shift)%4]));
    const aligned=options.reduce((best,points)=>
      points.reduce((sum,p,i)=>sum+distance(p,found.corners[i]),0)<
      best.reduce((sum,p,i)=>sum+distance(p,found.corners[i]),0)?points:best);
    const offsets=found.corners.map((p,i)=>distance(p,aligned[i]));
    const threshold=Math.max(40,Math.min(width,height)*.10);
    const corrected=offsets.flatMap((delta,i)=>delta>threshold?[i]:[]);
    // A single wildly displaced corner is a colour reflection, not camera movement.
    if(corrected.length!==1||offsets.filter(d=>d<threshold*.65).length<3)return {found,corrected:[]};
    const corners=found.corners.map((p,i)=>i===corrected[0]?aligned[i]:p);
    return {found:{...found,corners},corrected};
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
  return {FIELD_IDS,blueMask,detectLabel,labelReady,refineBorderCorners,refineShadowBoundary,sameLiveLabel,cornerMotion,alignCorners,labelDetail,advanceLiveCapture,advanceReachCapture,reachCaptureReady,reconcileCaptureCorners,warp,rotate,enhance,crop,orientationScore};
});

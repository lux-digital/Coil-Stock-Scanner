const assert=require('node:assert/strict');
const core=require('../scanner-core');

// A large blue sky above a coil should not displace a smaller complete label.
const width=270,height=480,data=new Uint8ClampedArray(width*height*4);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,sky=y<135,label=x>=40&&x<195&&y>=160&&y<390;
  const rgb=sky?[45,155,190]:label?[35,140,155]:[110,115,117];
  data[i]=rgb[0];data[i+1]=rgb[1];data[i+2]=rgb[2];data[i+3]=255;
}
const found=core.detectLabel({width,height,data});
assert(core.labelReady(found,width,height));
assert(found.corners.every(p=>p.y>=160));

const frame=corners=>({corners:corners.map(([x,y])=>({x,y})),coverage:.2,fill:.96});
const a=frame([[220,100],[210,340],[50,340],[40,100]]);
const b=frame([[222,102],[212,342],[52,342],[42,102]]);
let state={last:null,lastSeen:0,firstSeen:0,visible:0};
for(let i=0;i<11;i++)state=core.advanceReachCapture(state,i%2?a:b,true,1000+i*180);
assert.equal(state.visible,11);
assert(!core.reachCaptureReady(state,2800,80));
assert(core.reachCaptureReady(state,2800,92));
assert(core.reachCaptureReady(state,4100,60));
assert(core.reachCaptureReady(state,6100,35));
assert(core.reachCaptureReady(state,9100,18));
assert(!core.reachCaptureReady(state,9100,14));
state=core.advanceReachCapture(state,null,false,3000);
assert.equal(state.visible,11); // A momentary miss does not discard the photo.
state=core.advanceReachCapture(state,b,true,3180);
assert.equal(state.visible,12);
state=core.advanceReachCapture(state,null,false,5000);
assert.equal(state.visible,0);

const assert = require('node:assert/strict');
const core = require('../scanner-core');

const candidate = corners => ({corners:corners.map(([x,y])=>({x,y})),coverage:.40,fill:.96});
// Consecutive outlines from the phone trace shifted more than the previous 12px
// corner limit, even though the whole label stayed visible.
const frames = [
  candidate([[293,106],[282,539],[67,532],[53,110]]),
  candidate([[277,127],[274,517],[77,506],[68,133]]),
  candidate([[277,119],[272,493],[82,492],[75,125]])
];
assert(frames.every(frame=>core.labelReady(frame,360,640)));
assert(core.sameLiveLabel(frames[0],frames[1]));
assert(core.sameLiveLabel(frames[1],frames[2]));
assert(!core.sameLiveLabel(frames[0],candidate([[15,15],[90,15],[90,160],[15,160]])));
assert(!core.labelReady(candidate([[1,60],[275,60],[275,490],[1,490]]),360,640));

const sharp={detail:154,glare:.005},blurred={detail:76,glare:.04};
let state={last:null,lastSeen:0,steady:0,stableSince:0};
state=core.advanceLiveCapture(state,frames[0],true,1000,sharp);
assert.equal(state.steady,1);
assert(core.cornerMotion(frames[0],frames[1])>.12);
state=core.advanceLiveCapture(state,frames[1],true,1180,sharp);
assert.equal(state.steady,1); // A shifting label cannot count as held still.
state=core.advanceLiveCapture(state,frames[1],true,1360,blurred);
assert.equal(state.steady,0);
for(let i=0;i<4;i++)state=core.advanceLiveCapture(state,frames[2],true,1540+i*180,sharp);
assert.equal(state.steady,4);
assert.equal(2080-state.stableSince,540); // Four distinct ticks, over half a second.
state=core.advanceLiveCapture(state,null,false,2260,sharp);
assert.equal(state.steady,0);

// The saved dark-condition traces moved about 12–49 preview pixels between
// the two frames that previously triggered capture.
const darkA=candidate([[209,25],[200,365],[31,372],[17,22]]);
const darkB=candidate([[232,68],[225,409],[52,410],[45,66]]);
assert(core.cornerMotion(darkA,darkB)>.12);
const widthDetail=320,heightDetail=200;
const sharpPixels=new Uint8ClampedArray(widthDetail*heightDetail*4);
const softPixels=new Uint8ClampedArray(sharpPixels.length);
for(let y=0;y<heightDetail;y++)for(let x=0;x<widthDetail;x++){
  const i=(y*widthDetail+x)*4,v=Math.floor(x/4)%2?30:185;
  for(let c=0;c<3;c++){sharpPixels[i+c]=v;softPixels[i+c]=120;}
  sharpPixels[i+3]=softPixels[i+3]=255;
}
const inset=candidate([[8,8],[312,8],[312,192],[8,192]]);
assert(core.labelDetail({width:widthDetail,height:heightDetail,data:sharpPixels},inset).detail>=100);
assert(core.labelDetail({width:widthDetail,height:heightDetail,data:softPixels},inset).detail<100);

// The manually captured label has a dark border inside a blue-tinted camera frame.
// The colour mask alone picked the image corners; the border is inside the frame.
const width=270,height=480,data=new Uint8ClampedArray(width*height*4);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const i=(y*width+x)*4,isBorder=(y===6&&x>=27&&x<=233)||
    ((x===27||x===233)&&y>=6&&y<=423);
  data[i]=isBorder?40:85;data[i+1]=isBorder?55:180;data[i+2]=isBorder?60:200;data[i+3]=255;
}
const edgeCandidate=candidate([[269,0],[232,423],[19,409],[0,0]]);
edgeCandidate.coverage=.76;
const refined=core.refineBorderCorners({width,height,data},edgeCandidate);
assert(refined.borderRefined);
assert(core.labelReady(refined,width,height));
assert.deepEqual(refined.corners.map(p=>[p.x,p.y]),[[233,6],[232,423],[19,409],[27,6]]);

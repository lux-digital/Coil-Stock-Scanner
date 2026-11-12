const assert=require('node:assert/strict');
const core=require('../scanner-core');

const width=270,height=480;
function frame(label=false){
  const data=new Uint8ClampedArray(width*height*4);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4;
    // The left half is under a shadow; the right half remains flashlight lit.
    const rgb=label&&x>=30&&x<238&&y>=75&&y<415?
      (x<138?[33,61,65]:[40,100,110]):[36,39,41];
    data.set([...rgb,255],i);
  }
  return {width,height,data};
}

assert.equal(core.detectLabel(frame()),null);
const dark=frame(true),found=core.detectLabel(dark);
assert(found?.shadowMask);
assert(core.labelReady(found,width,height));
assert(found.coverage>.5); // Includes both the shaded and lit halves.
assert(Math.abs(found.corners[2].x-30)<3);
assert(Math.abs(found.corners[0].x-237)<3);

// A clear blue label keeps the fast normal detector path.
for(let i=0;i<dark.data.length;i+=4){
  if(dark.data[i+1]===61){dark.data[i]=40;dark.data[i+1]=100;dark.data[i+2]=110;}
}
const clear=core.detectLabel(dark);
assert(core.labelReady(clear,width,height));
assert(!clear.shadowMask);

const assert=require('node:assert/strict');
const core=require('../scanner-core'),{parse}=require('../scanner-parser');

// A red cast outside the label joins the blue mask at one corner. The printed
// border still separates blue pigment from the metal throughout the image.
const width=270,height=480,data=new Uint8ClampedArray(width*height*4);
for(let y=0;y<height;y++)for(let x=0;x<width;x++){
  const left=27+y*.01,right=235-y*.03,top=48,bottom=434+(x-27)*.025;
  const inside=x>=left&&x<=right&&y>=top&&y<=bottom;
  const shadow=inside&&y>210&&y<265;
  const i=(y*width+x)*4;
  data[i]=inside?(shadow?43:95):200;
  data[i+1]=inside?(shadow?72:147):105;
  data[i+2]=inside?(shadow?82:166):140;
  data[i+3]=255;
}
const wrong={corners:[{x:205,y:190},{x:221,y:440},{x:31,y:435},{x:28,y:48}],
  coverage:.56,fill:.9,ratio:1.8};
const fixed=core.refineShadowBoundary({width,height,data},wrong);
assert(fixed.shadowBorderRefined);
assert(Math.abs(fixed.corners[0].x-235)<12);
assert(Math.abs(fixed.corners[0].y-48)<12);
assert(core.labelReady(fixed,width,height));

const shaded=parse({left:'L1531V',right:'csm_c_r JW39BA1219A\nCOLOR TOP JW39B',
  idRaw:'COIL ID H36A50N',net:'11 024 LBS',netMetricLower:'[5,000 Kg]',
  gross:'G.WT 11 a 266 LBS',grossMetricLower:'[5,110 Kg]',
  length:'2898 FT',weightBand:'[ 883 M ]'});
assert.deepEqual([shaded.partNo,shaded.coilId,shaded.colour,shaded.netLb,shaded.netKg,
  shaded.grossLb,shaded.grossKg,shaded.lengthFt,shaded.lengthM],
  ['L1531V','H36A50N','JW39BA1219A','11024','5000','11266','5110','2898','883']);

const shadowId=parse({id:'COIL ID J S8AA511',idRaw:'COIL ID J8AA5 1 a'});
assert.equal(shadowId.coilId,'J8AA511');
const serial=parse({net:'8,202 LBS',gross:'7018-010-1',grossAlt:'[3,830 Kg]'});
assert.equal(serial.grossLb,'');
assert.equal(serial.grossKg,'3830');

const upperRow=parse({net:'9,450 LBS\n[4,290 Kg]',gross:'G.WT 791 LBS\n[4,400 Kg]',
  grossUpper:'G.WT 9,701 LBS',lengthUpper:'2497 FT',weightBand:'[761 M]'});
assert.deepEqual([upperRow.grossLb,upperRow.grossKg,upperRow.lengthFt,upperRow.lengthM],
  ['9701','4400','2497','761']);

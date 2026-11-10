const assert=require('node:assert/strict');
const {alignCorners,smoothCorners,quadProjection}=require('../scanner-core');

const quad=[{x:10,y:20},{x:130,y:10},{x:105,y:90},{x:20,y:100}];
const rotated=[quad[2],quad[3],quad[0],quad[1]];
assert.deepEqual(alignCorners(rotated,quad),quad);
assert.deepEqual(smoothCorners(quad,quad.map(p=>({x:p.x+20,y:p.y+10})),.25)[0],{x:15,y:22.5});
const project=quadProjection(quad);
for(const [i,[u,v]] of [[0,0],[1,0],[1,1],[0,1]].entries()){
  const p=project(u,v);
  assert(Math.abs(p.x-quad[i].x)<1e-6 && Math.abs(p.y-quad[i].y)<1e-6);
}
const center=project(.5,.5);
assert(center.x>20&&center.x<130&&center.y>10&&center.y<100);

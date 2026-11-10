const assert=require('node:assert/strict');
const {reconcileCaptureCorners}=require('../scanner-core');
const label=points=>({corners:points.map(([x,y])=>({x,y})),coverage:.45,fill:.96});

// Two phone reports had one crop corner pulled into blue reflections on the steel.
const live1=label([[219,75],[214,393],[42,396],[50,60]]);
const detected1=label([[300,0],[286,520],[56,529],[63,84]]);
const first=reconcileCaptureCorners(detected1,live1,360,640,270,480);
assert.deepEqual(first.corrected,[0]);
assert.equal(first.found.corners[0].y,100);
assert.deepEqual(first.found.corners.slice(1),detected1.corners.slice(1));

const live2=label([[201,55],[224,370],[43,395],[24,43]]);
const detected2=label([[268,71],[295,500],[57,527],[57,0]]);
const second=reconcileCaptureCorners(detected2,live2,360,640,270,480);
assert.deepEqual(second.corrected,[3]);
assert(Math.abs(second.found.corners[3].y-57)<1);

// Ordinary camera movement and a modest corner difference are left alone.
const ordinary=label([[316,75],[283,588],[39,576],[25,65]]);
const live3=label([[244,62],[220,419],[30,436],[23,45]]);
assert.deepEqual(reconcileCaptureCorners(ordinary,live3,360,640,270,480).corrected,[]);
const moved=label([[280,160],[270,610],[50,600],[40,160]]);
assert.deepEqual(reconcileCaptureCorners(moved,live1,360,640,270,480).corrected,[]);
assert.deepEqual(reconcileCaptureCorners(null,live1,360,640,270,480).corrected,[0,1,2,3]);

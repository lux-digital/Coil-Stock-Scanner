const assert=require('node:assert/strict');
const parser=require('../scanner-parser');
const core=require('../scanner-core');

const first={partNo:'L2026V',coilId:'J8HA42O',colour:'',netLb:'7959',netKg:'3610',
  grossLb:'8202',grossKg:'',lengthFt:'2100',lengthM:'640',review:[]};
assert(parser.retryFields(first).includes('grossKg'));
const second={partNo:'L2026V',coilId:'J8HA42O',colour:'STARLIGHT (PC11E)',netLb:'7959',netKg:'3610',
  grossLb:'8202',grossKg:'3720',lengthFt:'2100',lengthM:'640',review:[]};
const merged=parser.mergeSnapshots(first,second);
assert.equal(merged.values.grossKg,'3720');
assert.equal(merged.values.colour,'STARLIGHT (PC11E)');
assert.deepEqual(merged.used,['colour','grossKg']);
assert(merged.values.review.includes('grossKg'));

const wrongCoil=parser.mergeSnapshots(first,{...second,coilId:'J9HA42O'});
assert(wrongCoil.identityMismatch);
assert.equal(wrongCoil.values.grossKg,'');
assert(parser.mergeSnapshots(first,{...second,coilId:'J9HA42O',review:['coilId']}).identityMismatch);

const inconsistent=parser.mergeSnapshots(first,{...second,grossKg:'4600'});
assert.equal(inconsistent.values.grossKg,'');
assert(inconsistent.conflicts.includes('grossKg'));
const disputed=parser.mergeSnapshots(first,{...second,netLb:'9999'});
assert.equal(disputed.values.netLb,'7959');
assert(disputed.conflicts.includes('netLb'));
assert(parser.retryFields({...first,netKg:'5000'}).includes('netLb'));
const reference={corners:[{x:210,y:40},{x:200,y:300},{x:30,y:300},{x:20,y:40}]};
const rotated={corners:[reference.corners[2],reference.corners[3],reference.corners[0],reference.corners[1]]};
assert.deepEqual(core.alignCorners(reference,rotated).corners,reference.corners);
const shifted={corners:reference.corners.map(p=>({x:p.x+65,y:p.y}))};
assert(!core.sameLiveLabel(reference,shifted));
assert(core.sameLiveLabel(reference,shifted,.40));
const overheadSway={corners:reference.corners.map(p=>({x:p.x+100,y:p.y}))};
assert(!core.sameLiveLabel(reference,overheadSway,.40));
assert(core.sameLiveLabel(reference,overheadSway,.25));

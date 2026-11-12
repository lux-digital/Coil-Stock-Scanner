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
const badFirstWeight={...first,partNo:'L2486V',coilId:'J8AA91P',netLb:'5836',netKg:'',grossLb:'9679',grossKg:'4390',review:['netLb']};
const agreeingSecond={...badFirstWeight,netLb:'9436',netKg:'4280',review:['netLb','netKg']};
const repairedWeight=parser.mergeSnapshots(badFirstWeight,agreeingSecond);
assert.equal(repairedWeight.values.netLb,'9436');
assert.equal(repairedWeight.values.netKg,'4280');
assert(repairedWeight.conflicts.includes('netLb'));
assert(repairedWeight.values.review.includes('netLb'));
const completeFirst={...badFirstWeight,netKg:'2650'};
assert.equal(parser.mergeSnapshots(completeFirst,agreeingSecond).values.netLb,'5836');
assert.equal(parser.mergeSnapshots(badFirstWeight,{...agreeingSecond,netKg:'3900'}).values.netLb,'5836');
assert.equal(parser.parse({idLine:'JI7UA41K',id:'COIL ID J 7UA41 K..'}).coilId,'J7UA41K');
assert.equal(parser.parse({idLine:'JI7UA41K',id:'COIL ID J 7UA41 K..'}).review.includes('coilId'),true);
assert.equal(parser.parse({gross:'G.WT 10,120 LBS\n[ 4,59 Kg ]'}).grossKg,'4590');
assert.equal(parser.parse({gross:'G.WT 10,120 LBS'}).grossKg,'');
assert.equal(parser.parse({gross:'G.WT 9,120 LBS\n[ 4,59 Kg ]'}).grossKg,'');
const blurredMetric={gross:'G.WT 10,164 LBS',metricBand:'[ 4,600 Kg ]'};
const blurredPrimary=parser.parse(blurredMetric),blurredSecond=parser.parse({gross:'G.WT 10,164 LBS'});
const repairedGross=parser.mergeSnapshots(blurredPrimary,blurredSecond,blurredMetric);
assert.equal(repairedGross.values.grossKg,'4610');
assert(repairedGross.values.review.includes('grossKg'));
assert.equal(parser.mergeSnapshots(blurredPrimary,{...blurredSecond,grossLb:'10114'},blurredMetric).values.grossKg,'');
assert.equal(parser.mergeSnapshots(blurredPrimary,blurredSecond,{gross:'G.WT 10,164 LBS'}).values.grossKg,'');
const colourRead=parser.parse({right:'KNOTTY TEAK (PW37\nCOLOR TOP PW37)',colourCodeLine:'PW377',colourCodeTight:'PW373'});
assert.equal(colourRead.colour,'KNOTTY TEAK (PW373)');
assert(!parser.mergeSnapshots({...first,colour:'BLACK ONYX(KT031)'},
  {...second,colour:'BLACK ONYX (KT031)'}).conflicts.includes('colour'));
const reference={corners:[{x:210,y:40},{x:200,y:300},{x:30,y:300},{x:20,y:40}]};
const rotated={corners:[reference.corners[2],reference.corners[3],reference.corners[0],reference.corners[1]]};
assert.deepEqual(core.alignCorners(reference,rotated).corners,reference.corners);
const shifted={corners:reference.corners.map(p=>({x:p.x+65,y:p.y}))};
assert(!core.sameLiveLabel(reference,shifted));
assert(core.sameLiveLabel(reference,shifted,.40));
const overheadSway={corners:reference.corners.map(p=>({x:p.x+100,y:p.y}))};
assert(!core.sameLiveLabel(reference,overheadSway,.40));
assert(core.sameLiveLabel(reference,overheadSway,.25));

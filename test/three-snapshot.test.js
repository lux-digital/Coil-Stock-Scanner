const assert=require('node:assert/strict');
const parser=require('../scanner-parser');

// Newer copper labels use E part numbers and G coil IDs.
const copper=parser.parse({left:'LPL202409016\nE18811K',partUpper:'E18811K',
  idLine:'G9CA922',right:'COPPER WAVE (PS133\nCOLOR TOP PS133'});
assert.equal(copper.partNo,'E18811K');
assert.equal(copper.coilId,'G9CA922');
assert.equal(copper.colour,'COPPER WAVE (PS133)');
assert.equal(parser.parse({left:'L1778V',idLine:'H8QA907',
  right:'SILVER WAVE (PS13',colourCodeLine:'PS134'}).colour,'SILVER WAVE (PS134)');

const base={partNo:'L2099V',coilId:'J2SA90X',colour:'BLACK ONYX(KT031)',
  netLb:'9921',netKg:'4500',grossLb:'10164',grossKg:'4616',lengthFt:'2428',lengthM:'740',review:[]};
const shot=(values,shotNumber)=>({values,parts:{},shotNumber});
const voted=parser.mergeThreeSnapshots([
  shot(base,1),shot({...base,grossKg:'4610'},2),shot({...base,grossKg:'4610'},3)
]);
assert.equal(voted.values.grossKg,'4610');
assert(voted.values.review.includes('grossKg'));
assert.deepEqual(voted.selectedShots,[1,2,3]);
const incompleteColour=parser.mergeThreeSnapshots([shot(base,1),
  shot({...base,colour:'BLACK ONYX'},2),shot({...base,colour:'BLACK ONYX'},3)]);
assert.equal(incompleteColour.values.colour,'BLACK ONYX(KT031)');

const firstWrongId={...base,partNo:'L2486V',coilId:'J86A011'};
const correctId={...firstWrongId,coilId:'J86A911'};
const idVote=parser.mergeThreeSnapshots([shot(firstWrongId,1),shot(correctId,2),shot(correctId,3)]);
assert.equal(idVote.values.coilId,'J86A911');
assert.deepEqual(idVote.selectedShots,[2,3]);
assert.deepEqual(idVote.excludedShots,[1]);
assert(idVote.conflicts.includes('identity'));

// A bad part-number read in one photo must not block the third from
// corroborating the first photo and filling its missing coil ID.
const missingId={...base,coilId:''};
const badPart={...base,partNo:'L2229W',coilId:'J2SA90X'};
const partVote=parser.mergeThreeSnapshots([shot(missingId,1),shot(badPart,2),shot(base,3)]);
assert.equal(partVote.values.partNo,'L2099V');
assert.equal(partVote.values.coilId,'J2SA90X');
assert.deepEqual(partVote.selectedShots,[1,3]);

// A consistent but wrong first pair can be changed only by two agreeing
// independent photos of the same coil.
const wrongPair={...base,netLb:'5836',netKg:'2650',grossLb:'9679',grossKg:'4390'};
const rightPair={...wrongPair,netLb:'9436',netKg:'4280'};
const corrected=parser.mergeThreeSnapshots([shot(wrongPair,1),shot(rightPair,2),shot(rightPair,3)]);
assert.equal(corrected.values.netLb,'9436');
assert.equal(corrected.values.netKg,'4280');
assert.equal(parser.mergeThreeSnapshots([shot(wrongPair,1),shot(rightPair,2),
  shot({...rightPair,partNo:'L1111V',coilId:'J11A111'},3)]).values.netLb,'5836');

const unrelated=parser.mergeThreeSnapshots([shot(base,1),
  shot({...base,partNo:'L1111V',coilId:'J11A111'},2),
  shot({...base,partNo:'L2222V',coilId:'J22A222'},3)]);
assert.equal(unrelated.values.coilId,'J2SA90X');
assert(unrelated.identityMismatch);
const badTruncatedWeight=parser.mergeThreeSnapshots([shot(base,1),
  shot({...base,netLb:'921',netKg:''},2),shot({...base,netLb:'921',netKg:''},3)]);
assert.equal(badTruncatedWeight.values.netLb,'9921');

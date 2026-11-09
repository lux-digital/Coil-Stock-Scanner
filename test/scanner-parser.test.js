const assert = require('node:assert/strict');
const {parse} = require('../scanner-parser');

// Text captured from the November 9 phone report, with the added tighter OCR crops.
const phone = parse({
  left:'LPL202608051\nL2486V\nVANCOUVER',
  right:'csm_c_k PVDF PRINT KONA(P\ncoats 150 g/m AZ 158\ncrop «= PWA5L',
  rightAlt:'sm_c_k PVDF PRINT KONA(P.\novo ~=PW15L',
  net:'9. 084 LBS\n[ 45128 kg ]',netAlt:'9,084 us\n[ 4,120 kg ]',
  gross:'G.WT 9, 326 LBS\n[ 4,230 kg ]',grossAlt:'G.WT 9, 326 BS\n[45230 ke ]',
  length:'COAT\n523965\n[730M]',lengthAlt:'s 2396 + COL',
  id:'OIL ID J 7TA4OW',idTight:'J7TA4OW'
});
assert.deepEqual(Object.fromEntries(Object.entries(phone).filter(([key])=>key!=='review')),{
  partNo:'L2486V',coilId:'J7TA40W',colour:'PW15L',netLb:'9084',netKg:'4120',
  grossLb:'9326',grossKg:'4230',lengthFt:'2396',lengthM:'730'
});
assert(phone.review.includes('coilId') && phone.review.includes('colour'));

const star = parse({left:'12227V',right:'CSM_CIR STARLIGHT (PC11E)',
  net:'7,959 LBS\n[3,610 kg]',gross:'8,202 LBS\n[3,720 kg]',
  length:'2100 FT\n[640 M]',idTight:'J8HA420'});
assert.equal(star.partNo,'L2227V');
assert.equal(star.colour,'STARLIGHT (PC11E)');
assert.equal(star.coilId,'J8HA420');
assert.deepEqual([star.netLb,star.netKg,star.grossLb,star.grossKg,star.lengthFt,star.lengthM],
  ['7959','3610','8202','3720','2100','640']);

const mismatch=parse({net:'9,084 LBS\n[5,126 kg]'});
assert.equal(mismatch.netLb,'9084');
assert.equal(mismatch.netKg,'');
const metricOnly=parse({gross:'[ 4,610 Ke ]'});
assert.equal(metricOnly.grossLb,'');
assert.equal(metricOnly.grossKg,'4610');

// The follow-up phone report added a stray digit to both printed kilogram values.
const followup=parse({
  left:'LPL202608051\nL2486V',right:'CSM_CIR PVDF PRINT CEDAR(\nPW15I',
  net:'8,224 LBS\n[ 37730 kg ]',netAlt:'8,224 LBS\n[ 35730 kg ]',
  gross:'G.WT 8,466 LBS\n[ 35840 Kg ]',
  length:'2166 FT\n[660 M]',idTight:'J7UA40B'
});
assert.deepEqual([followup.netLb,followup.netKg,followup.grossLb,followup.grossKg],
  ['8224','3730','8466','3840']);
assert(followup.review.includes('netKg') && followup.review.includes('grossKg'));

// A conflicting OCR reading must not become a guessed metric weight.
assert.equal(parse({net:'8,224 LBS\n[ 39,999 kg ]'}).netKg,'');

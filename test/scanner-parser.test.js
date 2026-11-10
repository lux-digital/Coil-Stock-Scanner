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

// A later photo had correct numeric OCR, but its large coil ID and colour code were misread.
const later=parse({
  left:'L2486V',right:'PVDF PRINT KONA(P\nPW1SL',rightAlt:'PVDF PRINT KONA(P\nPW1SL',
  idTight:'J7TRAGOA',idUpscaled:'J7TA40X',colourCodeTight:'PW15L',
  net:'9,084 LBS\n[ 45120 Kg ]',netAlt:'9,084 LBS\n[ 4120 Kg ]',
  gross:'9,326 LBS\n[ 4,230 Kg ]',length:'2396 FT\n[ 730 M ]'
});
assert.equal(later.coilId,'J7TA40X');
assert.equal(later.colour,'PW15L');
assert(!later.review.includes('netKg'));
assert.equal(parse({idTight:'J7TRAGOA'}).coilId,'');

// Keep the original colour reading if the isolated crop misreads a valid code.
assert.equal(parse({right:'PVDF PRINT CEDAR(\nPW15I',colourCodeTight:'PW15T'}).colour,'PW15I');

// November 10 phone diagnostics: the colour name and metric length survive noisy side crops.
const pecan=parse({right:'was PECAN (PW495) / B',length:'2432\n[741 Mm]',gross:'29,943',grossAlt:'wr9,943',net:'9,701'});
assert.equal(pecan.colour,'PECAN (PW495) / B');
assert.equal(pecan.lengthM,'741');
assert.equal(pecan.grossLb,'9943');
assert(pecan.review.includes('grossLb'));
const onyx=parse({right:'BLACK ONYX(K1@31)\nKTO31',length:'[a0 # 100',lengthAlt:'{ 740 # TOP'});
assert.equal(onyx.colour,'BLACK ONYX(KT031)');
assert.equal(onyx.lengthFt,'');

// Nine new phone reports exposed incomplete names, multiple part numbers and OCR noise.
const chestnut=parse({left:'L2098V',right:'CSM_CLR KNOTTY CHESTNUT(P\nCOLOR TOP PW234',
  idTight:'1J2EA90B',net:'10,340 LBS\n[4,690 Kg]',gross:'19,783'});
assert.equal(chestnut.colour,'KNOTTY CHESTNUT (PW234)');
assert.equal(chestnut.coilId,'J2EA90B');
assert.equal(chestnut.grossLb,'');

const starlight=parse({left:'L2386V',right:'STARLIGHT (PC11E)',
  net:'Y.944 IN\n8,819 LBS\nr 2°600 Ke',gross:'9, P61 LBS\nr 42110 Ke',
  fullText:'[ 4,000 Kg ] [ 4,110 Kg ]'});
assert.deepEqual([starlight.netLb,starlight.netKg,starlight.grossLb,starlight.grossKg],
  ['8819','4000','9061','4110']);

const multi=parse({left:'L20406K, L2052V, L2053V',right:'PART NO L2040K\nCHAMPAGNE WAVE (PS',
  colourCodeTight:'PS135',id:'JIEA91G',net:'9,524 LBS\n[4,328 Kg]',netMetricTight:'[4,320 Kg]',
  gross:'9,767 LBS\n[4,430 Kg]'});
assert.equal(multi.partNo,'L2040K');
assert.equal(multi.coilId,'J1EA91G');
assert.equal(multi.colour,'CHAMPAGNE WAVE (PS135)');
assert.equal(multi.netKg,'4320');

const wrongMetric=parse({length:'2363 FT\n[726 M]'});
assert.equal(wrongMetric.lengthFt,'2363');
assert.equal(wrongMetric.lengthM,'');
assert.equal(parse({right:'PART NO L2098V\nKNOTTY CHESTNUT(P'}).colour,'KNOTTY CHESTNUT');
assert.equal(parse({idTight:'JSAA91M',idWide:'J8AA91M'}).coilId,'J8AA91M');
assert.equal(parse({length:'2330 FT',lengthAlt:'e710 METSTS'}).lengthM,'710');

const assert=require('node:assert/strict');
const {parse}=require('../scanner-parser');

// The circled large order number is readable in its own crop. A different
// small PART NO on the right must not silently replace it.
const circled=parse({left:'PPTL TR 05002\nVANCOUVER',partUpper:'L2229V',
  right:'PART NO L2099V\nBLACK ONYX(KT031)',idLine:'J3EA90Z'});
assert.equal(circled.partNo,'L2229V');
assert(circled.review.includes('partNo'));

// A period after L and a noisy full-label OCR pass must not make a good
// part number disappear. An invalid two-number row must not override gross.
const onyx=parse({left:'L.2099V',fullText:'L2OIIV',right:'BLACK ONYX(KT031)',
  net:'9,921 LBS',gross:'10,164 L',grossAlt:'[A610 Ky]',
  weightBand:'9,921 LBS 2428 FT\n[A610 Ky] [746 1M]',
  length:'2428 FT',lengthAlt:'2428 FT'});
assert.deepEqual([onyx.partNo,onyx.grossLb,onyx.grossKg,onyx.lengthFt,onyx.lengthM],
  ['L2099V','10164','4610','2428','740']);
assert(onyx.review.includes('lengthM'));

// The barcode caption resolves the large ID, while two independently read
// 800 M prints resolve one wrong foot digit. The unseen gross lb stays empty.
const suede=parse({left:'L2227V',idTight:'IAOAAOY',idLine:'JAOALOX',
  barcodeLine:'4J4QA4OX',net:'9,921 LBS\n[4,500 Kg]',
  gross:'18,204\n[4,600 Ke]',length:'225 FT\n800 M',
  lengthAlt:'2325 HET\n800 M',weightBand:'9,921 18,0b 225\n[4,500 Kg] [a,610 ke] 800 M',
  metricBand:'800 M\n[4,500 Kg]\n[4,610 Ke]'});
assert.deepEqual([suede.coilId,suede.grossLb,suede.grossKg,suede.lengthFt,suede.lengthM],
  ['J4QA40X','','4610','2625','800']);
assert(suede.review.includes('lengthFt')&&suede.review.includes('grossKg'));

// The large order number and isolated colour code corroborate one another
// when the broad OCR passes misread 0 as 6 and 4 as A.
const chestnut=parse({left:'L2698V',fullText:'L2098V',
  right:'KNOTTY CHESTNUT(P\nPW23A',colourCodeLine:'PW234'});
assert.equal(chestnut.partNo,'L2098V');
assert.equal(chestnut.colour,'KNOTTY CHESTNUT (PW234)');
assert(chestnut.review.includes('partNo')&&chestnut.review.includes('colour'));

// A single incompatible metric reading cannot fabricate a missing field.
assert.equal(parse({net:'9,877 LBS',metricBand:'[4,422 Kg]'}).netKg,'');
assert.deepEqual((()=>{const x=parse({length:'2325 FT',lengthAlt:'800 M'});
  return [x.lengthFt,x.lengthM];})(),['2325','']);

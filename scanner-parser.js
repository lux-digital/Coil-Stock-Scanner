/* Read only values printed on the label. Never invent a missing OCR reading. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoilParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const FIELDS = ['partNo','coilId','colour','netLb','netKg','grossLb','grossKg','lengthFt','lengthM'];
  const upper = text => String(text || '').toUpperCase().replace(/[|]/g,'I').replace(/[“”]/g,'"');
  function numbers(text, min, max) {
    return [...upper(text).replace(/(?<=\d|\d[, .]\s*)[OQ](?=\d|\b)/g,'0').replace(/(?<=\d)[IL](?=\d|\b)/g,'1')
      .matchAll(/\b\d{1,2}\s*[, .]\s*\d{3}\b|\b\d{3,5}\b/g)]
      .map(match => match[0].replace(/\D/g,''))
      .filter(value => Number(value)>=min && Number(value)<=max);
  }
  function readings(text, kind) {
    const pounds=[],other=[],min=kind==='length'?100:500,max=kind==='length'?10000:30000;
    const otherMin=kind==='length'?30:200,otherMax=kind==='length'?4000:15000;
    const lines=upper(text).split(/\n/).map(s=>s.trim()).filter(Boolean);
    for(const line of lines) {
      const isOther=kind==='length'?/(?:\bM\b|\d\s*M\d?\b)/.test(line):/K[G6E]/.test(line);
      const main=numbers(line,min,max),secondary=numbers(line,otherMin,otherMax);
      if(isOther) {
        // A line can contain both columns when OCR joins them. Prefer the number nearest the unit.
        const near=line.match(/(\d[\d, .]*\d)\s*(?:K[G6E]|M\d?\b)/);
        const value=near && numbers(near[1],otherMin,otherMax)[0];
        if(value)other.push(value);else if(secondary.length)other.push(secondary.at(-1));
        if(main.length && Number(main[0])>otherMax)pounds.push(main[0]);
      } else if(main.length) pounds.push(main[0]);
    }
    return {pounds,other};
  }
  function pair(primary, alternative, kind) {
    const a=readings(primary,kind),b=readings(alternative,kind);
    const pounds=[...a.pounds,...b.pounds],other=[...a.other,...b.other],direct=new Set(other);
    const factor=kind==='length'?.3048:.45359237;
    const repaired=new Set(),max=kind==='length'?4000:15000;
    // OCR sometimes inserts one digit into the small metric line (3,730 -> 37,730).
    // Only use a deletion when the printed imperial value independently confirms it.
    for(const text of [primary,alternative])for(const line of upper(text).split(/\n/)) {
      if(!(kind==='length'?/M\d?\b/:/K[G6E]/).test(line))continue;
      for(const match of line.matchAll(/\b\d{5}\b/g)) {
        if(Number(match[0])<=max)continue;
        for(const lb of pounds) {
          const expected=Number(lb)*factor,limit=Math.max(1.5,expected*.0005);
          const variants=new Set([...match[0]].map((_,i)=>match[0].slice(0,i)+match[0].slice(i+1)));
          for(const value of variants)if(Number(value)<=max && Math.abs(Number(value)-expected)<=limit){
            other.push(value);repaired.add(value);
          }
        }
      }
    }
    let chosen=null;
    for(const lb of pounds)for(const metric of other) {
      const error=Math.abs(Number(lb)*factor-Number(metric));
      if(!chosen || error<chosen.error)chosen={lb,metric,error};
    }
    if(!chosen)return [pounds[0]||'',other[0]||'',true];
    const limit=Math.max(3,Number(chosen.metric)*.015);
    if(chosen.error>limit)return [chosen.lb,'',true];
    return [chosen.lb,chosen.metric,chosen.error>2||(repaired.has(chosen.metric)&&!direct.has(chosen.metric))];
  }
  function coilId(parts) {
    const text=upper([parts.idTight,parts.idUpscaled,parts.barcodeText,parts.id].join('\n'));
    const candidates=text.match(/\b[A-Z][A-Z0-9]{5,9}\b/g)||[];
    const value=(parts.barcodeDecoded && candidates.includes(upper(parts.barcodeDecoded)) && upper(parts.barcodeDecoded))||
      candidates.find(x=>x.length===7 && /\d/.test(x) && /[A-Z]/.test(x.slice(2)));
    if(!value)return {value:'',review:false};
    // These labels use letter, digit, two letters, two digits, then an alphanumeric suffix.
    if(parts.barcodeDecoded && value===upper(parts.barcodeDecoded))return {value,review:false};
    if(value.length!==7 || !/^[A-Z][0-9OQI][A-Z]{2}[0-9OQILS]{2}[A-Z0-9OQILS]$/.test(value))return {value,review:true};
    const normalized=[...value].map((c,i)=>[1,4,5].includes(i)?({'O':'0','Q':'0','I':'1','L':'1','S':'5'}[c]||c):c).join('');
    return {value:normalized,review:normalized!==value};
  }
  function colour(text, alternate) {
    const lines=upper(text).split(/\n/).map(s=>s.trim()).filter(Boolean);
    const codeLines=upper(alternate?.text).split(/\n/).map(s=>s.trim()).filter(Boolean).concat(lines);
    let name='';
    for(const line of lines) {
      const marker=line.match(/CSM[A-Z_\s-]{0,3}C(?:L|I|1)R|COL(?:OU)?R\s*NAME/);
      if(marker && line.slice(marker.index+marker[0].length).trim()) {
        name=line.slice(marker.index+marker[0].length);break;
      }
      if(/\b(?:PVDF\s+PRINT|STARLIGHT|HEMLOCK|ONYX|SUEDE|CHERRY|CEDAR|DRIFTWOOD|CYPRESS)\b/.test(line)) {
        name=line.slice(line.search(/\b(?:PVDF|STARLIGHT|HEMLOCK|ONYX|SUEDE|CHERRY|CEDAR|DRIFTWOOD|CYPRESS)\b/));break;
      }
    }
    name=name.replace(/^[\s=:;|\\]+/,'').replace(/\s*(?:COATG|COATING|150\s*G\/M).*$/,'')
      .replace(/[|\\;.,\s]+$/,'').replace(/\s+/g,' ').trim();
    const codeLine=codeLines.find(line=>/\b(?:COL(?:OU)?R\s*TOP|COLOR\s*TOP)\b/.test(line))||'';
    const code=(codeLine.match(/\b[A-Z]{1,3}\d{2,4}[A-Z]?\b/)||[])[0]||
      (codeLines.flatMap(line=>line.match(/\b[A-Z]{1,3}\d{2,4}[A-Z]\b/g)||[]).find(x=>x!=='S9130')||'')||
      (upper(alternate?.colourCodeTight).match(/\b[A-Z]{1,3}\d{2,4}[A-Z]\b/)||[])[0]||'';
    const incomplete=name.includes('(') && !name.includes(')');
    if(incomplete&&code)return {value:code,review:true};
    if(name.length>=4&&name.length<=48)return {value:name,review:incomplete};
    return {value:code,review:!!code};
  }
  function parse(parts) {
    const out=Object.fromEntries(FIELDS.map(id=>[id,'']));out.review=[];
    const part=upper(parts.left).match(/\b[L1][0-9OQI]{3,6}[A-Z]\b/);
    if(part){out.partNo=('L'+part[0].slice(1)).replace(/[OQ]/g,'0').replace(/I/g,'1');if(part[0][0]==='1')out.review.push('partNo');}
    const id=coilId(parts);out.coilId=id.value;if(id.review)out.review.push('coilId');
    const color=colour(parts.right,{text:parts.rightAlt,colourCodeTight:parts.colourCodeTight});out.colour=color.value;if(color.review)out.review.push('colour');
    for(const [source,alt,kind,a,b] of [
      ['net','netAlt','weight','netLb','netKg'],
      ['gross','grossAlt','weight','grossLb','grossKg'],
      ['length','lengthAlt','length','lengthFt','lengthM']]) {
      const result=pair(parts[source],parts[alt],kind);
      out[a]=result[0];out[b]=result[1];
      if(result[2]&&out[b])out.review.push(b);
    }
    return out;
  }
  return {parse};
});

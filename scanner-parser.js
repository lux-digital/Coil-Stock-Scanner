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
      .replace(/(?<=\d[, .]\s*)P(?=\d)/g,'0')
      .matchAll(/(?<!\d)\d{1,2}\s*[, .]\s*\d{3}\b|(?<!\d)\d{3,5}\b/g)]
      .map(match => String(Number(match[0].replace(/\D/g,''))))
      .filter(value => Number(value)>=min && Number(value)<=max);
  }
  function readings(text, kind) {
    const pounds=[],other=[],explicit=[],min=kind==='length'?1000:500,max=kind==='length'?10000:30000;
    const otherMin=kind==='length'?30:200,otherMax=kind==='length'?4000:15000;
    const lines=upper(text).split(/\n/).map(s=>s.trim()).filter(Boolean);
    for(const line of lines) {
      const isOther=kind==='length'?/(?:\bM\b|\d\s*M(?:M\b|ET|E)?)/.test(line):/K[G6E]/.test(line);
      const main=numbers(line,min,max),secondary=numbers(line,otherMin,otherMax);
      if(isOther) {
        // A line can contain both columns when OCR joins them. Prefer the number nearest the unit.
        const near=line.match(/(\d[\d, .]*\d)\s*(?:K[G6E]|M(?:M\b|ET|E)?)/);
        const value=near && numbers(near[1],otherMin,otherMax)[0];
        if(value)other.push(value);else if(secondary.length)other.push(secondary.at(-1));
        if(main.length && Number(main[0])>otherMax)pounds.push(main[0]);
      } else if(main.length){pounds.push(main[0]);if(/\bLBS?\b/.test(line))explicit.push(main[0]);}
    }
    return {pounds,other,explicit};
  }
  function pair(primary, alternative, kind) {
    const a=readings(primary,kind),b=readings(alternative,kind);
    const explicit=[...a.explicit,...b.explicit];
    const pounds=explicit.length?explicit:[...a.pounds,...b.pounds],other=[...a.other,...b.other],direct=new Set(other);
    const factor=kind==='length'?.3048:.45359237;
    const repaired=new Set(),max=kind==='length'?4000:15000;
    // OCR sometimes inserts one digit into the small metric line (3,730 -> 37,730).
    // Only use a deletion when the printed imperial value independently confirms it.
    for(const text of [primary,alternative])for(const line of upper(text).split(/\n/)) {
      if(!(kind==='length'?/M\d?\b|MM\b|MET/:/K[G6E]/).test(line))continue;
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
    const limit=kind==='length'?2:6;
    if(chosen.error>limit)return [chosen.lb,'',true];
    return [chosen.lb,chosen.metric,chosen.error>2||(repaired.has(chosen.metric)&&!direct.has(chosen.metric))];
  }
  function coilId(parts) {
    const candidateText=[parts.idTight,parts.idUpscaled,parts.idWide,parts.barcodeText,parts.fullText,parts.id]
      .map(text=>upper(text).replace(/\bJ\s+(?=[0-9OQILSB])/, 'J'));
    const candidates=candidateText.flatMap(text=>text.match(/J[A-Z0-9]{6}(?![A-Z0-9])/g)||[]);
    const valid=value=>/^[A-Z][0-9OQIL][A-Z0-9]{2}[0-9OQILS]{2}[A-Z0-9OQILS]$/.test(value);
    const value=(parts.barcodeDecoded&&upper(parts.barcodeDecoded))||
      candidates.find(valid)||candidates[0];
    if(!value)return {value:'',review:false};
    // These labels use letter, digit, two letters, two digits, then an alphanumeric suffix.
    if(parts.barcodeDecoded && value===upper(parts.barcodeDecoded))return {value,review:false};
    if(value.length!==7 || !valid(value))return {value:'',review:true};
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
      if(/\b(?:PVDF\s+PRINT|KNOTTY\s+CHESTNUT|KNOTTY\s+TEAK|CHAMPAGNE\s+WAVE|STARLIGHT|HEMLOCK|BLACK\s+ONYX|WHITE\s+OAK|PECAN|ONYX|SUEDE|CHERRY|CEDAR|DRIFTWOOD|CYPRESS)\b/.test(line)) {
        name=line.slice(line.search(/\b(?:PVDF|KNOTTY\s+CHESTNUT|KNOTTY\s+TEAK|CHAMPAGNE\s+WAVE|STARLIGHT|HEMLOCK|BLACK\s+ONYX|WHITE\s+OAK|PECAN|ONYX|SUEDE|CHERRY|CEDAR|DRIFTWOOD|CYPRESS)\b/));break;
      }
    }
    name=name.replace(/^[\s=:;|\\]+/,'').replace(/\s*(?:COATG|COATING|150\s*G\/M).*$/,'')
      .replace(/[|\\;.,/\s]+$/,'').replace(/\s+/g,' ').trim();
    const codeLine=codeLines.find(line=>/\b(?:COL(?:OU)?R\s*TOP|COLOR\s*TOP)\b/.test(line))||'';
    const codePattern=/\b(?:PW|PC|PS|KT)(?:[0-9OQ]{3}|[0-9OQ]{2}[A-Z])\b/g;
    const colourCodes=codeLines.concat(upper(alternate?.colourCodeTight),upper(alternate?.fullText)).flatMap(line=>
      line.match(codePattern)||[]);
    const codeRaw=(codeLine.match(codePattern)||[])[0]||
      colourCodes.find(x=>/\d{3}$/.test(x))||colourCodes[0]||'';
    const code=codeRaw.slice(0,2)+codeRaw.slice(2).replace(/[OQ]/g,'0');
    const incomplete=name.includes('(') && !name.includes(')');
    if(incomplete&&code){
      if(/^(?:KNOTTY|CHAMPAGNE)/.test(name))return {value:name.replace(/\s*\([^)]*$/,'').trim()+' ('+code+')',review:true};
      return {value:code,review:true};
    }
    if(incomplete)name=name.replace(/\s*\([^)]*$/,'').trim();
    // A second printed colour code can correct a damaged character inside parentheses.
    const inside=name.match(/\(([A-Z0-9@]{4,6})\)/);
    let corrected=false;
    if(inside&&code&&inside[1]!==code && !/^(?:PW|PC|PS|KT)(?:\d{3}|\d{2}[A-Z])$/.test(inside[1])) {
      const normalized=inside[1].replace(/[@O]/g,'0');
      const differences=[...code].filter((c,i)=>c!==normalized[i]).length;
      const fullTextCode=(upper(alternate?.fullText).match(codePattern)||[]).includes(codeRaw);
      if(code.length===normalized.length && (differences<=1||fullTextCode)){
        name=name.replace(inside[1],code);corrected=true;
      }
    }
    const uncertainSuffix=/\s\/\s[A-Z]$/.test(name);
    if(uncertainSuffix&&!/\s\/\sB$/.test(name))name=name.replace(/\s*\/\s*[A-Z]$/,'');
    if(name.length>=4&&name.length<=48)return {value:name,review:incomplete||corrected||uncertainSuffix};
    return {value:code,review:!!code};
  }
  function parse(parts) {
    const out=Object.fromEntries(FIELDS.map(id=>[id,'']));out.review=[];
    const normalizePart=value=>('L'+value.slice(1)).replace(/[OQ]/g,'0').replace(/I/g,'1');
    const leftParts=[...upper(parts.left).matchAll(/\b[L1][0-9OQI]{3,6}[A-Z]\b/g)].map(x=>normalizePart(x[0]));
    const rightPart=upper([parts.right,parts.rightAlt].join('\n')).match(/PART\s*NO\s*([L1][0-9OQI]{3,6}[A-Z])/);
    const right=rightPart&&normalizePart(rightPart[1]);
    out.partNo=leftParts[0]||'';
    if(right&&(leftParts.includes(right)||leftParts.some(x=>x.length===right.length+1&&[...x].some((_,i)=>x.slice(0,i)+x.slice(i+1)===right)))){
      if(out.partNo!==right)out.review.push('partNo');
      out.partNo=right;
    }
    if(/\b1[0-9OQI]{3,6}[A-Z]\b/.test(upper(parts.left)))out.review.push('partNo');
    const id=coilId(parts);out.coilId=id.value;if(id.review)out.review.push('coilId');
    const color=colour(parts.right,{text:parts.rightAlt,colourCodeTight:parts.colourCodeTight,fullText:parts.fullText});out.colour=color.value;if(color.review)out.review.push('colour');
    for(const [source,alt,kind,a,b] of [
      ['net','netAlt','weight','netLb','netKg'],
      ['gross','grossAlt','weight','grossLb','grossKg'],
      ['length','lengthAlt','length','lengthFt','lengthM']]) {
      const alternative=[parts[alt],parts[source+'MetricTight']].filter(Boolean).join('\n');
      const result=pair(parts[source],alternative,kind);
      out[a]=result[0];out[b]=result[1];
      if(result[2]&&out[b])out.review.push(b);
    }
    // The first full-label OCR pass sometimes reads a metric value that its small crop misses.
    const fullMetric=[...upper(parts.fullText).matchAll(/([\d,.\s]{3,9})\s*K[G6E]\b/g)]
      .flatMap(match=>numbers(match[1],200,15000));
    for(const [lb,kg] of [['netLb','netKg'],['grossLb','grossKg']])if(out[lb]&&!out[kg]){
      const matches=[...new Set(fullMetric.filter(value=>Math.abs(Number(out[lb])*.45359237-Number(value))<=6))];
      if(matches.length===1){out[kg]=matches[0];out.review.push(kg);}
    }
    // Reject an extra leading digit when the second OCR pass and the net weight corroborate it.
    if(out.netLb&&out.grossLb&&Number(out.grossLb)>Number(out.netLb)*1.5){
      const candidates=readings(parts.grossAlt,'weight').pounds.filter(v=>Number(v)>=Number(out.netLb)&&Number(v)<Number(out.netLb)*1.25);
      if(candidates.length===1){out.grossLb=candidates[0];out.review.push('grossLb');}
      else{out.grossLb='';out.review.push('grossLb');}
    }
    return out;
  }
  return {parse};
});

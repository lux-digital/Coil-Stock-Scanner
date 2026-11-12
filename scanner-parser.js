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
    return [...upper(text).replace(/(\b\d{1,2})\s+[A-Z]\s+(\d{3})\s*(?=LBS?\b)/g,'$1,$2 ')
      .replace(/(?<=\d|\d[, .]\s*)[OQ](?=\d|\b)/g,'0').replace(/(?<=\d)[IL](?=\d|\b)/g,'1')
      .replace(/(?<=\d[, .]\s*)P(?=\d)/g,'0')
      .matchAll(/(?<!\d)\d{1,2}\s*[, .]\s*\d{3}\b|(?<!\d)\d{3,5}\b/g)]
      .map(match => String(Number(match[0].replace(/\D/g,''))))
      .filter(value => Number(value)>=min && Number(value)<=max);
  }
  function printedMetric(text,kind) {
    const weight=kind==='weight',pattern=weight?
      /\b([A0-9]\s*[, .]?\s*\d{3})\s*(?:K[G6EY]|V[G6Y])(?=\W|$)/g:
      /\b(\d{3,4})\s*(?:M(?:M\b|\b)|1M\b|¥)(?=\W|$)/g;
    return [...upper(text).matchAll(pattern)].flatMap(match=>
      numbers(match[1].replace(/^A/,'4'),weight?200:30,weight?15000:4000));
  }
  function readings(text, kind) {
    const pounds=[],other=[],explicit=[],min=kind==='length'?1000:500,max=kind==='length'?10000:30000;
    const otherMin=kind==='length'?30:200,otherMax=kind==='length'?4000:15000;
    const lines=upper(text).split(/\n/).map(s=>s.trim()).filter(Boolean);
    for(const line of lines) {
      // Serial numbers beneath the weight row contain plausible four-digit fragments.
      if(/\b(?:COIL\s*(?:ID|NO)|E\d{6,}|\d{4,}-\d)/.test(line)&&!/\b(?:LBS?|G\.?(?:WT|W)|N\.?(?:WT|W))\b/.test(line))continue;
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
    if(chosen.error>limit){
      // A three-digit OCR fragment cannot be a 9,000 lb coil beside a 4,000 kg reading.
      if(chosen.error>Number(chosen.metric)*.15&&Number(chosen.lb)<2000)return ['',chosen.metric,true];
      // When no pair agrees, the "least wrong" pair can still select a bad
      // later OCR fragment over the clear primary reading.
      return [pounds[0]||'','',true];
    }
    return [chosen.lb,chosen.metric,chosen.error>2||(repaired.has(chosen.metric)&&!direct.has(chosen.metric))];
  }
  function coilId(parts) {
    const candidateText=[parts.idLine,parts.idTight,parts.idUpscaled,parts.idWide,parts.barcodeLine,parts.barcodeText,parts.id,parts.fullText,parts.idRaw]
      .map(text=>upper(text).replace(/\bJ\s+S(?=[0-9OQIL][A-Z0-9]{5})/g,'J')
        .replace(/\b([JH])\s+(?=[0-9OQILSB])/g,'$1')
        .replace(/([JH][0-9OQIL][A-Z0-9]{2}[0-9OQILS])\s+(?=[0-9OQILS][A-Z0-9])/g,'$1'));
    const candidates=candidateText.flatMap(text=>text.match(/[JH][A-Z0-9]{6}(?![A-Z0-9])/g)||[]);
    const valid=value=>/^[A-Z][0-9OQIL][A-Z0-9]{2}[0-9OQILS]{2}[A-Z0-9OQILS]$/.test(value);
    const normalize=value=>[...value].map((c,i)=>[1,4,5].includes(i)?({'O':'0','Q':'0','I':'1','L':'1','S':'5'}[c]||c):c).join('');
    const line=(candidateText[0].match(/[JH][A-Z0-9]{6}(?![A-Z0-9])/g)||[]).find(valid);
    const value=(parts.barcodeDecoded&&upper(parts.barcodeDecoded))||
      (line&&candidates.slice(1).some(x=>valid(x)&&normalize(x)===normalize(line))?line:null)||
      candidates.find(valid)||candidates[0];
    if(!value)return {value:'',review:false};
    // These labels use letter, digit, two letters, two digits, then an alphanumeric suffix.
    if(parts.barcodeDecoded && value===upper(parts.barcodeDecoded))return {value,review:false};
    if(value.length!==7 || !valid(value))return {value:'',review:true};
    const normalized=normalize(value);
    const rawFallback=!!parts.idRaw&&!candidateText.slice(0,-1).some(text=>text.includes(value));
    const conflict=candidates.some(x=>valid(x)&&normalize(x)!==normalized);
    return {value:normalized,review:normalized!==value||rawFallback||conflict};
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
      if(/\b(?:PVDF\s+PRINT|KNOTTY\s+CHESTNUT|KNOTTY\s+TEAK|CHAMPAGNE\s+WAVE|STARLIGHT|HEMLOCK|WALNUT|BLACK\s+ONYX|WHITE\s+OAK|PECAN|ONYX|SUEDE|CHERRY|CEDAR|DRIFTWOOD|CYPRESS)\b/.test(line)) {
        name=line.slice(line.search(/\b(?:PVDF|KNOTTY\s+CHESTNUT|KNOTTY\s+TEAK|CHAMPAGNE\s+WAVE|STARLIGHT|HEMLOCK|WALNUT|BLACK\s+ONYX|WHITE\s+OAK|PECAN|ONYX|SUEDE|CHERRY|CEDAR|DRIFTWOOD|CYPRESS)\b/));break;
      }
    }
    name=name.replace(/^[\s=:;|\\]+/,'').replace(/\s*(?:COATG|COATING|150\s*G\/M).*$/,'')
      .replace(/[|\\;.,/\s]+$/,'').replace(/\s+/g,' ').trim();
    const codeLine=codeLines.find(line=>/\b(?:COL(?:OU)?R\s*TOP|COLOR\s*TOP)\b/.test(line))||'';
    const codePattern=/\b(?:PW|PC|PS|KT|JW|IW)(?:[0-9OQ]{3}|[0-9OQ]{2}[A-Z])\b/g;
    const colourCodes=[upper(alternate?.colourCodeLine),...codeLines,upper(alternate?.colourCodeTight),upper(alternate?.fullText)].flatMap(line=>
      line.match(codePattern)||[]);
    const codeRaw=(codeLine.match(codePattern)||[])[0]||
      colourCodes.find(x=>/\d{3}$/.test(x))||colourCodes[0]||'';
    const code=codeRaw.slice(0,2)+codeRaw.slice(2).replace(/[OQ]/g,'0');
    const incomplete=name.includes('(') && !name.includes(')');
    if(incomplete&&code){
      if(/^(?:KNOTTY|CHAMPAGNE|BLACK ONYX|WHITE OAK|PECAN)/.test(name))return {value:name.replace(/\s*\([^)]*$/,'').trim()+' ('+code+')',review:true};
      return {value:code,review:true};
    }
    if(incomplete)name=name.replace(/\s*\([^)]*$/,'').trim();
    if(/\((?:KT|PW|PC|PS)[0-9OQ@]{3}\)/.test(name)){
      const corrected=name.replace(/\(((?:KT|PW|PC|PS)[0-9OQ@]{3})\)/,(_,raw)=>'('+raw.slice(0,2)+raw.slice(2).replace(/[OQ@]/g,'0')+')');
      if(corrected!==name)return {value:corrected,review:true};
    }
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
    const printedColour=codeLines.flatMap(line=>line.match(/\b(?:JW|IW)[0-9OQ]{2}[A-Z]{1,2}\d{3,5}[A-Z]?\b/g)||[])[0];
    if(printedColour)return {value:printedColour,review:true};
    return {value:code,review:!!code};
  }
  function parse(parts) {
    const out=Object.fromEntries(FIELDS.map(id=>[id,'']));out.review=[];
    const normalizePart=value=>('L'+value.slice(1)).replace(/[OQ]/g,'0').replace(/I/g,'1');
    const leftParts=[...upper(parts.left).matchAll(/\b[L1][.,:]?\s*[0-9OQI]{3,6}[A-Z]\b/g)]
      .map(x=>normalizePart(x[0].replace(/[.,:\s]/g,'')));
    const upperPart=upper(parts.partUpper).match(/\b[L1][0-9OQI]{3,6}[A-Z]\b/);
    const rightPart=upper([parts.right,parts.rightAlt].join('\n')).match(/PART\s*NO\s*([L1][0-9OQI]{3,6}[A-Z])/);
    const right=rightPart&&normalizePart(rightPart[1]);
    out.partNo=leftParts[0]||(upperPart&&normalizePart(upperPart[0]))||'';
    if(right&&(leftParts.includes(right)||leftParts.some(x=>x.length===right.length+1&&[...x].some((_,i)=>x.slice(0,i)+x.slice(i+1)===right)))){
      if(out.partNo!==right)out.review.push('partNo');
      out.partNo=right;
    }
    if(right&&out.partNo&&right!==out.partNo)out.review.push('partNo');
    if(/\b1[0-9OQI]{3,6}[A-Z]\b/.test(upper(parts.left)))out.review.push('partNo');
    const id=coilId(parts);out.coilId=id.value;if(id.review)out.review.push('coilId');
    const color=colour(parts.right,{text:parts.rightAlt,colourCodeTight:parts.colourCodeTight,
      colourCodeLine:parts.colourCodeLine,fullText:parts.fullText});out.colour=color.value;if(color.review)out.review.push('colour');
    const fromFull=upper(parts.fullText).match(/\bL[0-9OQI]{3,5}[A-Z]\b/);
    if(out.partNo&&fromFull){
      const full=normalizePart(fromFull[0]);
      if(full.length===out.partNo.length&&full!==out.partNo&&
        [...full].filter((c,i)=>c!==out.partNo[i]).length===1&&
        !right){out.partNo=full;out.review.push('partNo');}
    }
    if(!out.partNo){
      if(fromFull){out.partNo=normalizePart(fromFull[0]);out.review.push('partNo');}}
    const row=upper([parts.weightBand,parts.fullText].filter(Boolean).join('\n')).split(/\n/)
      .find(line=>/\bLBS?\b/.test(line)&&numbers(line,1000,30000).length>=2);
    const rowCandidates=row?numbers(row,1000,30000):[];
    const rowNumbers=rowCandidates.length>=2&&Number(rowCandidates[0])>=5000&&
      Number(rowCandidates[1])>Number(rowCandidates[0])&&
      Number(rowCandidates[1])<Number(rowCandidates[0])*1.25?rowCandidates:[];
    // In low light the small "LBS" print disappears first. The three large
    // columns still give net lb, gross lb and length ft in that order.
    const clearRow=!rowNumbers.length&&upper(parts.weightBand).split(/\n/)
      .map(line=>numbers(line,1000,30000)).find(ns=>ns.length>=3&&
        Number(ns[0])>=5000&&Number(ns[1])>Number(ns[0])&&
        Number(ns[1])<Number(ns[0])*1.25&&Number(ns[2])>=1000&&Number(ns[2])<=10000);
    for(const [source,alt,kind,a,b] of [
      ['net','netAlt','weight','netLb','netKg'],
      ['gross','grossAlt','weight','grossLb','grossKg'],
      ['length','lengthAlt','length','lengthFt','lengthM']]) {
      const fallbackNumber=kind==='weight'?(rowNumbers.length>=2?rowNumbers[source==='net'?0:1]:
        clearRow?.[source==='net'?0:1]):null;
      const fallback=fallbackNumber?fallbackNumber+' LBS':'';
      const alternative=[parts[alt],parts[source+'Wide'],parts[source+'Upper'],parts[source+'MetricTight'],parts[source+'MetricLower'],fallback].filter(Boolean).join('\n');
      const result=pair(parts[source],alternative,kind);
      out[a]=result[0];out[b]=result[1];
      if(result[2])out.review.push(out[b]?b:a);
    }
    // The first full-label OCR pass sometimes reads a metric value that its small crop misses.
    const fullMetric=[...upper([parts.fullText,parts.weightBand,parts.metricBand].join('\n')).matchAll(/([\d,.\s]{3,9})\s*K[G6E]\b/g)]
      .flatMap(match=>numbers(match[1],200,15000));
    for(const [lb,kg] of [['netLb','netKg'],['grossLb','grossKg']])if(out[lb]&&!out[kg]){
      const matches=[...new Set(fullMetric.filter(value=>Math.abs(Number(out[lb])*.45359237-Number(value))<=6))];
      if(matches.length===1){out[kg]=matches[0];out.review.push(kg);}
    }
    if(out.lengthFt&&!out.lengthM){
      const candidates=[...new Set([...upper([parts.fullText,parts.id,parts.weightBand].join('\n')).matchAll(/\b(\d{3,4})\s*M(?:M\b|\b)/g)]
        .map(match=>match[1]).filter(value=>Math.abs(Number(value)-Number(out.lengthFt)*.3048)<=2))];
      if(candidates.length===1){out.lengthM=candidates[0];out.review.push('lengthM');}
    }
    // Flashlight reflections sometimes corrupt only the tiny unit glyph.
    // Accept an independently printed number with a damaged Vg/Vy/¥ unit
    // only when it agrees with the legible large imperial number.
    for(const [field,imperial,factor,limit,sources] of [
      ['netKg','netLb',.45359237,6,[parts.netAlt,parts.netWide,parts.weightBand,parts.metricBand]],
      ['grossKg','grossLb',.45359237,6,[parts.grossAlt,parts.grossWide,parts.weightBand,parts.metricBand]],
      ['lengthM','lengthFt',.3048,2,[parts.lengthAlt,parts.lengthWide,parts.weightBand,parts.metricBand]]
    ])if(out[imperial]&&!out[field]){
      const printed=[...new Set(sources.flatMap(text=>printedMetric(text,field==='lengthM'?'length':'weight')))];
      const candidates=printed.filter(value=>Math.abs(Number(value)-Number(out[imperial])*factor)<=limit);
      if(candidates.length===1){out[field]=candidates[0];out.review.push(field);}
    }
    const oneDigitRepair=(printed,target,factor)=>{
      const candidates=new Set();
      for(let i=0;i<printed.length;i++)for(const digit of '0123456789'){
        if(digit===printed[i]||i===0&&digit==='0')continue;
        const candidate=printed.slice(0,i)+digit+printed.slice(i+1);
        if(Math.abs(Number(candidate)*factor-target)<=.5)candidates.add(candidate);
      }
      return candidates.size===1?[...candidates][0]:'';
    };
    if(out.lengthFt&&!out.lengthM){
      const sourceMetrics=[parts.length,parts.lengthAlt,parts.weightBand,parts.metricBand]
        .map(text=>[...new Set(printedMetric(text,'length'))]);
      const corroborated=[...new Set(sourceMetrics.flat())].filter(value=>
        sourceMetrics.filter(source=>source.includes(value)).length>=2);
      const repairs=corroborated.map(metric=>({metric,ft:oneDigitRepair(out.lengthFt,Number(metric),.3048)}))
        .filter(x=>x.ft&&Math.abs(Number(x.ft)-Number(out.lengthFt))<Number(out.lengthFt)*.2);
      if(repairs.length===1){out.lengthFt=repairs[0].ft;out.lengthM=repairs[0].metric;
        out.review.push('lengthFt','lengthM');}
    }
    if(out.lengthFt&&!out.lengthM){
      const footSources=[parts.length,parts.lengthAlt,parts.weightBand]
        .filter(text=>numbers(text,1000,10000).includes(out.lengthFt)).length;
      const metric=[...new Set(printedMetric(parts.weightBand,'length'))];
      if(footSources>=2&&metric.length===1&&Math.abs(Number(metric[0])-Number(out.lengthFt)*.3048)<=10){
        const corrected=oneDigitRepair(metric[0],Number(out.lengthFt)*.3048,1);
        if(corrected){out.lengthM=corrected;out.review.push('lengthM');}
      }
    }
    // Reject an extra leading digit when the second OCR pass and the net weight corroborate it.
    if(out.netLb&&out.grossLb&&Number(out.grossLb)>Number(out.netLb)*1.5){
      const candidates=readings(parts.grossAlt,'weight').pounds.filter(v=>Number(v)>=Number(out.netLb)&&Number(v)<Number(out.netLb)*1.25);
      if(candidates.length===1){out.grossLb=candidates[0];out.review.push('grossLb');}
      else{out.grossLb='';out.review.push('grossLb');}
    }
    if(out.netLb&&out.grossLb&&Number(out.grossLb)<Number(out.netLb)){
      out.grossLb='';out.review.push('grossLb');
    }
    if(out.netKg&&!out.grossKg&&!out.grossLb){
      const metric=[...new Set(printedMetric(parts.metricBand,'weight'))];
      if(metric.length===2&&metric[0]===out.netKg&&Number(metric[1])>Number(metric[0])&&
        Number(metric[1])<Number(metric[0])*1.25){out.grossKg=metric[1];out.review.push('grossKg');}
    }
    out.review=[...new Set(out.review)];
    return out;
  }
  return {parse};
});

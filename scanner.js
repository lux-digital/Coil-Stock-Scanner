/* Client-side scanner: the photograph never leaves this browser. */
(function () {
  'use strict';
  const core = CoilCore;
  const $ = id => document.getElementById(id);
  const input = $('imageInput'), preview = $('preview'), scan = $('scanButton'), results = $('resultsCard');
  const progress = $('progressArea'), bar = $('progressBar'), status = $('progressText');
  const fullCanvas = document.createElement('canvas'), smallCanvas = document.createElement('canvas');
  let image = null, url = null, worker = null;
  const blank = () => Object.fromEntries(core.FIELD_IDS.map(id => [id, '']));
  function imageData(image, max) {
    const ratio = Math.min(1, max / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = max === 2400 ? fullCanvas : smallCanvas;
    canvas.width = Math.round(image.naturalWidth * ratio);
    canvas.height = Math.round(image.naturalHeight * ratio);
    const context = canvas.getContext('2d', {willReadFrequently:true});
    context.drawImage(image,0,0,canvas.width,canvas.height);
    return context.getImageData(0,0,canvas.width,canvas.height);
  }
  function toCanvas(data) {
    const canvas=document.createElement('canvas');canvas.width=data.width;canvas.height=data.height;
    canvas.getContext('2d').putImageData(new ImageData(data.data,data.width,data.height),0,0);
    return canvas;
  }
  function progressTo(message,percent) {status.textContent=message;bar.style.width=percent+'%';}
  input.addEventListener('change', () => {
    const file=input.files[0];if(!file)return;
    if(url)URL.revokeObjectURL(url);
    url=URL.createObjectURL(file);image=new Image();image.onload=()=>{
      preview.src=url;$('previewWrapper').style.display='block';results.style.display='none';progress.style.display='none';scan.disabled=false;
    };image.onerror=()=>{progress.style.display='block';progressTo('Cannot open this image. Try a JPEG photo.',0);};image.src=url;
  });
  $('clearButton').addEventListener('click',()=>{
    image=null;input.value='';preview.removeAttribute('src');$('previewWrapper').style.display='none';results.style.display='none';
    progress.style.display='none';if(url)URL.revokeObjectURL(url);url=null;
  });
  $('rescanButton').addEventListener('click',()=>{results.style.display='none';window.scrollTo({top:0,behavior:'smooth'});});
  async function getWorker() {
    if(!worker)worker=Tesseract.createWorker('eng',1,{logger:m=>{
      if(m.status==='recognizing text' && typeof m.progress==='number')bar.style.width=(35+Math.round(m.progress*40))+'%';
    }}).catch(e=>{worker=null;throw e;});
    return worker;
  }
  const compact=s=>String(s||'').toUpperCase().replace(/[|]/g,'I').replace(/[“”]/g,'"').replace(/[‘’]/g,"'");
  const code=s=>compact(s).replace(/[^A-Z0-9]/g,'');
  function number(s,min=0,max=Infinity) {
    const t=compact(s).replace(/[OQD]/g,'0').replace(/[IL|]/g,'1').replace(/[SB]/g,'8');
    const matches=t.match(/\d{1,2}\s*[, .]\s*\d{3}|\d{3,5}/g)||[];
    return matches.map(m=>m.replace(/\D/g,'')).find(n=>Number(n)>=min&&Number(n)<=max)||'';
  }
  function parseWeight(text,kind='weight') {
    const lines=compact(text).split(/\n/).map(x=>x.trim()).filter(Boolean);
    const min=kind==='length'?100:500,max=kind==='length'?10000:30000;
    const pounds=lines.map(x=>!/(?:K[G6]|\bM\b)/.test(x)?number(x,min,max):'').find(Boolean)||'';
    const kg=lines.map(x=>/(?:K[G6]|\bM\b)/.test(x)?number(x,kind==='length'?30:200,kind==='length'?4000:15000):'').find(Boolean)||'';
    return [pounds,kg];
  }
  function parse(parts) {
    const out=blank();let lines=compact(parts.left).split(/\n/).map(x=>x.trim());
    const candidates=lines.flatMap(x=>x.match(/\bL[0-9OQI]{3,6}[A-Z]\b/g)||[]);
    if(candidates.length)out.partNo=candidates[0].replace(/[OQ]/g,'0').replace(/I/g,'1');
    const right=compact(parts.right).split(/\n/).map(x=>x.trim()).filter(Boolean);
    const colorLine=right.find(x=>/(?:HEMLOCK|ONYX|SUEDE|CHERRY|CEDAR|DRIFTWOOD|CYPRESS|JW\d{2}[A-Z0-9]{4,})/.test(x))||
      right.find(x=>/(?:CSM[_\s]*CLR|CSM[_\s]*CIR|COLOUR NAME)/.test(x)&&x.length>15);
    if(colorLine){
      out.colour=colorLine.replace(/^.*?(?=HEMLOCK|BLACK|SUEDE|CLASSIC|PVDF|DRIFTWOOD|JW\d{2})/,'')
        .replace(/\s*(?:COATG|COATING|150\s*G\/M).*$/,'').replace(/[\/|\s-]+$/,'').replace(/\s+/g,' ').trim();
      if(out.colour.length>40||out.colour.length<4)out.colour='';
    }
    [out.netLb,out.netKg]=parseWeight(parts.net);
    [out.grossLb,out.grossKg]=parseWeight(parts.gross);
    [out.lengthFt,out.lengthM]=parseWeight(parts.length,'length');
    const ids=compact((parts.barcodeText||'')+'\n'+parts.id).match(/\b[A-Z0-9]{6,10}\b/g)||[];
    const valid=ids.find(x=>/^[A-Z][A-Z0-9]{5,8}$/.test(x)&&/\d/.test(x)&&!/^COIL/.test(x));
    if(valid)out.coilId=valid;
    return out;
  }
  function check(data) {
    const messages=[],bad=new Set(),confirmed=new Set(),numeric=id=>Number(data[id]);
    for(const [a,b,f,name] of [['netLb','netKg',.45359237,'Net weight'],['grossLb','grossKg',.45359237,'Gross weight'],['lengthFt','lengthM',.3048,'Length']]) {
      if(!data[a]||!data[b]){bad.add(a);bad.add(b);continue;}
      if(Math.abs(numeric(a)*f-numeric(b))>Math.max(2,numeric(b)*.015)){
        bad.add(a);bad.add(b);messages.push(name+' units do not agree.');
      }else{confirmed.add(a);confirmed.add(b);}
    }
    if(data.netLb&&data.grossLb&&numeric('netLb')>numeric('grossLb')) {
      bad.add('netLb');bad.add('grossLb');messages.push('Gross weight is below net weight.');
    }
    for(const id of core.FIELD_IDS) {
      const el=$(id);el.value=data[id]||'';el.classList.toggle('good',confirmed.has(id)&&!bad.has(id));
      el.classList.toggle('warning',bad.has(id)||!data[id]||!confirmed.has(id));
    }
    $('validation').replaceChildren(...messages.map(message=>{
      const div=document.createElement('div');div.className='check warning';div.textContent='⚠ '+message;return div;
    }));
    const missing=core.FIELD_IDS.filter(id=>!data[id]).length;
    const confidence=$('overallConfidence');
    confidence.textContent=bad.size||missing?'⚠ Check Fields':'⚠ Review Text';
    confidence.style.background='#fff3d8';confidence.style.color='#9a5a00';
  }
  results.querySelectorAll('input').forEach(el=>el.addEventListener('input',()=>{
    const values=Object.fromEntries(core.FIELD_IDS.map(id=>[id,$(id).value.trim()]));check(values);
  }));
  async function recognizeRegion(ocr,canvas,rect) {
    await ocr.setParameters({tessedit_pageseg_mode:'6',user_defined_dpi:'300'});
    return (await ocr.recognize(canvas,{rectangle:{left:Math.round(rect[0]*canvas.width),top:Math.round(rect[1]*canvas.height),width:Math.round(rect[2]*canvas.width),height:Math.round(rect[3]*canvas.height)}})).data.text;
  }
  scan.addEventListener('click',async()=>{
    if(!image)return;scan.disabled=true;progress.style.display='block';results.style.display='none';progressTo('Finding the blue label...',8);
    try {
      if(typeof Tesseract==='undefined')throw new Error('OCR library did not load. Check the internet connection.');
      const small=imageData(image,640),found=core.detectLabel(small);
      if(!found)throw new Error('The blue label could not be found. Move closer, keep the entire label visible, and try again.');
      const full=imageData(image,2400),corners=found.corners.map(p=>({x:p.x*full.width/small.width,y:p.y*full.height/small.height}));
      let label=core.warp(full,corners),ocr=await getWorker();progressTo('Checking label orientation...',25);
      // The blue border establishes the horizontal axis; OCR establishes which end is the top.
      await ocr.setParameters({tessedit_pageseg_mode:'6',user_defined_dpi:'300'});
      const quick=toCanvas(label),half=toCanvas(core.rotate(label,2));
      const first=(await ocr.recognize(quick)).data.text;
      const second=(await ocr.recognize(half)).data.text;
      if(core.orientationScore(second)>core.orientationScore(first))label=core.rotate(label,2);
      const straight=toCanvas(label),enhanced=toCanvas(core.enhance(label));
      $('straightenedPreview').src=straight.toDataURL('image/jpeg',.86);
      progressTo('Reading printed fields...',55);
      const regions={
        left:[.025,.14,.44,.25],right:[.61,.33,.38,.25],
        net:[.025,.53,.195,.14],gross:[.22,.53,.195,.14],
        length:[.405,.53,.165,.14],id:[.33,.62,.33,.16]
      };
      const parts={};for(const [key,rect] of Object.entries(regions))parts[key]=await recognizeRegion(ocr,enhanced,rect);
      await ocr.setParameters({tessedit_pageseg_mode:'7'});
      parts.barcodeText=(await ocr.recognize(enhanced,{rectangle:{left:Math.round(enhanced.width*.23),top:Math.round(enhanced.height*.84),width:Math.round(enhanced.width*.40),height:Math.round(enhanced.height*.055)}})).data.text;
      if(typeof BarcodeDetector!=='undefined'){
        try {
          const formats=await BarcodeDetector.getSupportedFormats();
          if(formats.includes('code_39')){
            const codes=await new BarcodeDetector({formats:['code_39']}).detect(straight);
            parts.barcodeText=(codes.find(x=>/^[A-Z][A-Z0-9]{5,8}$/.test(x.rawValue.replace(/\*/g,'')))?.rawValue||parts.barcodeText);
          }
        }catch(e){console.debug('Barcode reader unavailable',e);}
      }
      const values=parse(parts);
      $('rawText').textContent=Object.entries(parts).map(([name,value])=>name.toUpperCase()+':\n'+value).join('\n');
      check(values);results.style.display='block';progressTo('Scan complete. Please check the fields against the image.',100);
      results.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){console.error(error);progressTo(error.message||'Could not scan this photo.',0);}
    finally{scan.disabled=false;}
  });
})();

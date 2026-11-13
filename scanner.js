/* Client-side scanner: the photograph never leaves this browser. */
(function () {
  'use strict';
  const core = CoilCore;
  const findLabel=frame=>core.refineShadowBoundary(frame,core.refineBorderCorners(frame,core.detectLabel(frame)));
  const $ = id => document.getElementById(id);
  const input = $('imageInput'), preview = $('preview'), scan = $('scanButton'), results = $('resultsCard');
  const progress = $('progressArea'), bar = $('progressBar'), status = $('progressText');
  const fullCanvas = document.createElement('canvas'), smallCanvas = document.createElement('canvas');
  let image = null, url = null, worker = null, stream = null, cameraTimer = null, captureTimer = null, scanning = false, pairing = false;
  let lastLiveImage=null, lastLiveFound=null, capturedLive=null, alternatePhotos=[];
  let report={startedAt:new Date().toISOString(),source:'none',events:[],images:{},stage:'ready'};
  function event(name,details={}) {report.events.push({at:new Date().toISOString(),name,...details});if(report.events.length>240)report.events.shift();}
  function showReportButton(){ $('saveLiveReport').hidden=false;$('reportHint').hidden=false; }
  function resetReport(source){capturedLive=null;alternatePhotos=[];$('secondPreviewDetails').hidden=true;$('secondPreview').removeAttribute('src');
    $('thirdPreviewDetails').hidden=true;$('thirdPreview').removeAttribute('src');
    report={startedAt:new Date().toISOString(),source,events:[],images:{},stage:'ready'};showReportButton();event('new-test');}
  function frameImage(frame,found,caption='Detection preview') {
    const c=toCanvas(frame),x=c.getContext('2d');
    if(found){const corners=found.corners;x.lineWidth=5;x.lineJoin='round';x.strokeStyle='#ffcc32';x.beginPath();x.moveTo(corners[0].x,corners[0].y);
      for(const p of corners.slice(1))x.lineTo(p.x,p.y);x.closePath();x.stroke();}
    x.fillStyle='rgba(0,0,0,.78)';x.fillRect(0,0,c.width,35);x.fillStyle='#fff';x.font='16px sans-serif';x.fillText(caption,10,24);
    return c.toDataURL('image/jpeg',.86);
  }
  function maskImage(frame,found){
    const mask=core.blueMask(frame,!!found?.shadowMask),data=new Uint8ClampedArray(frame.width*frame.height*4);
    for(let i=0;i<mask.length;i++){const n=4*i;data[n]=mask[i]?35:25;data[n+1]=mask[i]?225:25;data[n+2]=mask[i]?236:25;data[n+3]=255;}
    return toCanvas({data,width:frame.width,height:frame.height}).toDataURL('image/png');
  }
  async function downloadReport(){
    try{
      if(stream&&video.videoWidth){const frame=imageData(video,640);lastLiveImage=frame;lastLiveFound=findLabel(frame);}
      if(lastLiveImage){report.images['camera-boundary.jpg']=frameImage(lastLiveImage,lastLiveFound,report.stage);
        report.images['blue-pixel-mask.png']=maskImage(lastLiveImage,lastLiveFound);}
      if(image&&!report.images['original-frame.jpg'])report.images['original-frame.jpg']=toCanvas(imageData(image,2400)).toDataURL('image/jpeg',.86);
      const metadata={version:'5',exportedAt:new Date().toISOString(),source:report.source,startedAt:report.startedAt,stage:report.stage,
        browser:navigator.userAgent,screen:{width:screen.width,height:screen.height,devicePixelRatio:devicePixelRatio},
        viewport:{width:innerWidth,height:innerHeight},
        camera:report.camera||null,capture:report.capture||null,secondary:report.secondary||null,
        third:report.third||null,comparison:report.comparison||null,
        events:report.events,detection:report.detection||null,
        orientation:report.orientation||null,ocr:report.ocr||null,parsed:report.parsed||null,error:report.error||null,
        displayedFields:Object.fromEntries(core.FIELD_IDS.map(id=>[id,$(id).value]))};
      const files=[['README.txt','Coil Scanner test report. Attach this ZIP to the chat. Photos and OCR results stayed on the device until you downloaded this file.\n'],
        ['diagnostics.json',JSON.stringify(metadata,null,2)],['raw-ocr.txt',$('rawText').textContent||'No OCR result yet.']];
      for(const [name,dataURL] of Object.entries(report.images))files.push([name,CoilDiagnostics.dataURLBytes(dataURL)]);
      const blob=CoilDiagnostics.zip(files),downloadURL=URL.createObjectURL(blob),link=document.createElement('a');
      link.href=downloadURL;link.download='coil-scan-test-'+new Date().toISOString().replace(/[:.]/g,'-')+'.zip';document.body.append(link);link.click();link.remove();
      setTimeout(()=>URL.revokeObjectURL(downloadURL),60000);
    }catch(error){console.error(error);alert('Could not create the test report: '+error.message);}
  }
  $('saveLiveReport').addEventListener('click',downloadReport);
  $('saveResultReport').addEventListener('click',downloadReport);
  function imageData(image, max) {
    const width=image.naturalWidth||image.videoWidth||image.width, height=image.naturalHeight||image.videoHeight||image.height;
    const ratio = Math.min(1, max / Math.max(width, height));
    const canvas = max === 2400 ? fullCanvas : smallCanvas;
    canvas.width = Math.round(width * ratio);
    canvas.height = Math.round(height * ratio);
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
    stopCamera();
    const file=input.files[0];if(!file)return;
    resetReport('photo-picker');event('photo-selected',{type:file.type,bytes:file.size});
    if(url)URL.revokeObjectURL(url);
    url=URL.createObjectURL(file);image=new Image();image.onload=()=>{
      preview.src=url;$('previewWrapper').style.display='block';results.style.display='none';progress.style.display='none';scan.disabled=false;
    };image.onerror=()=>{progress.style.display='block';progressTo('Cannot open this image. Try a JPEG photo.',0);};image.src=url;
  });
  $('clearButton').addEventListener('click',()=>{
    stopCamera();
    image=null;input.value='';preview.removeAttribute('src');$('previewWrapper').style.display='none';results.style.display='none';
    progress.style.display='none';if(url)URL.revokeObjectURL(url);url=null;
    resetReport('cleared');
  });
  $('rescanButton').addEventListener('click',()=>{results.style.display='none';window.scrollTo({top:0,behavior:'smooth'});});
  async function getWorker() {
    if(!worker)worker=Tesseract.createWorker('eng',1,{logger:m=>{
      if(m.status==='recognizing text' && typeof m.progress==='number')bar.style.width=(35+Math.round(m.progress*40))+'%';
    }}).catch(e=>{worker=null;throw e;});
    return worker;
  }
  function check(data) {
    const messages=[],bad=new Set(),confirmed=new Set(),numeric=id=>Number(data[id]);
    if(report.capture?.mode==='automatic-reach')messages.push('Overhead photo used the best available frame. Check every reading against the image.');
    if(report.comparison?.excludedShots?.length)messages.push('A photo could not be matched to the same label. Check the coil ID and part number.');
    else if(report.secondary?.identityMismatch)messages.push('The two photos may show different labels. Only the first was used.');
    const conflicts=report.comparison?.conflicts||report.secondary?.conflicts||[];
    for(const field of conflicts){
      if(field==='identity')continue;
      bad.add(field);messages.push('Photos disagree on '+$(field).previousElementSibling.textContent.toLowerCase()+'.');
    }
    for(const id of data.review||[]){bad.add(id);messages.push('Check '+$(id).previousElementSibling.textContent.toLowerCase()+' against the label.');}
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
  async function recognizeRegion(ocr,canvas,rect,mode='6',whitelist=null) {
    const parameters={tessedit_pageseg_mode:mode,user_defined_dpi:'300'};
    if(whitelist!==null)parameters.tessedit_char_whitelist=whitelist;
    await ocr.setParameters(parameters);
    return (await ocr.recognize(canvas,{rectangle:{left:Math.round(rect[0]*canvas.width),top:Math.round(rect[1]*canvas.height),width:Math.round(rect[2]*canvas.width),height:Math.round(rect[3]*canvas.height)}})).data.text;
  }
  async function recognizeEnlarged(ocr,canvas,rect,scale=3) {
    const crop=document.createElement('canvas');
    crop.width=Math.round(canvas.width*rect[2]*scale);crop.height=Math.round(canvas.height*rect[3]*scale);
    crop.getContext('2d').drawImage(canvas,rect[0]*canvas.width,rect[1]*canvas.height,
      rect[2]*canvas.width,rect[3]*canvas.height,0,0,crop.width,crop.height);
    return (await ocr.recognize(crop)).data.text;
  }
  async function readOtherPhoto(ocr,shot,reference,chosen,needed,slot=2) {
    const photo=new Image();
    await new Promise((resolve,reject)=>{photo.onload=resolve;photo.onerror=()=>reject(new Error('Other photo could not be opened.'));photo.src=shot.dataURL;});
    const small=imageData(photo,640),detected=findLabel(small);
    const adjusted=detected?.shadowBorderRefined?{found:detected}:
      core.reconcileCaptureCorners(detected,shot.live?.found,small.width,small.height,shot.live?.width,shot.live?.height);
    let boundary=adjusted.found;
    if(!core.labelReady(boundary,small.width,small.height)&&
      core.labelReady(shot.live?.found,shot.live?.width,shot.live?.height))
      boundary={...shot.live.found,corners:shot.live.found.corners.map(p=>({
        x:p.x*small.width/shot.live.width,y:p.y*small.height/shot.live.height}))};
    if(!core.labelReady(boundary,small.width,small.height))throw new Error('Other photo has no complete label.');
    const found=core.alignCorners(reference,boundary),full=imageData(photo,2400);
    const corners=found.corners.map(p=>({x:p.x*full.width/small.width,y:p.y*full.height/small.height}));
    let label=core.warp(full,corners);if(chosen)label=core.rotate(label,2);
    const straight=toCanvas(label),enhanced=toCanvas(core.enhance(label));
    const straightURL=straight.toDataURL('image/jpeg',.86);
    report.images[slot===3?'third-straightened-label.jpg':'alternate-straightened-label.jpg']=straightURL;
    $(slot===3?'thirdPreview':'secondPreview').src=straightURL;
    $(slot===3?'thirdPreviewDetails':'secondPreviewDetails').hidden=false;
    const regions={},parts={},need=new Set(needed);
    const read=async(key,canvas,rect,psm='6',whitelist='')=>{
      regions[key]=rect;parts[key]=await recognizeRegion(ocr,canvas,rect,psm,whitelist);
    };
    // Two small identity crops guard against combining adjacent coils.
    await read('left',enhanced,[.025,.14,.44,.25]);
    await read('idLine',straight,[.37,.615,.30,.125],'8','ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789');
    if(need.has('partNo')){
      await ocr.setParameters({tessedit_pageseg_mode:'8',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
      regions.partUpper=[.045,.215,.23,.09];parts.partUpper=await recognizeEnlarged(ocr,straight,regions.partUpper);
    }
    if(need.has('coilId')){
      await ocr.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
      regions.barcodeLine=[.31,.845,.27,.045];parts.barcodeLine=await recognizeEnlarged(ocr,straight,regions.barcodeLine);
    }
    if(need.has('colour')){
      await read('right',enhanced,[.57,.37,.40,.35]);
      await read('rightAlt',straight,[.57,.37,.40,.35]);
      await ocr.setParameters({tessedit_pageseg_mode:'8',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
      regions.colourCodeLine=[.675,.59,.115,.065];parts.colourCodeLine=await recognizeEnlarged(ocr,straight,regions.colourCodeLine);
    }
    for(const [key,fields,rect] of [
      ['net',['netLb','netKg'],[.04,.53,.20,.14]],
      ['gross',['grossLb','grossKg'],[.22,.53,.22,.14]],
      ['length',['lengthFt','lengthM'],[.42,.53,.20,.14]]
    ])if(fields.some(field=>need.has(field))){
      await read(key,enhanced,rect);await read(key+'Alt',straight,rect);
    }
    let values=CoilParser.parse(parts);
    if([...need].some(field=>!values[field]&&['netLb','netKg','grossLb','grossKg','lengthFt','lengthM'].includes(field))){
      await read('weightBand',straight,[.015,.52,.68,.23]);
      await ocr.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:''});
      regions.metricBand=[.06,.61,.52,.07];parts.metricBand=await recognizeEnlarged(ocr,straight,regions.metricBand);
      values=CoilParser.parse(parts);
    }
    // The small kg line can be lost when OCR sees the bold pounds and barcode
    // in the same crop. Revisit only missing kg values on the other frame.
    for(const [field,key,rect] of [
      ['netKg','netMetricTight',[.05,.605,.17,.05]],
      ['grossKg','grossMetricTight',[.25,.605,.15,.05]]
    ])if(need.has(field)&&!values[field]){
      await ocr.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:''});
      regions[key]=rect;parts[key]=await recognizeEnlarged(ocr,straight,rect);
      values=CoilParser.parse(parts);
    }
    return {regions,parts,values,found:{corners:found.corners,coverage:found.coverage}};
  }
  async function runScan(){
    if(!image||scanning)return;scanning=true;scan.disabled=true;progress.style.display='block';results.style.display='none';progressTo('Finding the blue label...',8);
    report.stage='detecting';event('scan-start',{imageWidth:image.naturalWidth,imageHeight:image.naturalHeight});
    try {
      if(typeof Tesseract==='undefined')throw new Error('OCR library did not load. Check the internet connection.');
      let found,chosen,values,parts,regions,ocr;
      { // Release the large primary image buffers before opening the second photo.
      const small=imageData(image,640),rawDetection=core.detectLabel(small),detected=core.refineShadowBoundary(small,core.refineBorderCorners(small,rawDetection));
      const adjusted=detected?.shadowBorderRefined?{found:detected,corrected:[]}:
        core.reconcileCaptureCorners(detected,capturedLive?.found,small.width,small.height,capturedLive?.width,capturedLive?.height);
      found=adjusted.found;
      report.detection={imageWidth:small.width,imageHeight:small.height,corners:found?.corners||null,
        originalCorners:rawDetection?.corners||null,borderRefined:!!detected?.borderRefined,
        shadowBorderRefined:!!detected?.shadowBorderRefined,correctedCorners:adjusted.corrected,
        coverage:found?.coverage||null,fill:found?.fill||null,ratio:found?.ratio||null,
        shadowMask:!!found?.shadowMask};
      if(adjusted.corrected.length)event('crop-corner-corrected',{indices:adjusted.corrected});
      report.images['scan-blue-mask.png']=maskImage(small,found);
      report.images['scan-boundary.jpg']=frameImage(small,found,'Boundary used for OCR');
      if(!found)throw new Error('The blue label could not be found. Move closer, keep the entire label visible, and try again.');
      const full=imageData(image,2400),corners=found.corners.map(p=>({x:p.x*full.width/small.width,y:p.y*full.height/small.height}));
      let label=core.warp(full,corners);ocr=await getWorker();progressTo('Checking label orientation...',25);report.stage='orientation';
      // The blue border establishes the horizontal axis; OCR establishes which end is the top.
      await ocr.setParameters({tessedit_pageseg_mode:'6',user_defined_dpi:'300',tessedit_char_whitelist:''});
      const quick=toCanvas(label),half=toCanvas(core.rotate(label,2));
      const first=(await ocr.recognize(quick)).data.text;
      const second=(await ocr.recognize(half)).data.text;
      chosen=core.orientationScore(second)>core.orientationScore(first)?180:0;
      report.orientation={score0:core.orientationScore(first),score180:core.orientationScore(second),chosenDegrees:chosen,text0:first,text180:second};
      if(chosen)label=core.rotate(label,2);
      const straight=toCanvas(label),enhanced=toCanvas(core.enhance(label));
      report.images['straightened-label.jpg']=straight.toDataURL('image/jpeg',.9);
      report.images['enhanced-for-ocr.jpg']=enhanced.toDataURL('image/jpeg',.86);
      $('straightenedPreview').src=straight.toDataURL('image/jpeg',.86);
      progressTo('Reading printed fields...',55);
      regions={
        left:[.025,.14,.44,.25],right:[.57,.37,.40,.35],
        net:[.04,.53,.20,.14],gross:[.22,.53,.22,.14],
        length:[.42,.53,.20,.14],id:[.33,.62,.33,.16],
        idTight:[.405,.612,.23,.098]
      };
      parts={fullText:chosen?second:first};for(const [key,rect] of Object.entries(regions)){
        if(key!=='idTight')parts[key]=await recognizeRegion(ocr,enhanced,rect);
      }
      // The original colour and kilogram print is sometimes sharper than the contrast-enhanced copy.
      for(const key of ['right','net','gross','length'])parts[key+'Alt']=await recognizeRegion(ocr,straight,regions[key]);
      await ocr.setParameters({tessedit_pageseg_mode:'7'});
      parts.barcodeText=(await ocr.recognize(enhanced,{rectangle:{left:Math.round(enhanced.width*.23),top:Math.round(enhanced.height*.84),width:Math.round(enhanced.width*.40),height:Math.round(enhanced.height*.055)}})).data.text;
      if(typeof BarcodeDetector!=='undefined'){
        try {
          const formats=await BarcodeDetector.getSupportedFormats();
          if(formats.includes('code_39')){
            const codes=await new BarcodeDetector({formats:['code_39']}).detect(straight);
            const decoded=codes.find(x=>/^[A-Z][A-Z0-9]{5,8}$/.test(x.rawValue.replace(/\*/g,'')))?.rawValue.replace(/\*/g,'');
            if(decoded){parts.barcodeDecoded=decoded;parts.barcodeText=decoded;}
          }
        }catch(e){console.debug('Barcode reader unavailable',e);}
      }
      await ocr.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
      parts.idTight=(await ocr.recognize(straight,{rectangle:{left:Math.round(straight.width*regions.idTight[0]),top:Math.round(straight.height*regions.idTight[1]),
        width:Math.round(straight.width*regions.idTight[2]),height:Math.round(straight.height*regions.idTight[3])}})).data.text;
      parts.idUpscaled=await recognizeEnlarged(ocr,straight,[.365,.595,.27,.105]);
      await ocr.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:''});
      parts.lengthMetricTight=await recognizeEnlarged(ocr,straight,[.47,.585,.085,.043]);
      await ocr.setParameters({tessedit_pageseg_mode:'8'});
      parts.colourCodeTight=await recognizeEnlarged(ocr,straight,[.675,.595,.095,.07]);
      await ocr.setParameters({tessedit_char_whitelist:''});
      values=CoilParser.parse(parts);
      const missingNumbers=()=>['netLb','netKg','grossLb','grossKg','lengthFt','lengthM']
        .some(key=>!values[key])||(values.netLb&&values.grossLb&&Number(values.grossLb)<Number(values.netLb));
      if(missingNumbers()){
        await ocr.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});
        regions.weightBand=[.015,.52,.68,.23];
        parts.weightBand=await recognizeRegion(ocr,straight,regions.weightBand);
        values=CoilParser.parse(parts);
      }
      // A second layout puts the metric row lower. Read a wider strip on the
      // original colour image when a number was missed or conflicts with its pair.
      if(missingNumbers()){
        await ocr.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});
        const wide={netWide:[.035,.58,.21,.18],grossWide:[.225,.58,.22,.18],lengthWide:[.42,.58,.21,.18]};
        for(const [key,rect] of Object.entries(wide)){
          const prefix=key.replace('Wide','');
          if(values[prefix+'Lb']&&values[prefix+'Kg']||prefix==='length'&&values.lengthFt&&values.lengthM)continue;
          regions[key]=rect;parts[key]=await recognizeRegion(ocr,straight,rect);
        }
        values=CoilParser.parse(parts);
      }
      for(const [field,region] of [['netLb',[.045,.525,.18,.065]],
        ['grossLb',[.245,.525,.20,.065]],['lengthFt',[.42,.52,.18,.065]]])if(!values[field]){
        await ocr.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:''});
        const key=field==='lengthFt'?'lengthUpper':field==='netLb'?'netUpper':'grossUpper';
        regions[key]=region;parts[key]=await recognizeEnlarged(ocr,straight,region,2);
        values=CoilParser.parse(parts);
      }
      if(!values.coilId){
        await ocr.setParameters({tessedit_pageseg_mode:'6',tessedit_char_whitelist:''});
        regions.idRaw=[.33,.62,.33,.16];
        parts.idRaw=await recognizeEnlarged(ocr,straight,regions.idRaw,2);
        values=CoilParser.parse(parts);
      }
      // Spend an extra OCR pass only when a key field was not read from the main crops.
      if(!values.coilId){
        await ocr.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
        regions.idWide=[.39,.60,.26,.12];
        parts.idWide=await recognizeEnlarged(ocr,straight,regions.idWide);
        values=CoilParser.parse(parts);
      }
      for(const [field,region] of [['netKg',[.05,.605,.17,.05]],['grossKg',[.25,.605,.15,.05]]])if(!values[field]){
        await ocr.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:''});
        const key=field==='netKg'?'netMetricTight':'grossMetricTight';
        regions[key]=region;parts[key]=await recognizeEnlarged(ocr,straight,region);
        values=CoilParser.parse(parts);
      }
      for(const [field,region] of [['netKg',[.05,.655,.15,.07]],['grossKg',[.28,.675,.15,.055]]])if(!values[field]){
        await ocr.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:''});
        const key=field==='netKg'?'netMetricLower':'grossMetricLower';
        regions[key]=region;parts[key]=await recognizeEnlarged(ocr,straight,region);
        values=CoilParser.parse(parts);
      }
      if(!values.partNo){
        await ocr.setParameters({tessedit_pageseg_mode:'8',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
        regions.partUpper=[.045,.215,.23,.09];
        parts.partUpper=await recognizeEnlarged(ocr,straight,regions.partUpper);
        values=CoilParser.parse(parts);
      }
      if(!values.coilId||values.review.includes('coilId')){
        // A whole-word pass separates Z from 7 on the large printed ID.
        await ocr.setParameters({tessedit_pageseg_mode:'8',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
        regions.idLine=[.37,.615,.30,.125];
        parts.idLine=await recognizeEnlarged(ocr,straight,regions.idLine,2);
        values=CoilParser.parse(parts);
      }
      if(!values.coilId){
        // The human-readable code beneath the barcode is a separate print of the ID.
        await ocr.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
        regions.barcodeLine=[.31,.845,.27,.045];
        parts.barcodeLine=await recognizeEnlarged(ocr,straight,regions.barcodeLine);
        values=CoilParser.parse(parts);
      }
      if(values.review.includes('colour')&&/KNOTTY|CHAMPAGNE/.test(parts.right||'')){
        await ocr.setParameters({tessedit_pageseg_mode:'8',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
        regions.colourCodeLine=[.675,.59,.115,.065];
        parts.colourCodeLine=await recognizeEnlarged(ocr,straight,regions.colourCodeLine);
        values=CoilParser.parse(parts);
      }
      if(!values.netKg||!values.grossKg||!values.lengthM){
        // Small metric type can read better as one sparse strip than as a tall
        // crop mixed with the bold weight row and the barcode underneath.
        await ocr.setParameters({tessedit_pageseg_mode:'11',tessedit_char_whitelist:''});
        regions.metricBand=[.06,.61,.52,.07];
        parts.metricBand=await recognizeEnlarged(ocr,straight,regions.metricBand);
        values=CoilParser.parse(parts);
      }
      }
      let secondaryParts=null,thirdParts=null;
      const needed=CoilParser.retryFields(values);
      if(alternatePhotos[0]&&needed.length){
        const readings=[{values,parts,shotNumber:report.capture.primaryShot}];
        let thirdNeeded=[];
        progressTo('Checking uncertain fields in the other photo...',86);report.stage='second-photo';
        try{
          const second=await readOtherPhoto(ocr,alternatePhotos[0],found,chosen,needed);
          readings.push({values:second.values,parts:second.parts,shotNumber:alternatePhotos[0].shotNumber});
          const merged=CoilParser.mergeSnapshots(values,second.values,parts);
          values=merged.values;secondaryParts=second.parts;
          report.secondary={needed,shotNumber:alternatePhotos[0].shotNumber,regions:second.regions,parts:second.parts,parsed:second.values,
            used:merged.used,conflicts:merged.conflicts,identityMismatch:merged.identityMismatch,
            corners:second.found.corners};
          event('second-photo-read',{used:merged.used,conflicts:merged.conflicts,identityMismatch:merged.identityMismatch});
          const unconfirmed=['coilId','partNo','netKg','grossKg','netLb','grossLb','lengthM','lengthFt','colour']
            .filter(field=>needed.includes(field)&&!!readings[0].values[field]!==!!second.values[field]);
          thirdNeeded=[...new Set([...core.FIELD_IDS.filter(field=>!values[field]),
            ...merged.conflicts.filter(field=>core.FIELD_IDS.includes(field)),
            ...(merged.identityMismatch?['partNo','coilId']:[]),...unconfirmed.slice(0,3)])];
        }catch(error){report.secondary={needed,error:error.message};event('second-photo-failed',{message:error.message});
          thirdNeeded=needed;}
        if(alternatePhotos[1]&&thirdNeeded.length){
          progressTo('Resolving fields with the third photo...',92);report.stage='third-photo';
          try{
            const third=await readOtherPhoto(ocr,alternatePhotos[1],found,chosen,thirdNeeded,3);
            readings.push({values:third.values,parts:third.parts,shotNumber:alternatePhotos[1].shotNumber});
            thirdParts=third.parts;
            const comparison=CoilParser.mergeThreeSnapshots(readings);
            values=comparison.values;
            report.third={needed:thirdNeeded,shotNumber:alternatePhotos[1].shotNumber,regions:third.regions,parts:third.parts,parsed:third.values,
              corners:third.found.corners};
            report.comparison={used:comparison.used,conflicts:comparison.conflicts,
              selectedShots:comparison.selectedShots,excludedShots:comparison.excludedShots,
              identityMismatch:comparison.identityMismatch};
            event('third-photo-read',report.comparison);
          }catch(error){report.third={needed:thirdNeeded,error:error.message};event('third-photo-failed',{message:error.message});}
        }else if(alternatePhotos[1])report.third={needed:[],skipped:'Two photos settled all missing and disputed fields.'};
      }else if(alternatePhotos.length){report.secondary={needed:[],used:[],skipped:'First photo had no missing or uncertain fields.'};
        if(alternatePhotos[1])report.third={needed:[],skipped:'First photo had no missing or uncertain fields.'};}
      alternatePhotos=[];
      report.ocr={regions,parts};report.parsed=values;report.stage='complete';event('scan-complete');
      $('rawText').textContent=Object.entries(parts).map(([name,value])=>name.toUpperCase()+':\n'+value).join('\n')+
        (secondaryParts?'\n\nOTHER PHOTO:\n'+Object.entries(secondaryParts).map(([name,value])=>name.toUpperCase()+':\n'+value).join('\n'):'')+
        (thirdParts?'\n\nTHIRD PHOTO:\n'+Object.entries(thirdParts).map(([name,value])=>name.toUpperCase()+':\n'+value).join('\n'):'');
      check(values);results.style.display='block';progressTo('Scan complete. Please check the fields against the image.',100);
      results.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){console.error(error);report.error={message:error.message,stack:error.stack};report.stage='failed';event('scan-failed',{message:error.message});progressTo(error.message||'Could not scan this photo.',0);}
    finally{scan.disabled=false;scanning=false;}
  }
  scan.addEventListener('click',runScan);
  const video=$('cameraVideo'),overlay=$('cameraOverlay'),cameraStatus=$('cameraStatus');
  const torchButton=$('torchButton'),torchMessage=$('torchMessage');
  let torchRequested=false,torchActive=false,torchAvailable=false,torchBusy=false;
  let soundContext=null;
  function unlockCaptureSound(){
    try{
      soundContext ||= new (window.AudioContext||window.webkitAudioContext)();
      if(soundContext.state==='suspended')soundContext.resume().catch(()=>{});
    }catch(error){event('capture-sound-unavailable',{name:error.name||'Error'});}
  }
  function captureCue(){
    try{
      if(soundContext?.state==='running'){
        const t=soundContext.currentTime;
        for(const [offset,frequency] of [[0,880],[.13,1175]]){
          const tone=soundContext.createOscillator(),gain=soundContext.createGain();
          tone.type='sine';tone.frequency.value=frequency;
          gain.gain.setValueAtTime(.001,t+offset);
          gain.gain.exponentialRampToValueAtTime(.12,t+offset+.015);
          gain.gain.exponentialRampToValueAtTime(.001,t+offset+.115);
          tone.connect(gain).connect(soundContext.destination);
          tone.start(t+offset);tone.stop(t+offset+.12);
        }
      }
      navigator.vibrate?.(120);
    }catch(error){event('capture-sound-error',{name:error.name||'Error'});}
  }
  function torchNotice(message){torchMessage.textContent=message;torchMessage.hidden=!message;}
  function showTorchState(){
    torchButton.textContent=torchActive?'FLASHLIGHT ON':'FLASHLIGHT OFF';
    torchButton.setAttribute('aria-pressed',String(torchActive));
    torchButton.disabled=!torchAvailable||torchBusy||!stream;
  }
  async function setTorch(track,on){
    if(!track||!torchAvailable||torchBusy)return;
    torchBusy=true;showTorchState();
    try{
      await track.applyConstraints({advanced:[{torch:on}]});
      if(track!==stream?.getVideoTracks()[0]||track.readyState!=='live')return;
      // Some iOS versions report the previous torch setting, so retain the
      // requested state after a successful constraint application.
      torchRequested=on;torchActive=on;
      torchNotice(on?'Flashlight stays on while the camera is open.':'');
      event('flashlight-changed',{on});
    }catch(error){
      if(track===stream?.getVideoTracks()[0]){
        torchNotice('Could not switch the flashlight. Use your phone camera to take a lit photo, then select it below.');
        event('flashlight-error',{name:error.name||'Error',message:error.message||''});
      }
    }finally{torchBusy=false;showTorchState();}
  }
  torchButton.addEventListener('click',()=>{
    const track=stream?.getVideoTracks()[0];
    if(track&&torchAvailable&&!torchBusy)setTorch(track,!torchActive);
  });
  function finishCapture(reason,shots,quality,showCheckFor){
    const primary=shots.reduce((best,shot)=>shot.actualQuality?.detail>best.actualQuality?.detail+5?shot:best);
    const others=shots.filter(shot=>shot!==primary).sort((a,b)=>(b.actualQuality?.detail||0)-(a.actualQuality?.detail||0));
    const [secondary,third]=others;
    const {dataURL,frame,found}=primary;
    capturedLive=primary.live;
    alternatePhotos=others.map(shot=>({dataURL:shot.dataURL,live:shot.live,shotNumber:shot.shotNumber}));
    report.images['original-frame.jpg']=dataURL;
    if(secondary)report.images['alternate-frame.jpg']=secondary.dataURL;
    if(third)report.images['third-frame.jpg']=third.dataURL;
    report.capture={mode:reason,quality,shots:shots.length,primaryQuality:primary.actualQuality,
      alternateQuality:secondary?.actualQuality||null,primaryShot:primary.shotNumber,
      alternateShot:secondary?.shotNumber||null,thirdQuality:third?.actualQuality||null,
      thirdShot:third?.shotNumber||null};
    event('camera-capture',{reason,corners:found?.corners||null,torchActive,quality,shots:shots.length,
      primaryQuality:primary.actualQuality,alternateQuality:secondary?.actualQuality||null,
      thirdQuality:third?.actualQuality||null,primaryShot:primary.shotNumber,
      soundState:soundContext?.state||'unavailable'});
    captureCue(); // The final chime means all available snapshots are saved.
    cameraStatus.textContent=shots.length===3?'✓ Three photos saved. You can lower the phone.':
      secondary?'✓ Two photos saved. You can lower the phone.':'✓ Photo saved. You can lower the phone.';
    if(showCheckFor){
      const displayed=shots.at(-1);
      drawLiveOutline(displayed.found,displayed.frame,true);
      video.pause();
    }
    const finish=()=>{captureTimer=null;
      report.images['camera-boundary.jpg']=frameImage(frame,found,'Captured '+reason);
      report.images['blue-pixel-mask.png']=maskImage(frame,found);
      stopCamera();image=new Image();image.onload=()=>{preview.src=dataURL;$('previewWrapper').style.display='block';runScan();};image.src=dataURL;};
    if(showCheckFor)captureTimer=setTimeout(finish,showCheckFor);else finish();
  }
  function captureFrame(reason, showCheckFor=0,quality=null,saved=null){
    if(!stream||!video.videoWidth||scanning||pairing)return false;
    const frame=saved?.frame||lastLiveImage||imageData(video,640),found=saved?.found||lastLiveFound||findLabel(frame);
    const capture=saved?.canvas||document.createElement('canvas');
    if(!saved){capture.width=video.videoWidth;capture.height=video.videoHeight;capture.getContext('2d').drawImage(video,0,0);}
    if(reason==='automatic'&&found){
      // Check the exact frame we will export, in case the camera delivered a
      // new blurred frame between the small preview and the full-resolution draw.
      const actual=imageData(capture,960),scaled={corners:found.corners.map(p=>({x:p.x*actual.width/frame.width,y:p.y*actual.height/frame.height}))};
      const actualQuality=core.labelDetail(actual,scaled);
      if(actualQuality.detail<110||actualQuality.glare>=.025){
        event('camera-capture-rejected',{previewQuality:quality,actualQuality});
        return false;
      }
      quality={...quality,actualQuality};
    }
    if(reason==='automatic-reach'){
      if(!saved||saved.quality.detail<15||saved.quality.glare>=.025)return false;
      quality={...quality,previewQuality:saved.previewQuality,actualQuality:saved.quality};
    }
    const first={dataURL:capture.toDataURL('image/jpeg',.9),frame,found,shotNumber:1,
      live:found?{found,width:frame.width,height:frame.height}:null,actualQuality:quality?.actualQuality||null};
    report.images['original-frame.jpg']=first.dataURL;
    if(reason==='manual'){finishCapture(reason,[first],quality,showCheckFor);return true;}
    pairing=true;event('camera-first-shot',{reason,quality:first.actualQuality});
    const aimedAt=lastLiveFound||found,started=performance.now();
    const captureAdditional=shotNumber=>{
      if(!stream||!video.videoWidth)return null;
      try{
        const secondFrame=imageData(video,480),secondFound=findLabel(secondFrame);
        if(core.labelReady(secondFound,secondFrame.width,secondFrame.height)&&core.sameLiveLabel(aimedAt,secondFound,.25)){
          const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
          canvas.getContext('2d').drawImage(video,0,0);
          const actual=imageData(canvas,960),scaled={corners:secondFound.corners.map(p=>({x:p.x*actual.width/secondFrame.width,y:p.y*actual.height/secondFrame.height}))};
          const actualQuality=core.labelDetail(actual,scaled);
          if(actualQuality.detail>=15&&actualQuality.glare<.025){
            return {dataURL:canvas.toDataURL('image/jpeg',.9),frame:secondFrame,found:secondFound,shotNumber,
              live:{found:secondFound,width:secondFrame.width,height:secondFrame.height},actualQuality};
          }
        }
      }catch(error){event('camera-additional-shot-error',{shotNumber,message:error.message});}
      return null;
    };
    const trySecond=()=>{
      captureTimer=null;
      if(!stream||!video.videoWidth)return;
      const second=captureAdditional(2);
      if(second){
        event('camera-second-shot',{quality:second.actualQuality});
        captureTimer=setTimeout(()=>tryThird(second),220);return;
      }
      if(performance.now()-started>=1250){event('camera-second-shot-unavailable');finishCapture(reason,[first],quality,showCheckFor);}
      else captureTimer=setTimeout(trySecond,200);
    };
    const tryThird=second=>{
      captureTimer=null;
      if(!stream||!video.videoWidth)return;
      const third=captureAdditional(3);
      if(third){event('camera-third-shot',{quality:third.actualQuality});finishCapture(reason,[first,second,third],quality,showCheckFor);}
      else if(performance.now()-started>=1000){event('camera-third-shot-unavailable');finishCapture(reason,[first,second],quality,showCheckFor);}
      else captureTimer=setTimeout(()=>tryThird(second),150);
    };
    captureTimer=setTimeout(trySecond,500);
    return true;
  }
  $('captureNow').addEventListener('click',()=>{unlockCaptureSound();captureFrame('manual');});
  $('testSound').addEventListener('click',()=>{unlockCaptureSound();captureCue();});
  function stopCamera(){
    if(cameraTimer){clearInterval(cameraTimer);cameraTimer=null;}
    if(captureTimer){clearTimeout(captureTimer);captureTimer=null;}
    if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
    pairing=false;torchAvailable=false;torchActive=false;showTorchState();torchNotice('');
    video.srcObject=null;$('cameraPanel').hidden=true;$('startCamera').hidden=false;
  }
  $('stopCamera').addEventListener('click',()=>{event('camera-stopped');stopCamera();});
  function drawLiveOutline(found,frame,recognized){
    const c=overlay,w=c.clientWidth,h=c.clientHeight;
    if(!w||!h)return;
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
    const ctx=c.getContext('2d');ctx.clearRect(0,0,w,h);
    if(!found)return;
    const scale=Math.min(w/frame.width,h/frame.height),dx=(w-frame.width*scale)/2,dy=(h-frame.height*scale)/2;
    const points=found.corners.map(p=>({x:dx+p.x*scale,y:dy+p.y*scale}));
    ctx.beginPath();ctx.moveTo(points[0].x,points[0].y);
    for(const p of points.slice(1))ctx.lineTo(p.x,p.y);
    ctx.closePath();ctx.lineJoin='round';ctx.lineWidth=4;
    if(recognized){ctx.fillStyle='rgba(0,220,105,.28)';ctx.fill();}
    ctx.strokeStyle=recognized?'#00e477':'#ffd45c';ctx.stroke();
    if(recognized){
      const center=points.reduce((sum,p)=>({x:sum.x+p.x/4,y:sum.y+p.y/4}),{x:0,y:0});
      const r=Math.max(23,Math.min(36,Math.min(w,h)*.075));
      ctx.fillStyle='#00a94f';ctx.beginPath();ctx.arc(center.x,center.y,r,0,Math.PI*2);ctx.fill();
      ctx.strokeStyle='#fff';ctx.lineWidth=7;ctx.lineCap='round';ctx.beginPath();
      ctx.moveTo(center.x-r*.45,center.y);ctx.lineTo(center.x-r*.1,center.y+r*.33);
      ctx.lineTo(center.x+r*.52,center.y-r*.4);ctx.stroke();
    }
  }
  $('startCamera').addEventListener('click',async()=>{
    if(scanning)return;
    resetReport('live-camera');report.stage='camera-starting';
    unlockCaptureSound(); // iOS needs audio enabled directly from the user's tap.
    if(!navigator.mediaDevices?.getUserMedia){cameraStatus.textContent='Live camera is unavailable. Use the photo picker below.';return;}
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
      video.srcObject=stream;await video.play();
      const track=stream.getVideoTracks()[0],settings=track?.getSettings()||{};
      let torchCapability;
      try{torchCapability=track?.getCapabilities?.().torch;}catch(error){console.debug('Flashlight capability unavailable',error);}
      torchAvailable=!!track?.applyConstraints&&(torchCapability===true||Array.isArray(torchCapability)&&torchCapability.includes(true));
      torchActive=false;showTorchState();
      torchNotice(torchAvailable?'':'Flashlight unavailable in this browser or camera. Use your phone camera to take a lit photo, then select it below.');
      report.camera={width:video.videoWidth,height:video.videoHeight,frameRate:settings.frameRate||null,
        facingMode:settings.facingMode||null,torchAvailable};
      report.stage='camera-running';event('camera-started',report.camera);
      $('cameraPanel').hidden=false;$('startCamera').hidden=true;
      if(torchRequested&&torchAvailable)await setTorch(track,true);
      lastLiveImage=null;lastLiveFound=null;
      drawLiveOutline(null,{width:1,height:1},false);
      let stability={last:null,lastSeen:0,steady:0,stableSince:0};
      let reach={last:null,lastSeen:0,firstSeen:0,visible:0},bestReach=null,lastReachSampleAt=0;
      let busy=false,lastFrameAt=0;
      cameraTimer=setInterval(()=>{
        if(busy||scanning||!video.videoWidth)return;busy=true;
        try{
          const started=performance.now(),intervalMs=lastFrameAt?started-lastFrameAt:null;lastFrameAt=started;
          // Live detection only needs a small frame; the captured photo keeps camera resolution.
          const img=imageData(video,480),found=findLabel(img);
          lastLiveImage=img;lastLiveFound=found;
          const c=overlay;
          let acceptable=false,quality=null;
          if(found){
            acceptable=core.labelReady(found,img.width,img.height);
            if(acceptable){
              const detailed=imageData(video,960);
              const scaled={corners:found.corners.map(p=>({x:p.x*detailed.width/img.width,y:p.y*detailed.height/img.height}))};
              quality=core.labelDetail(detailed,scaled);
            }
            stability=core.advanceLiveCapture(stability,found,acceptable,started,quality);
            const recognized=acceptable&&stability.steady>=4&&started-stability.stableSince>=500;
            drawLiveOutline(found,img,recognized);
          }else{
            stability=core.advanceLiveCapture(stability,null,false,started,null);
            if(!stability.last)drawLiveOutline(null,img,false);
          }
          const nextReach=core.advanceReachCapture(reach,found,acceptable,started);
          if(nextReach.firstSeen!==reach.firstSeen)bestReach=null;
          reach=nextReach;
          if(acceptable&&quality?.detail>=15&&quality.glare<.025&&
            (!bestReach||quality.detail>bestReach.previewQuality.detail+6)&&
            (!bestReach||started-lastReachSampleAt>=450||quality.detail>bestReach.previewQuality.detail+20)){
            lastReachSampleAt=started;
            // Hold one full-resolution frame, so the eventual hands-free save
            // uses the sharpest observed image rather than a later blurry one.
            const canvas=document.createElement('canvas');canvas.width=video.videoWidth;canvas.height=video.videoHeight;
            canvas.getContext('2d').drawImage(video,0,0);
            const actual=imageData(canvas,960),scaled={corners:found.corners.map(p=>({x:p.x*actual.width/img.width,y:p.y*actual.height/img.height}))};
            const actualQuality=core.labelDetail(actual,scaled);
            if(actualQuality.detail>=15&&actualQuality.glare<.025&&
              (!bestReach||actualQuality.detail>bestReach.quality.detail+3))
              bestReach={canvas,frame:img,found,quality:actualQuality,previewQuality:quality,at:started};
          }
          const margin=Math.max(4,Math.round(Math.min(img.width,img.height)*.012));
          const reason=!found?'no-blue-label-candidate':found.coverage<.10?'too-small':found.fill<.68||found.fill>1.08?'unreliable-shape':
            found.corners.some(q=>q.x<margin||q.y<margin||q.x>=img.width-margin||q.y>=img.height-margin)?'touches-camera-edge':'candidate-visible';
          event('camera-frame',{reason,acceptable,steady:stability.steady,motion:stability.motion,quality,intervalMs,detectionMs:Math.round(performance.now()-started),frameWidth:img.width,frameHeight:img.height,
            coverage:found?.coverage||null,fill:found?.fill||null,ratio:found?.ratio||null,borderRefined:!!found?.borderRefined,
            shadowBorderRefined:!!found?.shadowBorderRefined,shadowMask:!!found?.shadowMask,
            reachVisible:reach.visible,reachHeldMs:reach.firstSeen?Math.round(started-reach.firstSeen):0,
            reachBestDetail:bestReach?.quality.detail||null,
            corners:found?.corners||null,
            overlayWidth:c.width,overlayHeight:c.height});
          const ready=acceptable&&stability.steady>=4&&started-stability.stableSince>=500;
          const reachReady=acceptable&&core.reachCaptureReady(reach,started,bestReach?.quality.detail);
          if(reachReady&&!ready)drawLiveOutline(found,img,true);
          cameraStatus.textContent=ready?'✓ Label sharp. Capturing...':reachReady?'✓ Best available photo. Capturing...':acceptable&&quality?.glare>=.025?
            'Glare across the label. Tilt the phone slightly.':acceptable&&quality?.detail<110?
            'Hold steady for the hands-free capture chime.':acceptable?'Label found. Hold steady for the chime.':
            reason==='touches-camera-edge'?'Move back until the whole label fits.':'Point the camera at the full blue label.';
          if(ready||reachReady){
            const mode=ready?'automatic':'automatic-reach';
            const metadata=ready?{...quality,steady:stability.steady,motion:stability.motion,heldMs:Math.round(started-stability.stableSince)}:
              {heldMs:Math.round(started-reach.firstSeen),visible:reach.visible,bestAtMs:Math.round(started-bestReach.at)};
            if(captureFrame(mode,500,metadata,ready?null:bestReach)){
              clearInterval(cameraTimer);cameraTimer=null;
              bestReach=null;
              cameraStatus.textContent='First photo saved. Hold for the final chime.';
            }else stability={last:null,lastSeen:0,steady:0,stableSince:0};
          }
        }catch(error){console.error(error);report.error={message:error.message,stack:error.stack};report.stage='camera-error';event('camera-error',{message:error.message});stopCamera();cameraStatus.textContent='Camera preview stopped. Use the photo picker below.';}
        finally{busy=false;}
      },180);
    }catch(error){report.error={message:error.message,stack:error.stack};report.stage='camera-error';event('camera-error',{message:error.message});stopCamera();$('startCamera').textContent='RETRY LIVE SCANNER';
      alert('Camera could not start. Allow camera access in Safari, or use the photo picker below.');console.error(error);}
  });
})();

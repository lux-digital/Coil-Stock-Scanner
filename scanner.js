/* Client-side scanner: the photograph never leaves this browser. */
(function () {
  'use strict';
  const core = CoilCore;
  const $ = id => document.getElementById(id);
  const input = $('imageInput'), preview = $('preview'), scan = $('scanButton'), results = $('resultsCard');
  const progress = $('progressArea'), bar = $('progressBar'), status = $('progressText');
  const fullCanvas = document.createElement('canvas'), smallCanvas = document.createElement('canvas');
  let image = null, url = null, worker = null, stream = null, cameraTimer = null, captureTimer = null, scanning = false;
  let lastLiveImage=null, lastLiveFound=null, capturedLive=null;
  let report={startedAt:new Date().toISOString(),source:'none',events:[],images:{},stage:'ready'};
  function event(name,details={}) {report.events.push({at:new Date().toISOString(),name,...details});if(report.events.length>240)report.events.shift();}
  function showReportButton(){ $('saveLiveReport').hidden=false;$('reportHint').hidden=false; }
  function resetReport(source){capturedLive=null;report={startedAt:new Date().toISOString(),source,events:[],images:{},stage:'ready'};showReportButton();event('new-test');}
  function frameImage(frame,found,caption='Detection preview') {
    const c=toCanvas(frame),x=c.getContext('2d');
    if(found){const corners=found.corners;x.lineWidth=5;x.lineJoin='round';x.strokeStyle='#ffcc32';x.beginPath();x.moveTo(corners[0].x,corners[0].y);
      for(const p of corners.slice(1))x.lineTo(p.x,p.y);x.closePath();x.stroke();}
    x.fillStyle='rgba(0,0,0,.78)';x.fillRect(0,0,c.width,35);x.fillStyle='#fff';x.font='16px sans-serif';x.fillText(caption,10,24);
    return c.toDataURL('image/jpeg',.86);
  }
  function maskImage(frame){
    const mask=core.blueMask(frame),data=new Uint8ClampedArray(frame.width*frame.height*4);
    for(let i=0;i<mask.length;i++){const n=4*i;data[n]=mask[i]?35:25;data[n+1]=mask[i]?225:25;data[n+2]=mask[i]?236:25;data[n+3]=255;}
    return toCanvas({data,width:frame.width,height:frame.height}).toDataURL('image/png');
  }
  async function downloadReport(){
    try{
      if(stream&&video.videoWidth){const frame=imageData(video,640);lastLiveImage=frame;lastLiveFound=core.refineBorderCorners(frame,core.detectLabel(frame));}
      if(lastLiveImage){report.images['camera-boundary.jpg']=frameImage(lastLiveImage,lastLiveFound,report.stage);
        report.images['blue-pixel-mask.png']=maskImage(lastLiveImage);}
      if(image&&!report.images['original-frame.jpg'])report.images['original-frame.jpg']=toCanvas(imageData(image,2400)).toDataURL('image/jpeg',.86);
      const metadata={version:'3',exportedAt:new Date().toISOString(),source:report.source,startedAt:report.startedAt,stage:report.stage,
        browser:navigator.userAgent,screen:{width:screen.width,height:screen.height,devicePixelRatio:devicePixelRatio},
        viewport:{width:innerWidth,height:innerHeight},
        camera:report.camera||null,events:report.events,detection:report.detection||null,
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
    const width=image.naturalWidth||image.videoWidth, height=image.naturalHeight||image.videoHeight;
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
  async function recognizeRegion(ocr,canvas,rect) {
    await ocr.setParameters({tessedit_pageseg_mode:'6',user_defined_dpi:'300'});
    return (await ocr.recognize(canvas,{rectangle:{left:Math.round(rect[0]*canvas.width),top:Math.round(rect[1]*canvas.height),width:Math.round(rect[2]*canvas.width),height:Math.round(rect[3]*canvas.height)}})).data.text;
  }
  async function recognizeEnlarged(ocr,canvas,rect) {
    const crop=document.createElement('canvas');
    crop.width=Math.round(canvas.width*rect[2]*3);crop.height=Math.round(canvas.height*rect[3]*3);
    crop.getContext('2d').drawImage(canvas,rect[0]*canvas.width,rect[1]*canvas.height,
      rect[2]*canvas.width,rect[3]*canvas.height,0,0,crop.width,crop.height);
    return (await ocr.recognize(crop)).data.text;
  }
  async function runScan(){
    if(!image||scanning)return;scanning=true;scan.disabled=true;progress.style.display='block';results.style.display='none';progressTo('Finding the blue label...',8);
    report.stage='detecting';event('scan-start',{imageWidth:image.naturalWidth,imageHeight:image.naturalHeight});
    try {
      if(typeof Tesseract==='undefined')throw new Error('OCR library did not load. Check the internet connection.');
      const small=imageData(image,640),rawDetection=core.detectLabel(small),detected=core.refineBorderCorners(small,rawDetection);
      const adjusted=core.reconcileCaptureCorners(detected,capturedLive?.found,small.width,small.height,capturedLive?.width,capturedLive?.height);
      const found=adjusted.found;
      report.detection={imageWidth:small.width,imageHeight:small.height,corners:found?.corners||null,
        originalCorners:rawDetection?.corners||null,borderRefined:!!detected?.borderRefined,correctedCorners:adjusted.corrected,
        coverage:found?.coverage||null,fill:found?.fill||null,ratio:found?.ratio||null};
      if(adjusted.corrected.length)event('crop-corner-corrected',{indices:adjusted.corrected});
      report.images['scan-blue-mask.png']=maskImage(small);
      report.images['scan-boundary.jpg']=frameImage(small,found,'Boundary used for OCR');
      if(!found)throw new Error('The blue label could not be found. Move closer, keep the entire label visible, and try again.');
      const full=imageData(image,2400),corners=found.corners.map(p=>({x:p.x*full.width/small.width,y:p.y*full.height/small.height}));
      let label=core.warp(full,corners),ocr=await getWorker();progressTo('Checking label orientation...',25);report.stage='orientation';
      // The blue border establishes the horizontal axis; OCR establishes which end is the top.
      await ocr.setParameters({tessedit_pageseg_mode:'6',user_defined_dpi:'300',tessedit_char_whitelist:''});
      const quick=toCanvas(label),half=toCanvas(core.rotate(label,2));
      const first=(await ocr.recognize(quick)).data.text;
      const second=(await ocr.recognize(half)).data.text;
      const chosen=core.orientationScore(second)>core.orientationScore(first)?180:0;
      report.orientation={score0:core.orientationScore(first),score180:core.orientationScore(second),chosenDegrees:chosen,text0:first,text180:second};
      if(chosen)label=core.rotate(label,2);
      const straight=toCanvas(label),enhanced=toCanvas(core.enhance(label));
      report.images['straightened-label.jpg']=straight.toDataURL('image/jpeg',.9);
      report.images['enhanced-for-ocr.jpg']=enhanced.toDataURL('image/jpeg',.86);
      $('straightenedPreview').src=straight.toDataURL('image/jpeg',.86);
      progressTo('Reading printed fields...',55);
      const regions={
        left:[.025,.14,.44,.25],right:[.57,.37,.40,.35],
        net:[.04,.53,.20,.14],gross:[.22,.53,.22,.14],
        length:[.42,.53,.20,.14],id:[.33,.62,.33,.16],
        idTight:[.405,.612,.23,.098]
      };
      const parts={fullText:chosen?second:first};for(const [key,rect] of Object.entries(regions)){
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
      let values=CoilParser.parse(parts);
      // Spend an extra OCR pass only when a key field was not read from the main crops.
      if(!values.coilId){
        await ocr.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'});
        regions.idWide=[.39,.60,.26,.12];
        parts.idWide=await recognizeEnlarged(ocr,straight,regions.idWide);
        values=CoilParser.parse(parts);
      }
      for(const [field,region] of [['netKg',[.055,.612,.13,.055]],['grossKg',[.28,.612,.13,.055]]])if(!values[field]){
        await ocr.setParameters({tessedit_pageseg_mode:'7',tessedit_char_whitelist:''});
        const key=field==='netKg'?'netMetricTight':'grossMetricTight';
        regions[key]=region;parts[key]=await recognizeEnlarged(ocr,straight,region);
        values=CoilParser.parse(parts);
      }
      report.ocr={regions,parts};report.parsed=values;report.stage='complete';event('scan-complete');
      $('rawText').textContent=Object.entries(parts).map(([name,value])=>name.toUpperCase()+':\n'+value).join('\n');
      check(values);results.style.display='block';progressTo('Scan complete. Please check the fields against the image.',100);
      results.scrollIntoView({behavior:'smooth',block:'start'});
    }catch(error){console.error(error);report.error={message:error.message,stack:error.stack};report.stage='failed';event('scan-failed',{message:error.message});progressTo(error.message||'Could not scan this photo.',0);}
    finally{scan.disabled=false;scanning=false;}
  }
  scan.addEventListener('click',runScan);
  const video=$('cameraVideo'),overlay=$('cameraOverlay'),cameraStatus=$('cameraStatus');
  function captureFrame(reason, showCheckFor=0){
    if(!stream||!video.videoWidth||scanning)return;
    const frame=lastLiveImage||imageData(video,640),found=lastLiveFound||core.refineBorderCorners(frame,core.detectLabel(frame));
    capturedLive=found?{found,width:frame.width,height:frame.height}:null;
    event('camera-capture',{reason,corners:found?.corners||null});
    const capture=document.createElement('canvas');capture.width=video.videoWidth;capture.height=video.videoHeight;
    capture.getContext('2d').drawImage(video,0,0);
    const dataURL=capture.toDataURL('image/jpeg',.9);report.images['original-frame.jpg']=dataURL;
    if(showCheckFor)video.pause(); // Keep the green outline on the frame that was captured.
    const finish=()=>{captureTimer=null;
      report.images['camera-boundary.jpg']=frameImage(frame,found,'Captured '+reason);
      report.images['blue-pixel-mask.png']=maskImage(frame);
      stopCamera();image=new Image();image.onload=()=>{preview.src=dataURL;$('previewWrapper').style.display='block';runScan();};image.src=dataURL;};
    if(showCheckFor)captureTimer=setTimeout(finish,showCheckFor);else finish();
  }
  $('captureNow').addEventListener('click',()=>captureFrame('manual'));
  function stopCamera(){
    if(cameraTimer){clearInterval(cameraTimer);cameraTimer=null;}
    if(captureTimer){clearTimeout(captureTimer);captureTimer=null;}
    if(stream){stream.getTracks().forEach(track=>track.stop());stream=null;}
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
    if(!navigator.mediaDevices?.getUserMedia){cameraStatus.textContent='Live camera is unavailable. Use the photo picker below.';return;}
    try{
      stream=await navigator.mediaDevices.getUserMedia({audio:false,video:{facingMode:{ideal:'environment'},width:{ideal:1920},height:{ideal:1080}}});
      video.srcObject=stream;await video.play();
      const settings=stream.getVideoTracks()[0]?.getSettings()||{};
      report.camera={width:video.videoWidth,height:video.videoHeight,frameRate:settings.frameRate||null,facingMode:settings.facingMode||null};
      report.stage='camera-running';event('camera-started',report.camera);
      $('cameraPanel').hidden=false;$('startCamera').hidden=true;
      lastLiveImage=null;lastLiveFound=null;
      drawLiveOutline(null,{width:1,height:1},false);
      let stability={last:null,lastSeen:0,steady:0},busy=false,lastFrameAt=0;
      cameraTimer=setInterval(()=>{
        if(busy||scanning||!video.videoWidth)return;busy=true;
        try{
          const started=performance.now(),intervalMs=lastFrameAt?started-lastFrameAt:null;lastFrameAt=started;
          // Live detection only needs a small frame; the captured photo keeps camera resolution.
          const img=imageData(video,480),found=core.refineBorderCorners(img,core.detectLabel(img));
          lastLiveImage=img;lastLiveFound=found;
          const c=overlay;
          let acceptable=false;
          if(found){
            acceptable=core.labelReady(found,img.width,img.height);
            // Compare the label's overall position, so ordinary hand movement does not restart capture.
            stability=core.advanceLiveCapture(stability,found,acceptable,started);
            const recognized=acceptable&&stability.steady>=2;
            drawLiveOutline(found,img,recognized);
          }else{
            stability=core.advanceLiveCapture(stability,null,false,started);
            if(!stability.last)drawLiveOutline(null,img,false);
          }
          const margin=Math.max(4,Math.round(Math.min(img.width,img.height)*.012));
          const reason=!found?'no-blue-label-candidate':found.coverage<.10?'too-small':found.fill<.68||found.fill>1.08?'unreliable-shape':
            found.corners.some(q=>q.x<margin||q.y<margin||q.x>=img.width-margin||q.y>=img.height-margin)?'touches-camera-edge':'candidate-visible';
          event('camera-frame',{reason,acceptable,steady:stability.steady,intervalMs,detectionMs:Math.round(performance.now()-started),frameWidth:img.width,frameHeight:img.height,
            coverage:found?.coverage||null,fill:found?.fill||null,ratio:found?.ratio||null,borderRefined:!!found?.borderRefined,corners:found?.corners||null,
            overlayWidth:c.width,overlayHeight:c.height});
          cameraStatus.textContent=stability.steady>=2&&acceptable?'✓ Label recognized. Scanning...':acceptable?'Label found. Keep it in view...':reason==='touches-camera-edge'?'Move back until the whole label fits.':'Point the camera at the full blue label.';
          if(stability.steady>=2&&acceptable){
            clearInterval(cameraTimer);cameraTimer=null;
            captureFrame('automatic',500);
          }
        }catch(error){console.error(error);report.error={message:error.message,stack:error.stack};report.stage='camera-error';event('camera-error',{message:error.message});stopCamera();cameraStatus.textContent='Camera preview stopped. Use the photo picker below.';}
        finally{busy=false;}
      },180);
    }catch(error){report.error={message:error.message,stack:error.stack};report.stage='camera-error';event('camera-error',{message:error.message});stopCamera();$('startCamera').textContent='RETRY LIVE SCANNER';
      alert('Camera could not start. Allow camera access in Safari, or use the photo picker below.');console.error(error);}
  });
})();

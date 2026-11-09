/* Small ZIP writer (stored entries) so test reports work offline and stay on-device. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CoilDiagnostics = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const encoder = new TextEncoder();
  const table = new Uint32Array(256);
  for (let n=0;n<256;n++) {let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;table[n]=c>>>0;}
  function crc32(bytes) {let c=0xffffffff;for(const b of bytes)c=table[(c^b)&255]^(c>>>8);return(c^0xffffffff)>>>0;}
  const u16=(view,at,n)=>view.setUint16(at,n,true),u32=(view,at,n)=>view.setUint32(at,n>>>0,true);
  function zip(files) {
    if(files.length>1000)throw new Error('Too many report files');
    const data=[],directory=[];let offset=0;
    for(const [name,contents] of files){
      const filename=encoder.encode(name),body=typeof contents==='string'?encoder.encode(contents):contents;
      if(filename.length>65535||body.length>0xffffffff)throw new Error('Report file is too large');
      const crc=crc32(body),header=new Uint8Array(30+filename.length),v=new DataView(header.buffer);
      u32(v,0,0x04034b50);u16(v,4,20);u16(v,6,0x800);u32(v,14,crc);u32(v,18,body.length);u32(v,22,body.length);u16(v,26,filename.length);header.set(filename,30);
      data.push(header,body);
      const central=new Uint8Array(46+filename.length),d=new DataView(central.buffer);
      u32(d,0,0x02014b50);u16(d,4,20);u16(d,6,20);u16(d,8,0x800);u32(d,16,crc);u32(d,20,body.length);u32(d,24,body.length);u16(d,28,filename.length);u32(d,42,offset);central.set(filename,46);
      directory.push(central);offset+=header.length+body.length;
    }
    const directoryLength=directory.reduce((n,entry)=>n+entry.length,0),end=new Uint8Array(22),v=new DataView(end.buffer);
    u32(v,0,0x06054b50);u16(v,8,files.length);u16(v,10,files.length);u32(v,12,directoryLength);u32(v,16,offset);
    return new Blob([...data,...directory,end],{type:'application/zip'});
  }
  function dataURLBytes(dataURL) {
    const encoded=dataURL.split(',')[1],binary=atob(encoded),bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    return bytes;
  }
  return {zip,dataURLBytes};
});

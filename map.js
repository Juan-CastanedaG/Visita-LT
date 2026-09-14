/* ===== Módulo de Mapa — Torres (LT) =====
   Offline: Leaflet local + teselas cacheadas en IndexedDB.
   Carga KMZ / KML / GPX / GeoJSON. Muestra los sitios del proyecto como marcadores. */
let _map=null,_base=null,_siteLayer=null,_overlays=[],_locMarker=null,_mapReady=false,_curBaseKey='hibrido';

/* fuentes de teselas: calles (OSM), satélite (Esri), etiquetas/vías (Esri ref) */
const TILE_SRC={
  osm :{url:'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',sub:'abc',prefix:'osm',max:19,attr:'© OpenStreetMap'},
  esri:{url:'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',sub:'',prefix:'esri',max:19,attr:'Imágenes © Esri'},
  ref :{url:'https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}',sub:'',prefix:'ref',max:19,attr:''}
};
function _srcUrl(src,t){const s=src.sub?src.sub[(t.x+t.y)%src.sub.length]:'';return src.url.replace('{s}',s).replace('{z}',t.z).replace('{x}',t.x).replace('{y}',t.y);}

/* ---------- IndexedDB de teselas ---------- */
let _tdb=null;
function _tdbOpen(){return new Promise((res,rej)=>{if(_tdb)return res(_tdb);const r=indexedDB.open('lt_map_tiles',1);r.onupgradeneeded=e=>{const db=e.target.result;if(!db.objectStoreNames.contains('t'))db.createObjectStore('t');};r.onsuccess=e=>{_tdb=e.target.result;res(_tdb);};r.onerror=()=>rej(r.error);});}
function _tGet(k){return _tdbOpen().then(db=>new Promise(res=>{const q=db.transaction('t').objectStore('t').get(k);q.onsuccess=()=>res(q.result||null);q.onerror=()=>res(null);}));}
function _tPut(k,b){return _tdbOpen().then(db=>new Promise(res=>{const q=db.transaction('t','readwrite').objectStore('t').put(b,k);q.onsuccess=()=>res(1);q.onerror=()=>res(0);}));}
function _tCount(){return _tdbOpen().then(db=>new Promise(res=>{const q=db.transaction('t').objectStore('t').count();q.onsuccess=()=>res(q.result);q.onerror=()=>res(0);}));}
function _tClear(){return _tdbOpen().then(db=>new Promise(res=>{const q=db.transaction('t','readwrite').objectStore('t').clear();q.onsuccess=()=>res(1);q.onerror=()=>res(0);}));}

/* ---------- capa base offline (IndexedDB primero, luego red) ---------- */
function _offlineLayer(key){
  const src=TILE_SRC[key];
  const OT=L.TileLayer.extend({
    createTile:function(coords,done){
      const img=document.createElement('img'); img.alt='';
      const k=src.prefix+'/'+coords.z+'/'+coords.x+'/'+coords.y, url=this.getTileUrl(coords);
      img.onload=()=>done(null,img); img.onerror=()=>done(null,img);
      _tGet(k).then(b=>{
        if(b){ img.src=URL.createObjectURL(b); }
        else{ fetch(url).then(r=>{if(!r.ok)throw 0;return r.blob();}).then(bl=>{_tPut(k,bl);img.src=URL.createObjectURL(bl);}).catch(()=>{img.src=url;}); }
      }).catch(()=>{img.src=url;});
      return img;
    }
  });
  return new OT(src.url,{subdomains:src.sub||'abc',maxZoom:src.max,crossOrigin:true,attribution:src.attr});
}

/* ---------- abrir / cerrar ---------- */
function openMap(){
  document.getElementById('appView').style.display='none';
  document.getElementById('mapView').style.display='block';
  if(!_mapReady){ _initMap(); _mapReady=true; } else { setTimeout(()=>_map.invalidateSize(),60); }
  _refreshTileInfo();
}
function closeMap(){
  document.getElementById('mapView').style.display='none';
  document.getElementById('appView').style.display='block';
}
function _initMap(){
  _map=L.map('map',{zoomControl:true}).setView([6.2442,-75.5812],12);
  const calles=_offlineLayer('osm'), satelite=_offlineLayer('esri');
  const hibrido=L.layerGroup([_offlineLayer('esri'),_offlineLayer('ref')]);
  hibrido.addTo(_map); _curBaseKey='hibrido';           // híbrido por defecto
  L.control.layers({'Híbrido (satélite)':hibrido,'Satélite':satelite,'Calles':calles},null,{collapsed:true,position:'topright'}).addTo(_map);
  _map.on('baselayerchange',e=>{ _curBaseKey = e.name.indexOf('Híbrido')>=0?'hibrido':(e.name.indexOf('Satélite')>=0?'esri':'osm'); });
  mapShowSites(true);
  setTimeout(()=>_map.invalidateSize(),80);
}

/* ---------- ubicación ---------- */
function mapLocate(){
  if(!navigator.geolocation){alert('Este dispositivo no expone GPS.');return;}
  navigator.geolocation.getCurrentPosition(p=>{
    const ll=[p.coords.latitude,p.coords.longitude];
    if(_locMarker)_map.removeLayer(_locMarker);
    _locMarker=L.circleMarker(ll,{radius:8,color:'#1769ff',weight:3,fillColor:'#1769ff',fillOpacity:.5}).addTo(_map).bindPopup('Aquí estás ±'+Math.round(p.coords.accuracy)+' m').openPopup();
    _map.setView(ll,16);
  },e=>alert('No se pudo ubicar ('+e.message+'). Sobre HTTPS/app instalada funciona.'),{enableHighAccuracy:true,timeout:10000});
}

/* ---------- sitios del proyecto ---------- */
function mapShowSites(silent){
  if(_siteLayer){ _map.removeLayer(_siteLayer); _siteLayer=null; if(!silent)return; }
  const p=(typeof curProj==='function')?curProj():null; if(!p)return;
  const col={mantener:'#0f7a34',mover:'#a3540c'};
  const g=L.layerGroup(); let any=false;
  (p.sitios||[]).forEach(s=>{
    const lat=parseFloat(s.data&&s.data.lat), lon=parseFloat(s.data&&s.data.lon);
    if(!isFinite(lat)||!isFinite(lon))return; any=true;
    const rec=s.rec==='mantener'?'Mantener':s.rec==='mover'?'Mover':'sin recomendación';
    const m=L.circleMarker([lat,lon],{radius:8,weight:2,color:'#fff',fillColor:(col[s.rec]||'#666'),fillOpacity:1});
    m.bindPopup('<b>'+_esc(s.sitioId||'(sin ID)')+'</b><br>'+rec+'<br>'+_esc(s.data.lat+', '+s.data.lon)+'<br><button style="margin-top:6px" onclick="mapOpenSite(\''+s.id+'\')">Abrir sitio</button>');
    g.addLayer(m);
  });
  g.addTo(_map); _siteLayer=g;
  if(any){ try{_map.fitBounds(g.getBounds(),{padding:[40,40],maxZoom:15});}catch(e){} }
  else if(!silent){ alert('Este proyecto aún no tiene sitios con coordenadas.'); }
}
function mapOpenSite(id){
  if(typeof DB!=='undefined'){ DB.actSite=id; if(typeof saveDB==='function')saveDB(); }
  closeMap(); if(typeof render==='function')render(); window.scrollTo(0,0);
}
function _esc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}

/* ---------- cargar archivos de mapa ---------- */
function mapPickFile(){ document.getElementById('mapFile').click(); }
async function mapLoadFile(input){
  const file=input.files&&input.files[0]; if(!file)return; input.value='';
  try{
    const name=file.name.toLowerCase();
    if(name.endsWith('.geojson')||name.endsWith('.json')){ _addGeoJSON(JSON.parse(await file.text()),file.name); return; }
    if(name.endsWith('.kml')){ _addGeoJSON(_kmlToGeo(new DOMParser().parseFromString(await file.text(),'text/xml')),file.name); return; }
    if(name.endsWith('.gpx')){ _addGeoJSON(_gpxToGeo(new DOMParser().parseFromString(await file.text(),'text/xml')),file.name); return; }
    if(name.endsWith('.kmz')){
      const zip=await JSZip.loadAsync(await file.arrayBuffer());
      const kn=Object.keys(zip.files).find(n=>n.toLowerCase().endsWith('.kml'));
      if(!kn){alert('El KMZ no contiene un archivo KML.');return;}
      _addGeoJSON(_kmlToGeo(new DOMParser().parseFromString(await zip.files[kn].async('text'),'text/xml')),file.name); return;
    }
    if(name.endsWith('.zip')){                       // shapefile comprimido
      if(typeof shp==='undefined'){alert('El soporte de shapefile no cargó.');return;}
      const res=await shp(await file.arrayBuffer());
      const list=Array.isArray(res)?res:[res];
      let ok=0; list.forEach((fc,i)=>{ if(fc&&fc.features&&fc.features.length){ _addGeoJSON(fc,file.name+(list.length>1?(' ['+(fc.fileName||('capa '+(i+1)))+']'):'')); ok++; } });
      if(!ok)alert('El ZIP no traía un shapefile con geometrías (revisa que incluya .shp, .dbf y .prj).');
      return;
    }
    if(name.endsWith('.pdf')){ await _loadPDF(file); return; }
    alert('Formato no soportado. Usa KMZ, KML, GPX, GeoJSON, ZIP (shapefile) o PDF.');
  }catch(e){ alert('No se pudo leer el archivo: '+e.message); }
}
function _addGeoJSON(gj,name){
  if(!gj||!gj.features||!gj.features.length){alert('No se encontraron geometrías en "'+name+'".');return;}
  const color='#'+('00000'+((Math.random()*0xffffff)|0).toString(16)).slice(-6);
  const layer=L.geoJSON(gj,{
    style:{color:color,weight:3,fillOpacity:.15},
    pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:6,color:'#fff',weight:2,fillColor:color,fillOpacity:1}),
    onEachFeature:(f,l)=>{const p=f.properties||{};const nm=p.name||p.Name||p.NOMBRE||p.nombre;if(nm)l.bindPopup(_esc(nm));}
  }).addTo(_map);
  _overlays.push({name,layer,color});
  try{_map.fitBounds(layer.getBounds(),{padding:[30,30]});}catch(e){}
  _renderLayers();
}

/* ---------- PDF / GeoPDF ---------- */
let _pendingPDF=null;
async function _loadPDF(file){
  if(typeof pdfjsLib==='undefined'){alert('El lector de PDF no cargó.');return;}
  try{
    pdfjsLib.GlobalWorkerOptions.workerSrc='vendor/pdf.worker.min.js';
    const buf=await file.arrayBuffer();
    const pdf=await pdfjsLib.getDocument({data:buf.slice(0)}).promise;
    const page=await pdf.getPage(1);
    let scale=2, vp=page.getViewport({scale}); const maxpx=2200;
    if(Math.max(vp.width,vp.height)>maxpx){ scale=scale*maxpx/Math.max(vp.width,vp.height); vp=page.getViewport({scale}); }
    const cv=document.createElement('canvas'); cv.width=Math.round(vp.width); cv.height=Math.round(vp.height);
    await page.render({canvasContext:cv.getContext('2d'),viewport:vp}).promise;
    _pendingPDF={dataURL:cv.toDataURL('image/jpeg',0.85),name:file.name};
    _showPlacePDF(_readGeoPDF(new Uint8Array(buf)));
  }catch(e){ alert('No se pudo leer el PDF: '+e.message); }
}
function _readGeoPDF(bytes){          // intento OGC GeoPDF: /GPTS [lat lon ...] sin comprimir
  try{
    const s=new TextDecoder('latin1').decode(bytes);
    const m=s.match(/\/GPTS\s*\[([-0-9.\sEe]+)\]/);
    if(m){ const n=m[1].trim().split(/\s+/).map(parseFloat).filter(v=>isFinite(v));
      if(n.length>=8){ const lats=[],lons=[]; for(let i=0;i+1<n.length;i+=2){lats.push(n[i]);lons.push(n[i+1]);}
        const swLat=Math.min.apply(0,lats),neLat=Math.max.apply(0,lats),swLon=Math.min.apply(0,lons),neLon=Math.max.apply(0,lons);
        if(Math.abs(neLat)<=90&&Math.abs(neLon)<=180&&(neLat-swLat)<20&&(neLon-swLon)<20) return {swLat,swLon,neLat,neLon,auto:true};
      }
    }
  }catch(e){}
  return null;
}
function _showPlacePDF(geo){
  const b=_map.getBounds();
  const g=geo||{swLat:b.getSouth(),swLon:b.getWest(),neLat:b.getNorth(),neLon:b.getEast()};
  document.getElementById('pp_note').textContent=geo&&geo.auto?'✓ Detecté georreferenciación en el PDF (verifica las esquinas).':'No detecté georreferenciación. Ubícalo por esquinas o usa la vista actual del mapa.';
  document.getElementById('pp_swlat').value=(+g.swLat).toFixed(6);
  document.getElementById('pp_swlon').value=(+g.swLon).toFixed(6);
  document.getElementById('pp_nelat').value=(+g.neLat).toFixed(6);
  document.getElementById('pp_nelon').value=(+g.neLon).toFixed(6);
  document.getElementById('pp_op').value=70;
  document.getElementById('pdfPlace').style.display='flex';
}
function pdfUseView(){const b=_map.getBounds();document.getElementById('pp_swlat').value=b.getSouth().toFixed(6);document.getElementById('pp_swlon').value=b.getWest().toFixed(6);document.getElementById('pp_nelat').value=b.getNorth().toFixed(6);document.getElementById('pp_nelon').value=b.getEast().toFixed(6);}
function pdfCancel(){document.getElementById('pdfPlace').style.display='none';_pendingPDF=null;}
function pdfPlace(){
  if(!_pendingPDF)return;
  const sla=parseFloat(document.getElementById('pp_swlat').value),slo=parseFloat(document.getElementById('pp_swlon').value),nla=parseFloat(document.getElementById('pp_nelat').value),nlo=parseFloat(document.getElementById('pp_nelon').value),op=(+document.getElementById('pp_op').value||70)/100;
  if(![sla,slo,nla,nlo].every(v=>isFinite(v))){alert('Revisa las coordenadas de las esquinas.');return;}
  const bounds=[[Math.min(sla,nla),Math.min(slo,nlo)],[Math.max(sla,nla),Math.max(slo,nlo)]];
  const ov=L.imageOverlay(_pendingPDF.dataURL,bounds,{opacity:op}).addTo(_map);
  _overlays.push({name:_pendingPDF.name,layer:ov,color:'#c0392b',isImg:true,opacity:op});
  try{_map.fitBounds(bounds,{padding:[20,20]});}catch(e){}
  _renderLayers(); pdfCancel();
}
function mapOpacity(i,v){const o=_overlays[i];if(o&&o.isImg&&o.layer.setOpacity){o.opacity=v/100;o.layer.setOpacity(v/100);}}
function _renderLayers(){
  const box=document.getElementById('mapLayers'); if(!box)return;
  if(!_overlays.length){box.innerHTML='';return;}
  box.innerHTML='<div class="mlh">Capas cargadas</div>'+_overlays.map((o,i)=>{
    const op=o.isImg?'<input type="range" min="10" max="100" value="'+Math.round((o.opacity||0.7)*100)+'" oninput="mapOpacity('+i+',this.value)" style="width:64px;vertical-align:middle">':'';
    return '<div class="mlrow"><span class="dot" style="background:'+o.color+'"></span><span class="nm">'+_esc(o.name)+'</span>'
    +op+'<button onclick="mapToggleLayer('+i+')">👁</button><button onclick="mapRemoveLayer('+i+')">✕</button></div>';}).join('');
}
function mapToggleLayer(i){const o=_overlays[i];if(!o)return;if(_map.hasLayer(o.layer))_map.removeLayer(o.layer);else o.layer.addTo(_map);}
function mapRemoveLayer(i){const o=_overlays[i];if(!o)return;_map.removeLayer(o.layer);_overlays.splice(i,1);_renderLayers();}

/* ---------- parsers KML / GPX ---------- */
function _coords(txt){return (txt||'').trim().split(/\s+/).map(t=>{const a=t.split(',');return [parseFloat(a[0]),parseFloat(a[1])];}).filter(c=>isFinite(c[0])&&isFinite(c[1]));}
function _txt(el,tag){const e=el.getElementsByTagName(tag)[0];return e?e.textContent:'';}
function _kmlToGeo(xml){
  const F=[]; const pms=xml.getElementsByTagName('Placemark');
  for(let i=0;i<pms.length;i++){const pm=pms[i];
    const nmEl=pm.getElementsByTagName('name')[0]; const name=nmEl?nmEl.textContent.trim():'';
    let g=null;
    const pt=pm.getElementsByTagName('Point')[0], ls=pm.getElementsByTagName('LineString')[0], pg=pm.getElementsByTagName('Polygon')[0];
    if(pt){const c=_coords(_txt(pt,'coordinates'))[0]; if(c)g={type:'Point',coordinates:c};}
    else if(ls){const c=_coords(_txt(ls,'coordinates')); if(c.length)g={type:'LineString',coordinates:c};}
    else if(pg){const ob=pg.getElementsByTagName('outerBoundaryIs')[0]||pg; const c=_coords(_txt(ob,'coordinates')); if(c.length)g={type:'Polygon',coordinates:[c]};}
    if(g)F.push({type:'Feature',properties:{name},geometry:g});
  }
  return {type:'FeatureCollection',features:F};
}
function _gpxToGeo(xml){
  const F=[];
  const wpts=xml.getElementsByTagName('wpt');
  for(let i=0;i<wpts.length;i++){const w=wpts[i];const lat=+w.getAttribute('lat'),lon=+w.getAttribute('lon');if(isFinite(lat)&&isFinite(lon))F.push({type:'Feature',properties:{name:_txt(w,'name').trim()},geometry:{type:'Point',coordinates:[lon,lat]}});}
  const trks=xml.getElementsByTagName('trk');
  for(let i=0;i<trks.length;i++){const pts=[];const tp=trks[i].getElementsByTagName('trkpt');for(let j=0;j<tp.length;j++){const lat=+tp[j].getAttribute('lat'),lon=+tp[j].getAttribute('lon');if(isFinite(lat)&&isFinite(lon))pts.push([lon,lat]);}if(pts.length)F.push({type:'Feature',properties:{name:_txt(trks[i],'name').trim()||'track'},geometry:{type:'LineString',coordinates:pts}});}
  const rtes=xml.getElementsByTagName('rte');
  for(let i=0;i<rtes.length;i++){const pts=[];const rp=rtes[i].getElementsByTagName('rtept');for(let j=0;j<rp.length;j++){const lat=+rp[j].getAttribute('lat'),lon=+rp[j].getAttribute('lon');if(isFinite(lat)&&isFinite(lon))pts.push([lon,lat]);}if(pts.length)F.push({type:'Feature',properties:{name:'ruta'},geometry:{type:'LineString',coordinates:pts}});}
  return {type:'FeatureCollection',features:F};
}

/* ---------- descargar zona (cachear teselas) ---------- */
function _tileRange(b,z){
  const nw=_map.project(b.getNorthWest(),z).divideBy(256).floor();
  const se=_map.project(b.getSouthEast(),z).divideBy(256).floor();
  return {x0:Math.min(nw.x,se.x),x1:Math.max(nw.x,se.x),y0:Math.min(nw.y,se.y),y1:Math.max(nw.y,se.y)};
}
function _areaTiles(){
  const b=_map.getBounds(), z0=_map.getZoom(), zMax=Math.min(z0+3,18);
  const list=[];
  for(let z=z0;z<=zMax;z++){const r=_tileRange(b,z);for(let x=r.x0;x<=r.x1;x++)for(let y=r.y0;y<=r.y1;y++)list.push({z,x,y});}
  return list;
}
async function mapDownloadArea(){
  if(!_map)return;
  const srcKeys = _curBaseKey==='hibrido'?['esri','ref'] : _curBaseKey==='esri'?['esri'] : ['osm'];
  const tiles=_areaTiles();
  const jobs=[]; srcKeys.forEach(k=>tiles.forEach(t=>jobs.push({k,t})));
  const mb=(jobs.length*22/1024).toFixed(1);
  if(!confirm('Descargar el mapa de esta vista (zoom '+_map.getZoom()+' hasta +3)\ncapa: '+srcKeys.join(' + ')+'\n\n'+jobs.length+' teselas · ~'+mb+' MB\n\nHazlo con wifi. ¿Continuar?'))return;
  const bar=document.getElementById('mapProg'), fill=document.getElementById('mapProgFill'), lbl=document.getElementById('mapProgLbl');
  bar.style.display='block'; let done=0,ok=0,fail=0,idx=0;
  async function worker(){
    while(idx<jobs.length){
      const j=jobs[idx++], src=TILE_SRC[j.k], key=src.prefix+'/'+j.t.z+'/'+j.t.x+'/'+j.t.y;
      try{
        if(await _tGet(key)){ ok++; }
        else{ const r=await fetch(_srcUrl(src,j.t)); if(r.ok){ await _tPut(key,await r.blob()); ok++; } else fail++; }
      }catch(e){ fail++; }
      done++; if(done%4===0||done===jobs.length){ fill.style.width=Math.round(done/jobs.length*100)+'%'; lbl.textContent=done+'/'+jobs.length; }
    }
  }
  await Promise.all(Array.from({length:6},worker));
  fill.style.width='100%'; lbl.textContent='Listo: '+ok+' ✓'+(fail?(' · '+fail+' fallidas'):'');
  setTimeout(()=>{bar.style.display='none';fill.style.width='0';},2600);
  _refreshTileInfo();
}
function _refreshTileInfo(){ _tCount().then(n=>{const el=document.getElementById('mapTileInfo'); if(el)el.textContent=n?('🗂 '+n+' teselas guardadas (offline listo)'):'Sin mapa offline aún — usa "⬇ Zona".'; }); }
async function mapClearTiles(){ if(!confirm('¿Borrar todas las teselas guardadas offline?'))return; await _tClear(); _refreshTileInfo(); alert('Mapa offline borrado.'); }

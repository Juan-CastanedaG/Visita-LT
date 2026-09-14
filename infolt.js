/* ===== Info de la LT — tabla de torres (PLS-CADD) por alternativa + cruce con KMZ =====
   Importa .xlsx (hoja "Tabla torres") con el JSZip ya cargado, o .json. Sin reacciones. */
let _iltSort={f:'num',dir:1}, _iltLayer=null;

function _iltEsc(s){return String(s==null?'':s).replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
function _altsP(){const p=(typeof curProj==='function')?curProj():null;if(!p)return null;if(!Array.isArray(p.altsLT))p.altsLT=[];return p;}
function _activeAlt(){const p=_altsP();if(!p)return null;return p.altsLT.find(a=>a.id===p.actAltLT)||p.altsLT[0]||null;}

/* ---------- vista ---------- */
function openInfoLT(){document.getElementById('appView').style.display='none';document.getElementById('iltView').style.display='block';iltRender();}
function closeInfoLT(){document.getElementById('iltView').style.display='none';document.getElementById('appView').style.display='block';}

function iltRender(){
  const p=_altsP(); const host=document.getElementById('iltBody'); if(!host)return;
  if(!p){host.innerHTML='<div class="ilt-empty">Crea o abre un proyecto primero.</div>';return;}
  const alts=p.altsLT, alt=_activeAlt();
  let head='<div class="ilt-bar">'+
    '<select onchange="iltSwitch(this.value)">'+(alts.length?alts.map(a=>'<option value="'+a.id+'" '+(alt&&a.id===alt.id?'selected':'')+'>'+_iltEsc(a.nombre)+' ('+a.torres.length+')</option>').join(''):'<option>— sin alternativas —</option>')+'</select>'+
    '<button onclick="iltImport()">📥 Importar</button>'+
    (alt?'<button onclick="iltExport()">📤 JSON</button><button onclick="iltRename()">✏️</button><button onclick="iltDelete()">🗑</button>':'')+
    '</div>';
  if(!alt){ host.innerHTML=head+'<div class="ilt-empty">Importa un Excel (Tabla torres de PLS-CADD) o un JSON para crear una alternativa.</div>'; return; }
  head+='<div class="ilt-bar2"><button onclick="iltCrossKMZ()">🗺 Cruzar con el KMZ del mapa</button><span class="ilt-n">'+alt.torres.length+' estructuras</span></div>';
  const cols=[['num','#'],['nombre','Nombre'],['station','Absc (m)'],['angulo','Áng (°)'],['resistencia','Res %'],['ancho','Patas (m)']];
  const arrow=f=> _iltSort.f===f?(_iltSort.dir>0?' ▲':' ▼'):'';
  const ts=alt.torres.slice().sort((a,b)=>{const f=_iltSort.f;let x=a[f],y=b[f];if(x==null)x=-1e12;if(y==null)y=-1e12;if(typeof x==='string'||typeof y==='string'){x=String(x);y=String(y);return _iltSort.dir*x.localeCompare(y);}return _iltSort.dir*(x-y);});
  let tbl='<div class="ilt-tblwrap"><table class="ilt-tbl"><thead><tr>'+cols.map(c=>'<th onclick="iltSortBy(\''+c[0]+'\')">'+c[1]+arrow(c[0])+'</th>').join('')+'<th></th></tr></thead><tbody>';
  ts.forEach(t=>{
    tbl+='<tr><td>'+t.num+'</td><td class="nm">'+_iltEsc(t.nombre||'')+'</td><td>'+_fmt(t.station)+'</td><td>'+_fmt(t.angulo)+'</td><td>'+_fmt(t.resistencia)+'</td><td>'+_fmt(t.ancho)+'</td>'+
      '<td><button class="mini" onclick="iltToMap('+t.num+')">🗺</button></td></tr>';
  });
  tbl+='</tbody></table></div>';
  host.innerHTML=head+tbl;
}
function _fmt(v){return v==null||v===''?'—':(typeof v==='number'?(Math.round(v*100)/100):v);}
function iltSortBy(f){if(_iltSort.f===f)_iltSort.dir*=-1;else{_iltSort.f=f;_iltSort.dir=1;}iltRender();}
function iltSwitch(id){const p=_altsP();if(p){p.actAltLT=id;if(typeof saveDB==='function')saveDB();iltRender();}}
function iltRename(){const a=_activeAlt();if(!a)return;const n=prompt('Nombre de la alternativa:',a.nombre);if(n){a.nombre=n.trim()||a.nombre;if(typeof saveDB==='function')saveDB();iltRender();}}
function iltDelete(){const p=_altsP(),a=_activeAlt();if(!p||!a)return;if(!confirm('¿Eliminar la alternativa "'+a.nombre+'"?'))return;p.altsLT=p.altsLT.filter(x=>x.id!==a.id);p.actAltLT=(p.altsLT[0]||{}).id||null;if(typeof saveDB==='function')saveDB();iltRender();}
function iltExport(){const a=_activeAlt();if(!a)return;const blob=new Blob([JSON.stringify(a,null,2)],{type:'application/json'});const u=URL.createObjectURL(blob);const el=document.createElement('a');el.href=u;el.download=(a.nombre||'alternativa').replace(/[^\w\-]+/g,'_')+'.json';document.body.appendChild(el);el.click();el.remove();setTimeout(()=>URL.revokeObjectURL(u),1500);}

/* ---------- importar ---------- */
function iltImport(){document.getElementById('iltFile').click();}
async function iltHandleFile(input){
  const file=input.files&&input.files[0]; if(!file)return; input.value='';
  try{
    const nm=file.name.toLowerCase(); let torres=null, nombre=file.name.replace(/\.[^.]+$/,'');
    if(nm.endsWith('.json')){ const d=JSON.parse(await file.text()); torres=Array.isArray(d)?d:(d.torres||[]); if(d.nombre)nombre=d.nombre; }
    else if(nm.endsWith('.xlsx')){ torres=await _parseXlsxTorres(await file.arrayBuffer()); }
    else { alert('Usa un archivo .xlsx (PLS-CADD) o .json.'); return; }
    if(!torres||!torres.length){ alert('No encontré la tabla de torres. ¿El .xlsx trae la hoja "Tabla torres"?'); return; }
    iltAddAlt(nombre,torres);
  }catch(e){ alert('No se pudo importar: '+e.message); }
}
function iltAddAlt(nombre,torres){
  const p=_altsP(); if(!p){alert('Abre un proyecto primero.');return;}
  const id='a'+Math.random().toString(36).slice(2,9)+Date.now().toString(36).slice(-4);
  p.altsLT.push({id,nombre,creado:Date.now(),torres});
  p.actAltLT=id; if(typeof saveDB==='function')saveDB();
  iltRender();
}

/* ---------- parser xlsx (solo hoja "Tabla torres") ---------- */
function _colIdx(ref){let s='';for(let i=0;i<ref.length;i++){const ch=ref[i];if(ch>='A'&&ch<='Z')s+=ch;else break;}let n=0;for(let i=0;i<s.length;i++)n=n*26+(s.charCodeAt(i)-64);return n-1;}
async function _parseXlsxTorres(buf){
  const zip=await JSZip.loadAsync(buf);
  const DP=new DOMParser();
  const rd=async n=> zip.files[n]?await zip.files[n].async('text'):null;
  // shared strings
  const sst=[]; const ssTxt=await rd('xl/sharedStrings.xml');
  if(ssTxt){ const x=DP.parseFromString(ssTxt,'text/xml'); const sis=x.getElementsByTagName('si');
    for(let i=0;i<sis.length;i++){ const tt=sis[i].getElementsByTagName('t'); let s=''; for(let j=0;j<tt.length;j++)s+=tt[j].textContent; sst.push(s); } }
  // localizar hoja "Tabla torres"
  const wb=DP.parseFromString(await rd('xl/workbook.xml'),'text/xml');
  const sheets=wb.getElementsByTagName('sheet'); let rid=null;
  for(let i=0;i<sheets.length;i++){ if((sheets[i].getAttribute('name')||'').trim().toLowerCase()==='tabla torres'){ rid=sheets[i].getAttribute('r:id')||sheets[i].getAttribute('id'); break; } }
  let target='xl/worksheets/sheet1.xml';
  const relsTxt=await rd('xl/_rels/workbook.xml.rels');
  if(rid&&relsTxt){ const rels=DP.parseFromString(relsTxt,'text/xml'); const rs=rels.getElementsByTagName('Relationship');
    for(let i=0;i<rs.length;i++){ if(rs[i].getAttribute('Id')===rid){ let t=rs[i].getAttribute('Target'); t=t.replace(/^\.\//,''); target=t.charAt(0)==='/'?t.slice(1):('xl/'+t); break; } } }
  const shTxt=await rd(target)||await rd('xl/worksheets/sheet1.xml');
  const sh=DP.parseFromString(shTxt,'text/xml'); const rows=sh.getElementsByTagName('row'); const grid=[];
  for(let i=0;i<rows.length;i++){ const cs=rows[i].getElementsByTagName('c'); const arr=[];
    for(let j=0;j<cs.length;j++){ const c=cs[j]; const ref=c.getAttribute('r')||''; const col=ref?_colIdx(ref):j; const t=c.getAttribute('t');
      let val=null; const v=c.getElementsByTagName('v')[0];
      if(t==='s'){ val=v?sst[parseInt(v.textContent,10)]:''; }
      else if(t==='inlineStr'){ const is=c.getElementsByTagName('t')[0]; val=is?is.textContent:''; }
      else { val=v?v.textContent:null; if(val!=null&&val!==''&&!isNaN(val))val=parseFloat(val); }
      arr[col]=val; }
    grid.push(arr); }
  const hdr=grid[0]||[];
  const find=pfx=>{for(let k=0;k<hdr.length;k++){const h=(hdr[k]==null?'':hdr[k]).toString().trim().toLowerCase();if(h.indexOf(pfx)===0)return k;}return -1;};
  const iNum=find('structure number'),iName=find('structure name'),iSta=find('station'),iAng=find('line angle'),iStr=find('structure strength'),iSw=find('insulator swing'),iPat=find('ancho de patas');
  const torres=[];
  for(let r=1;r<grid.length;r++){ const g=grid[r]; if(!g)continue; const num=iNum>=0?g[iNum]:g[0]; if(num==null||num==='')continue;
    torres.push({num:num,nombre:iName>=0?(g[iName]||''):'',station:iSta>=0?g[iSta]:null,angulo:iAng>=0?g[iAng]:null,resistencia:iStr>=0?g[iStr]:null,swing:iSw>=0?g[iSw]:null,ancho:iPat>=0?g[iPat]:null}); }
  return torres;
}

/* ---------- cruce con KMZ del mapa (por número) ---------- */
function iltCrossKMZ(){
  const a=_activeAlt(); if(!a||!a.torres.length){alert('Primero importa una alternativa.');return;}
  if(typeof _map==='undefined'||!_map){alert('Abre el mapa (🗺) y carga ahí el KMZ de la línea primero.');return;}
  const byNum={}; a.torres.forEach(t=>{byNum[String(parseInt(t.num,10))]=t;});
  const grp=L.layerGroup(); let matched=0,total=0;
  const ovs=(typeof _overlays!=='undefined')?_overlays:[];
  ovs.forEach(o=>{ if(!o.layer||!o.layer.eachLayer)return;
    o.layer.eachLayer(l=>{ if(!l.getLatLng||!l.feature||!l.feature.geometry||l.feature.geometry.type!=='Point')return; total++;
      const p=l.feature.properties||{}; const nm=p.name||p.Name||p.NOMBRE||p.nombre||''; const mm=String(nm).match(/\d+/); if(!mm)return;
      const t=byNum[String(parseInt(mm[0],10))]; if(!t)return; matched++;
      const m=L.circleMarker(l.getLatLng(),{radius:7,weight:2,color:'#fff',fillColor:'#1f6feb',fillOpacity:1});
      m.bindPopup('<b>#'+t.num+' · '+_iltEsc(t.nombre||'')+'</b><br>Abscisa: '+_fmt(t.station)+' m<br>Ángulo: '+_fmt(t.angulo)+'°<br>Resistencia: '+_fmt(t.resistencia)+'%<br>Ancho patas: '+_fmt(t.ancho)+' m');
      grp.addLayer(m);
    });
  });
  if(_iltLayer&&_map.hasLayer(_iltLayer))_map.removeLayer(_iltLayer);
  _iltLayer=grp; grp.addTo(_map);
  if(!total){ alert('No hay puntos KMZ cargados en el mapa. Abre 🗺 Mapa → 📂 Capas y carga el KMZ de la línea.'); return; }
  alert('Cruce por número: '+matched+' de '+total+' puntos empatados con la tabla.'+(matched<total?'\n\n(Si faltaron, revisa que el nombre de cada punto del KMZ tenga el número de estructura.)':''));
  if(matched){ try{_map.fitBounds(grp.getBounds(),{padding:[30,30]});}catch(e){} closeInfoLT(); if(typeof openMap==='function')openMap(); }
}
function iltToMap(num){
  if(!_iltLayer){ alert('Primero toca "Cruzar con el KMZ del mapa".'); return; }
  let found=null; _iltLayer.eachLayer(l=>{ if(l.getPopup&&l.getPopup()&&l.getPopup().getContent().indexOf('#'+num+' ')>=0)found=l; });
  closeInfoLT(); if(typeof openMap==='function')openMap();
  if(found){ _map.setView(found.getLatLng(),16); found.openPopup(); }
}

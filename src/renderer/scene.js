/* Décors pixel-art générés (repris de la maquette) : fonds d’écran et couvertures d’instances */
const rnd=s=>()=>((s=(s*16807)%2147483647)/2147483647);
const BI={plains:['#5fa8ff','#d6ecff','#5aa83c','#7a5a33','#4c8f3d','#fff3a0'],night:['#070b22','#2b2f6b','#2f6b3a','#4a3a2a','#17343c','#e8ecff'],desert:['#f09a4f','#ffe3ab','#e6c77f','#c9a25a','#d9a860','#fff0b0'],snow:['#8fb8de','#eef6ff','#f4f8ff','#9aa8b8','#b9c9dc','#ffffff'],nether:['#2a0606','#a02a14','#7a2222','#4a1010','#6a1a10','#ffb14a'],end:['#07040f','#2a1646','#d8d6a0','#bdb882','#3a2a5a','#a77bff'],cherry:['#6fb8ff','#ffe2ef','#6cbf5a','#7a5a33','#d89ab8','#fff6d0'],sunset:['#2f1b5c','#ff9a4a','#3f7a3a','#5a3f2a','#6a3f7a','#ffd27a'],
 jungle:['#3fa0d8','#c8f0d0','#2f8f3a','#6b4a2a','#1f6a35','#fff3a0'],mesa:['#e8825a','#ffd9a8','#c8643c','#8a4a2a','#b5532f','#fff0c0'],taiga:['#4a6a8f','#cfe0ee','#3f7a55','#5a4630','#2f5a45','#f5f0d0'],
 swamp:['#6f8f6a','#cfe0b0','#4a6a3a','#4a3a24','#3a5a3a','#f0f0b0'],mushroom:['#9a7fd0','#f4d8f0','#8a5a9a','#5a3a5a','#7a4a8a','#ffe8ff'],deepdark:['#02090f','#0b2a35','#0f3a44','#071a22','#0a2a33','#6ee7e0']};
function scene(sd,k,w=320,h=180){const [a,b,g,d,m,sn]=BI[k],r=rnd(sd*97+k.length*13+7),u=w/40,gid='g'+sd+k+w,gy=h*.7,ht=(i,s,A)=>Math.round((Math.sin(i*.35+s)*A+Math.sin(i*.9+s*2)*A*.4)/(u/2))*(u/2),s1=r()*10,s2=r()*10,n=Math.ceil(w/u)+1;
let o=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid slice"><defs><linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="${w}" height="${h}" fill="url(#${gid})"/>`;
if(k=='night'||k=='end'||k=='deepdark')for(let i=0;i<45;i++)o+=`<rect x="${(r()*w).toFixed(1)}" y="${(r()*h*.6).toFixed(1)}" width="${u*.18}" height="${u*.18}" fill="#fff" opacity="${(.3+r()*.7).toFixed(2)}"/>`;
const sx=w*(.15+r()*.6),sy=h*(.1+r()*.15);o+=`<rect x="${sx-u*2.4}" y="${sy-u*2.4}" width="${u*4.8}" height="${u*4.8}" fill="${sn}" opacity=".25"/><rect x="${sx-u*1.5}" y="${sy-u*1.5}" width="${u*3}" height="${u*3}" fill="${sn}"/>`;
if(k!='nether'&&k!='end'&&k!='deepdark')for(let i=0;i<3;i++){const cx=r()*w,cy=h*(.12+r()*.2);o+=`<g fill="#fff" opacity=".7"><rect x="${cx}" y="${cy}" width="${u*5}" height="${u}"/><rect x="${cx+u}" y="${cy-u}" width="${u*3}" height="${u}"/></g>`}
for(let i=0;i<n;i++){const y=gy-u*7-ht(i,s1,u*4);o+=`<rect x="${i*u}" y="${y}" width="${u+.5}" height="${gy-y}" fill="${m}" opacity=".55"/>`}
for(let i=0;i<n;i++){const y=gy-u*3-ht(i,s2,u*2.4);o+=`<rect x="${i*u}" y="${y}" width="${u+.5}" height="${gy-y}" fill="${m}"/>`}
const gh=i=>gy+ht(i,sd,u*.8);
for(let i=0;i<n;i++){const y=gh(i);o+=`<rect x="${i*u}" y="${y}" width="${u+.5}" height="${h-y}" fill="${g}"/><rect x="${i*u}" y="${y+u*.9}" width="${u+.5}" height="${h}" fill="${d}"/>`}
if(k=='nether')o+=`<rect x="0" y="${h-u*2}" width="${w}" height="${u*2}" fill="#ff7a1a" opacity=".9"/>`;
const tc={plains:'#2f7d32',night:'#245c2e',snow:'#2f6b4a',cherry:'#f2a0c4',sunset:'#2b6a3a',jungle:'#1f7a2a',taiga:'#2a5f45',swamp:'#3f6a2f'}[k];
for(let t=0;t<6;t++){const c=Math.floor(r()*n),x=c*u,y=gh(c);
 if(tc)o+=`<rect x="${x+u*.35}" y="${y-u*3}" width="${u*.5}" height="${u*3}" fill="#5b3d1e"/><rect x="${x-u*.9}" y="${y-u*5.2}" width="${u*2.3}" height="${u*2.4}" fill="${tc}"/><rect x="${x-u*.2}" y="${y-u*6.4}" width="${u*1.1}" height="${u*1.3}" fill="${tc}"/>`;
 else if(k=='desert'||k=='mesa')o+=`<rect x="${x}" y="${y-u*3}" width="${u*.7}" height="${u*3}" fill="#3c8c3c"/><rect x="${x+u*.7}" y="${y-u*2}" width="${u*.7}" height="${u*.7}" fill="#3c8c3c"/>`}
return o+`</svg>`}


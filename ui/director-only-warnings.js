(function(){
'use strict';
const noticePattern=/(shared power bi cannot be verified|shared data:\s*reconciliation required|power bi import incomplete|power bi tier totals do not match|shared power bi unavailable|shared import.*(?:unverified|incomplete)|only \d+ of \d+ agent profiles stamped)/i;
const style=document.createElement('style');
style.textContent='[data-director-only-warning="true"]{display:none!important}';
document.head.appendChild(style);
function tidy(){
 for(const node of document.querySelectorAll('[role="alert"],[class*="warning"],[class*="Warning"],[id*="warning"],[id*="Warning"],.toast,.banner')){
  if(!noticePattern.test((node.textContent||'').slice(0,1200)))continue;
  if(node.querySelector('button[type="submit"],input,textarea'))continue;
  node.setAttribute('data-director-only-warning','true');
 }
 for(const node of document.querySelectorAll('body *')){
  if(node.children.length!==0 || !noticePattern.test(node.textContent||''))continue;
  let p=node;
  while(p.parentElement && p.parentElement!==document.body){
   if(p.matches('[role="alert"],[class*="warning"],[class*="Warning"],[class*="banner"],[class*="Banner"]'))break;
   const parent=p.parentElement;
   if(parent.querySelectorAll('button,input,textarea').length || (parent.textContent||'').length>650)break;
   p=parent;
  }
  if((p.textContent||'').length<650)p.setAttribute('data-director-only-warning','true');
 }
}
let queued=false;function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;tidy()})}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{tidy();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true})});
else{tidy();new MutationObserver(schedule).observe(document.body,{childList:true,subtree:true})}
})();
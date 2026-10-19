import https from 'node:https';
import dns from 'node:dns';
import { isIP } from 'node:net';
export const approvedSourceHosts = ['www.cisa.gov','www.nist.gov','nvlpubs.nist.gov','attack.mitre.org','www.mitre.org'];
export function approvedSourceUrl(value) {
 const url=new URL(value);
 if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||!approvedSourceHosts.includes(url.hostname))throw new Error('Automatic retrieval accepts HTTPS pages on: '+approvedSourceHosts.join(', ')+'. For other sources, paste source text with its provenance.');
 return url;
}
export function publicAddress(address) {
 if(isIP(address)===6)return /^[23][0-9a-f]{0,3}:/i.test(address)&&!address.toLowerCase().startsWith('2001:db8:');
 if(isIP(address)!==4)return false;
 const [a,b]=address.split('.').map(Number);
 return !(a===0||a===10||a===127||a>=224||a===169&&b===254||a===172&&b>=16&&b<=31||a===192&&(b===168||b===0)||a===100&&b>=64&&b<=127||a===198&&(b===18||b===19||b===51)||a===203&&b===0);
}
export function fetchApprovedSource(value) {
 const url=approvedSourceUrl(value);
 return new Promise((resolve,reject)=>{
  const req=https.get(url,{lookup:(hostname,options,callback)=>dns.lookup(hostname,{all:true},(error,addresses)=>{
   if(error)return callback(error);
   if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))return callback(new Error('Source hostname did not resolve exclusively to public addresses.'));
   if(options.all)callback(null,addresses);else callback(null,addresses[0].address,addresses[0].family);
  }),headers:{Accept:'text/html,text/plain','User-Agent':'AgentDebate-local evidence retrieval'}},res=>{
   if(res.statusCode!==200){res.resume();reject(new Error('Source retrieval returned HTTP '+res.statusCode+'. Redirects are not followed; use the final approved URL.'));return;}
   const type=res.headers['content-type']||'';
   if(!/text\/(html|plain)/i.test(type)){res.resume();reject(new Error('Automatic retrieval supports HTML and plain text. Add PDF/document extracts with provenance instead.'));return;}
   const chunks=[];let size=0;
   res.on('data',chunk=>{size+=chunk.length;if(size>1000000){req.destroy(new Error('Source exceeds the 1 MB retrieval limit. Import it into the knowledge library.'));return;}chunks.push(chunk);});
   res.on('error',reject);
   res.on('end',()=>{
    if(size>1000000)return;
    let text=Buffer.concat(chunks).toString('utf8');
    if(/html/i.test(type))text=text.replace(/<(script|style|nav|header|footer)\b[^>]*>[\s\S]*?<\/\1>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;/g,' ').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim();
    if(!text.trim())reject(new Error('No readable source content was retrieved.'));else resolve({text,url:url.href,retrieved_at:new Date().toISOString(),retrieval:'approved_public_url'});
   });
  });
  const deadline=setTimeout(()=>req.destroy(new Error('Source retrieval timed out.')),20000);
  req.on('close',()=>clearTimeout(deadline));req.on('error',reject);
 });
}

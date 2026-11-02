const http=require('node:http'),fs=require('node:fs'),path=require('node:path');
const root=path.resolve('dist');
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.mp4':'video/mp4','.jpg':'image/jpeg','.png':'image/png','.webp':'image/webp'};
http.createServer((req,res)=>{
 const name=path.resolve(root,'.'+decodeURIComponent(new URL(req.url,'http://localhost').pathname));
 let file=name===root?path.join(root,'index.html'):name;
 if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
 fs.stat(file,(error,stat)=>{
  if(error||!stat.isFile()){res.writeHead(404).end();return;}
  const headers={'Content-Type':mime[path.extname(file)]||'application/octet-stream','Accept-Ranges':'bytes','Cache-Control':'no-store'};
  const match=req.headers.range?.match(/^bytes=(\d+)-(\d*)$/);
  let start=0,end=stat.size-1,status=200;
  if(match){start=Number(match[1]);end=match[2]?Math.min(Number(match[2]),end):end;status=206;headers['Content-Range']='bytes '+start+'-'+end+'/'+stat.size;}
  if(start> end||start>=stat.size){res.writeHead(416).end();return;}
  headers['Content-Length']=end-start+1;res.writeHead(status,headers);
  if(req.method==='HEAD')res.end();else fs.createReadStream(file,{start,end}).pipe(res);
 });
}).listen(8765,'127.0.0.1',()=>console.log('Media test server supports byte ranges on port 8765'));

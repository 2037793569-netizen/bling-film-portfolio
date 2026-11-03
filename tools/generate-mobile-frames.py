"""Generate small, independently decodable mobile frame chunks and install the player."""
from pathlib import Path
import json,subprocess,tempfile,re
from PIL import Image
root=Path('dist'); clips={}
for kind in ('opening','about'):
    with tempfile.TemporaryDirectory() as tmp:
        temp=Path(tmp)
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(root/'assets'/f'{kind}.mp4'),'-vf','fps=24,scale=640:360','-an',str(temp/'%04d.png')],check=True)
        frames=sorted(temp.glob('*.png'))
        sheets=[]
        for start in range(0,len(frames),12):
            sheet=Image.new('RGB',(640*4,360*3),'white')
            for cell,source in enumerate(frames[start:start+12]):
                with Image.open(source) as frame: sheet.paste(frame,(cell%4*640,cell//4*360))
            name=f'mobile-{kind}-frames-{start//12:02d}.webp'
            sheet.save(root/'assets'/name,'WEBP',quality=76,method=6)
            sheets.append('assets/'+name)
        clips[kind]={'width':640,'height':360,'fps':24,'columns':4,'perSheet':12,'frames':len(frames),'sheets':sheets}
app=(root/'app.js').read_text()
start=app.index("  const mobileAnimation = $('mobile-animation');")
end=app.index('  let introPlaybackToken',start)
player=Path('tools/mobile-frame-player.js').read_text().replace('__MOBILE_CLIPS__',json.dumps(clips,separators=(',',':')))
app=app[:start]+player+app[end:]
app=app.replace("document.body.classList.add('is-opening'); setScene('opening'); playMobileFilm('opening'); return;","document.body.classList.add('is-opening'); playMobileFilm('opening'); return;")
app=app.replace("if (introState === 'playing' || introState === 'about') return;","if (introState === 'playing' || introState === 'waiting' || introState === 'about') return;")
app=app.replace("introState = 'playing'; transitionPending = false;\n      setScene('about'); setVisualState(0, 1, 1); $('sequence-progress').style.width = '0%';","introState = 'waiting'; transitionPending = false;\n      $('sequence-progress').style.width = '0%';")
(root/'app.js').write_text(app)
html=(root/'index.html').read_text().replace('<img id="mobile-animation" class="mobile-animation" alt="" aria-hidden="true">','<canvas id="mobile-animation" class="mobile-animation" width="768" height="432" aria-hidden="true"></canvas>')
html=html.replace('fetchpriority="auto"','fetchpriority="low"')
html=re.sub(r'(app\.js|style\.css)\?v=[^"]+',r'\1?v=20261103-frames10',html)
(root/'index.html').write_text(html)
report={kind:{**{k:v for k,v in clip.items() if k!='sheets'},'bytes':sum((root/name).stat().st_size for name in clip['sheets']),'first_chunk_bytes':(root/clip['sheets'][0]).stat().st_size,'chunks':len(clip['sheets'])} for kind,clip in clips.items()}
Path('tools/mobile-frames-report.json').write_text(json.dumps(report,indent=2))
print(json.dumps(report,indent=2))

css=(root/'style.css').read_text()
css+="""
/* Hardware video is visible only after a decoded first frame; canvas remains the automatic fallback. */
@media(hover:none) and (pointer:coarse){
 .stage[data-native="opening"]>#opening,.stage[data-native="about"]>#about-video{
   display:block!important;visibility:visible;opacity:0;transition:none;z-index:6
 }
 .stage[data-native-ready="true"][data-native="opening"]>#opening,
 .stage[data-native-ready="true"][data-native="about"]>#about-video{opacity:1}
 .work-card:hover .work-media img{transform:none;filter:none}
 .work-card:hover .work-media i{opacity:0}
}
"""
(root/'style.css').write_text(css)

app=(root/'app.js').read_text()
app=app.replace("    preloadMobileFilm('about').catch(() => {});","    preloadMobileFilm('about').catch(() => {});\n    prepareMobileNative(about);")
app=app.replace("if (touchConsumed) { touchConsumed = touchNavigation = false; return; }","if (touchConsumed) { retryMobileNativeGesture(event); touchConsumed = touchNavigation = false; return; }")
app=app.replace("link.addEventListener('click', event => { event.preventDefault(); startAboutTransition(); })","link.addEventListener('click', event => { event.preventDefault(); if (mobileMedia && event.isTrusted) mobileNativeAllowed = true; startAboutTransition(); })")
(root/'app.js').write_text(app)

# Responsive stills retain enough pixels for a high-density phone without large desktop JPEGs.
for name in ('gaze','about'):
    with Image.open(root/'assets'/f'{name}.jpg') as source:
        source=source.convert('RGB')
        source.thumbnail((1280,720))
        source.save(root/'assets'/f'{name}-mobile-still.webp','WEBP',quality=88,method=6)
html=(root/'index.html').read_text()
html=html.replace('class="cover-poster" src="assets/gaze.jpg"', 'class="cover-poster" src="assets/gaze-mobile-still.webp" srcset="assets/gaze-mobile-still.webp 1280w, assets/gaze.jpg 2560w" sizes="100vw"')
html=html.replace('class="about-end-frame" src="assets/about.jpg"', 'class="about-end-frame" src="assets/about-mobile-still.webp" srcset="assets/about-mobile-still.webp 1280w, assets/about.jpg 2560w" sizes="100vw"')
html=html.replace('poster="assets/about.jpg"','poster="assets/about-mobile-still.webp"')
# Covers are started before their section enters view, using a bounded queue and a scroll backup.
html=re.sub(r'(<img[^>]*?) src="(assets/[^"]+-640.webp)" srcset="([^"]+)"',r'\1 data-cover-src="\2" data-cover-srcset="\3"',html)

# The literal replacement also handles versions installed by older passes.
html=html.replace('20261103-frames10','20261103-mobile12').replace('20261103-mobile11','20261103-mobile12')
(root/'index.html').write_text(html)
app=(root/'app.js').read_text()
anchor="  const mobileMedia = matchMedia('(hover: none) and (pointer: coarse)').matches;"
loader=Path('tools/mobile-cover-loader.js').read_text()
if 'const deferredCovers =' not in app: app=app.replace(anchor,anchor+'\n'+loader)
(root/'app.js').write_text(app)

html=(root/'index.html').read_text().replace('20261103-mobile12','20261103-mobile13')
(root/'index.html').write_text(html)

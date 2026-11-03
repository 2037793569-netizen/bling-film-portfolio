  // Defer below-the-fold covers explicitly; no native lazy-load dependency in WeChat.
  const deferredCovers = [...document.querySelectorAll('img[data-cover-src]')];
  let coversStarted = false;
  function loadProjectCovers() {
    if (coversStarted) return;
    coversStarted = true;
    const queue = deferredCovers.slice();
    function next() {
      const picture = queue.shift(); if (!picture) return;
      let attempts = 0;
      picture.onload = () => { picture.onload = picture.onerror = null; next(); };
      picture.onerror = () => {
        if (attempts++ === 0) { picture.src = picture.dataset.coverSrc + '?retry=1'; return; }
        picture.onload = picture.onerror = null; next();
      };
      if (!mobileMedia && picture.dataset.coverSrcset) picture.srcset = picture.dataset.coverSrcset;
      picture.loading = 'eager'; picture.src = picture.dataset.coverSrc;
    }
    for (let i=0; i<(mobileMedia ? 3 : 6); i++) next();
  }
  function warmVisibleCovers() {
    if ($('works').getBoundingClientRect().top < innerHeight + 400) loadProjectCovers();
  }
  if (!mobileMedia) loadProjectCovers();
  else {
    if ('IntersectionObserver' in window) {
      const coverObserver = new IntersectionObserver(entries => {
        if (entries.some(entry=>entry.isIntersecting)) { loadProjectCovers(); coverObserver.disconnect(); }
      }, {rootMargin:'400px 0px'});
      coverObserver.observe($('works'));
    }
    addEventListener('scroll',warmVisibleCovers,{passive:true});
    document.querySelectorAll('a[href="#works"]').forEach(link=>link.addEventListener('click',loadProjectCovers));
    warmVisibleCovers();
  }

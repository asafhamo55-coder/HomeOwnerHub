// Deliberately NOT a 'use client' module: server root layouts inline this
// string in <head>. Importing a value from a client module into a server
// component yields a client reference, not the string.
//
// Runs before paint: applies `.dark` (stored preference, else the OS) and
// the collapsed-sidebar attribute, so neither flashes on load.
export const THEME_INIT_SCRIPT =
  "(function(){try{var d=document.documentElement;var t=localStorage.getItem('theme');if(!t||t==='system'){t=window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light';}if(t==='dark'){d.classList.add('dark');}if(localStorage.getItem('sidebar')==='collapsed'){d.setAttribute('data-sidebar','collapsed');}}catch(e){}})();"

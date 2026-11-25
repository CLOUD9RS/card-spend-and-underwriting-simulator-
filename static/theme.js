const systemTheme = matchMedia('(prefers-color-scheme: dark)');
function preference(key, fallback) {
  try {return localStorage.getItem('cardfolio.'+key) || fallback} catch {return fallback}
}
function remember(key, value) {
  try { localStorage.setItem('cardfolio.'+key,value) } catch {}
}
function applyTheme(choice) {
  const theme = ['light','dark','system'].includes(choice) ? choice : 'system';
  document.documentElement.dataset.appearance = theme;
  document.documentElement.dataset.theme = theme==='system' ? (systemTheme.matches?'dark':'light') : theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content',document.documentElement.dataset.theme==='dark'?'#101c1a':'#f4f6f3');
}
applyTheme(preference('theme','system'));
systemTheme.addEventListener('change',()=>applyTheme(preference('theme','system')));

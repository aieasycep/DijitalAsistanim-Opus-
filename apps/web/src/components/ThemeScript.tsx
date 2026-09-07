export const THEME_STORAGE_KEY = 'da-theme'

// Runs before first paint so the page never flashes the wrong theme.
const inlineScript = `(function(){try{var t=window.localStorage.getItem('${THEME_STORAGE_KEY}');var r=document.documentElement;if(t==='light'||t==='dark'){r.setAttribute('data-theme',t);}else{r.removeAttribute('data-theme');}}catch(e){}})();`

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: inlineScript }} />
}

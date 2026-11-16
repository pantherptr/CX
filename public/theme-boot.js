// Paints the saved theme before the app loads (no light flash on a dark theme). A separate file, not an
// inline <script>, so the Content-Security-Policy in vercel.json can refuse every inline script.
try {
  var t = localStorage.getItem('cx-theme') || localStorage.getItem('cx-gateway-theme');
  if (/^\/signal(\/|$)/.test(location.pathname)) t = localStorage.getItem('cx-signal-theme') || 'dark';
  if (t === 'dark') {
    document.documentElement.dataset.theme = 'dark';
    document.documentElement.style.colorScheme = 'dark';
    document.querySelector('meta[name="theme-color"]').setAttribute('content', '#000000');
  }
} catch (e) {}

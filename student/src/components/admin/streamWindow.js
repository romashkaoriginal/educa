export function openStreamWindow() {
  const popup = window.open('', '', 'popup,width=1280,height=900');
  if (!popup) return null;
  popup.document.title = 'KUBIK — Трансляция';
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    popup.document.head.appendChild(node.cloneNode(true));
  });
  popup.document.body.style.margin = '0';
  return popup;
}

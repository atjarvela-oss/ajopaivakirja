import L from 'leaflet';

/**
 * Korjaa Leafletin tunnetun bugin React 18 / StrictMode / unmount -tilanteissa,
 * joissa _leaflet_pos luetaan undefined-elementistä (esim. poistetusta mapPanesta tai keskeytetystä animaatiosta).
 */
if (typeof window !== 'undefined' && L && L.DomUtil) {
  const originalGetPosition = L.DomUtil.getPosition;
  L.DomUtil.getPosition = function (el: any) {
    if (!el) {
      return new L.Point(0, 0);
    }
    try {
      return originalGetPosition.call(L.DomUtil, el) || new L.Point(0, 0);
    } catch {
      return (el && el._leaflet_pos) || new L.Point(0, 0);
    }
  };

  const originalSetPosition = L.DomUtil.setPosition;
  L.DomUtil.setPosition = function (el: any, point: any) {
    if (!el) return;
    try {
      originalSetPosition.call(L.DomUtil, el, point);
    } catch {
      // ignore if element is being removed
    }
  };
}

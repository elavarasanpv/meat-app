/**
 * Map style tuned for rural streets: every road down to small lanes is drawn
 * with a clear outline and its name, and only landmarks people navigate by
 * (temples, churches, mosques, schools, hospitals, parks) are shown —
 * shop/business clutter is hidden.
 */
export const RURAL_MAP_STYLE = [
  // base
  { elementType: "geometry", stylers: [{ color: "#ebe4da" }] },
  { featureType: "landscape.man_made", elementType: "geometry", stylers: [{ color: "#e2d9cd" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#4a403a" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#ffffff" }, { weight: 3 }] },

  // roads: visible at every level, with outlines so thin village lanes stand out
  { featureType: "road", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }] },
  { featureType: "road", elementType: "geometry.stroke", stylers: [{ color: "#a8978a" }, { weight: 1.5 }] },
  { featureType: "road.local", elementType: "geometry.fill", stylers: [{ color: "#ffffff" }, { weight: 3 }] },
  { featureType: "road.local", elementType: "geometry.stroke", stylers: [{ color: "#9c8b7d" }, { weight: 1.5 }] },
  { featureType: "road.local", elementType: "labels", stylers: [{ visibility: "on" }] },
  { featureType: "road.arterial", elementType: "geometry.fill", stylers: [{ color: "#ffe2cf" }] },
  { featureType: "road.arterial", elementType: "geometry.stroke", stylers: [{ color: "#f0b48f" }] },
  { featureType: "road.highway", elementType: "geometry.fill", stylers: [{ color: "#ffcfae" }] },
  { featureType: "road.highway", elementType: "geometry.stroke", stylers: [{ color: "#e9946a" }] },
  { featureType: "road", elementType: "labels.icon", stylers: [{ visibility: "off" }] },

  // landmarks people give directions by
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "poi.place_of_worship", stylers: [{ visibility: "on" }] },
  { featureType: "poi.school", stylers: [{ visibility: "on" }] },
  { featureType: "poi.medical", stylers: [{ visibility: "on" }] },
  { featureType: "poi.government", stylers: [{ visibility: "on" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ visibility: "on" }, { color: "#dcefd6" }] },

  // water, transit, boundaries
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#bfdcf2" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#1c1715" }] },
];

export type MapKind = "standard" | "hybrid";

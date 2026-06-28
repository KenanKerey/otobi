import { Marker } from 'react-map-gl/maplibre';

function BusSVG({ line }) {
  return (
    <svg width="72" height="38" viewBox="0 0 72 38" xmlns="http://www.w3.org/2000/svg">
      {/* Ground shadow */}
      <ellipse cx="36" cy="36" rx="30" ry="3" fill="rgba(0,0,0,0.35)" />

      {/* Bus body */}
      <rect x="3" y="5" width="66" height="24" rx="4" ry="4"
        fill="url(#busBody)" stroke="#aaa" strokeWidth="0.5" />

      {/* Body gradient */}
      <defs>
        <linearGradient id="busBody" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="50%" stopColor="#f0f0f0" />
          <stop offset="100%" stopColor="#e0e0e0" />
        </linearGradient>
        <linearGradient id="windowGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6db3f2" />
          <stop offset="60%" stopColor="#3a7fd5" />
          <stop offset="100%" stopColor="#2a5faa" />
        </linearGradient>
      </defs>

      {/* Front windshield */}
      <path d="M3,9 Q3,5 7,5 L12,5 L12,27 Q3,27 3,25 Z"
        fill="url(#windowGrad)" stroke="#3a6fa0" strokeWidth="0.5" />

      {/* Rear window */}
      <path d="M69,9 Q69,5 65,5 L62,5 L62,27 Q69,27 69,25 Z"
        fill="url(#windowGrad)" stroke="#3a6fa0" strokeWidth="0.5" opacity="0.7" />

      {/* Side windows */}
      <rect x="15" y="7" width="8" height="10" rx="1.5" fill="url(#windowGrad)" opacity="0.9" />
      <rect x="25" y="7" width="8" height="10" rx="1.5" fill="url(#windowGrad)" opacity="0.9" />
      <rect x="35" y="7" width="8" height="10" rx="1.5" fill="url(#windowGrad)" opacity="0.9" />
      <rect x="45" y="7" width="8" height="10" rx="1.5" fill="url(#windowGrad)" opacity="0.9" />
      <rect x="55" y="7" width="5" height="10" rx="1.5" fill="url(#windowGrad)" opacity="0.9" />

      {/* Window reflections */}
      <rect x="15" y="7" width="8" height="3" rx="1.5" fill="rgba(255,255,255,0.3)" />
      <rect x="25" y="7" width="8" height="3" rx="1.5" fill="rgba(255,255,255,0.3)" />
      <rect x="35" y="7" width="8" height="3" rx="1.5" fill="rgba(255,255,255,0.3)" />
      <rect x="45" y="7" width="8" height="3" rx="1.5" fill="rgba(255,255,255,0.3)" />

      {/* Orange IETT stripe */}
      <rect x="3" y="19" width="66" height="6" rx="0"
        fill="#f59e0b" opacity="0.95" />

      {/* Door (dark line) */}
      <rect x="19" y="19" width="1.5" height="10" fill="rgba(0,0,0,0.2)" />

      {/* Bottom trim */}
      <rect x="3" y="26" width="66" height="3" rx="0 0 4 4"
        fill="#888" opacity="0.5" />

      {/* Front headlight */}
      <circle cx="5" cy="22" r="2" fill="#fef08a" stroke="#d4a500" strokeWidth="0.5" opacity="0.8" />

      {/* Rear light */}
      <circle cx="67" cy="22" r="1.5" fill="#ef4444" stroke="#b91c1c" strokeWidth="0.5" opacity="0.7" />

      {/* Wheels */}
      <circle cx="18" cy="30" r="4" fill="#2a2a2a" stroke="#444" strokeWidth="0.5" />
      <circle cx="54" cy="30" r="4" fill="#2a2a2a" stroke="#444" strokeWidth="0.5" />
      {/* Hubcaps */}
      <circle cx="18" cy="30" r="2" fill="#666" />
      <circle cx="54" cy="30" r="2" fill="#666" />
      <circle cx="18" cy="30" r="0.8" fill="#999" />
      <circle cx="54" cy="30" r="0.8" fill="#999" />

      {/* Line code text on bus body */}
      <text x="36" y="16" textAnchor="middle" fontSize="9" fontWeight="800"
        fill="#1a1a1a" fontFamily="'JetBrains Mono', monospace"
        letterSpacing="0.5">
        {line}
      </text>

      {/* Top shine */}
      <rect x="10" y="5" width="52" height="1" rx="0.5"
        fill="rgba(255,255,255,0.6)" />
    </svg>
  );
}

export default function BusMarker({ bus, onClick }) {
  const hasSpeed = bus.speed != null;
  // heading: 0 = North (up). For a side-view bus facing right, 0 heading = bus facing up.
  // We rotate the wrapper so the bus front points in direction of travel.
  const rotation = bus.heading != null ? bus.heading - 90 : 0;

  return (
    <Marker
      longitude={bus.lng}
      latitude={bus.lat}
      anchor="center"
      onClick={(e) => {
        e.originalEvent.stopPropagation();
        onClick(bus);
      }}
    >
      <div
        className="bus-marker-wrapper"
        title={`${bus.line} → ${bus.destination}${hasSpeed ? ` | ${bus.speed} km/sa` : ''}`}
      >
        {/* Speed + line label */}
        <div className="bus-info-bar">
          <span className="bus-info-line">{bus.line}</span>
          {hasSpeed && <span className="bus-info-speed">{bus.speed} km/sa</span>}
        </div>
        {/* Rotating bus SVG */}
        <div style={{ transform: `rotate(${rotation}deg)` }}>
          <BusSVG line={bus.line} />
        </div>
      </div>
    </Marker>
  );
}

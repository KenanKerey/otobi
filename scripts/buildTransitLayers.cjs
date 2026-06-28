/**
 * Build-time script to fetch Istanbul transit line geometry from OpenStreetMap Overpass API
 * and Metro Istanbul API, then save as static GeoJSON files.
 *
 * Usage: node scripts/buildTransitLayers.js
 */

const fs = require('fs');
const path = require('path');

const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'transit');

// Istanbul metro/tram/ferry line colors (official)
const LINE_COLORS = {
  // Metro
  'M1A': '#e21e26', 'M1B': '#e21e26',
  'M2': '#00af4f', 'M3': '#0076be',
  'M4': '#e085b8', 'M5': '#7d3f98',
  'M6': '#cd9a6a', 'M7': '#f19e1c',
  'M8': '#7cc8e3', 'M9': '#f0c514',
  'M10': '#daa520', 'M11': '#9dc41a',
  'M12': '#00bcd4', 'M14': '#ff5722',
  // Tram
  'T1': '#0054a6', 'T2': '#6f2f9e',
  'T3': '#e91e63', 'T4': '#d32f2f',
  'T5': '#6d4c41',
  // Funicular
  'F1': '#ff5722', 'F2': '#ff9800',
  'F3': '#795548', 'F4': '#607d8b',
  // Marmaray
  'Marmaray': '#e53935',
  // Cable car
  'TF1': '#00bcd4', 'TF2': '#8bc34a',
};

async function overpassQuery(query) {
  const params = new URLSearchParams();
  params.set('data', query.trim());

  const res = await fetch(OVERPASS_URL, {
    method: 'POST',
    body: params,
    headers: {
      'User-Agent': 'Otobi/1.0 (transit data build script)',
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Overpass API error: ${res.status} ${res.statusText} - ${text.slice(0, 200)}`);
  }

  return res.json();
}

function buildNodeMap(elements) {
  const nodeMap = new Map();
  for (const el of elements) {
    if (el.type === 'node' && el.lat != null && el.lon != null) {
      nodeMap.set(el.id, [el.lon, el.lat]);
    }
  }
  return nodeMap;
}

function wayToCoords(way, nodeMap) {
  if (!way.nodes) return [];
  return way.nodes
    .map(nid => nodeMap.get(nid))
    .filter(Boolean);
}

function relationToLineStrings(relation, elements, nodeMap) {
  const wayMap = new Map();
  for (const el of elements) {
    if (el.type === 'way') {
      wayMap.set(el.id, el);
    }
  }

  const lines = [];
  for (const member of (relation.members || [])) {
    if (member.type === 'way') {
      const way = wayMap.get(member.ref);
      if (way) {
        const coords = wayToCoords(way, nodeMap);
        if (coords.length >= 2) {
          lines.push(coords);
        }
      }
    }
  }

  // Try to merge consecutive ways into longer linestrings
  if (lines.length === 0) return [];

  const merged = [lines[0]];
  for (let i = 1; i < lines.length; i++) {
    const prev = merged[merged.length - 1];
    const curr = lines[i];
    const prevEnd = prev[prev.length - 1];
    const currStart = curr[0];
    const currEnd = curr[curr.length - 1];

    if (prevEnd[0] === currStart[0] && prevEnd[1] === currStart[1]) {
      // Connect: prev end matches curr start
      merged[merged.length - 1] = [...prev, ...curr.slice(1)];
    } else if (prevEnd[0] === currEnd[0] && prevEnd[1] === currEnd[1]) {
      // Connect: prev end matches curr end (reverse curr)
      merged[merged.length - 1] = [...prev, ...[...curr].reverse().slice(1)];
    } else {
      merged.push(curr);
    }
  }

  return merged;
}

function extractStations(elements) {
  const stations = [];
  for (const el of elements) {
    if (el.type === 'node' && el.tags && (el.tags.railway === 'station' || el.tags.railway === 'stop' || el.tags.station)) {
      stations.push({
        name: el.tags.name || el.tags['name:tr'] || '',
        lat: el.lat,
        lng: el.lon,
      });
    }
  }
  return stations;
}

async function fetchWithRetry(query, maxRetries = 3) {
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await overpassQuery(query);
    } catch (err) {
      if (err.message.includes('429') && i < maxRetries) {
        const delay = 10000 * (i + 1);
        console.log(`  Rate limited, waiting ${delay / 1000}s before retry...`);
        await new Promise(r => setTimeout(r, delay));
        continue;
      }
      throw err;
    }
  }
}

async function fetchTransitType(transitType, overpassFilter) {
  console.log(`Fetching ${transitType} data from Overpass API...`);

  const query = `
    [out:json][timeout:90];
    area["name"="İstanbul"]["admin_level"="4"]->.istanbul;
    (
      relation${overpassFilter}(area.istanbul);
    );
    out body;
    >;
    out body qt;
  `;

  const data = await fetchWithRetry(query);
  const elements = data.elements || [];
  const nodeMap = buildNodeMap(elements);

  const features = [];
  const allStations = [];

  for (const el of elements) {
    if (el.type !== 'relation') continue;

    const tags = el.tags || {};
    const name = tags.name || tags['name:tr'] || tags.ref || '';
    const ref = tags.ref || '';

    // Extract a short line code (e.g. "M1A", "T1")
    let lineCode = ref;
    if (!lineCode) {
      const match = name.match(/(M\d+[A-Z]?|T\d+|F\d+|TF\d+|Marmaray)/i);
      if (match) lineCode = match[1].toUpperCase();
    }

    const color = LINE_COLORS[lineCode] || tags.colour || '#888888';

    const lineStrings = relationToLineStrings(el, elements, nodeMap);
    // Extract stations from relation members with stop/platform role
    const stationNodeIds = new Set(
      (el.members || [])
        .filter(m => m.type === 'node' && (m.role === 'stop' || m.role === 'platform'))
        .map(m => m.ref)
    );
    const stationNodes = elements.filter(e => e.type === 'node' && stationNodeIds.has(e.id));
    const stations = stationNodes
      .filter(n => n.lat != null && n.lon != null)
      .map(n => ({
        name: (n.tags?.name) || (n.tags?.['name:tr']) || '',
        lat: n.lat,
        lng: n.lon,
      }));

    for (const coords of lineStrings) {
      features.push({
        type: 'Feature',
        properties: {
          name,
          ref: lineCode,
          color,
          type: transitType,
        },
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      });
    }

    stations.forEach(s => {
      allStations.push({
        type: 'Feature',
        properties: {
          name: s.name,
          line: lineCode,
          color,
          type: transitType,
        },
        geometry: {
          type: 'Point',
          coordinates: [s.lng, s.lat],
        },
      });
    });
  }

  return { features, stations: allStations };
}

async function fetchFerryRoutes() {
  console.log('Fetching ferry route data from Overpass API...');

  const query = `
    [out:json][timeout:90];
    area["name"="İstanbul"]["admin_level"="4"]->.istanbul;
    (
      relation["route"="ferry"](area.istanbul);
    );
    out body;
    >;
    out body qt;
  `;

  const data = await fetchWithRetry(query);
  const elements = data.elements || [];
  const nodeMap = buildNodeMap(elements);

  const features = [];
  const stations = [];

  for (const el of elements) {
    if (el.type !== 'relation') continue;

    const tags = el.tags || {};
    const name = tags.name || tags['name:tr'] || '';

    const lineStrings = relationToLineStrings(el, elements, nodeMap);

    for (const coords of lineStrings) {
      features.push({
        type: 'Feature',
        properties: {
          name,
          color: '#4fc3f7',
          type: 'ferry',
        },
        geometry: {
          type: 'LineString',
          coordinates: coords,
        },
      });
    }

    // Ferry terminals
    for (const member of (el.members || [])) {
      if (member.type === 'node' && (member.role === 'stop' || member.role === 'platform')) {
        const node = elements.find(e => e.type === 'node' && e.id === member.ref);
        if (node && node.lat && node.lon) {
          stations.push({
            type: 'Feature',
            properties: {
              name: node.tags?.name || '',
              color: '#4fc3f7',
              type: 'ferry',
            },
            geometry: {
              type: 'Point',
              coordinates: [node.lon, node.lat],
            },
          });
        }
      }
    }
  }

  return { features, stations };
}

async function main() {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  try {
    // Fetch metro lines
    const metro = await fetchTransitType('metro', '["route"="subway"]');
    console.log(`  Found ${metro.features.length} metro line segments, ${metro.stations.length} stations`);

    // Small delay to be nice to Overpass API
    await new Promise(r => setTimeout(r, 8000));

    // Fetch tram lines
    const tram = await fetchTransitType('tram', '["route"="tram"]');
    console.log(`  Found ${tram.features.length} tram line segments, ${tram.stations.length} stations`);

    await new Promise(r => setTimeout(r, 8000));

    // Fetch light rail / monorail
    const rail = await fetchTransitType('rail', '["route"="light_rail"]');
    console.log(`  Found ${rail.features.length} light rail segments, ${rail.stations.length} stations`);

    await new Promise(r => setTimeout(r, 8000));

    // Fetch funicular
    const funicular = await fetchTransitType('funicular', '["route"="funicular"]');
    console.log(`  Found ${funicular.features.length} funicular segments, ${funicular.stations.length} stations`);

    await new Promise(r => setTimeout(r, 8000));

    // Fetch ferry routes
    const ferry = await fetchFerryRoutes();
    console.log(`  Found ${ferry.features.length} ferry route segments, ${ferry.stations.length} terminals`);

    // Combine rail-based transit (metro + tram + rail + funicular)
    const railLines = {
      type: 'FeatureCollection',
      features: [...metro.features, ...tram.features, ...rail.features, ...funicular.features],
    };

    const ferryLines = {
      type: 'FeatureCollection',
      features: ferry.features,
    };

    const allStations = {
      type: 'FeatureCollection',
      features: [...metro.stations, ...tram.stations, ...rail.stations, ...funicular.stations, ...ferry.stations],
    };

    // Write output files
    const railPath = path.join(OUTPUT_DIR, 'rail.geojson');
    const ferryPath = path.join(OUTPUT_DIR, 'ferry.geojson');
    const stationsPath = path.join(OUTPUT_DIR, 'stations.geojson');

    fs.writeFileSync(railPath, JSON.stringify(railLines));
    fs.writeFileSync(ferryPath, JSON.stringify(ferryLines));
    fs.writeFileSync(stationsPath, JSON.stringify(allStations));

    console.log(`\nOutput files written:`);
    console.log(`  ${railPath} (${(fs.statSync(railPath).size / 1024).toFixed(1)} KB)`);
    console.log(`  ${ferryPath} (${(fs.statSync(ferryPath).size / 1024).toFixed(1)} KB)`);
    console.log(`  ${stationsPath} (${(fs.statSync(stationsPath).size / 1024).toFixed(1)} KB)`);
    console.log('\nDone!');
  } catch (err) {
    console.error('Error:', err.message);
    process.exit(1);
  }
}

main();

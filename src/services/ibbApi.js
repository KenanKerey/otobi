import { XMLParser } from 'fast-xml-parser';
import { calculateDistanceKm } from '../utils/distance';
import { fetchAllStops, fetchAllLines } from './supabase';

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@_'
});

// ── Caches ──────────────────────────────────────────
let cachedStops = null;
let cachedLines = null;

// De-dupe concurrent identical line-position requests (e.g. React StrictMode
// double-invokes the effect in dev) so they share a single network call.
const hatKonumInFlight = new Map();

// ── Generic SOAP helper ─────────────────────────────
function getBody(parsed) {
  const envelope = parsed['soap:Envelope'] || parsed['soapenv:Envelope'];
  if (!envelope) return null;
  return envelope['soap:Body'] || envelope['soapenv:Body'];
}

function isRateLimitError(fault) {
  const faultString = (fault.faultstring || '').toLowerCase();
  if (faultString.includes('policy falsified')) return true;

  const detail = fault.detail || fault.Detail || {};
  const policyResult = detail['l7:policyResult'];
  if (!policyResult) return false;

  const status = typeof policyResult === 'object'
    ? (policyResult['@_status'] || '')
    : String(policyResult);
  return status.toLowerCase().includes('rate limit');
}

function checkFault(body) {
  const fault = body?.['soap:Fault'] || body?.['soapenv:Fault'];
  if (!fault) return;

  if (isRateLimitError(fault)) {
    throw new RateLimitError();
  }
  throw new Error(fault.faultstring || 'SOAP API hatası');
}

class RateLimitError extends Error {
  constructor() {
    super('API istek limiti aşıldı. Lütfen birkaç saniye bekleyin.');
    this.name = 'RateLimitError';
  }
}

async function soapRequest(endpoint, soapAction, bodyXml, retries = 1) {
  const envelope = `<?xml version="1.0" encoding="utf-8"?>
<soap:Envelope xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/">
  <soap:Body>
    ${bodyXml}
  </soap:Body>
</soap:Envelope>`;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'text/xml; charset=utf-8',
        'SOAPAction': `"http://tempuri.org/${soapAction}"`
      },
      body: envelope
    });

    const text = await response.text();
    const result = parser.parse(text);
    const body = getBody(result);

    if (!body) {
      throw new Error('Geçersiz API yanıtı');
    }

    try {
      checkFault(body);
    } catch (err) {
      if (err instanceof RateLimitError && attempt < retries) {
        await new Promise(r => setTimeout(r, 3000 * Math.pow(2, attempt)));
        continue;
      }
      throw err;
    }

    return body;
  }
}

// ── Fleet positions (GetFiloAracKonum_json) ────────
// This is the heavy "all vehicles in Istanbul" call. It is ONLY used for the
// city-wide overview (no line selected). Per-line tracking does NOT use it —
// that keeps each tracking poll to a single light request and avoids the IBB
// rate limit. Cached 30s and de-duped so concurrent callers share one request.
const FLEET_TTL = 30000;
let cachedFleet = null;
let fleetFetchTime = 0;
let fleetInFlight = null;

export async function getFleetPositions() {
  const now = Date.now();
  if (cachedFleet && now - fleetFetchTime < FLEET_TTL) return cachedFleet;
  if (fleetInFlight) return fleetInFlight;

  fleetInFlight = (async () => {
    try {
      const body = await soapRequest(
        '/api/iett/FiloDurum/SeferGerceklesme.asmx',
        'GetFiloAracKonum_json',
        '<GetFiloAracKonum_json xmlns="http://tempuri.org/" />',
        0
      );

      const jsonString = body['GetFiloAracKonum_jsonResponse']?.['GetFiloAracKonum_jsonResult'];
      if (!jsonString) return cachedFleet || [];

      const data = JSON.parse(jsonString);
      const vehicles = data
        .filter(v => v.Boylam && v.Enlem)
        .map(v => ({
          id: v.KapiNo || '',
          lat: parseFloat(v.Enlem),
          lng: parseFloat(v.Boylam),
          speed: parseInt(v.Hiz, 10) || 0,
          plate: v.Plaka || '',
          line: v.HatKodu || '',
        }))
        .filter(v => !isNaN(v.lat) && !isNaN(v.lng));

      cachedFleet = vehicles;
      fleetFetchTime = Date.now();
      return vehicles;
    } catch (err) {
      console.warn('Filo konum verisi alınamadı:', err.message);
      return cachedFleet || [];
    } finally {
      fleetInFlight = null;
    }
  })();

  return fleetInFlight;
}

// ── Stops (from Supabase, not IBB) ──────────────────
// Pre-seeded static data; one cached read, no IBB rate-limit exposure.
export async function getAllStops() {
  if (cachedStops) return cachedStops;

  try {
    const stopsArray = await fetchAllStops();
    const stopsMap = new Map();
    stopsArray.forEach(stop => {
      stopsMap.set(String(stop.code), {
        code: String(stop.code),
        name: stop.name,
        district: stop.district,
        lat: stop.lat,
        lng: stop.lng,
      });
    });
    cachedStops = stopsMap;
    return stopsMap;
  } catch (err) {
    console.error('Duraklar çekilirken hata oluştu:', err);
    return new Map();
  }
}

// ── Lines (from Supabase, not IBB) ──────────────────
export async function getAllLines() {
  if (cachedLines) return cachedLines;

  try {
    const linesArray = await fetchAllLines();
    cachedLines = linesArray.map(line => ({
      code: line.code || '',
      name: line.name || '',
    }));
    return cachedLines;
  } catch (err) {
    console.error('Hatlar çekilirken hata oluştu:', err);
    return [];
  }
}

// ── Line stops (ordered by SIRANO) ─────────────────
let cachedLineStops = new Map(); // lineCode -> [{code, name, lat, lng, direction, sequence}]

export async function getLineStops(lineCode) {
  const key = lineCode.toUpperCase();
  if (cachedLineStops.has(key)) return cachedLineStops.get(key);

  try {
    const body = await soapRequest(
      '/api/iett/ibb/ibb.asmx',
      'DurakDetay_GYY',
      `<DurakDetay_GYY xmlns="http://tempuri.org/"><hat_kodu>${key}</hat_kodu></DurakDetay_GYY>`
    );

    const result = body['DurakDetay_GYYResponse']?.['DurakDetay_GYYResult'];
    if (!result) return [];

    // Response format: { NewDataSet: { Table: [...] } }
    const ds = result['NewDataSet'] || result['diffgr:diffgram']?.['NewDataSet'];
    if (!ds) return [];

    let rows = ds.Table || ds.table || [];
    if (!Array.isArray(rows)) rows = [rows];

    const stops = rows
      .map(row => ({
        code: String(row.DURAKKODU || ''),
        name: row.DURAKADI || '',
        lat: parseFloat(row.YKOORDINATI),
        lng: parseFloat(row.XKOORDINATI),
        direction: row.YON || '',
        sequence: parseInt(row.SIRANO, 10) || 0,
      }))
      .filter(s => !isNaN(s.lat) && !isNaN(s.lng))
      .sort((a, b) => a.sequence - b.sequence);

    cachedLineStops.set(key, stops);
    return stops;
  } catch (err) {
    console.warn('Hat durak verisi alınamadı:', err.message);
    return [];
  }
}

// ── Buses by line ───────────────────────────────────
// Single light request per poll. Speed is derived from GPS deltas in useBuses
// (no heavy fleet call), which keeps us well under the IBB rate limit.
export async function getBusesByLine(line, stopsMap) {
  const key = line.toUpperCase();

  let promise = hatKonumInFlight.get(key);
  if (!promise) {
    promise = soapRequest(
      '/api/iett/FiloDurum/SeferGerceklesme.asmx',
      'GetHatOtoKonum_json',
      `<GetHatOtoKonum_json xmlns="http://tempuri.org/"><HatKodu>${key}</HatKodu></GetHatOtoKonum_json>`
    ).finally(() => hatKonumInFlight.delete(key));
    hatKonumInFlight.set(key, promise);
  }

  const body = await promise;

  const jsonString = body['GetHatOtoKonum_jsonResponse']['GetHatOtoKonum_jsonResult'];
  if (!jsonString) return [];

  const data = JSON.parse(jsonString);

  return data.map(bus => {
    const lat = parseFloat(bus.enlem);
    const lng = parseFloat(bus.boylam);

    let approachingStop = null;
    if (bus.yakinDurakKodu && stopsMap.has(bus.yakinDurakKodu)) {
      const stopInfo = stopsMap.get(bus.yakinDurakKodu);
      if (stopInfo.lat && stopInfo.lng) {
        const distKm = calculateDistanceKm(lat, lng, stopInfo.lat, stopInfo.lng);
        // ETA filled in by useBuses once speed is known.
        approachingStop = { ...stopInfo, distanceKm: distKm, etaMin: null };
      }
    }

    return {
      id: bus.kapino,
      lat,
      lng,
      line: bus.hatkodu,
      routeCode: bus.guzergahkodu || '',
      destination: bus.yon || 'Bilinmiyor',
      speed: null,                      // computed from GPS deltas in useBuses
      plate: bus.kapino,
      lastUpdate: bus.son_konum_zamani ? bus.son_konum_zamani.split(' ')[1]?.slice(0, 5) : '-',
      rawTime: bus.son_konum_zamani || null,
      approachingStop,
    };
  });
}

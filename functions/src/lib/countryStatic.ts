// Static per-country travel facts. Used when no API source exists.
// Seed values; extend over time. Keys are ISO 3166-1 alpha-2.

export interface StaticFacts {
  plugs: string[];          // e.g. ["A", "B"]
  voltage: string;          // "120V/60Hz"
  tapWaterSafe: boolean;
  tippingPercent: string;   // "15-20%", "service included"
  emergency: { police?: string; ambulance?: string; fire?: string; universal?: string };
  driving: "left" | "right";
}

export const COUNTRY_STATIC: Record<string, Partial<StaticFacts>> = {
  US: { plugs: ["A", "B"], voltage: "120V/60Hz", tapWaterSafe: true, tippingPercent: "15-20%", emergency: { universal: "911" }, driving: "right" },
  GB: { plugs: ["G"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "10-12.5%", emergency: { universal: "999", police: "999", ambulance: "999", fire: "999" }, driving: "left" },
  DE: { plugs: ["C", "F"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "5-10%", emergency: { universal: "112" }, driving: "right" },
  FR: { plugs: ["C", "E"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "service included", emergency: { universal: "112" }, driving: "right" },
  IT: { plugs: ["C", "F", "L"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "5-10%", emergency: { universal: "112" }, driving: "right" },
  ES: { plugs: ["C", "F"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "5-10%", emergency: { universal: "112" }, driving: "right" },
  GR: { plugs: ["C", "F"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "5-10%", emergency: { universal: "112" }, driving: "right" },
  JP: { plugs: ["A", "B"], voltage: "100V/50-60Hz", tapWaterSafe: true, tippingPercent: "no tipping", emergency: { police: "110", ambulance: "119", fire: "119" }, driving: "left" },
  CN: { plugs: ["A", "C", "I"], voltage: "220V/50Hz", tapWaterSafe: false, tippingPercent: "not customary", emergency: { police: "110", ambulance: "120", fire: "119" }, driving: "right" },
  TH: { plugs: ["A", "B", "C", "F"], voltage: "220V/50Hz", tapWaterSafe: false, tippingPercent: "round up / 10%", emergency: { police: "191", ambulance: "1669" }, driving: "left" },
  VN: { plugs: ["A", "C", "F"], voltage: "220V/50Hz", tapWaterSafe: false, tippingPercent: "5-10%", emergency: { police: "113", ambulance: "115", fire: "114" }, driving: "right" },
  LA: { plugs: ["A", "B", "C", "E", "F"], voltage: "230V/50Hz", tapWaterSafe: false, tippingPercent: "round up", emergency: { police: "191", ambulance: "195" }, driving: "right" },
  KH: { plugs: ["A", "C", "G"], voltage: "230V/50Hz", tapWaterSafe: false, tippingPercent: "10%", emergency: { police: "117", ambulance: "119" }, driving: "right" },
  ID: { plugs: ["C", "F"], voltage: "230V/50Hz", tapWaterSafe: false, tippingPercent: "10%", emergency: { police: "110", ambulance: "118" }, driving: "left" },
  IN: { plugs: ["C", "D", "M"], voltage: "230V/50Hz", tapWaterSafe: false, tippingPercent: "10%", emergency: { universal: "112" }, driving: "left" },
  AU: { plugs: ["I"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "not expected", emergency: { universal: "000" }, driving: "left" },
  NZ: { plugs: ["I"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "not expected", emergency: { universal: "111" }, driving: "left" },
  CA: { plugs: ["A", "B"], voltage: "120V/60Hz", tapWaterSafe: true, tippingPercent: "15-20%", emergency: { universal: "911" }, driving: "right" },
  MX: { plugs: ["A", "B"], voltage: "127V/60Hz", tapWaterSafe: false, tippingPercent: "10-15%", emergency: { universal: "911" }, driving: "right" },
  BR: { plugs: ["C", "N"], voltage: "127-220V/60Hz", tapWaterSafe: false, tippingPercent: "service included", emergency: { police: "190", ambulance: "192" }, driving: "right" },
  AR: { plugs: ["C", "I"], voltage: "220V/50Hz", tapWaterSafe: true, tippingPercent: "10%", emergency: { universal: "911" }, driving: "right" },
  TR: { plugs: ["C", "F"], voltage: "230V/50Hz", tapWaterSafe: false, tippingPercent: "5-10%", emergency: { universal: "112" }, driving: "right" },
  AE: { plugs: ["G"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "10-15%", emergency: { police: "999", ambulance: "998" }, driving: "right" },
  EG: { plugs: ["C", "F"], voltage: "220V/50Hz", tapWaterSafe: false, tippingPercent: "10-15%", emergency: { police: "122", ambulance: "123" }, driving: "right" },
  ZA: { plugs: ["M", "N"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "10-15%", emergency: { universal: "112" }, driving: "left" },
  MA: { plugs: ["C", "E"], voltage: "220V/50Hz", tapWaterSafe: false, tippingPercent: "10%", emergency: { police: "19", ambulance: "15" }, driving: "right" },
  PT: { plugs: ["C", "F"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "5-10%", emergency: { universal: "112" }, driving: "right" },
  NL: { plugs: ["C", "F"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "5-10%", emergency: { universal: "112" }, driving: "right" },
  BE: { plugs: ["C", "E"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "service included", emergency: { universal: "112" }, driving: "right" },
  CH: { plugs: ["C", "J"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "service included", emergency: { universal: "112" }, driving: "right" },
  AT: { plugs: ["C", "F"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "5-10%", emergency: { universal: "112" }, driving: "right" },
  CZ: { plugs: ["C", "E"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "10%", emergency: { universal: "112" }, driving: "right" },
  PL: { plugs: ["C", "E"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "10%", emergency: { universal: "112" }, driving: "right" },
  RU: { plugs: ["C", "F"], voltage: "220V/50Hz", tapWaterSafe: false, tippingPercent: "10%", emergency: { universal: "112" }, driving: "right" },
  KR: { plugs: ["C", "F"], voltage: "220V/60Hz", tapWaterSafe: true, tippingPercent: "not customary", emergency: { police: "112", ambulance: "119" }, driving: "right" },
  SG: { plugs: ["G"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "service included", emergency: { universal: "995" }, driving: "left" },
  MY: { plugs: ["G"], voltage: "240V/50Hz", tapWaterSafe: false, tippingPercent: "not expected", emergency: { universal: "999" }, driving: "left" },
  PH: { plugs: ["A", "B", "C"], voltage: "220V/60Hz", tapWaterSafe: false, tippingPercent: "10%", emergency: { universal: "911" }, driving: "right" },
  IL: { plugs: ["C", "H", "M"], voltage: "230V/50Hz", tapWaterSafe: true, tippingPercent: "10-15%", emergency: { police: "100", ambulance: "101" }, driving: "right" },
};

export function getCountryStatic(cc: string): Partial<StaticFacts> {
  return COUNTRY_STATIC[cc.toUpperCase()] || {};
}

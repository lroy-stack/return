/**
 * Offline stand-in for Nominatim, used only when ENVIRONMENT=development and NOMINATIM_STUB=1 (E2E and
 * local work without network). It answers in-process: nothing is exposed over HTTP and nothing leaves
 * the machine. Answers are deterministic and echo the request so tests can tell them apart.
 */
export function stubNominatim(path: string, params: Record<string, string>): unknown {
  if (path === "/reverse") {
    return {
      name: "Stub Place",
      display_name: `Stub Place, Stub Street, Stubville, Stubland (${params.lat}, ${params.lon})`,
      address: { amenity: "Stub Place", road: "Stub Street", city: "Stubville", country: "Stubland" },
    };
  }
  const q = params.q ?? "";
  return [1, 2].map((n) => ({
    name: `${q} (stub ${n})`,
    display_name: `${q} (stub ${n}), Stub Street, Stubville, Stubland`,
    lat: String(40 + n / 100),
    lon: "-3.70",
    address: { amenity: `${q} (stub ${n})`, city: "Stubville", country: "Stubland" },
  }));
}

// Word pools for the games that need plausible Foundation-flavoured text.
//
// Everything here is uppercase ASCII by construction: the whole app enforces
// ASCII-only input (see lib/validation.ts), and a puzzle whose answer contained
// a character the answer box rejects would be unwinnable.

// Grouped by length so ICE PASSWORD CRACK can draw a candidate set that is all
// the same length — the likeness mechanic is meaningless otherwise.
export const PASSWORD_POOL: Record<number, readonly string[]> = {
  6: [
    "BREACH", "KETER", "SECURE", "REDACT", "SITE19", "PURGE", "AMNION",
    "VECTOR", "SHROUD", "CINDER", "HOLLOW", "MARROW", "SABLE", "TETHER",
    "WARDEN", "GRAVEN", "HUSHED", "IRONNE", "LANTRN", "MENDER",
  ],
  7: [
    "CONTAIN", "ANOMALY", "PROTECT", "EUCLIDS", "OVERSEE", "ABERRNT",
    "CASCADE", "DERELIC", "EMBASSY", "FRAGILE", "GRANITE", "HARBOUR",
    "INSIGHT", "JANITOR", "KEYSTON", "LATTICE", "MERIDIA", "NOCTURN",
    "OBELISK", "PARADOX",
  ],
  8: [
    "CONTAINS", "PROTOCOL", "QUARTERS", "RESONATE", "SANCTUAR", "THRESHLD",
    "UMBRALLA", "VIGILANT", "WATCHMAN", "XENOLITH", "YARDBIRD", "ZEPPELIN",
    "ABSOLUTE", "BULKHEAD", "CATACOMB", "DOWNLINK", "EMISSARY", "FIREWALL",
    "GLASSEYE", "HINTERLD",
  ],
  9: [
    "CONTAINED", "PERIMETER", "RECURSION", "SUBSTRATE", "TERMINATE",
    "UNDERTOWN", "VESTIBULE", "WAVEGUIDE", "XEROGRAPH", "YOKEPOINT",
    "ZOETROPES", "ABERRATIO", "BLACKSITE", "CARTOUCHE", "DISSOLVED",
    "ENCLOSURE", "FILAMENTS", "GATEHOUSE", "HOLOGRAPH", "INTERDICT",
  ],
};

// Short plaintexts for SUBSTITUTION BREAK. Letters only — the cipher alphabet
// is A-Z, so a digit in the plaintext would survive the shift unchanged and
// hand the player a free crib.
export const CIPHER_PHRASES: readonly string[] = [
  "CONTAINMENT HOLDS",
  "BREACH IN SECTOR",
  "SEAL THE VAULT",
  "PURGE THE RECORD",
  "OVERSEER CONSENT",
  "LOCKDOWN ACTIVE",
  "SITE NINETEEN",
  "TERMINATE ACCESS",
  "ANOMALY CONTAINED",
  "EVACUATE THE WING",
  "DEEP STORAGE ONLY",
  "SILENCE THE ALARM",
  "REDACT THE ENTRY",
  "CLOSE THE APERTURE",
  "HOLD THE PERIMETER",
  "BURN THE MANIFEST",
];

// Hidden strings for STRING EXTRACTION. Kept short so a band-1 dump stays
// readable and a band-4 one stays solvable inside the clock.
export const HIDDEN_STRINGS: readonly string[] = [
  "KETER", "SAFE", "VAULT", "PURGE", "BREACH", "SEALED", "OMEGA",
  "WARDEN", "CINDER", "HOLLOW", "SHROUD", "TETHER", "MARROW", "GRAVEN",
];

// Specimen designations for CONTAINMENT TRIAGE.
export const SPECIMEN_PREFIXES: readonly string[] = [
  "SPC", "ANO", "ITM", "OBJ", "ENT", "ART",
];

// Node labels for ROUTE RECONSTRUCTION, and host labels for FIREWALL AUDIT.
export const NODE_LABELS: readonly string[] = [
  "AXON", "BRIG", "CORE", "DOCK", "ECHO", "FLUX", "GATE", "HELM",
  "IRIS", "JOLT", "KILN", "LOOM", "MAST", "NODE", "ONYX", "PYRE",
  "QUAY", "RUNE", "SPUR", "TIDE", "VANE", "WELL", "YARD", "ZINC",
];

// Fragment alphabet for TOKEN REASSEMBLY. Deliberately excludes characters
// that are hard to tell apart in a monospace face (O/0, I/1/L) so a player
// never loses to a font.
export const FRAGMENT_CHARS = "ACDEFHJKMNPRTUVWXY2345789";

// Non-ASCII characters (accented letters, emoji, homoglyphs, RTL overrides,
// zero-width characters, etc.) are rejected outright. Every field in the
// submitted FormData is checked so no text-entry path is missed.
const ASCII_ONLY = /^[\x00-\x7F]*$/;

export function containsNonAscii(value: string): boolean {
  return !ASCII_ONLY.test(value);
}

export function findNonAsciiFormField(formData: FormData): string | null {
  for (const [key, value] of formData.entries()) {
    if (typeof value === "string" && containsNonAscii(value)) {
      return key;
    }
  }
  return null;
}

export const NON_ASCII_ERROR = "NON-ASCII CHARACTERS ARE NOT ALLOWED.";

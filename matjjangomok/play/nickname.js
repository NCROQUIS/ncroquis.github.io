// Compose modern Hangul (including names pasted from NFD-normalizing systems)
// before display, so font shards cannot split a single syllable's shaping run.
// This does not filter characters or alter the stored nickname override.
export function displayNickname(value) {
  return typeof value === "string" ? value.normalize("NFC") : "";
}

// The server supplies the same game-scoped guest code to the owner and peers.
// Keep localization at display time and preserve explicit names over that code.
export function profileNickname(profile, translate, fallback = "") {
  return displayNickname(profile?.nickname || (profile?.guestCode
    ? translate("recordGuest", { code: profile.guestCode }) : fallback));
}

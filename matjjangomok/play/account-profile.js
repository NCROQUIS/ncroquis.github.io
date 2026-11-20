// NcqAuth is the only source of the game's current display profile.
// Explicitly initialize an empty override before Board can import an old name.
export async function loadAccountProfile(auth, player, { forceRefresh = false } = {}) {
  if (!auth?.updateProfile) throw Object.assign(new Error("profileUnavailable"), { code: "profileUnavailable" });
  let profile = await auth.profile({ forceRefresh });
  if (profile?.player !== player) throw Object.assign(new Error("identity_changed"), { code: "identity_changed" });
  if (profile.profileManaged === false) throw Object.assign(new Error("profileUnavailable"), { code: "profileUnavailable" });
  if (!profile.profileInitialized) {
    profile = await auth.updateProfile({ nickname: "" }, { ifUnset: true, expectedPlayer: player });
  }
  if (profile?.player !== player) throw Object.assign(new Error("identity_changed"), { code: "identity_changed" });
  return profile;
}

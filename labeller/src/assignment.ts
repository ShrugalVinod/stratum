// Who labels which scene (decision 17 Oct 2026; mirrored in stratum/labelling/assignment.py).
// Pilot (≤ 40 scenes): every labeller labels every scene.
// Main: each scene is labelled by exactly TWO of the three labellers (pre-registered
// "two team members, independently"), in rotating pairs over the scene ids sorted A→Z:
// position k → pair k mod 3 = (aditya, ishaan), (aditya, abeer), (ishaan, abeer).
export const LABELLERS = ["aditya", "ishaan", "abeer"] as const;
export type LabellerId = (typeof LABELLERS)[number];
export const PAIRS: [LabellerId, LabellerId][] = [
  ["aditya", "ishaan"],
  ["aditya", "abeer"],
  ["ishaan", "abeer"],
];
export const PILOT_MAX_SCENES = 40;

export const isLabeller = (id: string): id is LabellerId => (LABELLERS as readonly string[]).includes(id);

export function labellersFor(sceneIds: string[]): Map<string, LabellerId[]> {
  const out = new Map<string, LabellerId[]>();
  const sorted = [...sceneIds].sort();
  const pilot = sorted.length <= PILOT_MAX_SCENES;
  sorted.forEach((sid, k) => out.set(sid, pilot ? [...LABELLERS] : [...PAIRS[k % 3]]));
  return out;
}

/** Deviation D-003 review: each Claude draft is reviewed by ONE labeller, k mod 3 over sorted ids. */
export function reviewerFor(sceneIds: string[]): Map<string, LabellerId> {
  const out = new Map<string, LabellerId>();
  [...sceneIds].sort().forEach((sid, k) => out.set(sid, LABELLERS[k % 3]));
  return out;
}

export function reviewScenesFor(sceneIds: string[], who: LabellerId): string[] {
  const m = reviewerFor(sceneIds);
  return [...sceneIds].sort().filter((sid) => m.get(sid) === who);
}

export function scenesFor(sceneIds: string[], who: LabellerId): string[] {
  const m = labellersFor(sceneIds);
  return [...sceneIds].sort().filter((sid) => m.get(sid)!.includes(who));
}

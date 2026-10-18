"""Who labels which scene (team decision 17 Oct 2026; mirrored in labeller/src/assignment.ts).

Three labellers (Aditya, Ishaan, Abeer). The pre-registration says each scene is labelled by
**two** team members independently (paper §4.4, ``labellers_per_scene: 2``); with three people
we share the work in rotating pairs:

* **Pilot** (≤ 40 scenes): all three label all 20 scenes, so the guide is tested by everyone.
* **Main**: scene ids sorted A→Z; the scene at position k is labelled by pair k mod 3 =
  (aditya, ishaan), (aditya, abeer), (ishaan, abeer). That gives 134 / 133 / 133 scenes each.
  Scene ids are a random permutation (sampling.py), so the pairs are a random split of the
  strata. Disagreements are settled by discussion; Shrugal Vinod decides if a pair can't agree.
"""

from __future__ import annotations

LABELLERS = ("aditya", "ishaan", "abeer")
PAIRS = (("aditya", "ishaan"), ("aditya", "abeer"), ("ishaan", "abeer"))
PILOT_MAX_SCENES = 40


def labellers_for(scene_ids: list[str]) -> dict[str, list[str]]:
    ids = sorted(scene_ids)
    if len(ids) <= PILOT_MAX_SCENES:
        return {s: list(LABELLERS) for s in ids}
    return {s: list(PAIRS[k % 3]) for k, s in enumerate(ids)}


def reviewer_for(scene_ids: list[str]) -> dict[str, str]:
    """Deviation D-003: each Claude draft is reviewed by ONE labeller, position k → k mod 3.

    100 test scenes → aditya 34, ishaan 33, abeer 33. Same rule as ``reviewerFor`` in
    labeller/src/assignment.ts."""
    return {s: LABELLERS[k % 3] for k, s in enumerate(sorted(scene_ids))}

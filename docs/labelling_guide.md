# STRATUM labelling guide — v0.1 (DRAFT, to be revised after the 20-scene pilot)

Rules 1–6 are the paper's Appendix B (v1.0). They are pre-registered where they affect scoring
(`preregistered.yaml: labelling_rules`) and may only be clarified, not changed, after the pilot.
Everything under "How to" is practical help and can change freely.

## What you are looking for

A **contrail** seen from Meteosat-9 is a **thin, straight or gently curved bright line** in the
BTD image (BTD = T10.8 − T12.0). Ice absorbs more at 12.0 µm than at 10.8 µm, so thin ice cloud,
and above all young contrails, look *brighter* in BTD than their surroundings. A typical contrail
here is 1–3 pixels wide (a pixel is ~3–5 km) and tens to a few hundred pixels long. Old contrails
spread, get fainter and wider, and may bend with the wind; they often come in parallel groups
along air routes.

## The rules

1. **Label a contrail only if it is a line at least 10 pixels long in the BTD image and is
   clearly narrower than it is long.**
2. **Label each contrail as one polyline along its centre. If two contrails cross, label both.**
3. **Do not label linear cloud edges, coastlines or terrain features that appear in the 10.8 µm
   image as well.** Switch to the T10.8 view: if the line is just as sharp there, it is probably
   not a contrail.
4. **Mark each scene as clear, partly obscured or obscured.** Obscured scenes are excluded from
   scoring.
   - *clear*: you can see the whole scene; thick cloud covers less than ~10 % of it.
   - *partly obscured*: thick cloud hides part of the scene, but you can judge the rest.
   - *obscured*: so much thick cloud (or bad data) that you could not see contrails anyway.
5. **When unsure, mark the line as uncertain rather than leaving it out.** Uncertain lines are
   scored separately.
6. **Label without looking at the flight tracks or the model's predictions,** so that labels stay
   independent of the thing being tested. (The app never shows them. Don't open the STRATUM map
   or the overlay figures while labelling.)

Why rules 3 and 6 exist: sharp coastlines and terrain edges can create line-like features in
infrared images that are easy to mistake for contrails, and a labeller who can see the predicted
flight tracks is more likely to "find" faint lines where they expect them.

## How to label a scene (app)

1. Open the labelling app link, type your **labeller ID** (`aditya` or `ishaan`, always the same),
   and open the scene zip (`pilot.zip` first, later `main.zip`). Nothing is uploaded: the images
   stay on your laptop.
2. The app shows scenes in **your own random order**. For each scene:
   - Look at the BTD image first. Press **1 / 2 / 3** (or the buttons) to flip between
     **t − 15 min, t and t + 15 min**: contrails drift and spread slowly; surface features don't
     move at all; ordinary clouds change shape.
   - Press **T** to compare with **T10.8** (rule 3).
   - Use the **contrast** slider and zoom (scroll / pinch, drag to pan) for faint lines.
3. **Draw** each contrail: click points along its centre line, **double-click** (or press
   **Enter**) to finish. Choose **sure** or **uncertain** for it (press **U** to toggle the
   selected line). Lines shorter than 10 px are refused (rule 1).
4. Mistakes: **Ctrl/Cmd + Z** undo, **Ctrl/Cmd + Shift + Z** redo, select a line and press
   **Delete**.
5. Set the **scene status** (clear / partly obscured / obscured). If there are no contrails at
   all, press **No contrails** (that is a real answer, not a skipped scene). If the scene is
   unusable (broken image), choose **Unusable** and write why.
6. **Next scene**. Your work is saved in the browser as you go, but always press **Export** at
   the end of a session: it downloads one zip with a JSON file per scene. Upload that zip to the
   team Drive folder `labels/raw/<your id>/` (unzip it there).

Aim for 3–5 minutes per scene. Don't discuss scenes with the other labeller until both of you
have finished the set; agreement is only meaningful if you work independently.

## After the pilot

Claude computes agreement (object F1 and Cohen's κ on 16-px cells, with 95 % intervals) and makes
a **disagreement gallery**. The team discusses it, clarifies this guide (version bump, changelog
below), and only then do both labellers do the 200 main scenes.

## Changelog

- v0.1 (17 Oct 2026): rules 1–6 from paper Appendix B; how-to for the labelling app. Draft.

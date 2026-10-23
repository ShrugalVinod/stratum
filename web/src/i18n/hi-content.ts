// Hindi for the text in content/site.ts (methods, results, logbook, team, data sources), keyed by
// the English like hi.ts. Drafted with AI (Claude), to be reviewed by the team. When an English
// sentence in site.ts changes, its Hindi here stops matching and the page shows the English until
// this file is updated.
export const HI_CONTENT: Record<string, string> = {
  "ADS-B flight tracks":
    "ADS-B उड़ान रास्ते",
  "Where every commercial flight was, minute by minute":
    "हर व्यावसायिक उड़ान मिनट-दर-मिनट कहाँ थी",
  "Raw position reports":
    "कच्ची स्थिति रिपोर्ट",
  "1-minute cruise segments":
    "1 मिनट के क्रूज़ हिस्से",
  "ADS-B Exchange first-of-month samples, bounded to 4–39°N, 66–100°E. Cleaning: duplicates, implausible jumps (> 6,000 ft/min or 100 kt), cruise ≥ FL250, gaps ≤ 10 min filled along the great circle, longer gaps split. Only commercial airline flights are ever shown.":
    "ADS-B Exchange के हर महीने की पहली तारीख के नमूने, 4–39°N, 66–100°E तक सीमित। सफ़ाई: दोहराव, असंभव छलाँगें (> 6,000 ft/min या 100 kt), क्रूज़ ≥ FL250, ≤ 10 मिनट के अंतराल ग्रेट सर्कल पर भरे गए, लंबे अंतराल पर उड़ान बाँटी गई। केवल व्यावसायिक एयरलाइन उड़ानें ही कभी दिखाई जाती हैं।",
  "ERA5 weather":
    "ERA5 मौसम",
  "What the air was like at the aircraft's height":
    "विमान की ऊँचाई पर हवा कैसी थी",
  "Segments":
    "हिस्से",
  "Temperature + humidity":
    "तापमान + नमी",
  "ECMWF ERA5 reanalysis, hourly, 0.25°, 12 pressure levels (100–500 hPa). Linear in time, bilinear in space, linear in ln p vertically (pre-registered).":
    "ECMWF ERA5 रीएनालिसिस, हर घंटे, 0.25°, 12 दबाव लेवल (100–500 hPa)। समय में रैखिक, स्थान में द्विरैखिक, ऊर्ध्वाधर में ln p में रैखिक (पहले से दर्ज)।",
  "Schmidt–Appleman check":
    "श्मिट–ऐपलमैन जाँच",
  "Will a contrail form at all?":
    "क्या कंट्रेल बनेगी भी?",
  "T, humidity, engine efficiency":
    "T, नमी, इंजन दक्षता",
  "Forms / persists flags":
    "बनती है / टिकती है के संकेत",
  "Exact threshold temperature from the mixing-line tangent; persistence requires ice supersaturation (RHi ≥ 1). Engine efficiency from OpenAP per aircraft type.":
    "मिश्रण-रेखा की स्पर्शरेखा से सटीक सीमा तापमान; टिकने के लिए बर्फ़-अतिसंतृप्ति (RHi ≥ 1) ज़रूरी। इंजन दक्षता OpenAP से, हर विमान प्रकार के लिए।",
  "CoCiP model":
    "CoCiP मॉडल",
  "How long will it last, and how much will it warm?":
    "यह कितनी देर टिकेगी, और कितना गर्म करेगी?",
  "Flagged segments":
    "चिह्नित हिस्से",
  "Lifetime + energy forcing":
    "जीवनकाल + ऊर्जा फ़ोर्सिंग",
  "pycontrails CoCiP with three humidity baselines (B1 raw, B2 ÷0.95, B3 latitude correction) and 100 Monte Carlo members for the 5th–95th percentile range.":
    "pycontrails CoCiP, तीन नमी बेसलाइन के साथ (B1 कच्चा, B2 ÷0.95, B3 अक्षांश सुधार) और 5वें–95वें प्रतिशतक दायरे के लिए 100 मोंटे कार्लो सदस्य।",
  "Satellite check":
    "उपग्रह जाँच",
  "Did a contrail actually appear?":
    "क्या सचमुच कंट्रेल दिखी?",
  "Meteosat-9 images":
    "Meteosat-9 तस्वीरें",
  "Detected contrail lines":
    "खोजी गई कंट्रेल लकीरें",
  "Brightness-temperature difference (10.8 − 12.0 µm), oriented line filters, parallax correction for the satellite's viewing angle, and observability rules: cloudy or high-angle scenes count as unknown, never as 'no contrail'.":
    "ब्राइटनेस-तापमान अंतर (10.8 − 12.0 µm), दिशा वाले लाइन फ़िल्टर, उपग्रह के देखने के कोण के लिए पैरलैक्स सुधार, और दृश्यता के नियम: बादल वाले या तिरछे कोण वाले दृश्य 'अज्ञात' गिने जाते हैं, कभी 'कंट्रेल नहीं' नहीं।",
  "Correction":
    "सुधार",
  "Learn where the physics is wrong":
    "सीखना कि भौतिकी कहाँ गलत है",
  "Predictions + satellite labels":
    "अनुमान + उपग्रह लेबल",
  "Calibrated probability":
    "कैलिब्रेटेड संभावना",
  "Gradient-boosted trees with monotone constraints and isotonic calibration, trained west of 80°E and tested east of it on held-out seasons (Phase 7).":
    "एकदिश (monotone) बाध्यताओं और आइसोटोनिक कैलिब्रेशन वाले ग्रेडिएंट-बूस्टेड ट्री, 80°E के पश्चिम में प्रशिक्षित और पूर्व में अलग रखे गए मौसमों पर परखे गए (चरण 7)।",
  "Decision":
    "निर्णय",
  "Fly 2,000 ft higher here?":
    "यहाँ 2,000 ft ऊपर उड़ें?",
  "Corrected estimate + fuel":
    "सुधरा अनुमान + ईंधन",
  "Advice with a lower bound":
    "निचली सीमा के साथ सलाह",
  "Alternatives at ±2,000 and ±4,000 ft, extra fuel and CO₂ from OpenAP, net warming avoided at 20- and 100-year horizons; alerts only when the lower bound is positive (Phase 7).":
    "±2,000 और ±4,000 ft पर विकल्प, OpenAP से अतिरिक्त ईंधन और CO₂, 20 और 100 वर्ष की अवधि पर टाली गई कुल गर्मी; चेतावनी तभी जब निचली सीमा सकारात्मक हो (चरण 7)।",
  "Uncorrected physics under-predicts the persistent contrails that satellites actually detect.":
    "बिना सुधार की भौतिकी उन टिकाऊ कंट्रेल को कम आँकती है जिन्हें उपग्रह सचमुच पकड़ते हैं।",
  "Ratio of B1-predicted persistence to observed detectable contrails; supported if the upper 95 % CI is below 1.":
    "B1 से अनुमानित टिकाऊपन और देखी गई पकड़ने योग्य कंट्रेल का अनुपात; समर्थित अगर 95 % CI की ऊपरी सीमा 1 से कम हो।",
  "Not supported":
    "समर्थित नहीं",
  "Ratio 6.44 (95 % CI 4.92–12.12): physics predicts about 6× more persistent contrails than Meteosat-9 sees, the opposite of the hypothesis. Most are too thin or narrow to detect: allowing for that, the ratio is 1.05 (0.81–1.91). 12 flight days, mostly winter and spring.":
    "अनुपात 6.44 (95 % CI 4.92–12.12): भौतिकी Meteosat-9 को दिखने वाली टिकाऊ कंट्रेल से लगभग 6 गुना ज़्यादा का अनुमान लगाती है, परिकल्पना के उलट। ज़्यादातर इतनी पतली या संकरी हैं कि पकड़ी नहीं जातीं: इसे ध्यान में रखें तो अनुपात 1.05 (0.81–1.91) है। 12 उड़ान-दिन, ज़्यादातर सर्दी और वसंत।",
  "STRATUM's corrected forecast is clearly more skilful than the best existing correction (B3).":
    "STRATUM का सुधरा पूर्वानुमान सबसे अच्छे मौजूदा सुधार (B3) से साफ़ तौर पर ज़्यादा कुशल है।",
  "Mean held-out-season Brier skill score vs B3 ≥ 0.10 with lower 95 % CI > 0. Primary endpoint.":
    "अलग रखे गए मौसमों पर B3 के मुकाबले औसत Brier स्किल स्कोर ≥ 0.10, और 95 % CI की निचली सीमा > 0। मुख्य मापदंड।",
  "Supported":
    "समर्थित",
  "Skill vs B3 0.86 (95 % CI 0.82–0.91). But a constant guess of the average contrail rate scores the same, because B3 only says yes or no; against that constant the model is not better overall (−0.19). Where it does help is ranking which flights are likely to make a visible contrail (AUROC 0.65–0.83 vs 0.42–0.66 for physics rules).":
    "B3 के मुकाबले स्किल 0.86 (95 % CI 0.82–0.91)। लेकिन औसत कंट्रेल दर का एक स्थिर अनुमान भी उतना ही स्कोर करता है, क्योंकि B3 सिर्फ़ हाँ या ना कहता है; उस स्थिर अनुमान के मुकाबले मॉडल कुल मिलाकर बेहतर नहीं है (−0.19)। यह मदद करता है यह क्रम लगाने में कि कौन सी उड़ानें दिखने वाली कंट्रेल बनाएँगी (AUROC 0.65–0.83, भौतिकी नियमों के 0.42–0.66 के मुकाबले)।",
  "A small share of flying causes most contrail warming.":
    "उड़ान का एक छोटा हिस्सा ही कंट्रेल की ज़्यादातर गर्मी पैदा करता है।",
  "Share of cruise distance carrying 80 % of positive modelled energy forcing ≤ 10 %.":
    "क्रूज़ दूरी का वह हिस्सा जो सकारात्मक मॉडल की गई ऊर्जा फ़ोर्सिंग का 80 % ढोता है ≤ 10 %।",
  "Under 1 % of flying carries 80 % of contrail warming: 0.48 % of cruise distance with raw ERA5 physics and 0.54 % with the published correction (descriptive). The logged test used our humidity correction, which turned out far too dry, and gave 0.0044 %.":
    "1 % से कम उड़ान कंट्रेल की 80 % गर्मी ढोती है: कच्ची ERA5 भौतिकी में क्रूज़ दूरी का 0.48 % और प्रकाशित सुधार के साथ 0.54 % (वर्णनात्मक)। दर्ज परीक्षण में हमारा नमी सुधार इस्तेमाल हुआ, जो बहुत ज़्यादा सूखा निकला, और उसने 0.0044 % दिया।",
  "Night flights cause a larger share of contrail warming than their share of distance.":
    "रात की उड़ानें दूरी में अपने हिस्से से ज़्यादा कंट्रेल की गर्मी पैदा करती हैं।",
  "Night EF share minus night distance share (18:00–06:00 local solar time); lower 95 % CI > 0.":
    "रात का EF हिस्सा घटा रात का दूरी हिस्सा (18:00–06:00 स्थानीय सौर समय); 95 % CI की निचली सीमा > 0।",
  "Night flights carried 84 % of warming against 49 % of distance, but the logged test (too-dry corrected physics, only 1,583 warming segments) has an interval that reaches below zero (−0.03 to 0.45). With standard physics the night excess is clear: 73–75 % of warming vs 49 % of distance (descriptive).":
    "रात की उड़ानों ने 49 % दूरी के मुकाबले 84 % गर्मी ढोई, लेकिन दर्ज परीक्षण (बहुत सूखी सुधरी भौतिकी, केवल 1,583 गर्म करने वाले हिस्से) का दायरा शून्य से नीचे तक जाता है (−0.03 से 0.45)। सामान्य भौतिकी में रात की अधिकता साफ़ है: 49 % दूरी के मुकाबले 73–75 % गर्मी (वर्णनात्मक)।",
  "Data":
    "डेटा",
  "ERA5 weather, Meteosat-9 imagery every 15 minutes, ADS-B flight tracks for 12 first-of-month days (Mar 2025 – Feb 2026), and an aircraft database.":
    "ERA5 मौसम, हर 15 मिनट की Meteosat-9 तस्वीरें, 12 'महीने की पहली तारीख' वाले दिनों (मार्च 2025 – फ़रवरी 2026) के ADS-B उड़ान रास्ते, और एक विमान डेटाबेस।",
  "Physics baseline":
    "भौतिकी बेसलाइन",
  "Schmidt–Appleman formation check, then CoCiP for persistence and energy forcing, with three humidity baselines and Monte Carlo ranges.":
    "श्मिट–ऐपलमैन से बनने की जाँच, फिर टिकाऊपन और ऊर्जा फ़ोर्सिंग के लिए CoCiP, तीन नमी बेसलाइन और मोंटे कार्लो दायरों के साथ।",
  "Satellite detection":
    "उपग्रह से पहचान",
  "A transparent line-filter detector on the 10.8 − 12.0 µm brightness-temperature difference, tuned on 51 Meteosat scenes labelled by three contrail experts (DLR dataset) and checked on 89 others (precision 0.22, recall 0.23). Over India it is also checked against 100 scenes whose labels Claude drafted and team members reviewed: a secondary, exploratory check.":
    "10.8 − 12.0 µm ब्राइटनेस-तापमान अंतर पर एक पारदर्शी लाइन-फ़िल्टर डिटेक्टर, तीन कंट्रेल विशेषज्ञों द्वारा लेबल किए 51 Meteosat दृश्यों (DLR डेटासेट) पर ट्यून किया और 89 अन्य पर जाँचा (precision 0.22, recall 0.23)। भारत के ऊपर इसे 100 ऐसे दृश्यों पर भी जाँचा गया जिनके लेबल Claude ने बनाए और टीम के सदस्यों ने जाँचे: एक द्वितीयक, खोजपरक जाँच।",
  "Matching and labels":
    "मिलान और लेबल",
  "Each predicted contrail is advected with the wind for 20–120 min, parallax-corrected and matched within 2 px and 20°. A segment counts as observed only if it matches in at least two satellite images; cloudy or steep-angle scenes are labelled unknown, never \"no contrail\". A wrong-day check measures how many matches are chance.":
    "हर अनुमानित कंट्रेल को 20–120 मिनट तक हवा के साथ बहाया जाता है, पैरलैक्स के लिए सुधारा जाता है और 2 px व 20° के भीतर मिलाया जाता है। कोई हिस्सा तभी 'देखा गया' माना जाता है जब वह कम से कम दो उपग्रह तस्वीरों में मिले; बादल वाले या तिरछे कोण के दृश्य 'अज्ञात' लेबल होते हैं, कभी \"कंट्रेल नहीं\" नहीं। एक 'गलत-दिन' जाँच मापती है कि कितने मिलान संयोग हैं।",
  "Correction and decision":
    "सुधार और निर्णय",
  "A calibrated model (monotone gradient-boosted trees) learns where physics is wrong, trained on some seasons and tested on another. The decision layer tries flying 2,000 or 4,000 ft higher or lower, reruns the contrail physics 100 times with different humidity, model and climate-metric assumptions, adds the extra fuel, and alerts only when the cautious end of the warming avoided is positive at both 20 and 100 years.":
    "एक कैलिब्रेटेड मॉडल (एकदिश ग्रेडिएंट-बूस्टेड ट्री) सीखता है कि भौतिकी कहाँ गलत है, कुछ मौसमों पर प्रशिक्षित और किसी दूसरे पर परखा गया। निर्णय परत 2,000 या 4,000 ft ऊपर या नीचे उड़कर देखती है, अलग-अलग नमी, मॉडल और जलवायु-माप की मान्यताओं के साथ कंट्रेल भौतिकी 100 बार दोबारा चलाती है, अतिरिक्त ईंधन जोड़ती है, और चेतावनी तभी देती है जब टाली गई गर्मी का सतर्क छोर 20 और 100 दोनों वर्षों पर सकारात्मक हो।",
  "RHi at the flight level":
    "फ़्लाइट लेवल पर RHi",
  "Ice supersaturation is what lets a contrail persist":
    "बर्फ़-अतिसंतृप्ति ही कंट्रेल को टिकने देती है",
  "RHi one level above":
    "एक लेवल ऊपर RHi",
  "A moist layer just above may mean ERA5 placed the supersaturated layer slightly wrong":
    "ठीक ऊपर नम परत का मतलब हो सकता है कि ERA5 ने अतिसंतृप्त परत थोड़ी गलत जगह रखी",
  "RHi one level below":
    "एक लेवल नीचे RHi",
  "The same, for the level below":
    "वही बात, नीचे के लेवल के लिए",
  "Vertical RHi gradient":
    "ऊर्ध्वाधर RHi ढलान",
  "Sharp humidity edges are where ERA5 misses thin moist layers":
    "नमी के तीखे किनारों पर ही ERA5 पतली नम परतें चूकता है",
  "Temperature":
    "तापमान",
  "Colder air favours formation and ice growth":
    "ठंडी हवा बनने और बर्फ़ के बढ़ने में मदद करती है",
  "Temperature above the formation threshold (T − T_LM)":
    "बनने की सीमा से ऊपर तापमान (T − T_LM)",
  "Warmer than the Schmidt–Appleman threshold, no contrail forms":
    "श्मिट–ऐपलमैन सीमा से गर्म हो तो कंट्रेल नहीं बनती",
  "Pressure (flight level)":
    "दबाव (फ़्लाइट लेवल)",
  "ERA5's humidity bias depends on altitude":
    "ERA5 की नमी की त्रुटि ऊँचाई पर निर्भर करती है",
  "Cloud ice water content":
    "बादल में बर्फ़-जल की मात्रा",
  "Natural cirrus already present: humid air, but contrails are harder to see":
    "प्राकृतिक सिरस पहले से है: नम हवा, लेकिन कंट्रेल देखना मुश्किल",
  "High-cloud fraction at and above":
    "उस लेवल पर और ऊपर ऊँचे बादलों का हिस्सा",
  "Cirrus above hides contrails from the satellite":
    "ऊपर का सिरस कंट्रेल को उपग्रह से छिपा देता है",
  "Vertical velocity":
    "ऊर्ध्वाधर वेग",
  "Rising air cools and moistens, creating moist layers ERA5 may underplay":
    "उठती हवा ठंडी और नम होती है, जिससे ऐसी नम परतें बनती हैं जिन्हें ERA5 कम आँक सकता है",
  "Vertical wind shear":
    "ऊर्ध्वाधर हवा का कतरन",
  "Shear spreads contrails into wider, more visible cirrus":
    "कतरन कंट्रेल को चौड़े, ज़्यादा दिखने वाले सिरस में फैला देता है",
  "Distance to the tropopause":
    "ट्रोपोपॉज़ से दूरी",
  "Moist layers cluster just below the tropopause, where ERA5 is driest":
    "नम परतें ट्रोपोपॉज़ के ठीक नीचे जमा होती हैं, जहाँ ERA5 सबसे सूखा है",
  "Latitude":
    "अक्षांश",
  "Tropical versus subtropical air":
    "उष्णकटिबंधीय बनाम उपोष्णकटिबंधीय हवा",
  "Longitude":
    "देशांतर",
  "West versus east India (sea, land, monsoon onset)":
    "पश्चिमी बनाम पूर्वी भारत (समुद्र, ज़मीन, मानसून की शुरुआत)",
  "Month (sin, cos)":
    "महीना (sin, cos)",
  "Season, encoded as a circle so December sits next to January":
    "मौसम, एक वृत्त की तरह लिखा गया ताकि दिसंबर जनवरी के पास रहे",
  "Local solar time (sin, cos)":
    "स्थानीय सौर समय (sin, cos)",
  "Day and night: detection and humidity both follow the daily cycle":
    "दिन और रात: पहचान और नमी दोनों रोज़ के चक्र पर चलती हैं",
  "Patchy ADS-B coverage":
    "ADS-B का अधूरा कवरेज",
  "Missing flights; biased sample of routes":
    "छूटी उड़ानें; रूटों का पक्षपाती नमूना",
  "Coverage audit and decision rule; coverage reported with every result":
    "कवरेज जाँच और निर्णय नियम; हर नतीजे के साथ कवरेज बताया जाता है",
  "12 free sample days only; the coverage audit runs on 2 and 5 Nov 2026.":
    "केवल 12 मुफ़्त नमूना दिन; कवरेज जाँच 2 और 5 नवंबर 2026 को चलेगी।",
  "Limited satellite observability":
    "उपग्रह की सीमित दृश्यता",
  "Labels favour thick, long-lived contrails; monsoon under-represented":
    "लेबल मोटी, लंबी चलने वाली कंट्रेल की ओर झुके; मानसून कम दर्शाया गया",
  "Observability mask; unobservable = missing; results by season and viewing angle":
    "दृश्यता मास्क; न दिखने लायक = अनुपलब्ध; नतीजे मौसम और देखने के कोण के अनुसार",
  "Real and large: 1 contrail seen in 9,803 monsoon segments; only ~16 % of predicted contrails are detectable at all (H1).":
    "असली और बड़ा: 9,803 मानसूनी हिस्सों में 1 कंट्रेल दिखी; अनुमानित कंट्रेल में से केवल ~16 % ही पकड़ी जा सकती हैं (H1)।",
  "Wind advection error":
    "हवा से बहाव की त्रुटि",
  "True contrails fail to match, or false matches occur":
    "असली कंट्रेल मेल नहीं खातीं, या झूठे मिलान होते हैं",
  "Age window, distance and angle tolerances, each with a sensitivity analysis":
    "उम्र की खिड़की, दूरी और कोण की छूट, हर एक का संवेदनशीलता विश्लेषण",
  "H1 verdict unchanged under all 8 variants; a wrong-day test showed a third of matches are chance, so a match now needs two images (D-004).":
    "सभी 8 रूपों में H1 का फ़ैसला वही; 'गलत-दिन' परीक्षण ने दिखाया कि एक तिहाई मिलान संयोग हैं, इसलिए अब मिलान के लिए दो तस्वीरें चाहिए (D-004)।",
  "Labeller subjectivity":
    "लेबल लगाने वाले की व्यक्तिपरकता",
  "Noisy ground truth":
    "शोर भरा सत्य-आधार",
  "Written guide, double labelling, Cohen's κ":
    "लिखित गाइड, दोहरा लेबलिंग, Cohen का κ",
  "Changed: the detector is tuned on expert-labelled scenes (D-002); India labels were drafted by AI and reviewed by the team (D-003), so κ does not apply.":
    "बदला गया: डिटेक्टर विशेषज्ञ-लेबल वाले दृश्यों पर ट्यून है (D-002); भारत के लेबल AI ने बनाए और टीम ने जाँचे (D-003), इसलिए κ लागू नहीं।",
  "Coarse reanalysis":
    "मोटा रीएनालिसिस",
  "Thin humid layers smeared across levels":
    "पतली नम परतें लेवलों में फैल जाती हैं",
  "Neighbouring-level features; results by flight level":
    "पड़ोसी-लेवल वाले इनपुट; फ़्लाइट लेवल के अनुसार नतीजे",
  "The humidity at, above and below the flight level are the model's most important inputs in every season.":
    "फ़्लाइट लेवल पर, ऊपर और नीचे की नमी हर मौसम में मॉडल के सबसे अहम इनपुट हैं।",
  "Radiative uncertainty":
    "विकिरण की अनिश्चितता",
  "Warming estimates off by a large factor":
    "गर्मी के अनुमान कई गुना गलत",
  "Ranges, two metric horizons, ranking on lower bounds":
    "दायरे, दो माप-अवधि, निचली सीमा पर क्रम",
  "Implemented: 100 Monte Carlo members, 20- and 100-year horizons, alerts only on a positive lower bound.":
    "लागू: 100 मोंटे कार्लो सदस्य, 20 और 100 वर्ष की अवधि, चेतावनी केवल सकारात्मक निचली सीमा पर।",
  "Operational realism":
    "संचालन की वास्तविकता",
  "ATC may not allow a suggested level":
    "ATC सुझाया लेवल शायद न दे",
  "Out of scope; stated plainly in all outputs":
    "दायरे से बाहर; हर आउटपुट में साफ़ लिखा",
  "Every card and download says it; OpenAP often finds the higher level cheaper, which we report separately.":
    "हर कार्ड और डाउनलोड यह कहता है; OpenAP अक्सर ऊँचे लेवल को सस्ता पाता है, जिसे हम अलग से बताते हैं।",
  "Overfitting and leakage":
    "ओवरफ़िटिंग और रिसाव",
  "Optimistic scores":
    "ज़रूरत से अच्छे स्कोर",
  "Blocked splits; primary metric and hypotheses fixed in advance":
    "अलग किए गए हिस्से; मुख्य माप और परिकल्पनाएँ पहले से तय",
  "Seasons held out with no shared flight or image; models frozen before scoring; one logged final run per hypothesis.":
    "मौसम अलग रखे गए, कोई साझा उड़ान या तस्वीर नहीं; स्कोर से पहले मॉडल स्थिर किए; हर परिकल्पना का एक दर्ज अंतिम रन।",
  "Model":
    "मॉडल",
  "Monotone gradient-boosted trees (LightGBM) on 18 ERA5 and position/time inputs, isotonic calibration; one model per held-out season and per side of 80°E. Fed back into the physics as a humidity factor per latitude band (with detection efficiency).":
    "18 ERA5 और स्थान/समय इनपुट पर एकदिश ग्रेडिएंट-बूस्टेड ट्री (LightGBM), आइसोटोनिक कैलिब्रेशन; हर अलग रखे मौसम और 80°E के हर तरफ़ के लिए एक मॉडल। भौतिकी में हर अक्षांश पट्टी के लिए एक नमी गुणक के रूप में वापस डाला गया (पहचान दक्षता के साथ)।",
  "Intended use":
    "उद्देश्य",
  "Research: where ERA5-based contrail physics is wrong over India, and which flight stretches a ±2,000/±4,000 ft change would most likely help, with uncertainty ranges, for discussion with airlines and air traffic experts.":
    "शोध: भारत के ऊपर ERA5-आधारित कंट्रेल भौतिकी कहाँ गलत है, और ±2,000/±4,000 ft का बदलाव किन उड़ान हिस्सों में सबसे ज़्यादा मदद करेगा, अनिश्चितता दायरों के साथ, एयरलाइन और हवाई यातायात विशेषज्ञों से चर्चा के लिए।",
  "Out of scope":
    "दायरे से बाहर",
  "Operational flight planning or ATC instructions; anything outside 6–37°N, 68–98°E or below FL250; seasons and conditions the labels do not cover; estimates of aviation's total climate impact.":
    "असली उड़ान योजना या ATC निर्देश; 6–37°N, 68–98°E से बाहर या FL250 से नीचे कुछ भी; वे मौसम और हालात जिन्हें लेबल नहीं ढकते; विमानन के कुल जलवायु प्रभाव के अनुमान।",
  "12 ADS-B days (Mar 2025–Feb 2026), ERA5, Meteosat-9 contrail labels from an automatic detector matched to wind-drifted flight segments (two images needed). About a third of positive labels are expected to be chance; almost no monsoon labels.":
    "12 ADS-B दिन (मार्च 2025–फ़रवरी 2026), ERA5, एक स्वचालित डिटेक्टर से Meteosat-9 कंट्रेल लेबल, हवा से बहाए उड़ान हिस्सों से मिलाए गए (दो तस्वीरें ज़रूरी)। सकारात्मक लेबलों में लगभग एक तिहाई संयोग होने की उम्मीद; मानसून के लेबल लगभग नहीं।",
  "Metrics":
    "माप",
  "Brier skill score vs B3 (pre-registered), vs the constant rate, climatology and a humidity-only model; AUROC; reliability; 1,000 day-bootstrap resamples.":
    "B3 के मुकाबले Brier स्किल स्कोर (पहले से दर्ज), स्थिर दर, जलवायु-औसत और केवल-नमी मॉडल के मुकाबले भी; AUROC; विश्वसनीयता; 1,000 दिन-बूटस्ट्रैप पुनर्नमूने।",
  "Limitations":
    "सीमाएँ",
  "2–4 days per season; noisy, detection-limited labels; calibration did not help; probabilities barely beat the base rate; the feedback into physics is too blunt; ATC, traffic and airline constraints not modelled.":
    "हर मौसम में 2–4 दिन; शोर भरे, पहचान से सीमित लेबल; कैलिब्रेशन से फ़ायदा नहीं हुआ; संभावनाएँ आधार दर से मुश्किल से बेहतर; भौतिकी में वापसी बहुत भोथरी; ATC, यातायात और एयरलाइन की बाध्यताएँ मॉडल नहीं की गईं।",
  "Ethics":
    "नैतिकता",
  "Alerts can burn fuel for no benefit, so an alert needs a positive lower bound at both horizons. Commercial flights only, hashed identities. AI-assisted labels disclosed (D-003).":
    "चेतावनियाँ बिना फ़ायदे के ईंधन जला सकती हैं, इसलिए चेतावनी के लिए दोनों अवधियों पर सकारात्मक निचली सीमा चाहिए। केवल व्यावसायिक उड़ानें, छिपी पहचान। AI-सहायता वाले लेबल घोषित (D-003)।",
  "Monte Carlo members 20 → 100":
    "मोंटे कार्लो सदस्य 20 → 100",
  "The 5th percentile moved 28 % between 20 and 40 members; the decision layer ranks on it.":
    "20 और 40 सदस्यों के बीच 5वाँ प्रतिशतक 28 % खिसका; निर्णय परत इसी पर क्रम लगाती है।",
  "Detector tuned on expert-labelled scenes":
    "डिटेक्टर विशेषज्ञ-लेबल वाले दृश्यों पर ट्यून",
  "A published DLR dataset of Meteosat scenes labelled by three contrail experts replaced tuning on our own labels.":
    "तीन कंट्रेल विशेषज्ञों द्वारा लेबल किए Meteosat दृश्यों के प्रकाशित DLR डेटासेट ने हमारे अपने लेबलों पर ट्यूनिंग की जगह ली।",
  "India labels drafted by AI, reviewed by the team":
    "भारत के लेबल AI ने बनाए, टीम ने जाँचे",
  "The team could not find contrails reliably by eye; used only as a secondary, exploratory check.":
    "टीम आँख से कंट्रेल भरोसे से नहीं खोज पाई; केवल द्वितीयक, खोजपरक जाँच के लिए इस्तेमाल।",
  "A contrail counts as seen only in two satellite images":
    "कंट्रेल तभी 'देखी गई' जब दो उपग्रह तस्वीरों में हो",
  "A wrong-day test showed most single-image matches are chance; two images cut the chance share from 60 % to 33 %.":
    "'गलत-दिन' परीक्षण ने दिखाया कि एक-तस्वीर वाले ज़्यादातर मिलान संयोग हैं; दो तस्वीरों से संयोग का हिस्सा 60 % से 33 % हुआ।",
  "A learned contrail detector, as a second analysis":
    "एक सीखा हुआ कंट्रेल डिटेक्टर, दूसरे विश्लेषण के रूप में",
  "Added after the logged results: a neural network trained on OpenContrails and the expert scenes. The logged H1–H4 results keep the original detector; the new labels are reported next to them, clearly marked.":
    "दर्ज नतीजों के बाद जोड़ा गया: OpenContrails और विशेषज्ञ दृश्यों पर प्रशिक्षित एक न्यूरल नेटवर्क। दर्ज H1–H4 नतीजे मूल डिटेक्टर ही रखते हैं; नए लेबल उनके साथ, साफ़ चिह्नित करके बताए गए हैं।",
  "Our pre-registered contrail detector is weak: on expert-labelled scenes it finds about a quarter of the contrails, and over India only about 1 in 20 of its lines is a contrail. Learned detectors added afterwards (D-005) do about twice as well on the same expert scenes (F1 0.49 vs 0.22; the best finds 82.5 % of the contrails all three experts agreed on); the logged results still use the original one.":
    "हमारा पहले से दर्ज कंट्रेल डिटेक्टर कमज़ोर है: विशेषज्ञ-लेबल वाले दृश्यों पर यह लगभग एक चौथाई कंट्रेल खोजता है, और भारत के ऊपर इसकी लगभग 20 में से 1 लकीर ही कंट्रेल है। बाद में जोड़े गए सीखे हुए डिटेक्टर (D-005) उन्हीं विशेषज्ञ दृश्यों पर लगभग दोगुना अच्छा करते हैं (F1 0.49 बनाम 0.22; सबसे अच्छा वह 82.5 % कंट्रेल खोजता है जिन पर तीनों विशेषज्ञ सहमत थे); दर्ज नतीजे अब भी मूल वाले से हैं।",
  "We could not label India's satellite scenes ourselves; AI drafted the lines and we reviewed them, which we disclose.":
    "हम भारत के उपग्रह दृश्य खुद लेबल नहीं कर सके; AI ने लकीरें बनाईं और हमने उन्हें जाँचा, जिसे हम घोषित करते हैं।",
  "About a third of the satellite matches would happen by chance, even with two images required.":
    "दो तस्वीरें ज़रूरी होने पर भी लगभग एक तिहाई उपग्रह मिलान संयोग से हो जाते।",
  "H1 went the other way: physics over-predicts the contrails the satellite sees about six times, mostly because thin contrails are invisible.":
    "H1 उल्टा निकला: भौतिकी उपग्रह को दिखने वाली कंट्रेल से लगभग छह गुना ज़्यादा का अनुमान लगाती है, ज़्यादातर इसलिए कि पतली कंट्रेल दिखती नहीं।",
  "Calibrating the model (isotonic regression) did not improve it on validation days.":
    "मॉडल को कैलिब्रेट करने (आइसोटोनिक रिग्रेशन) से सत्यापन दिनों पर सुधार नहीं हुआ।",
  "The model's probabilities barely beat a constant guess of the average contrail rate; it is only clearly better at ranking which flights are likely to make a visible contrail.":
    "मॉडल की संभावनाएँ औसत कंट्रेल दर के स्थिर अनुमान से मुश्किल से बेहतर हैं; यह केवल यह क्रम लगाने में साफ़ बेहतर है कि कौन सी उड़ानें दिखने वाली कंट्रेल बनाएँगी।",
  "Feeding the correction back into the physics as one humidity factor per latitude band hit its limit everywhere and dried the air so much that almost no contrails formed.":
    "सुधार को हर अक्षांश पट्टी के लिए एक नमी गुणक के रूप में भौतिकी में वापस डालने पर वह हर जगह अपनी सीमा पर पहुँच गया और हवा इतनी सूख गई कि लगभग कोई कंट्रेल नहीं बनी।",
  "The monsoon cannot be tested: cloud hides contrails from the satellite almost completely.":
    "मानसून को परखा नहीं जा सकता: बादल कंट्रेल को उपग्रह से लगभग पूरी तरह छिपा देते हैं।",
  "Most avoidance alerts fall on one humid day, and some rely on OpenAP finding the higher level cheaper rather than on the contrail.":
    "ज़्यादातर बचाव चेतावनियाँ एक नम दिन पर पड़ती हैं, और कुछ कंट्रेल पर नहीं बल्कि OpenAP के ऊँचे लेवल को सस्ता पाने पर टिकी हैं।",
  "Twelve flight days are too few for tight per-season uncertainty ranges.":
    "हर मौसम के लिए कसे हुए अनिश्चितता दायरों के लिए बारह उड़ान-दिन बहुत कम हैं।",
  "See the proof: 241 contrails on the map":
    "सबूत देखिए: मानचित्र पर 241 कंट्रेल",
  "Every contrail the satellite confirmed is now on the map as a cyan ring: 241 of them on 7 days, from 234 commercial flights. Click one to see the real Meteosat-9 images around it, with where the plane flew, where the physics says its contrail drifted, and the line our detector found, frame by frame. The predicted and detected lines sit a median of 1.2 pixels apart.":
    "उपग्रह से पुष्ट हर कंट्रेल अब मानचित्र पर एक फ़िरोज़ी घेरे के रूप में है: 7 दिनों पर 241, 234 व्यावसायिक उड़ानों से। किसी एक पर क्लिक करके उसके आसपास की असली Meteosat-9 तस्वीरें देखिए, साथ में विमान कहाँ उड़ा, भौतिकी के अनुसार उसकी कंट्रेल कहाँ बही, और हमारे डिटेक्टर को कौन सी लकीर मिली, फ़्रेम-दर-फ़्रेम। अनुमानित और खोजी गई लकीरें माध्यिका में 1.2 पिक्सेल दूर हैं।",
  "Detector v3: close to expert level":
    "डिटेक्टर v3: विशेषज्ञ स्तर के करीब",
  "A second, stronger network (six infrared channels, trained on every labeller's vote, all 20,088 OpenContrails scenes, five models voting together) matches the experts' consensus at a pixel Dice of 0.64, close to the 0.72 a single expert reaches at most, and finds 82.5 % of the contrails all three experts agreed on. Re-labelling the twelve flight days with it gives 1,109 contrails with 14 % chance matches, and the same answers: H1 not supported, H2 supported. All of this is a disclosed second analysis; the logged results are unchanged.":
    "एक दूसरा, ज़्यादा मज़बूत नेटवर्क (छह इन्फ्रारेड चैनल, हर लेबल लगाने वाले के वोट पर प्रशिक्षित, सभी 20,088 OpenContrails दृश्य, पाँच मॉडल मिलकर वोट करते हैं) विशेषज्ञों की सहमति से 0.64 के पिक्सेल Dice पर मेल खाता है, जो एक अकेले विशेषज्ञ के अधिकतम 0.72 के करीब है, और उन 82.5 % कंट्रेल को खोजता है जिन पर तीनों विशेषज्ञ सहमत थे। इससे बारह उड़ान-दिनों को दोबारा लेबल करने पर 14 % संयोग-मिलान के साथ 1,109 कंट्रेल मिलती हैं, और जवाब वही: H1 समर्थित नहीं, H2 समर्थित। यह सब एक घोषित दूसरा विश्लेषण है; दर्ज नतीजे नहीं बदले।",
  "A learned contrail detector doubles detection quality":
    "एक सीखा हुआ कंट्रेल डिटेक्टर पहचान की गुणवत्ता दोगुनी करता है",
  "Our simple line-finding detector was the weakest part of the project. We trained a small neural network on 6,067 human-labelled contrail scenes from Google's OpenContrails dataset, then fine-tuned it on the 51 expert-labelled Meteosat scenes. Checked once on the 89 expert scenes it never saw: 64 % of its detections are real contrails (the old detector: 22 %) and it finds 38 % of the contrails (old: 23 %), F1 0.48 against 0.22. This was added after the logged results, so it is a disclosed second analysis (D-005): the H1–H4 results stay as logged, and the new labels are reported next to them.":
    "हमारा सरल लकीर खोजने वाला डिटेक्टर प्रोजेक्ट का सबसे कमज़ोर हिस्सा था। हमने Google के OpenContrails डेटासेट के 6,067 मानव-लेबल वाले कंट्रेल दृश्यों पर एक छोटा न्यूरल नेटवर्क प्रशिक्षित किया, फिर उसे 51 विशेषज्ञ-लेबल वाले Meteosat दृश्यों पर फ़ाइन-ट्यून किया। उन 89 विशेषज्ञ दृश्यों पर एक बार जाँचा जो इसने कभी नहीं देखे: इसकी 64 % पहचानें असली कंट्रेल हैं (पुराना डिटेक्टर: 22 %) और यह 38 % कंट्रेल खोजता है (पुराना: 23 %), F1 0.48 बनाम 0.22। इसे दर्ज नतीजों के बाद जोड़ा गया, इसलिए यह एक घोषित दूसरा विश्लेषण है (D-005): H1–H4 नतीजे दर्ज रूप में ही रहते हैं, और नए लेबल उनके साथ बताए गए हैं।",
  "Open release with a DOI":
    "DOI के साथ खुली रिलीज़",
  "Version 1.0.0 is public: the code, a derived-data release (every labelled commercial flight segment with its satellite label, baselines and held-out forecasts) and a one-click notebook that recomputes our results, archived on Zenodo (doi:10.5281/zenodo.23480202). A teammate who did not write the code reproduced every results figure from scratch.":
    "संस्करण 1.0.0 सार्वजनिक है: कोड, एक व्युत्पन्न-डेटा रिलीज़ (हर लेबल वाला व्यावसायिक उड़ान हिस्सा, उसके उपग्रह लेबल, बेसलाइन और अलग रखे पूर्वानुमानों के साथ) और एक-क्लिक नोटबुक जो हमारे नतीजे फिर से गिनती है, Zenodo पर संग्रहीत (doi:10.5281/zenodo.23480202)। एक साथी ने, जिसने कोड नहीं लिखा था, हर नतीजे का चित्र शुरू से दोबारा बनाया।",
  "Phase 7 accepted: H2–H4 tested":
    "चरण 7 स्वीकृत: H2–H4 परखी गईं",
  "A machine-learning correction trained on the satellite labels ranks contrail-prone flight segments far better than any yes/no physics rule, and it passes H2 against the published correction. But a constant guess of the average contrail rate passes too, so we report that the model's probabilities barely beat the base rate. Feeding the correction back into the physics as one humidity factor turned out too blunt: it dried the air so much that almost no contrails formed. With standard physics, under 1 % of flying carries 80 % of contrail warming over India (H3, supported), and night flights carry about three quarters of it against half the distance (H4 not supported in the logged test, clear in the context runs). The avoidance layer flagged 402 stretches of flight on 12 days and would alert on 333 of them, mostly on one humid day in February.":
    "उपग्रह लेबलों पर प्रशिक्षित एक मशीन-लर्निंग सुधार कंट्रेल वाले उड़ान हिस्सों का क्रम किसी भी हाँ/ना भौतिकी नियम से कहीं बेहतर लगाता है, और प्रकाशित सुधार के मुकाबले H2 पास करता है। लेकिन औसत कंट्रेल दर का स्थिर अनुमान भी पास होता है, इसलिए हम बताते हैं कि मॉडल की संभावनाएँ आधार दर से मुश्किल से बेहतर हैं। सुधार को एक नमी गुणक के रूप में भौतिकी में वापस डालना बहुत भोथरा निकला: इसने हवा इतनी सुखा दी कि लगभग कोई कंट्रेल नहीं बनी। सामान्य भौतिकी में, भारत के ऊपर 1 % से कम उड़ान कंट्रेल की 80 % गर्मी ढोती है (H3, समर्थित), और रात की उड़ानें आधी दूरी के मुकाबले लगभग तीन चौथाई गर्मी ढोती हैं (दर्ज परीक्षण में H4 समर्थित नहीं, संदर्भ रनों में साफ़)। बचाव परत ने 12 दिनों पर उड़ान के 402 हिस्से चिह्नित किए और उनमें से 333 पर चेतावनी देती, ज़्यादातर फ़रवरी के एक नम दिन पर।",
  "Phase 6 accepted: H1 is not supported":
    "चरण 6 स्वीकृत: H1 समर्थित नहीं",
  "The one logged test of H1: over 334,211 flight segments on 12 days, raw ERA5 physics predicted 10,076 persistent contrails and Meteosat-9 saw 1,564 — a ratio of 6.44 (95 % range 4.92–12.12). We expected physics to predict too few; it predicts about six times too many. Most predicted contrails are too thin or narrow for the satellite: only 16 % pass the detectability thresholds, and allowing for that the two agree (1.05). The answer is the same under every alternative label rule and matching tolerance. Limits: only 2–4 days per season, no monsoon contrails seen, and about a third of the satellite labels are chance matches. A refuted hypothesis is a result, and we report it as one.":
    "H1 का एक दर्ज परीक्षण: 12 दिनों के 334,211 उड़ान हिस्सों पर कच्ची ERA5 भौतिकी ने 10,076 टिकाऊ कंट्रेल का अनुमान लगाया और Meteosat-9 ने 1,564 देखीं — अनुपात 6.44 (95 % दायरा 4.92–12.12)। हमें उम्मीद थी कि भौतिकी कम अनुमान लगाएगी; वह लगभग छह गुना ज़्यादा लगाती है। ज़्यादातर अनुमानित कंट्रेल उपग्रह के लिए बहुत पतली या संकरी हैं: केवल 16 % पहचान की सीमाएँ पार करती हैं, और इसे ध्यान में रखें तो दोनों मेल खाते हैं (1.05)। हर वैकल्पिक लेबल नियम और मिलान छूट में जवाब वही है। सीमाएँ: हर मौसम में केवल 2–4 दिन, मानसून की कोई कंट्रेल नहीं दिखी, और लगभग एक तिहाई उपग्रह लेबल संयोग-मिलान हैं। गलत साबित हुई परिकल्पना भी एक नतीजा है, और हम उसे ऐसे ही बताते हैं।",
  "Evaluation harness built":
    "मूल्यांकन ढाँचा बना",
  "One harness that every model goes through the same way: four baselines (climatology, raw ERA5, constant humidity scaling, latitude-dependent correction), seasons held out one at a time, no flight or satellite image on both sides of a split, and 1,000 day-resamples for every uncertainty range. The H1 test runs once, logged, before the results are seen.":
    "एक ढाँचा जिससे हर मॉडल एक ही तरह गुज़रता है: चार बेसलाइन (जलवायु-औसत, कच्चा ERA5, स्थिर नमी स्केलिंग, अक्षांश-आधारित सुधार), एक-एक करके मौसम अलग रखे गए, कोई उड़ान या उपग्रह तस्वीर विभाजन के दोनों तरफ़ नहीं, और हर अनिश्चितता दायरे के लिए 1,000 दिन-पुनर्नमूने। H1 परीक्षण नतीजे देखने से पहले एक बार, दर्ज करके चलता है।",
  "Phase 5 accepted: satellite labels for the whole year":
    "चरण 5 स्वीकृत: पूरे साल के उपग्रह लेबल",
  "680,387 contrail-forming flight segments over India checked against Meteosat-9: 421 contrails observed from 369 flights (the pre-registered minimum is 300). A wrong-day check shows about a third of these matches would happen by chance, so the labels are noisy. Almost all observations are from winter and spring: monsoon cloud hides contrails from June to October. Over India the detector finds about 1 in 3 labelled contrails, but only about 1 in 20 of its lines is a contrail.":
    "भारत के ऊपर कंट्रेल बनाने वाले 680,387 उड़ान हिस्से Meteosat-9 से जाँचे गए: 369 उड़ानों से 421 कंट्रेल देखी गईं (पहले से दर्ज न्यूनतम 300 है)। 'गलत-दिन' जाँच दिखाती है कि इनमें से लगभग एक तिहाई मिलान संयोग से होते, इसलिए लेबल शोर भरे हैं। लगभग सभी अवलोकन सर्दी और वसंत के हैं: जून से अक्टूबर तक मानसूनी बादल कंट्रेल छिपा देते हैं। भारत के ऊपर डिटेक्टर लेबल वाली लगभग 3 में से 1 कंट्रेल खोजता है, लेकिन उसकी लगभग 20 में से 1 लकीर ही कंट्रेल है।",
  "The team could not find contrails reliably in the India scenes, so Claude drafted the lines and Aditya, Ishaan and Abeer each reviewed and corrected a third of the 100 scenes: 15 draft lines, 0 deleted, 5 moved, 21 added. This is logged as a deviation from the plan and used only as a secondary check.":
    "टीम भारत के दृश्यों में भरोसे से कंट्रेल नहीं खोज पाई, इसलिए Claude ने लकीरें बनाईं और आदित्य, ईशान और अबीर ने 100 दृश्यों में से एक-एक तिहाई जाँचे और सुधारे: 15 मसौदा लकीरें, 0 हटाई, 5 खिसकाई, 21 जोड़ी। इसे योजना से विचलन के रूप में दर्ज किया गया है और केवल द्वितीयक जाँच के लिए इस्तेमाल किया गया है।",
  "Detector tuned on expert labels; matching built":
    "डिटेक्टर विशेषज्ञ लेबलों पर ट्यून; मिलान बना",
  "The satellite detector was tuned on 51 Meteosat scenes labelled by three contrail experts (DLR dataset) and checked on 89 others: precision 0.22, recall 0.23, up from 0.14 / 0.26. It still misses many short, faint contrails. The full-year matching that turns satellite images into labels for every flight segment is built and tested.":
    "उपग्रह डिटेक्टर को तीन कंट्रेल विशेषज्ञों द्वारा लेबल किए 51 Meteosat दृश्यों (DLR डेटासेट) पर ट्यून किया और 89 अन्य पर जाँचा: precision 0.22, recall 0.23, पहले के 0.14 / 0.26 से बेहतर। यह अब भी कई छोटी, फीकी कंट्रेल चूकता है। पूरे साल का मिलान, जो उपग्रह तस्वीरों को हर उड़ान हिस्से के लेबल में बदलता है, बन गया है और परखा गया है।",
  "Labelling scenes drawn":
    "लेबलिंग के दृश्य चुने गए",
  "220 Meteosat scenes drawn once with a fixed seed, stratified by month, time of day and predicted contrail density. A separate labelling app keeps the satellite data private.":
    "220 Meteosat दृश्य एक निश्चित seed से एक बार चुने गए, महीने, दिन के समय और अनुमानित कंट्रेल घनत्व के अनुसार बँटे हुए। एक अलग लेबलिंग ऐप उपग्रह डेटा को निजी रखता है।",
  "Web app v0 accepted":
    "वेब ऐप v0 स्वीकृत",
  "Map with real January 2026 contrail conditions, flight replay and contrail details, plus the Innovation Website, live on Cloudflare.":
    "जनवरी 2026 की असली कंट्रेल स्थिति वाला मानचित्र, उड़ान रीप्ले और कंट्रेल विवरण, साथ में इनोवेशन वेबसाइट, Cloudflare पर लाइव।",
  "Web app v0 started":
    "वेब ऐप v0 शुरू",
  "Data contract for the website: contrail-condition grids for every hour and flight level of January 2026, commercial flights only, aircraft identities hashed.":
    "वेबसाइट के लिए डेटा अनुबंध: जनवरी 2026 के हर घंटे और फ़्लाइट लेवल के कंट्रेल-स्थिति ग्रिड, केवल व्यावसायिक उड़ानें, विमानों की पहचान छिपी हुई।",
  "Satellite contrail detector":
    "उपग्रह कंट्रेल डिटेक्टर",
  "A line-filter detector on Meteosat-9 finds long contrails such as two over the Arabian Sea at night. Overlays of physics predictions on satellite images: on 1 Jan 2026 no predicted contrail lined up with a detected one — a first sign that physics alone is not enough.":
    "Meteosat-9 पर एक लाइन-फ़िल्टर डिटेक्टर लंबी कंट्रेल खोजता है, जैसे रात में अरब सागर के ऊपर दो। उपग्रह तस्वीरों पर भौतिकी के अनुमानों की परतें: 1 जनवरी 2026 को कोई अनुमानित कंट्रेल किसी खोजी गई से मेल नहीं खाई — पहला संकेत कि अकेली भौतिकी काफ़ी नहीं।",
  "Physics baseline for January 2026":
    "जनवरी 2026 के लिए भौतिकी बेसलाइन",
  "1,706 flights through the Delhi–Mumbai corridor on 1 Jan 2026, 131,661 one-minute segments, CoCiP with three humidity baselines and 100 Monte Carlo members. A dry winter day: persistent contrails from 6 flights, all south of 15°N.":
    "1 जनवरी 2026 को दिल्ली–मुंबई गलियारे से गुज़री 1,706 उड़ानें, 131,661 एक-मिनट हिस्से, तीन नमी बेसलाइन और 100 मोंटे कार्लो सदस्यों के साथ CoCiP। एक सूखा सर्दियों का दिन: 6 उड़ानों से टिकाऊ कंट्रेल, सभी 15°N के दक्षिण में।",
  "A year of data acquired":
    "एक साल का डेटा जुटाया",
  "ERA5 for the full evaluation year (36/36 month-blocks), 12 ADS-B days, 14 days of Meteosat-9 imagery and the aircraft database.":
    "पूरे मूल्यांकन वर्ष का ERA5 (36/36 महीना-खंड), 12 ADS-B दिन, Meteosat-9 तस्वीरों के 14 दिन और विमान डेटाबेस।",
  "Analysis plan locked":
    "विश्लेषण योजना लॉक",
  "Every hypothesis, threshold and test was fixed and fingerprinted (SHA-256) before any result existed. Changes since then are logged as deviations with a team sign-off.":
    "हर परिकल्पना, सीमा और परीक्षण किसी भी नतीजे के होने से पहले तय करके फ़िंगरप्रिंट (SHA-256) किया गया। तब से हर बदलाव टीम की मंज़ूरी के साथ विचलन के रूप में दर्ज है।",
  "Team lead · modelling & software":
    "टीम लीड · मॉडलिंग और सॉफ़्टवेयर",
  "Flight data · label review":
    "उड़ान डेटा · लेबल जाँच",
  "Satellite data · label review":
    "उपग्रह डेटा · लेबल जाँच",
  "Product & communication · label review":
    "प्रोडक्ट और संवाद · लेबल जाँच",
  "Supervisor":
    "मार्गदर्शक",
  "Hourly weather reanalysis, 0.25°":
    "हर घंटे का मौसम रीएनालिसिस, 0.25°",
  "Temperature and humidity at flight level":
    "फ़्लाइट लेवल पर तापमान और नमी",
  "Reanalysis humidity at cruise height can be wrong — the reason this project exists.":
    "क्रूज़ ऊँचाई पर रीएनालिसिस की नमी गलत हो सकती है — यही इस प्रोजेक्ट की वजह है।",
  "Indian Ocean geostationary satellite, every 15 min":
    "हिंद महासागर का भूस्थिर उपग्रह, हर 15 मिनट",
  "Detect real contrails; check predictions":
    "असली कंट्रेल पहचानना; अनुमान जाँचना",
  "Thin or cloud-covered contrails can be missed; steep viewing angles near the edges.":
    "पतली या बादलों से ढकी कंट्रेल छूट सकती हैं; किनारों के पास तिरछे कोण।",
  "Aircraft position reports":
    "विमानों की स्थिति रिपोर्ट",
  "Flight tracks (free first-of-month samples)":
    "उड़ान रास्ते (हर महीने की पहली तारीख के मुफ़्त नमूने)",
  "12 days in the year; coverage over India is being audited (Nov 2026).":
    "साल में 12 दिन; भारत के ऊपर कवरेज की जाँच हो रही है (नवंबर 2026)।",
  "Aircraft database":
    "विमान डेटाबेस",
  "Aircraft type → performance and engine efficiency":
    "विमान प्रकार → प्रदर्शन और इंजन दक्षता",
  "Some types missing; fallbacks are logged.":
    "कुछ प्रकार गायब; विकल्प दर्ज किए जाते हैं।",
  "GOES-16 scenes with human contrail masks":
    "मानव कंट्रेल मास्क वाले GOES-16 दृश्य",
  "Pre-training the learned detector (D-005)":
    "सीखे हुए डिटेक्टर का पूर्व-प्रशिक्षण (D-005)",
  "American satellite and skies; fine-tuned on Meteosat before use.":
    "अमेरिकी उपग्रह और आसमान; इस्तेमाल से पहले Meteosat पर फ़ाइन-ट्यून किया।",
  "Meteosat scenes labelled by three contrail experts":
    "तीन कंट्रेल विशेषज्ञों द्वारा लेबल किए Meteosat दृश्य",
  "Tuning (51 scenes) and checking (89 scenes) the detectors":
    "डिटेक्टरों को ट्यून (51 दृश्य) और जाँचना (89 दृश्य)",
  "Not over India; the 89 check scenes have been used twice and are now closed.":
    "भारत के ऊपर नहीं; 89 जाँच दृश्य दो बार इस्तेमाल हो चुके हैं और अब बंद हैं।",
  "Daily global weather forecast, 0.25°":
    "रोज़ का वैश्विक मौसम पूर्वानुमान, 0.25°",
  "Live outlook and contrail advisories (/advisory, /live)":
    "लाइव पूर्वानुमान और कंट्रेल चेतावनियाँ (/advisory, /live)",
  "No cloud fields on pressure levels, so physics only; experimental.":
    "दबाव लेवलों पर बादलों के फ़ील्ड नहीं, इसलिए केवल भौतिकी; प्रायोगिक।",
  "Live aircraft positions":
    "विमानों की लाइव स्थिति",
  "Airliners over India now (/live), every 5 minutes":
    "अभी भारत के ऊपर यात्री विमान (/live), हर 5 मिनट",
  "Snapshot every 5 minutes; positions moved on by speed and heading in between.":
    "हर 5 मिनट एक स्नैपशॉट; बीच में स्थिति गति और दिशा से आगे बढ़ाई जाती है।",
  "Live aircraft positions (community receivers)":
    "विमानों की लाइव स्थिति (समुदाय के रिसीवर)",
  "Airliners near the visitor (/live)":
    "आगंतुक के पास के यात्री विमान (/live)",
  "Few receivers over India.":
    "भारत के ऊपर कम रिसीवर।",
  "Coastlines, borders (India point of view), cities":
    "तटरेखाएँ, सीमाएँ (भारत का दृष्टिकोण), शहर",
  "Base map":
    "आधार मानचित्र",
  "Simplified for the web.":
    "वेब के लिए सरल किया गया।",
  "Line filter (pre-registered)":
    "लाइन फ़िल्टर (पहले से दर्ज)",
  "Learned v1":
    "सीखा हुआ v1",
  "Learned v3 (ensemble)":
    "सीखा हुआ v3 (समूह)",
  "Line filter (logged)":
    "लाइन फ़िल्टर (दर्ज)",
  "Learned v3":
    "सीखा हुआ v3",
  "Japan, 1 year":
    "जापान, 1 साल",
  "2.2 % of flights cause 80 % of contrail warming":
    "2.2 % उड़ानें कंट्रेल की 80 % गर्मी पैदा करती हैं",
  "0.48 % of cruise distance carries 80 % of warming (raw ERA5 physics; 0.54 % with the published correction)":
    "क्रूज़ दूरी का 0.48 % गर्मी का 80 % ढोता है (कच्ची ERA5 भौतिकी; प्रकाशित सुधार के साथ 0.54 %)",
  "North Atlantic, 2016–2021":
    "उत्तरी अटलांटिक, 2016–2021",
  "About 12 % of flights cause 80 % of yearly contrail warming; most of it from night flights in winter":
    "लगभग 12 % उड़ानें सालाना कंट्रेल गर्मी का 80 % पैदा करती हैं; ज़्यादातर सर्दियों की रात की उड़ानों से",
  "Same pattern over India: winter nights dominate (H4 context runs)":
    "भारत के ऊपर भी यही ढर्रा: सर्दियों की रातें हावी (H4 संदर्भ रन)",
  "Global, 2019–2021":
    "वैश्विक, 2019–2021",
  "14 % of flights form a warming contrail; 2 % of flights cause 80 % of the warming":
    "14 % उड़ानें गर्म करने वाली कंट्रेल बनाती हैं; 2 % उड़ानें 80 % गर्मी पैदा करती हैं",
  "Under 1 % of distance carries 80 %: as concentrated, measured by distance":
    "1 % से कम दूरी 80 % ढोती है: उतना ही केंद्रित, दूरी से मापा गया",
  "Global model":
    "वैश्विक मॉडल",
  "Night flights: under 40 % of distance, 60 % of contrail forcing":
    "रात की उड़ानें: 40 % से कम दूरी, कंट्रेल फ़ोर्सिंग का 60 %",
  "Night: 49 % of distance, 73–75 % of warming (standard physics; descriptive)":
    "रात: 49 % दूरी, 73–75 % गर्मी (सामान्य भौतिकी; वर्णनात्मक)",
  "Commercial flight planner, ~85,000 simulated flights":
    "व्यावसायिक उड़ान योजनाकार, ~85,000 सिम्युलेटेड उड़ानें",
  "Contrail forcing −73 % for +0.11 % fuel (simulation)":
    "+0.11 % ईंधन पर कंट्रेल फ़ोर्सिंग −73 % (सिमुलेशन)",
  "Our alerts need a positive cautious (5th-percentile) estimate at 20 and 100 years, so we flag fewer flights than a central-estimate planner would":
    "हमारी चेतावनियों को 20 और 100 वर्ष पर सकारात्मक सतर्क (5वाँ प्रतिशतक) अनुमान चाहिए, इसलिए हम केंद्रीय-अनुमान वाले योजनाकार से कम उड़ानें चिह्नित करते हैं",
  "Randomised trial with American Airlines, 22 adjusted and 22 control flights":
    "American Airlines के साथ यादृच्छिक परीक्षण, 22 बदली गई और 22 नियंत्रण उड़ानें",
  "Satellites saw 64 % fewer contrails on adjusted flights; about 2 % more fuel per adjusted flight":
    "बदली गई उड़ानों पर उपग्रहों ने 64 % कम कंट्रेल देखीं; हर बदली गई उड़ान पर लगभग 2 % ज़्यादा ईंधन",
  "We use the same kind of check: satellite images confirm which predicted contrails really formed":
    "हम उसी तरह की जाँच करते हैं: उपग्रह तस्वीरें पुष्टि करती हैं कि कौन सी अनुमानित कंट्रेल सचमुच बनीं",
};

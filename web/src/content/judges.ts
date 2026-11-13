// Copy for the pages judges read first: the story, mission, what is new, the comparison, IP,
// the roadmap, the business plan, the glossary and the references. Same rule as site.ts: no
// invented facts. Every number is from our own logged runs or from a source listed in `references`.
// Plans and proposals (price, budget, dates ahead) are labelled as plans.

export const updated = "13 Nov 2026";

// ---------------------------------------------------------------- story, mission, values
export const story = [
  "We are four Grade 9 students at Indus International School in Bengaluru. For the Conrad Challenge 2026–27 we picked a problem most people have never heard of: the white lines planes leave in the sky. A few of them spread into thin cloud that lasts for hours and traps heat.",
  "Our Lean Canvas and research plan are dated 12 October 2026, and we locked our hypotheses the next day, before any result existed. On 18 October we photographed a long contrail over South India. That line is exactly what we are trying to predict: will it fade in seconds, or spread into cloud for hours?",
  "Why India? Almost all contrail research, and every avoidance trial we found, is over Europe, the North Atlantic and the United States. India is now the world's third-largest domestic aviation market, and we had not found a study that checks contrail forecasts over Indian skies against what a satellite sees.",
];

export const mission =
  "Find out how well contrail forecasts work over India, and turn what we learn into advice that cuts warming without wasting fuel.";
export const vision =
  "Before take-off, any airline flying over India can check whether a flight will leave a warming contrail, how sure that is, and what avoiding it would cost.";
export const values: [string, string][] = [
  ["Plan first", "We write down the test before we see the result, and log every change to the plan with a reason."],
  ["Show what didn't work", "A hypothesis that fails is a result. Ours are on the Results page next to the ones that held."],
  ["Open by default", "Our code and derived data are public, with a DOI, so anyone can check or reuse them."],
  ["No fuel for nothing", "STRATUM only advises a level change when the cautious estimate still shows a benefit."],
  ["Credit everything", "Every dataset, every source and every tool we used is named, including the AI assistant."],
];

export const roles: { name: string; role: string; does: string; skills: string }[] = [
  {
    name: "Shrugal Vinod",
    role: "Team lead · modelling & software",
    does: "Shrugal leads the team, wrote the hypotheses and the analysis plan, runs every model on Google Colab, and builds the software and this website with an AI assistant.",
    skills: "Python, machine learning (gradient-boosted trees and a neural-network contrail detector trained on Google Colab), and research design: writing hypotheses and tests down before the results.",
  },
  {
    name: "Aditya Harsoda",
    role: "Flight data · label review",
    does: "Aditya works on the flight data: where every plane was, minute by minute. Aditya also checked and corrected a third of our 100 India satellite scenes.",
    skills: "Working with ADS-B flight-tracking data (how flights are rebuilt from position reports and cleaned), and reading Meteosat images to find contrails by eye.",
  },
  {
    name: "Ishaan Kupnur",
    role: "Satellite data · label review",
    does: "Ishaan works on the satellite side: the Meteosat-9 images we use to see real contrails. Ishaan also checked and corrected a third of the India scenes.",
    skills: "Reading infrared satellite images: how contrails show up in the 10.8 and 12.0 µm channels, and how cloud and viewing angle hide them.",
  },
  {
    name: "Abeer Shah",
    role: "Product & communication · label review",
    does: "Abeer works on how STRATUM reaches people: the website's story, the video, market research and outreach. Abeer also checked and corrected a third of the India scenes.",
    skills: "Writing and explaining science for non-scientists, market research on airlines and the EU contrail rule, and outreach.",
  },
];
export const supervisorRole =
  "Dr. Varsha Pant is our supervisor at Indus International School. She reviews the science, holds us to our milestones, and checked how our maps draw India's borders.";

// ---------------------------------------------------------------- what's new, comparison, IP
export const whatsNew: [string, string][] = [
  [
    "A satellite check of contrail forecasts over India",
    "We have not found a published study that checks contrail forecasts over Indian airspace against satellite observations. STRATUM does it for 12 days of real traffic, and the answer surprised us: the standard physics predicts about six times more lasting contrails than Meteosat-9 sees (test H1).",
  ],
  [
    "A model trained on Indian skies",
    "The published humidity corrections we compared against were fitted to aircraft measurements taken mostly over other regions. Our model is trained on contrails Meteosat-9 actually saw over India, and scenes the satellite could not see are marked unknown, never counted as \"no contrail\". It ranks contrail-prone flights much better than physics rules (AUROC 0.65–0.83 against 0.42–0.66).",
  ],
  [
    "A public daily score for the forecast",
    "Once a day, yesterday's contrail forecast is checked against the contrails Meteosat-9 saw, and the score stays on the Report card page, good days and bad. We have not found anyone else publishing a daily score like this for India.",
  ],
  [
    "A decision for one flight",
    "Each alert names the flight, the level 2,000 or 4,000 ft away, the extra fuel and the warming avoided as a range, and it is only raised when the cautious estimate still shows a benefit.",
  ],
  [
    "A plan locked before the results",
    "Every hypothesis, threshold and test was fixed and fingerprinted on 13 Oct 2026, before any result existed. Each later change is a numbered deviation with a reason.",
  ],
];

export type Tool = { name: string; what: string; where: string; satIndia: string; open: string; vs: string; src: string; href: string };
export const tools: Tool[] = [
  {
    name: "Google Research with American Airlines",
    what: "Contrail forecasts used by pilots to change altitude in a randomised trial: 64 % fewer contrails for about 2 % more fuel per adjusted flight.",
    where: "United States",
    satIndia: "No",
    open: "Published paper; the tool is not public",
    vs: "STRATUM checks the forecasts over India, where no trial has run, and publishes its daily score.",
    src: "Sonabend-W et al. 2024",
    href: "https://doi.org/10.1038/s44172-024-00329-7",
  },
  {
    name: "Google Research with FlightKeys",
    what: "Contrail forecasts offered through flight-planning software: Google names FlightKeys among its flight-planning partners and works with airlines such as American Airlines.",
    where: "United States and the North Atlantic, including a trial in Shanwick airspace with the UK Government and NATS",
    satIndia: "No",
    open: "Commercial",
    vs: "Shows the route to market: flight-planning software. STRATUM would be the India-checked forecast such a system could use.",
    src: "Google, Operation Blue Skies, 18 Aug 2026",
    href: "https://blog.google/innovation-and-ai/models-and-research/google-research/blue-skies/",
  },
  {
    name: "pycontrails / CoCiP",
    what: "Open-source contrail physics (Schmidt–Appleman check and the CoCiP model). STRATUM uses it as its baseline.",
    where: "Anywhere there is weather data",
    satIndia: "No",
    open: "Open source",
    vs: "We run it, then check it against Meteosat-9 over India and learn where it goes wrong.",
    src: "Schumann 2012; pycontrails",
    href: "https://py.contrails.org/",
  },
  {
    name: "pycontrails latitude correction (our baseline B3)",
    what: "A correction for ERA5's humidity at cruise height, fitted to humidity measured from airliners.",
    where: "Measurements mostly from other regions",
    satIndia: "No",
    open: "Open source",
    vs: "Our model learns from contrails seen over India instead. It passed our test against B3 (H2), but only ranking is clearly better.",
    src: "Teoh et al. 2024",
    href: "https://doi.org/10.5194/acp-24-6071-2024",
  },
  {
    name: "EU non-CO₂ monitoring (default method)",
    what: "From 2027, estimates each EU-linked flight's contrail effect with CoCiP for airlines' reports.",
    where: "Every flight into and out of the EEA, India–Europe included",
    satIndia: "No",
    open: "Public rules",
    vs: "The same physics we found over-predicts lasting contrails over India about six-fold. STRATUM can check those estimates for Indian skies.",
    src: "European Commission",
    href: "https://climate.ec.europa.eu/areas-action/transport-decarbonisation/reducing-emissions-aviation_en",
  },
];

export const ip: [string, string][] = [
  [
    "What anyone can copy",
    "Our code is open source (Apache-2.0) and our v1.0 data are CC BY 4.0. Anyone can copy them, and we chose that on purpose so the science can be checked. We have filed no patent: in India a computer program or algorithm by itself cannot be patented (Patents Act 1970, Section 3(k)).",
  ],
  [
    "What is hard to copy",
    "A growing, satellite-labelled record of contrails over India; the daily report card, whose history cannot be rebuilt later; the know-how in our matching and detector rules (what failed, and why); and being first to check contrail forecasts over India in public.",
  ],
  [
    "What we would keep",
    "The public map, the daily score and the research data stay open. A paid service would add what an airline needs on top: alerts sent into its own systems, reports for the EU rule, and support. That service code and new labels made for customers would not have to be public.",
  ],
  [
    "The DLR licence",
    "Our detectors were tuned with expert labels from DLR that are licensed for non-commercial use only (CC BY-NC 4.0), so a paid service cannot use them as they are. Before any sale we would retrain on labels we are free to use (Google's OpenContrails, CC BY 4.0, and our own India labels) or ask DLR for a licence.",
  ],
];

// ---------------------------------------------------------------- what's next, limits
export const roadmap: { when: string; title: string; body: string; done?: boolean }[] = [
  {
    when: "Done · 11 Nov 2026",
    done: true,
    title: "Flight-data coverage audit",
    body: "We checked how many scheduled Delhi–Mumbai flights free trackers see from end to end. OpenSky saw 41 % of them on 10 Nov (our rule needed 50 %), and the free adsb.lol archive saw none end to end. So the research keeps its 12 ADS-B Exchange days, and we know a paid or partner feed is needed to run daily.",
  },
  {
    when: "Dec 2026 – Feb 2027",
    title: "More flight days",
    body: "Twelve first-of-month days are too few for tight per-season ranges. We already record every airliner over India every few minutes from OpenSky for the live pages; we will keep those recordings and re-test H1 on the winter days they cover, as a second analysis.",
  },
  {
    when: "By Feb 2027",
    title: "Expert review",
    body: "Contrail researchers we wrote to have replied. We will ask them to review the method and, with their permission, publish what they say.",
  },
  {
    when: "Jan – Mar 2027",
    title: "Ask air traffic control",
    body: "STRATUM does not model air traffic control. We will ask an air traffic expert in India whether 2,000 and 4,000 ft level changes are workable on the routes we flag, and change the advice if they are not.",
  },
  {
    when: "From Jan 2027",
    title: "A first airline trial, with no flights changed",
    body: "We will offer an Indian airline that flies to Europe a free shadow trial: STRATUM forecasts its flights each day and the satellite scores the forecast. Only if that works would a real level change be discussed, with the airline and air traffic control.",
  },
  {
    when: "21–24 Apr 2027",
    title: "Conrad Innovation Summit",
    body: "If we are selected: the live demo, the daily report card so far, and what the airline and air traffic conversations taught us.",
  },
  {
    when: "Jun – Sep 2027",
    title: "The monsoon problem",
    body: "Monsoon cloud hides contrails from the satellite: we saw 1 contrail in 9,803 monsoon segments. We will test whether a second satellite view helps, starting with India's own INSAT-3DR images from MOSDAC.",
  },
  {
    when: "Mid-2027",
    title: "Preprint and data update",
    body: "Write the full study up as a preprint and release the new labels and the report-card record with the code.",
  },
];

// Why Meteosat-9 and not INSAT-3D (the Lean Canvas named INSAT-3D and Himawari).
export const satelliteSwitch =
  "Our Lean Canvas (12 Oct 2026) named INSAT-3D and Himawari. When we wrote the research plan that same week we chose Meteosat-9 instead: it sits over the Indian Ocean at 45.5°E and sees all of India every 15 minutes, in the two infrared channels contrail detection uses (10.8 and 12.0 µm); EUMETSAT's data store let our code download a whole year of images; and the only expert-labelled contrail dataset on a geostationary satellite we found (DLR) was made on the same instrument, so we could test our detector against experts. Himawari's view of India is at the edge of its disc. INSAT-3DR is where we will look again for the monsoon.";

export const cantDo: string[] = [
  "No real flight has been changed. Everything is computational.",
  "Air traffic control is not modelled, so every alert is a suggestion for a person to decide on.",
  "The research rests on 12 flight days; the uncertainty ranges per season are wide.",
  "The monsoon cannot be tested yet: cloud hides contrails from the satellite.",
  "Our model ranks risky flights well, but its probabilities barely beat a constant guess.",
  "No airline uses STRATUM yet.",
];

// ---------------------------------------------------------------- business plan
export const customers: { who: string; why: string; pays: string; uses: string }[] = [
  {
    who: "Indian airlines flying to Europe",
    why: "From 1 Jan 2027 the EU makes every flight between India and Europe report its contrails' climate effect, using the same physics we found over-predicts over India.",
    pays: "Sustainability or compliance team",
    uses: "Flight dispatch and the reporting team",
  },
  {
    who: "Indian airlines on domestic routes",
    why: "No rule yet, but contrails are aviation's biggest warming term in the most-used estimate and among the cheapest to cut, and Indian airlines are entering ICAO's CORSIA for CO₂ from 2027.",
    pays: "Sustainability team",
    uses: "Flight dispatch",
  },
  {
    who: "Flight-planning software companies",
    why: "Dispatchers plan in this software, and Google already works with flight-planning software providers on contrails, FlightKeys among them. An India-checked forecast is a feature they could add.",
    pays: "The software company, as a data licence",
    uses: "Their airline customers' dispatchers",
  },
  {
    who: "Regulators and air navigation providers",
    why: "Whoever checks India's contrail reporting, or plans its airspace, needs to know how far the forecasts can be trusted here.",
    pays: "Research or pilot contracts",
    uses: "Analysts and airspace planners",
  },
  {
    who: "Researchers and climate groups",
    why: "There is little contrail data for South Asia. They are our first users and they pay nothing.",
    pays: "Nobody: free",
    uses: "Researchers",
  },
];

export const reach: [string, string][] = [
  ["Give the science away", "The map, the daily report card and the data stay free. They are the proof an airline can check before talking to us."],
  ["First pilot: a shadow trial", "Our first pilot customer type is an Indian airline that flies to Europe, because it faces the EU rule in 2027. We offer a free shadow trial: no flight changes, just a daily forecast for its flights scored by the satellite."],
  ["Sell direct, then through software", "A paid subscription goes direct to the airline first. To reach many airlines, we would license the forecast to flight-planning software companies so the alerts appear where dispatchers already work."],
  ["Work with research bodies and regulators", "We share our results with contrail researchers, and later with Indian aviation regulators, so the method is reviewed before anyone relies on it."],
];

export const market: { n: string; what: string; src: string; href: string }[] = [
  {
    n: "844",
    what: "commercial aircraft in India's fleet in 2025, up from 395 in 2014",
    src: "AIR News, 20 Dec 2025",
    href: "https://www.newsonair.gov.in/india-emerges-as-worlds-third-largest-domestic-aviation-market",
  },
  {
    n: "2,250",
    what: "aircraft Airbus forecasts India's commercial fleet will reach by 2035",
    src: "Airbus press release, Jan 2026",
    href: "https://www.airbus.com/en/newsroom/press-releases/2026-01-indian-aircraft-fleet-to-reach-2250-by-2035-mro-market-to-hit-us95-billion",
  },
  {
    n: "3rd",
    what: "largest domestic aviation market in the world: India",
    src: "AIR News, 20 Dec 2025",
    href: "https://www.newsonair.gov.in/india-emerges-as-worlds-third-largest-domestic-aviation-market",
  },
];
export const marketMath =
  "At our proposed price of ₹50,000 per aircraft a year, every aircraft in India's 2025 fleet would be ₹4.2 crore a year, and the 2035 fleet ₹11.3 crore. That is a ceiling, not a forecast: we would start with one airline.";

export const offer: [string, string, string][] = [
  ["Free", "Public map, daily report card, open data", "₹0, for everyone"],
  ["STRATUM Report", "For the EU rule: each India–Europe flight's contrail estimate, checked against the satellite, in a report the airline can file", "₹50,000 per aircraft a year (proposed)"],
  ["STRATUM Alerts", "Daily level advice for the airline's own flights, sent into its dispatch or flight-planning system", "Included with STRATUM Report"],
  ["First pilot", "A three-month shadow trial with one airline", "Free"],
];
export const priceNote =
  "Our proposed price is ₹50,000 per aircraft a year. We have not tested it with any airline yet. For comparison, in our runs one advised level change used about 79 kg of extra fuel (about 98 litres, so about ₹13,500 at ₹137 a litre, the Delhi jet-fuel price from 1 October 2026) and avoided about 6 t of CO₂-equivalent warming even on the cautious estimate.";

export const costsNow: [string, string, string][] = [
  ["Website and live data (Cloudflare Workers, free plan)", "₹0", "Free plan: 100,000 requests a day"],
  ["Daily jobs (GitHub Actions, public repository)", "₹0", "Free for public repositories"],
  ["Model runs and storage (Google Colab, Google Drive 2 TB)", "Our own accounts", "Run on our own Google accounts, not charged to the project"],
  ["Weather, satellite and flight-sample data", "₹0", "Free for research: ERA5, ECMWF open data, EUMETSAT, ADS-B Exchange sample days, OpenSky"],
  ["Domain", "₹0", "We use the free workers.dev address"],
];
export const costsService: [string, string, string][] = [
  ["Hosting (Cloudflare Workers Paid)", "US$60 a year", "US$5 a month, 10 million requests included (Cloudflare)"],
  ["Compute (Google Colab Pro)", "about US$120 a year", "US$9.99 a month"],
  ["Flight data for daily, commercial use", "US$1,200 a year (our budget)", "Free sources are licensed for research only; we budget US$100 a month until we have a quote"],
  ["Domain", "about ₹1,000 a year", "Our budget for a .in or .com name"],
];
export const costNote =
  "Running costs grow with the airspace covered, not the number of customers: the same daily run serves one airline or ten. Satellite images delayed by an hour or more are free from EUMETSAT; for a paid service we would need to check its licence for commercial use.";

export const funding = {
  need: "About US$1,400 a year to run STRATUM as a daily service for a first pilot airline, plus about ₹1,000 for a domain.",
  goesTo: [
    "Flight data for daily, commercial use (about US$1,200)",
    "Hosting on Cloudflare's paid plan (US$60)",
    "Compute on Google Colab Pro (about US$120)",
  ],
  sources: [
    "Prize and grant money for student innovation, such as the Conrad Challenge and India's INSPIRE-MANAK award for school students in classes 6 to 12 (nominations go through the school; the 2026–27 round has closed, so we would apply in the next round, in 2027).",
    "Our school, for the domain and printing.",
    "After a successful shadow trial: the first airline subscription.",
  ],
};

// ---------------------------------------------------------------- glossary
export const glossary: [string, string][] = [
  ["Contrail", "The line of ice cloud a jet leaves when the water vapour in its exhaust freezes in cold air."],
  ["Persistent contrail", "A contrail that does not fade within minutes but spreads into thin cloud that can last for hours."],
  ["Contrail cirrus", "The thin, spread-out cloud a persistent contrail turns into."],
  ["ISSR (ice-supersaturated region)", "A layer of air holding more water vapour than ice can hold in balance with it. Contrails last only in these layers, which are often just a few hundred metres thick."],
  ["RHi (relative humidity over ice)", "How humid the air is compared with saturation over ice. Above 100 % the air is ice-supersaturated and a contrail can last."],
  ["SAC (Schmidt–Appleman criterion)", "The textbook rule for whether a contrail forms at all, from the air's temperature and humidity and the engine's efficiency."],
  ["CoCiP (Contrail Cirrus Prediction Model)", "A model that follows each contrail as it drifts and spreads and estimates how long it lasts and how much it warms. We run it through the open-source pycontrails library."],
  ["FL (flight level)", "Altitude in hundreds of feet at standard pressure: FL350 is about 35,000 ft."],
  ["ERA5", "ECMWF's global record of past weather, every hour on a 0.25° grid. Its humidity at cruise height is a model estimate, not a measurement."],
  ["Meteosat-9", "A European weather satellite over the Indian Ocean (45.5°E) that photographs India every 15 minutes, including in the infrared channels where contrails show up."],
  ["ADS-B", "The position reports airliners broadcast every second, collected by networks of ground receivers."],
  ["Energy forcing (EF)", "The total extra energy a contrail traps over its life, in joules. Bigger means more warming."],
  ["CO₂e (CO₂-equivalent)", "Warming expressed as the mass of CO₂ that would warm the same over a chosen time horizon (we use 20 and 100 years)."],
  ["Brier score", "A score for probability forecasts: the average squared gap between the forecast and what happened. Lower is better."],
  ["Brier skill score", "How much better a forecast's Brier score is than a reference forecast: 1 is perfect, 0 is no better, below 0 is worse."],
  ["AUROC", "How well a forecast ranks: the chance it gives a higher score to a flight that made a visible contrail than to one that did not. 0.5 is a coin toss, 1 is perfect."],
  ["Pre-registration", "Writing down the hypotheses, tests and thresholds before seeing any result, so the result cannot shape the test."],
  ["Deviation", "A logged change to the pre-registered plan, with the reason and the team's sign-off."],
  ["Monte Carlo members", "Re-running a model many times with different plausible settings to get a range instead of one number. We use 100."],
  ["Detection efficiency", "The share of real contrails the satellite and our detector can actually see."],
];

// ---------------------------------------------------------------- references (same list as the brief)
export const references: { ref: string; href?: string }[] = [
  { ref: "Lee, D. S., et al. (2021). The contribution of global aviation to anthropogenic climate forcing for 2000 to 2018. Atmospheric Environment, 244, 117834.", href: "https://doi.org/10.1016/j.atmosenv.2020.117834" },
  { ref: "Teoh, R., Schumann, U., Majumdar, A., & Stettler, M. E. J. (2020). Mitigating the climate forcing of aircraft contrails by small-scale diversions and technology adoption. Environmental Science & Technology, 54(5), 2941–2950.", href: "https://doi.org/10.1021/acs.est.9b05608" },
  { ref: "Teoh, R., Schumann, U., Gryspeerdt, E., Shapiro, M., Molloy, J., Koudis, G., Voigt, C., & Stettler, M. E. J. (2022). Aviation contrail climate effects in the North Atlantic from 2016 to 2021. Atmospheric Chemistry and Physics, 22, 10919–10935.", href: "https://doi.org/10.5194/acp-22-10919-2022" },
  { ref: "Teoh, R., Engberg, Z., Schumann, U., Voigt, C., Shapiro, M., Rohs, S., & Stettler, M. E. J. (2024). Global aviation contrail climate effects from 2019 to 2021. Atmospheric Chemistry and Physics, 24, 6071–6093.", href: "https://doi.org/10.5194/acp-24-6071-2024" },
  { ref: "Stuber, N., & Forster, P. (2007). The impact of diurnal variations of air traffic on contrail radiative forcing. Atmospheric Chemistry and Physics, 7, 3153–3162.", href: "https://doi.org/10.5194/acp-7-3153-2007" },
  { ref: "Martín Frías, A., Shapiro, M. L., Engberg, Z., Zopp, R., Soler, M., & Stettler, M. E. J. (2024). Feasibility of contrail avoidance in a commercial flight planning system: an operational analysis. Environmental Research: Infrastructure and Sustainability, 4, 015013.", href: "https://doi.org/10.1088/2634-4505/ad310c" },
  { ref: "Sonabend-W, A., Elkin, C., Dean, T., et al. (2024). Feasibility test of per-flight contrail avoidance in commercial aviation. Communications Engineering, 3, 184.", href: "https://doi.org/10.1038/s44172-024-00329-7" },
  { ref: "Gierens, K., Matthes, S., & Rohs, S. (2020). How well can persistent contrails be predicted? Aerospace, 7(12), 169.", href: "https://doi.org/10.3390/aerospace7120169" },
  { ref: "Wolf, K., Bellouin, N., Boucher, O., Rohs, S., & Li, Y. (2025). Correction of ERA5 temperature and relative humidity biases by bivariate quantile mapping for contrail formation analysis. Atmospheric Chemistry and Physics, 25, 157–181.", href: "https://doi.org/10.5194/acp-25-157-2025" },
  { ref: "Driver, O. G. A., Stettler, M. E. J., & Gryspeerdt, E. (2025). Factors limiting contrail detection in satellite imagery. Atmospheric Measurement Techniques, 18, 1115–1134.", href: "https://doi.org/10.5194/amt-18-1115-2025" },
  { ref: "Hersbach, H., et al. (2020). The ERA5 global reanalysis. Quarterly Journal of the Royal Meteorological Society, 146, 1999–2049.", href: "https://doi.org/10.1002/qj.3803" },
  { ref: "Schumann, U. (2012). A contrail cirrus prediction model. Geoscientific Model Development, 5, 543–580.", href: "https://doi.org/10.5194/gmd-5-543-2012" },
  { ref: "Schäfer, M., Strohmeier, M., Lenders, V., Martinovic, I., & Wilhelm, M. (2014). Bringing up OpenSky: a large-scale ADS-B sensor network for research. Proceedings of IPSN '14, 83–94.", href: "https://doi.org/10.1109/IPSN.2014.6846743" },
  { ref: "Ng, J. Y.-H., et al. (2023). OpenContrails: benchmarking contrail detection on GOES-16 ABI. arXiv:2304.02122. Dataset licence CC BY 4.0.", href: "https://arxiv.org/abs/2304.02122" },
  { ref: "Santos Gabriel, V., et al. (2026). DLR expert-labelled contrails on Meteosat SEVIRI scenes. Earth System Science Data, 18, 2397–2412. Dataset on Zenodo, CC BY-NC 4.0.", href: "https://doi.org/10.5281/zenodo.17669443" },
  { ref: "pycontrails: Python library for modelling aviation climate impacts (Breakthrough Energy). Open source.", href: "https://py.contrails.org/" },
  { ref: "OpenAP: open aircraft performance model.", href: "https://openap.dev/" },
  { ref: "Ke, G., et al. (2017). LightGBM: a highly efficient gradient boosting decision tree. Advances in Neural Information Processing Systems 30. Software:", href: "https://lightgbm.readthedocs.io/" },
  { ref: "ADS-B Exchange. Flight tracking data (free first-of-month sample days; derived flight lines shown with written permission of 16 Oct 2026).", href: "https://www.adsbexchange.com/" },
  { ref: "The OpenSky Network. Aircraft database and live aircraft positions.", href: "https://opensky-network.org/" },
  { ref: "EUMETSAT. Meteosat-9 (IODC) SEVIRI Level 1.5 images and cloud mask. Images © EUMETSAT.", href: "https://data.eumetsat.int/" },
  { ref: "EUMETSAT. Data Policy.", href: "https://www-cdn.eumetsat.int/files/2026-01/45173%20-%20Data_Policy.pdf" },
  { ref: "ECMWF open data (IFS forecasts), CC BY 4.0.", href: "https://www.ecmwf.int/en/forecasts/datasets/open-data" },
  { ref: "European Commission. Reducing emissions from aviation.", href: "https://climate.ec.europa.eu/areas-action/transport-decarbonisation/reducing-emissions-aviation_en" },
  { ref: "Directive (EU) 2023/958 amending Directive 2003/87/EC as regards aviation's contribution to the Union's economy-wide emission reduction target.", href: "https://eur-lex.europa.eu/legal-content/en/TXT/?uri=CELEX%3A32023L0958" },
  { ref: "AIR News (2025, 20 December). India emerges as world's third largest domestic aviation market.", href: "https://www.newsonair.gov.in/india-emerges-as-worlds-third-largest-domestic-aviation-market" },
  { ref: "Airbus (2026, 29 January). Indian commercial aircraft fleet to reach 2,250 by 2035.", href: "https://www.airbus.com/en/newsroom/press-releases/2026-01-indian-aircraft-fleet-to-reach-2250-by-2035-mro-market-to-hit-us95-billion" },
  { ref: "Google (2026, 18 August). Operation Blue Skies: reducing aviation climate impact with AI.", href: "https://blog.google/innovation-and-ai/models-and-research/google-research/blue-skies/" },
  { ref: "Cloudflare. Workers pricing.", href: "https://developers.cloudflare.com/workers/platform/pricing/" },
  { ref: "ICAO / DGCA (2025). CORSIA implementation in India (ICAO Asia-Pacific CORSIA seminar presentation).", href: "https://www.icao.int/sites/default/files/APAC/Meetings/2025/2025%20CORSIASAP/Presentations/PPT-FOR-ICAO-CORSIA-SEMINAR_India.pdf" },
  { ref: "Business Standard (2026, 1 October). Commercial LPG price up ₹62.50, ATF rises ₹16/litre from October 1 (Delhi ATF ₹121 → ₹137 a litre).", href: "https://www.business-standard.com/amp/industry/news/commercial-lpg-atf-price-hike-october-1-windfall-tax-diesel-126100100466_1.html" },
  { ref: "IndiGo (InterGlobe Aviation). Business Responsibility and Sustainability Report FY2025–26, filed 28 July 2026.", href: "https://nsearchives.nseindia.com/corporate/Indigo1_28072026133647_BRSR.pdf" },
  { ref: "The Patents Act, 1970 (India), Section 3(k), as reproduced by WIPO.", href: "https://wipo.int/ip-development/en/agenda/flexibilities/details.jsp?id=8825" },
  { ref: "Department of Science and Technology, Government of India. INSPIRE Awards – MANAK.", href: "https://www.inspireawards-dst.gov.in/" },
  { ref: "Vinod S., Harsoda A., Kupnur I., Shah A. (2026). STRATUM: how well can persistent contrails be predicted over India? Zenodo (all versions).", href: "https://doi.org/10.5281/zenodo.23480201" },
  { ref: "Anthropic (2026). Claude Code [AI coding assistant], running Claude Opus 5.5 and Claude Fable 5.2. Used October–November 2026 to write much of the analysis code and the website, and to draft the contrail lines on 100 India satellite scenes that the team then reviewed. Accessed 13 October to 13 November 2026.", href: "https://www.anthropic.com/claude-code" },
  { ref: "Anthropic (2026). Claude Opus 5.5 and Claude Fable 5.2 [large language models]. Used October–November 2026 to help find and summarise papers and to help draft and edit the Innovation Brief and this website's text from the team's notes and results. Accessed 13 October to 13 November 2026.", href: "https://claude.ai/" },
];

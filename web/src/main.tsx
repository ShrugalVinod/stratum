import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/public-sans/wght.css";
import "@fontsource-variable/martian-mono/wdth.css";
import "@fontsource-variable/newsreader/wght-italic.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import { render } from "preact";
import { useEffect } from "preact/hooks";
import {
  ErrorBoundary,
  LocationProvider,
  Route,
  Router,
  lazy,
  useLocation,
} from "preact-iso";
import { Footer } from "./components/Footer";
import { Booth, boothRequested } from "./components/Booth";
import { Header } from "./components/Header";
import { startMotion } from "./components/motion";
import { useLang } from "./i18n";
import { Home } from "./pages/Home";

// A page's code is fetched when it is first opened. If that fetch fails (a new version was
// deployed while the tab was open, so the old file names are gone, or the dev server stopped),
// load the page normally once instead of silently staying on the current one.
function reloadOnce<T>(load: () => Promise<T>): () => Promise<T> {
  return () =>
    load().catch((err: unknown) => {
      const key = `stratum-reload:${location.pathname}`;
      let tried = false;
      try {
        tried = sessionStorage.getItem(key) === "1";
        sessionStorage.setItem(key, "1");
      } catch {
        tried = false;
      }
      if (!tried) {
        location.reload();
        return new Promise<T>(() => {}); // the reload replaces the page
      }
      throw err;
    });
}

const MapPage = lazy(
  reloadOnce(() => import("./pages/MapPage").then((m) => m.MapPage)),
);
const HowItWorks = lazy(
  reloadOnce(() => import("./pages/HowItWorks").then((m) => m.HowItWorks)),
);
const Progress = lazy(
  reloadOnce(() => import("./pages/Progress").then((m) => m.Progress)),
);
const Methods = lazy(
  reloadOnce(() => import("./pages/Methods").then((m) => m.Methods)),
);
const Results = lazy(reloadOnce(() => import("./pages/Results").then((m) => m.Results)));
const Team = lazy(reloadOnce(() => import("./pages/Team").then((m) => m.Team)));
const AboutData = lazy(
  reloadOnce(() => import("./pages/AboutData").then((m) => m.AboutData)),
);
const Contact = lazy(
  reloadOnce(() => import("./pages/Contact").then((m) => m.Contact)),
);
const LiveSky = lazy(reloadOnce(() => import("./pages/LiveSky").then((m) => m.LiveSky)));
const Sky3D = lazy(reloadOnce(() => import("./pages/Sky3D").then((m) => m.Sky3D)));
const Advisory = lazy(reloadOnce(() => import("./pages/Advisory").then((m) => m.Advisory)));
const Game = lazy(reloadOnce(() => import("./pages/Game").then((m) => m.Game)));
const Routes = lazy(reloadOnce(() => import("./pages/Routes").then((m) => m.Routes)));
const Spot = lazy(reloadOnce(() => import("./pages/Spot").then((m) => m.Spot)));
const Flight = lazy(reloadOnce(() => import("./pages/Flight").then((m) => m.Flight)));
const Report = lazy(reloadOnce(() => import("./pages/Report").then((m) => m.Report)));
const Airlines = lazy(reloadOnce(() => import("./pages/Airlines").then((m) => m.Airlines)));
const Sandbox = lazy(reloadOnce(() => import("./pages/Sandbox").then((m) => m.Sandbox)));
const Replay = lazy(reloadOnce(() => import("./pages/Replay").then((m) => m.Replay)));
const NotFound = lazy(
  reloadOnce(() => import("./pages/NotFound").then((m) => m.NotFound)),
);

function ScrollReset() {
  const { path } = useLocation();
  useEffect(() => startMotion(), []);
  useEffect(() => {
    if (!location.hash) window.scrollTo({ top: 0, behavior: "instant" });
  }, [path]);
  return null;
}

function Shell() {
  const { path } = useLocation();
  return (
    <>
      <Header />
      <main id="main" class={path === "/map" || path === "/3d" ? "is-map" : ""}>
        <ErrorBoundary>
          <Router>
            <Route path="/" component={Home} />
            <Route path="/map" component={MapPage} />
            <Route path="/live" component={LiveSky} />
            <Route path="/3d" component={Sky3D} />
            <Route path="/advisory" component={Advisory} />
            <Route path="/game" component={Game} />
            <Route path="/routes" component={Routes} />
            <Route path="/spot" component={Spot} />
            <Route path="/flight" component={Flight} />
            <Route path="/report" component={Report} />
            <Route path="/airlines" component={Airlines} />
            <Route path="/sandbox" component={Sandbox} />
            <Route path="/replay" component={Replay} />
            <Route path="/how-it-works" component={HowItWorks} />
            <Route path="/progress" component={Progress} />
            <Route path="/results" component={Results} />
            <Route path="/methods" component={Methods} />
            <Route path="/team" component={Team} />
            <Route path="/about-data" component={AboutData} />
            <Route path="/contact" component={Contact} />
            <Route default component={NotFound} />
          </Router>
        </ErrorBoundary>
      </main>
      <Footer />
      {boothRequested() && <Booth />}
    </>
  );
}

export function App() {
  // switching language redraws the whole site in the other language
  const lang = useLang();
  return (
    <LocationProvider>
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      <ScrollReset />
      <Shell key={lang} />
    </LocationProvider>
  );
}

render(<App />, document.getElementById("app")!);

// offline support (build prompt §8.2): production builds only, so development never caches
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => undefined));
}

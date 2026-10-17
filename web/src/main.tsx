import "@fontsource-variable/archivo/wdth.css";
import "@fontsource-variable/public-sans/wght.css";
import "@fontsource-variable/martian-mono/wdth.css";
import "@fontsource-variable/newsreader/wght-italic.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import { render } from "preact";
import { useEffect } from "preact/hooks";
import { ErrorBoundary, LocationProvider, Route, Router, lazy, useLocation } from "preact-iso";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
import { startMotion } from "./components/motion";
import { Home } from "./pages/Home";

const MapPage = lazy(() => import("./pages/MapPage").then((m) => m.MapPage));
const HowItWorks = lazy(() => import("./pages/HowItWorks").then((m) => m.HowItWorks));
const Progress = lazy(() => import("./pages/Progress").then((m) => m.Progress));
const Methods = lazy(() => import("./pages/Methods").then((m) => m.Methods));
const Team = lazy(() => import("./pages/Team").then((m) => m.Team));
const AboutData = lazy(() => import("./pages/AboutData").then((m) => m.AboutData));
const Contact = lazy(() => import("./pages/Contact").then((m) => m.Contact));
const NotFound = lazy(() => import("./pages/NotFound").then((m) => m.NotFound));

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
      <main id="main" class={path === "/map" ? "is-map" : ""}>
        <ErrorBoundary>
          <Router>
            <Route path="/" component={Home} />
            <Route path="/map" component={MapPage} />
            <Route path="/how-it-works" component={HowItWorks} />
            <Route path="/progress" component={Progress} />
            <Route path="/methods" component={Methods} />
            <Route path="/team" component={Team} />
            <Route path="/about-data" component={AboutData} />
            <Route path="/contact" component={Contact} />
            <Route default component={NotFound} />
          </Router>
        </ErrorBoundary>
      </main>
      <Footer />
    </>
  );
}

export function App() {
  return (
    <LocationProvider>
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      <ScrollReset />
      <Shell />
    </LocationProvider>
  );
}

render(<App />, document.getElementById("app")!);

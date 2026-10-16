import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/500.css";
import "@fontsource/source-serif-4/400.css";
import "@fontsource/source-serif-4/600.css";
import "@fontsource/source-serif-4/700.css";
import "./styles/tokens.css";
import "./styles/base.css";
import "./styles/layout.css";
import { render } from "preact";
import { useEffect } from "preact/hooks";
import { ErrorBoundary, LocationProvider, Route, Router, lazy, useLocation } from "preact-iso";
import { Footer } from "./components/Footer";
import { Header } from "./components/Header";
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
  useEffect(() => {
    if (!location.hash) window.scrollTo(0, 0);
  }, [path]);
  return null;
}

export function App() {
  return (
    <LocationProvider>
      <a class="skip-link" href="#main">
        Skip to content
      </a>
      <ScrollReset />
      <Header />
      <main id="main">
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
    </LocationProvider>
  );
}

render(<App />, document.getElementById("app")!);

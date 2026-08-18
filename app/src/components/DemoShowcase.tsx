import {
  ArrowRight,
  BrainCircuit,
  HeartPulse,
  RadioTower,
} from "lucide-react";

import "./DemoShowcase.css";
import { setDemoNavigationSource } from "./demoNavigation";

export type FeaturedDemoId =
  | "ai-image-recognition"
  | "adaptive-beamforming"
  | "cardiac-monitoring";

type DemoShowcaseProps = {
  onOpenDemo: (demoId: FeaturedDemoId) => void;
};

const FEATURED_DEMOS = [
  {
    id: "ai-image-recognition" as const,
    field: "Artificial Intelligence",
    title: "AI Image Recognition",
    description:
      "See how technical text about image recognition can be organized into patent-search concepts, keywords, classifications, and search-query starters.",
    Icon: BrainCircuit,
  },
  {
    id: "adaptive-beamforming" as const,
    field: "Digital Communications",
    title: "5G/6G Adaptive Beamforming",
    description:
      "Explore a communications example involving adaptive antenna control and see how the app prepares structured patent-search information.",
    Icon: RadioTower,
  },
  {
    id: "cardiac-monitoring" as const,
    field: "Medical Technology",
    title: "Wearable Cardiac Monitoring",
    description:
      "Preview how wearable cardiac-monitoring technology can be converted into organized technical concepts and patent-search starting points.",
    Icon: HeartPulse,
  },
];

export default function DemoShowcase({
  onOpenDemo,
}: DemoShowcaseProps) {
  function openLandingDemo(demoId: FeaturedDemoId) {
    setDemoNavigationSource("landing");
    onOpenDemo(demoId);
  }

  return (
    <div className="demo-showcase">
      <div className="demo-showcase-heading">
        <p className="demo-showcase-eyebrow">Example analyses</p>
        <h2>Explore three patent-search examples</h2>
        <p>
          Review representative examples from three active technology fields
          and see how technical text becomes structured patent-search
          information.
        </p>
      </div>

      <div className="demo-showcase-grid">
        {FEATURED_DEMOS.map(({ id, field, title, description, Icon }) => (
          <article className="demo-showcase-card" key={id}>
            <div className="demo-showcase-icon" aria-hidden="true">
              <Icon />
            </div>

            <p className="demo-showcase-field">{field}</p>
            <h3>{title}</h3>
            <p className="demo-showcase-description">{description}</p>

            <button
              type="button"
              className="demo-showcase-button"
              onClick={() => openLandingDemo(id)}
            >
              View demo
              <ArrowRight aria-hidden="true" />
            </button>
          </article>
        ))}
      </div>
    </div>
  );
}

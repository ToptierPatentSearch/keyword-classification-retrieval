import type { GeneratedSearchQueryStarter } from "../searchQuery";

export type DemoKeyword = {
  term: string;
  synonyms: string;
};

export type DemoClassification = {
  system: string;
  code: string;
  title: string;
};

export type DemoCase = {
  id: string;
  field: string;
  title: string;
  technicalExample: string;
  conceptTitle: string;
  conceptDescription: string;
  facets: string[];
  keywords: DemoKeyword[];
  classifications: DemoClassification[];
  queryStarter: GeneratedSearchQueryStarter;
};

export const EV_WIRELESS_CHARGING_DEMO: DemoCase = {
  id: "ev-wireless-charging",
  field: "Electric Vehicle Technology",
  title: "EV Wireless Charging",

  technicalExample:
    "An electric-vehicle wireless charging system includes a ground-side power-transmitting coil, a vehicle-side power-receiving coil, and a camera that detects alignment markers around the charging pad. A controller estimates lateral and angular misalignment from the camera images and adjusts the vehicle parking position before energizing the transmitting coil. During power transfer, the controller monitors coupling efficiency and coil temperature, then changes the inverter frequency and transmitted power to maintain charging efficiency while preventing overheating.",

  conceptTitle: "Adaptive alignment and safe power-transfer control",

  conceptDescription:
    "A wireless EV charging system uses image-based coil positioning, efficiency feedback, and temperature monitoring to establish and maintain efficient inductive power transfer.",

  facets: [
    "Object/system",
    "Component relationships",
    "Control means",
    "Technical effect",
  ],

  keywords: [
    {
      term: "electric-vehicle wireless charging",
      synonyms: "contactless EV charging · inductive vehicle charging",
    },
    {
      term: "coil alignment control",
      synonyms: "charging-pad positioning · coil misalignment correction",
    },
    {
      term: "coupling-efficiency optimization",
      synonyms:
        "power-transfer efficiency control · resonant coupling adjustment",
    },
    {
      term: "coil temperature protection",
      synonyms: "thermal monitoring · overheating prevention",
    },
  ],

  classifications: [
    {
      system: "IPC / CPC",
      code: "B60L 53/12",
      title: "Inductive energy transfer for electrically propelled vehicles",
    },
    {
      system: "IPC / CPC",
      code: "B60L 53/38",
      title:
        "Automatic or assisted alignment of charging devices and vehicles",
    },
    {
      system: "IPC / CPC",
      code: "H02J 50/10",
      title: "Circuit arrangements for inductive wireless power transfer",
    },
  ],

  queryStarter: {
    keywordQuery:
      '("wireless EV charging" OR "inductive vehicle charging") AND ("coil alignment" OR "coil misalignment correction") AND ("coupling-efficiency optimization" OR "coil temperature protection")',

    classificationQuery:
      "(CPC=B60L53/38 OR CPC=H02J50/10)",

    reviewStatus: "demo",

    reviewSummary:
      "This demonstration query was pre-reviewed for technical relevance, Boolean structure, and use of the displayed classification codes.",
  },
};
export const AI_IMAGE_RECOGNITION_DEMO: DemoCase = {
  id: "ai-image-recognition",
  field: "Artificial Intelligence / Computer Vision",
  title: "AI Image Recognition",

  technicalExample:
    "A vision-processing system receives camera images and applies a neural network to identify objects. It calculates a confidence level for each recognition result and initiates further image processing when the confidence is below a defined threshold.",

  conceptTitle: "Confidence-triggered neural-network object recognition",

  conceptDescription:
    "A vision-processing system uses a neural network to recognize objects in camera images and selectively performs further image processing when recognition confidence falls below a defined threshold.",

  facets: [
    "Object/system",
    "Operation",
    "Control means",
    "Technical effect",
  ],

  keywords: [
    {
      term: "vision-processing system",
      synonyms:
        "computer vision system · visual processing system · image analysis system",
    },
    {
      term: "neural network",
      synonyms:
        "deep neural network · neural model · machine-learning network",
    },
    {
      term: "camera images",
      synonyms:
        "captured images · camera frames · image frames",
    },
    {
      term: "confidence level",
      synonyms:
        "recognition confidence · confidence score · confidence measure",
    },
    {
      term: "defined threshold",
      synonyms:
        "confidence threshold · decision threshold · preset threshold",
    },
  ],

  classifications: [
    {
      system: "IPC / CPC",
      code: "G06T 7/00",
      title: "Image analysis",
    },
    {
      system: "IPC / CPC",
      code: "G06V 10/82",
      title: "using neural networks",
    },
  ],

  queryStarter: {
    keywordQuery:
      '("vision processing system" OR "vision-processing system" OR "computer vision system") AND ("neural network" OR "deep neural network" OR "neural model") AND ("camera image" OR "camera images" OR "captured images") AND ("recognition confidence" OR "confidence level" OR "confidence score") AND ("confidence threshold" OR "defined threshold" OR "decision threshold")',

    classificationQuery:
      "(CPC=G06T7/00 OR CPC=G06V10/82)",

    reviewStatus: "demo",

    reviewSummary:
      "This demonstration uses the catalog-backed classifications and reviewed search-query starter verified during application testing.",
  },
};
export const ADAPTIVE_BEAMFORMING_DEMO: DemoCase = {
  id: "adaptive-beamforming",
  field: "5G / 6G Wireless Communications",
  title: "Adaptive Beamforming",

  technicalExample:
    "A wireless cellular base station monitors channel quality for several user terminals and dynamically steers antenna beams while changing transmission settings in response to interference and varying radio-channel conditions.",

  conceptTitle: "Adaptive beam and radio-resource control",

  conceptDescription:
    "A cellular base station monitors radio-channel quality and dynamically controls antenna-beam direction and transmission settings in response to interference and changing channel conditions.",

  facets: [
    "Object/system",
    "Operation",
    "Control means",
    "Controlled variable",
  ],

  keywords: [
    {
      term: "wireless cellular base station",
      synonyms:
        "wireless base station · cellular radio base station · radio access base station",
    },
    {
      term: "antenna beams",
      synonyms:
        "beam steering · antenna beamforming · directional radio beams",
    },
    {
      term: "channel quality",
      synonyms:
        "radio-channel quality · link quality · radio link quality",
    },
    {
      term: "transmission settings",
      synonyms:
        "radio transmission parameters · transmission parameters · radio settings",
    },
    {
      term: "interference",
      synonyms:
        "radio interference · radio-frequency interference · wireless interference",
    },
  ],

  classifications: [
    {
      system: "IPC / CPC",
      code: "H04W 16/28",
      title: "using beam steering",
    },
    {
      system: "IPC / CPC",
      code: "H04W 36/36",
      title: "by user or terminal equipment",
    },
    {
      system: "IPC / CPC",
      code: "H04W 40/12",
      title: "based on transmission quality or channel quality",
    },
    {
      system: "CPC",
      code: "H04W 52/0206",
      title: "in access points, e.g. base stations",
    },
    {
      system: "IPC / CPC",
      code: "H04W 74/00",
      title: "Wireless channel access",
    },
    {
      system: "IPC / CPC",
      code: "H04W 92/08",
      title: "between user and terminal device",
    },
  ],

  queryStarter: {
    keywordQuery:
      '("cellular base station" OR "wireless cellular base station" OR "wireless base station") AND ("antenna beam steering" OR "antenna beams" OR "beam steering") AND ("radio-channel quality" OR "channel quality" OR "link quality") AND ("radio transmission parameters" OR "transmission settings" OR "transmission parameters") AND ("radio interference" OR "interference" OR "radio-frequency interference")',

    classificationQuery:
      "(CPC=H04W16/28 OR CPC=H04W36/36 OR CPC=H04W40/12 OR CPC=H04W52/0206 OR CPC=H04W74/00 OR CPC=H04W92/08)",

    reviewStatus: "demo",

    reviewSummary:
      "This demonstration uses the catalog-backed wireless-communication classifications and reviewed search-query starter verified during application testing.",
  },
};
export const CARDIAC_MONITORING_DEMO: DemoCase = {
  id: "cardiac-monitoring",
  field: "Digital Health / Medical Devices",
  title: "Wearable Cardiac Monitoring",

  technicalExample:
    "A wearable ECG monitor continuously records cardiac electrical signals, suppresses motion-related artifacts, detects abnormal heart rhythms, and sends selected arrhythmia episodes to a remote patient-monitoring service.",

  conceptTitle: "Continuous wearable ECG monitoring and remote arrhythmia reporting",

  conceptDescription:
    "A wearable ECG monitoring system continuously acquires cardiac electrical signals, reduces motion-related interference, detects abnormal rhythms, and remotely transmits selected arrhythmia episodes for patient monitoring.",

  facets: [
    "Object/system",
    "Operation",
    "Control means",
    "Application/use",
  ],

  keywords: [
    {
      term: "wearable ECG monitor",
      synonyms:
        "wearable cardiac monitor · ambulatory ECG monitor · wearable electrocardiography device",
    },
    {
      term: "cardiac electrical signals",
      synonyms:
        "electrocardiographic signals · ECG signals · cardiac electrophysiological signals",
    },
    {
      term: "motion-related artifacts",
      synonyms:
        "motion artifacts · motion interference · movement artifacts",
    },
    {
      term: "abnormal heart rhythms",
      synonyms:
        "cardiac arrhythmias · irregular heart rhythms · abnormal cardiac rhythms",
    },
    {
      term: "arrhythmia episodes",
      synonyms:
        "cardiac arrhythmia episodes · arrhythmic episodes · abnormal rhythm episodes",
    },
  ],

  classifications: [
    {
      system: "CPC",
      code: "A61B 5/0006",
      title: "{ECG or EEG signals}",
    },
  ],

  queryStarter: {
    keywordQuery:
      '("wearable electrocardiogram monitor" OR "wearable ECG monitor" OR "wearable cardiac monitor") AND ("electrocardiographic signals" OR "cardiac electrical signals" OR "ECG signals") AND ("motion artifacts" OR "motion-related artifacts" OR "motion interference") AND ("cardiac arrhythmias" OR "abnormal heart rhythms" OR "irregular heart rhythms") AND ("cardiac arrhythmia episodes" OR "arrhythmia episodes" OR "arrhythmic episodes")',

    classificationQuery:
      "CPC=A61B5/0006",

    reviewStatus: "demo",

    reviewSummary:
      "This demonstration uses the catalog-backed ECG classification and reviewed search-query starter verified during application testing.",
  },
};
export const DEMO_CASES: Record<string, DemoCase> = {
  [EV_WIRELESS_CHARGING_DEMO.id]: EV_WIRELESS_CHARGING_DEMO,
  [AI_IMAGE_RECOGNITION_DEMO.id]: AI_IMAGE_RECOGNITION_DEMO,
  [ADAPTIVE_BEAMFORMING_DEMO.id]: ADAPTIVE_BEAMFORMING_DEMO,
  [CARDIAC_MONITORING_DEMO.id]: CARDIAC_MONITORING_DEMO,
};

export function getDemoCase(demoId: string | null): DemoCase {
  if (demoId && DEMO_CASES[demoId]) {
    return DEMO_CASES[demoId];
  }

  return EV_WIRELESS_CHARGING_DEMO;
}
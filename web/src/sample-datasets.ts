import bankMarketingCsv from "./sample-data/bank-marketing.csv?raw";

import { normalizeTable, parseCsvText, type ParsedDataset } from "./dataset";

export type SampleDatasetDefinition = {
  id: "banking-demo" | "bank-marketing";
  title: string;
  eyebrow: string;
  description: string;
  sizeLabel: string;
  target: string;
  targetLabel: string;
  featured?: boolean;
  sourceLabel: string;
  sourceUrl?: string;
  license: string;
};

export const sampleDatasets: SampleDatasetDefinition[] = [
  {
    id: "banking-demo",
    eyebrow: "Recommended · Synthetic",
    title: "Credit risk demo",
    description: "Explore fictional retail customers with exposure, utilization, arrears, products, and default risk.",
    sizeLabel: "2,000 rows · 14 variables",
    target: "default_next_12m",
    targetLabel: "Default in the next 12 months",
    featured: true,
    sourceLabel: "Created for ControlTree",
    license: "Synthetic data · included under the ControlTree license",
  },
  {
    id: "bank-marketing",
    eyebrow: "Public banking data",
    title: "Term deposit marketing",
    description: "Use real campaign data from a Portuguese bank to explore which clients subscribed to a term deposit.",
    sizeLabel: "4,521 rows · 17 variables",
    target: "term_deposit",
    targetLabel: "Term deposit subscription",
    sourceLabel: "UCI Bank Marketing",
    sourceUrl: "https://archive.ics.uci.edu/dataset/222/bank%2Bmarketing",
    license: "CC BY 4.0 · Moro, Rita & Cortez (2014)",
  },
];

function randomGenerator(seed: number) {
  let value = seed;
  return () => {
    value += 0x6d2b79f5;
    let next = value;
    next = Math.imul(next ^ (next >>> 15), next | 1);
    next ^= next + Math.imul(next ^ (next >>> 7), next | 61);
    return ((next ^ (next >>> 14)) >>> 0) / 4294967296;
  };
}

function choose<T>(values: T[], random: () => number): T {
  return values[Math.floor(random() * values.length)];
}

function buildCreditRiskDemo(): ParsedDataset {
  const random = randomGenerator(20260911);
  const columns = [
    "customer_id",
    "age",
    "annual_income_eur",
    "account_balance_eur",
    "credit_exposure_eur",
    "utilization_pct",
    "days_in_arrears",
    "missed_payments_12m",
    "product_count",
    "tenure_years",
    "region",
    "customer_segment",
    "has_mortgage",
    "default_next_12m",
  ];
  const rows: Array<Array<string | number>> = [columns];
  const regions = ["North", "Centre", "Lisbon", "Alentejo", "Algarve", "Islands"];

  for (let index = 0; index < 2000; index += 1) {
    const age = Math.round(21 + random() * 58);
    const segmentRoll = random();
    const segment = segmentRoll < .16 ? "Affluent" : segmentRoll < .53 ? "Mass affluent" : "Mass market";
    const incomeBase = segment === "Affluent" ? 78000 : segment === "Mass affluent" ? 44000 : 24500;
    const annualIncome = Math.max(10500, Math.round(incomeBase * (.62 + random() * .78)));
    const tenure = Math.min(age - 18, Math.round(random() * 22));
    const productCount = Math.max(1, Math.min(7, Math.round(1 + tenure / 6 + random() * 2)));
    const utilization = Math.min(100, Math.max(3, Math.round(12 + random() * 80 + (segment === "Mass market" ? 8 : -5))));
    const exposure = Math.round((annualIncome * (.12 + random() * .92) * (utilization / 70)) / 100) * 100;
    const accountBalance = Math.round(Math.max(0, annualIncome * (random() * .42) - exposure * .08) / 10) * 10;
    const stress = utilization / 100 + exposure / Math.max(annualIncome, 1) + (segment === "Mass market" ? .18 : 0);
    const missedPayments = random() < Math.max(.04, stress * .32) ? 1 + Math.floor(random() * 5) : 0;
    const arrears = missedPayments ? Math.round(random() * 75 + missedPayments * 8) : 0;
    const riskScore = -4.7 + utilization * .031 + missedPayments * .58 + (arrears > 30 ? .9 : 0) + (exposure > annualIncome * .7 ? .65 : 0) - (accountBalance > 8000 ? .45 : 0);
    const defaultProbability = 1 / (1 + Math.exp(-riskScore));
    rows.push([
      `CT${String(index + 1).padStart(5, "0")}`,
      age,
      annualIncome,
      accountBalance,
      exposure,
      utilization,
      arrears,
      missedPayments,
      productCount,
      tenure,
      choose(regions, random),
      segment,
      random() < Math.min(.82, Math.max(.08, (age - 24) / 58)) ? "yes" : "no",
      random() < defaultProbability ? "yes" : "no",
    ]);
  }

  return normalizeTable(rows, "ControlTree Credit Risk Demo.csv");
}

function buildBankMarketing(): ParsedDataset {
  const dataset = parseCsvText(bankMarketingCsv, "UCI Bank Marketing.csv");
  const originalTarget = "y";
  const target = "term_deposit";
  dataset.columns = dataset.columns.map((column) => column === originalTarget ? target : column);
  if (dataset.inferredTypes?.[originalTarget]) {
    dataset.inferredTypes[target] = dataset.inferredTypes[originalTarget];
    delete dataset.inferredTypes[originalTarget];
  }
  if (dataset.numberFormats?.[originalTarget]) {
    dataset.numberFormats[target] = dataset.numberFormats[originalTarget];
    delete dataset.numberFormats[originalTarget];
  }
  return dataset;
}

export async function loadSampleDataset(id: SampleDatasetDefinition["id"]): Promise<ParsedDataset> {
  await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
  return id === "bank-marketing" ? buildBankMarketing() : buildCreditRiskDemo();
}

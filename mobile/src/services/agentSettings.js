import {
  fetchAgentSettings as sdkFetchAgentSettings,
  saveAgentSettings as sdkSaveAgentSettings,
} from "@homie/sdk";

export const SPENDING_CAP_OPTS = [
  { value: 100,   label: "$100 per tx",     desc: "Conservative auto-execute limit" },
  { value: 500,   label: "$500 per tx",     desc: "Standard limit for most actions" },
  { value: 1000,  label: "$1,000 per tx",   desc: "Higher limit for active portfolios" },
  { value: 99999, label: "No cap",          desc: "Unlimited — only bounded by daily cap" },
];

export const DAILY_CAP_OPTS = [
  { value: 500,   label: "$500 / day" },
  { value: 2000,  label: "$2,000 / day" },
  { value: 5000,  label: "$5,000 / day" },
  { value: 99999, label: "No daily cap" },
];

export const AUTO_EXECUTE_OPTS = [
  {
    key:   "compoundRewards",
    label: "Compound rewards",
    desc:  "Harvest and reinvest LP fees automatically",
    risk:  "Very Low",
    riskColor: "#4ADE80",
  },
  {
    key:   "rebalanceLp",
    label: "Rebalance LP range",
    desc:  "Recenter out-of-range positions, with a notification",
    risk:  "Low",
    riskColor: "#4ADE80",
  },
  {
    key:   "moveBetweenLending",
    label: "Move to higher yield",
    desc:  "Rotate lending positions when rate gap exceeds threshold. Notifies first — executes after 10 min unless cancelled.",
    risk:  "Medium",
    riskColor: "#FBBF24",
  },
  {
    key:   "autoRepay",
    label: "Auto-repay on low health",
    desc:  "Repay borrow positions if health factor drops below your threshold. Alerts you immediately after.",
    risk:  "Med-High",
    riskColor: "#F87171",
  },
];

const DEFAULTS = {
  isPaused:    false,
  spendingCapUsd: 500,
  dailyCapUsd: 2000,
  autoExecute: {
    compoundRewards:    true,
    rebalanceLp:        true,
    moveBetweenLending: false,
    autoRepay:          false,
  },
};

export async function loadAgentSettings(walletAddress) {
  try {
    const settings = await sdkFetchAgentSettings(walletAddress);
    return {
      ...DEFAULTS,
      ...(settings || {}),
      autoExecute: { ...DEFAULTS.autoExecute, ...(settings?.autoExecute || {}) },
    };
  } catch {
    return { ...DEFAULTS };
  }
}

export async function saveAgentSettings(walletAddress, settings) {
  try {
    return await sdkSaveAgentSettings(walletAddress, settings);
  } catch {
    return null;
  }
}

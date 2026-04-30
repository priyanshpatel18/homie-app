import React from "react";
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, ActivityIndicator, ScrollView,
} from "react-native";
import GradientButton from "./GradientButton";

const GLASS       = "rgba(255,255,255,0.07)";
const GLASS_MED   = "rgba(255,255,255,0.10)";
const GLASS_BDR   = "rgba(255,255,255,0.12)";
const GLASS_BDR_L = "rgba(255,255,255,0.18)";
const TEXT_PRI    = "#FFFFFF";
const TEXT_SEC    = "rgba(255,255,255,0.65)";
const TEXT_MUTED  = "rgba(255,255,255,0.35)";
const GREEN       = "#4ADE80";
const WARN        = "#FBBF24";
const RED         = "#F87171";
const BLUE        = "#60A5FA";

const RISK_CONFIG = {
  low:    { color: GREEN, label: "Low risk",    dot: "●" },
  medium: { color: WARN,  label: "Medium risk", dot: "●" },
  high:   { color: RED,   label: "High risk",   dot: "●" },
};

function getRiskFromTx(tx) {
  if (tx.riskLevel) return tx.riskLevel;
  const action   = (tx.action   || "").toLowerCase();
  const protocol = (tx.protocol || "").toLowerCase();
  if (action.includes("stake") || action.includes("msol") || protocol.includes("marinade")) return "low";
  if (action.includes("lend")  || protocol.includes("kamino"))  return "low";
  if (action.includes("swap")  || action.includes("jupiter"))   return "medium";
  if (action.includes("leverage") || protocol.includes("meteora")) return "medium";
  if (action.includes("lp") || action.includes("liquidity"))    return "medium";
  return "medium";
}

function parseFeeUsd(fee, solPrice) {
  if (!fee || !solPrice) return null;
  const match = fee.match(/([\d.]+)\s*SOL/i);
  if (!match) return null;
  const usd = parseFloat(match[1]) * solPrice;
  if (usd < 0.001) return "<$0.001";
  return `~$${usd.toFixed(3)}`;
}

function parseInputToken(tx) {
  if (tx.inputToken) return { symbol: tx.inputToken, amount: tx.inputAmount };
  const action    = tx.action || "";
  const swapMatch = action.match(/Swap\s+([\d.]+)\s+(\w+)/i);
  if (swapMatch) return { symbol: swapMatch[2], amount: parseFloat(swapMatch[1]) };
  const stakeMatch = action.match(/Stake\s+([\d.]+)\s+(\w+)/i);
  if (stakeMatch) return { symbol: stakeMatch[2], amount: parseFloat(stakeMatch[1]) };
  return null;
}

function parseOutputToken(tx) {
  if (tx.outputToken) return tx.outputToken;
  const action = tx.action || "";
  const arrowMatch = action.match(/→\s*(\w+)/);
  if (arrowMatch) return arrowMatch[1];
  if ((tx.action || "").toLowerCase().includes("stake")) return "mSOL";
  if ((tx.action || "").toLowerCase().includes("lend"))  return "kToken (receipt)";
  return null;
}

// ─── Bundle step row ─────────────────────────────────────────────────────────

function BundleStep({ step, isCurrent, isDone }) {
  const borderColor = isDone ? GREEN : isCurrent ? BLUE : GLASS_BDR;
  const numBg       = isDone ? "rgba(74,222,128,0.15)" : isCurrent ? "rgba(96,165,250,0.15)" : GLASS;
  const numColor    = isDone ? GREEN : isCurrent ? BLUE : TEXT_MUTED;

  return (
    <View style={[b.stepRow, { borderColor }]}>
      <View style={[b.stepNum, { backgroundColor: numBg, borderColor }]}>
        {isDone
          ? <Text style={[b.stepNumText, { color: GREEN }]}>✓</Text>
          : <Text style={[b.stepNumText, { color: numColor }]}>{step.step}</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <View style={b.stepLabelRow}>
          <Text style={[b.stepLabel, isCurrent && { color: TEXT_PRI }]}>{step.label}</Text>
          {step.estimated && (
            <View style={b.estBadge}>
              <Text style={b.estText}>EST</Text>
            </View>
          )}
        </View>
        <Text style={b.stepDesc} numberOfLines={2}>{step.description}</Text>
        {step.estimated && (
          <Text style={b.stepNote}>{step.estimatedNote}</Text>
        )}
      </View>
      <View style={[b.protocolTag, isCurrent && { borderColor: BLUE }]}>
        <Text style={[b.protocolText, isCurrent && { color: BLUE }]}>
          {(step.protocol || "").split(" ")[0]}
        </Text>
      </View>
    </View>
  );
}

// ─── Bundle view ──────────────────────────────────────────────────────────────

function BundlePreview({ bundle, currentStep, onConfirm, onCancel, signing }) {
  const step = bundle.steps[currentStep];

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.header}>
        <View style={[s.headerIconBox, { backgroundColor: "rgba(96,165,250,0.12)", borderColor: "rgba(96,165,250,0.25)" }]}>
          <Text style={[s.headerIconText, { color: BLUE }]}>⚡</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{bundle.title}</Text>
          <Text style={s.headerSub}>
            Step {currentStep + 1} of {bundle.totalSteps} — {bundle.protocol}
          </Text>
        </View>
        <TouchableOpacity onPress={onCancel} style={s.closeBtn} disabled={signing}>
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Why box */}
      {bundle.why && (
        <View style={[s.whyBox, { borderLeftColor: BLUE, borderLeftWidth: 3 }]}>
          <Text style={[s.whyText, { color: TEXT_SEC }]}>{bundle.why}</Text>
        </View>
      )}

      {/* All steps */}
      <View style={{ gap: 8, marginBottom: 16 }}>
        {bundle.steps.map((st, i) => (
          <BundleStep
            key={st.step}
            step={st}
            isCurrent={i === currentStep}
            isDone={i < currentStep}
          />
        ))}
      </View>

      {/* Current step details */}
      <View style={s.detailsBox}>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Current action</Text>
          <Text style={s.detailValue}>{step.label}</Text>
        </View>
        <View style={s.detailRow}>
          <Text style={s.detailLabel}>Protocol</Text>
          <Text style={s.detailValue}>{step.protocol}</Text>
        </View>
        {bundle.estimatedGas && (
          <View style={[s.detailRow, { borderBottomWidth: 0 }]}>
            <Text style={s.detailLabel}>Total gas (all steps)</Text>
            <Text style={s.detailValue}>{bundle.estimatedGas}</Text>
          </View>
        )}
      </View>

      {/* New range info */}
      {bundle.newRange && (
        <View style={[s.whyBox, { borderLeftColor: GREEN, borderLeftWidth: 3 }]}>
          <Text style={[s.whyText, { color: GREEN }]}>
            New range: ${bundle.newRange.low} – ${bundle.newRange.high} (current price: ${bundle.newRange.currentPrice})
          </Text>
        </View>
      )}

      <GradientButton onPress={onConfirm} disabled={signing} style={s.confirmBtn} paddingVertical={17}>
        {signing
          ? <ActivityIndicator size="small" color="#000" />
          : <Text style={s.confirmText}>Sign Step {currentStep + 1} of {bundle.totalSteps}</Text>}
      </GradientButton>
      <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.7} disabled={signing}>
        <Text style={s.cancelText}>Cancel bundle</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Main export ─────────────────────────────────────────────────────────────

export default function TransactionPreview({ transaction, onConfirm, onCancel, solPrice }) {
  const [signing, setSigning]     = React.useState(false);
  const [bundleStep, setBundleStep] = React.useState(0);

  const isBundle = transaction?.type === "transaction_bundle";

  const handleConfirm = async () => {
    setSigning(true);
    try {
      if (isBundle) {
        // onConfirm receives the current step's serializedTx
        const step = transaction.steps[bundleStep];
        await onConfirm(step.serializedTx, bundleStep, transaction);
        // Advance to next step unless app already closed modal
        if (bundleStep < transaction.steps.length - 1) {
          setBundleStep((s) => s + 1);
        }
      } else {
        await onConfirm();
      }
    } finally {
      setSigning(false);
    }
  };

  return (
    <Modal transparent animationType="slide" visible>
      <View style={s.backdrop}>
        <ScrollView
          contentContainerStyle={{ justifyContent: "flex-end", flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
        >
          {isBundle ? (
            <BundlePreview
              bundle={transaction}
              currentStep={bundleStep}
              onConfirm={handleConfirm}
              onCancel={onCancel}
              signing={signing}
            />
          ) : (
            <SingleTxPreview
              transaction={transaction}
              onConfirm={handleConfirm}
              onCancel={onCancel}
              signing={signing}
              solPrice={solPrice}
            />
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

// ─── Single tx view (original logic, extracted) ──────────────────────────────

function SingleTxPreview({ transaction, onConfirm, onCancel, signing, solPrice }) {
  const risk    = getRiskFromTx(transaction);
  const riskCfg = RISK_CONFIG[risk] || RISK_CONFIG.medium;
  const feeUsd  = parseFeeUsd(transaction.fee, solPrice);
  const inputParsed = parseInputToken(transaction);
  const outputToken = parseOutputToken(transaction);
  const priceImpactNum = parseFloat((transaction.priceImpact || "").replace("%", ""));
  const highImpact = priceImpactNum > 1;

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.header}>
        <View style={s.headerIconBox}>
          <Text style={s.headerIconText}>↗</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.headerTitle}>{transaction.protocol}</Text>
          <Text style={s.headerSub}>Review before signing</Text>
        </View>
        <TouchableOpacity onPress={onCancel} style={s.closeBtn} disabled={signing}>
          <Text style={s.closeBtnText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* Token flow */}
      {(inputParsed || transaction.estimatedOutput) && (
        <View style={s.flowBox}>
          {inputParsed && (
            <View style={s.flowRow}>
              <Text style={s.flowLabel}>You send</Text>
              <View style={s.flowAmountRow}>
                <Text style={s.flowAmount}>{inputParsed.amount ?? ""}</Text>
                <View style={s.tokenBadge}>
                  <Text style={s.tokenBadgeText}>{inputParsed.symbol}</Text>
                </View>
              </View>
            </View>
          )}
          {inputParsed && transaction.estimatedOutput && (
            <View style={s.arrowRow}>
              <View style={s.arrowLine} />
              <Text style={s.arrowIcon}>↓</Text>
              <View style={s.arrowLine} />
            </View>
          )}
          {transaction.estimatedOutput && (
            <View style={s.flowRow}>
              <Text style={s.flowLabel}>You receive</Text>
              <View style={s.flowAmountRow}>
                <Text style={[s.flowAmount, { color: GREEN }]}>{transaction.estimatedOutput}</Text>
                {outputToken && (
                  <View style={[s.tokenBadge, { borderColor: "rgba(74,222,128,0.30)", backgroundColor: "rgba(74,222,128,0.08)" }]}>
                    <Text style={[s.tokenBadgeText, { color: GREEN }]}>{outputToken}</Text>
                  </View>
                )}
              </View>
            </View>
          )}
        </View>
      )}

      {/* Details */}
      <View style={s.detailsBox}>
        {!inputParsed && !transaction.estimatedOutput && transaction.action && (
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Transaction</Text>
            <Text style={s.detailValue}>{transaction.action}</Text>
          </View>
        )}
        {transaction.priceImpact && (
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Price impact</Text>
            <Text style={[s.detailValue, highImpact && { color: WARN }]}>
              {transaction.priceImpact}{highImpact ? " ⚠" : ""}
            </Text>
          </View>
        )}
        {transaction.fee && (
          <View style={s.detailRow}>
            <Text style={s.detailLabel}>Network fee</Text>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={s.detailValue}>{transaction.fee}</Text>
              {feeUsd && <Text style={s.detailSub}>{feeUsd}</Text>}
            </View>
          </View>
        )}
        <View style={[s.detailRow, { borderBottomWidth: 0 }]}>
          <Text style={s.detailLabel}>Risk</Text>
          <View style={s.riskBadge}>
            <Text style={[s.riskDot, { color: riskCfg.color }]}>{riskCfg.dot}</Text>
            <Text style={[s.riskLabel, { color: riskCfg.color }]}>{riskCfg.label}</Text>
          </View>
        </View>
      </View>

      {transaction.why && (
        <View style={s.whyBox}>
          <Text style={s.whyText}>{transaction.why}</Text>
        </View>
      )}

      {highImpact && (
        <View style={s.warnBox}>
          <Text style={s.warnText}>
            Price impact above 1% — you may want to split this into smaller trades.
          </Text>
        </View>
      )}

      <GradientButton onPress={onConfirm} disabled={signing} style={s.confirmBtn} paddingVertical={17}>
        {signing
          ? <ActivityIndicator size="small" color="#000" />
          : <Text style={s.confirmText}>Confirm & Sign</Text>}
      </GradientButton>
      <TouchableOpacity style={s.cancelBtn} onPress={onCancel} activeOpacity={0.7} disabled={signing}>
        <Text style={s.cancelText}>Cancel</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.75)", justifyContent: "flex-end" },
  card: {
    backgroundColor: "#111111",
    borderTopLeftRadius: 28, borderTopRightRadius: 28,
    padding: 24, paddingBottom: 36,
    borderWidth: 1, borderColor: GLASS_BDR_L, borderBottomWidth: 0,
  },

  // Header
  header: { flexDirection: "row", alignItems: "center", gap: 14, marginBottom: 20 },
  headerIconBox: {
    width: 42, height: 42, borderRadius: 14,
    backgroundColor: "rgba(74,222,128,0.12)",
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: "rgba(74,222,128,0.25)",
  },
  headerIconText: { color: GREEN, fontSize: 18, fontWeight: "900" },
  headerTitle: { color: TEXT_PRI, fontSize: 17, fontWeight: "800", letterSpacing: 0.3 },
  headerSub: { color: TEXT_MUTED, fontSize: 12, fontWeight: "500", marginTop: 2 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 10,
    backgroundColor: GLASS_MED, alignItems: "center", justifyContent: "center",
    borderWidth: 1, borderColor: GLASS_BDR,
  },
  closeBtnText: { color: TEXT_MUTED, fontSize: 14, fontWeight: "700" },

  // Token flow
  flowBox: {
    backgroundColor: GLASS, borderRadius: 18, padding: 16, marginBottom: 16,
    borderWidth: 1, borderColor: GLASS_BDR,
  },
  flowRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  flowLabel: { color: TEXT_MUTED, fontSize: 12, fontWeight: "600", letterSpacing: 0.5 },
  flowAmountRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  flowAmount: { color: TEXT_PRI, fontSize: 22, fontWeight: "800" },
  tokenBadge: {
    paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
    borderWidth: 1, borderColor: "rgba(255,255,255,0.20)",
    backgroundColor: "rgba(255,255,255,0.06)",
  },
  tokenBadgeText: { color: TEXT_PRI, fontSize: 12, fontWeight: "700" },
  arrowRow: { flexDirection: "row", alignItems: "center", marginVertical: 12, gap: 8 },
  arrowLine: { flex: 1, height: 1, backgroundColor: GLASS_BDR },
  arrowIcon: { color: TEXT_MUTED, fontSize: 18 },

  // Details
  detailsBox: {
    borderRadius: 16, borderWidth: 1, borderColor: GLASS_BDR,
    overflow: "hidden", marginBottom: 16,
  },
  detailRow: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 12, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: GLASS_BDR,
  },
  detailLabel: { color: TEXT_MUTED, fontSize: 13, fontWeight: "600" },
  detailValue: { color: TEXT_PRI, fontSize: 13, fontWeight: "700", maxWidth: "60%", textAlign: "right" },
  detailSub: { color: TEXT_MUTED, fontSize: 11, marginTop: 1, textAlign: "right" },

  // Risk
  riskBadge: { flexDirection: "row", alignItems: "center", gap: 5 },
  riskDot: { fontSize: 10 },
  riskLabel: { fontSize: 13, fontWeight: "700" },

  // Why / warning
  whyBox: {
    backgroundColor: GLASS, borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: GLASS_BDR,
  },
  whyText: { color: TEXT_SEC, fontSize: 13, lineHeight: 20 },
  warnBox: {
    backgroundColor: "rgba(251,191,36,0.07)", borderRadius: 14, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: "rgba(251,191,36,0.25)",
    borderLeftWidth: 3, borderLeftColor: WARN,
  },
  warnText: { color: WARN, fontSize: 13, lineHeight: 19 },

  // Actions
  confirmBtn: { marginTop: 8 },
  confirmText: { color: "#000", fontSize: 16, fontWeight: "800", letterSpacing: 0.3 },
  cancelBtn: { alignItems: "center", paddingVertical: 14 },
  cancelText: { color: TEXT_MUTED, fontSize: 15, fontWeight: "600" },
});

// Bundle-specific styles
const b = StyleSheet.create({
  stepRow: {
    flexDirection: "row", alignItems: "flex-start", gap: 12,
    backgroundColor: GLASS, borderRadius: 14, padding: 12,
    borderWidth: 1, borderColor: GLASS_BDR,
  },
  stepNum: {
    width: 28, height: 28, borderRadius: 9,
    alignItems: "center", justifyContent: "center",
    borderWidth: 1, flexShrink: 0,
  },
  stepNumText: { fontSize: 13, fontWeight: "800" },
  stepLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 2 },
  stepLabel: { color: TEXT_SEC, fontSize: 13, fontWeight: "700", flex: 1 },
  stepDesc: { color: TEXT_MUTED, fontSize: 12, lineHeight: 17 },
  stepNote: { color: WARN, fontSize: 11, marginTop: 3, lineHeight: 15 },
  estBadge: {
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6,
    backgroundColor: "rgba(251,191,36,0.12)", borderWidth: 1, borderColor: "rgba(251,191,36,0.3)",
  },
  estText: { color: WARN, fontSize: 9, fontWeight: "800", letterSpacing: 0.5 },
  protocolTag: {
    paddingHorizontal: 7, paddingVertical: 3, borderRadius: 7,
    backgroundColor: GLASS, borderWidth: 1, borderColor: GLASS_BDR,
    alignSelf: "flex-start", flexShrink: 0,
  },
  protocolText: { color: TEXT_MUTED, fontSize: 10, fontWeight: "700" },
});

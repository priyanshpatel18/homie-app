import React, { useState } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ActivityIndicator } from "react-native";
import { Zap, Clock, DollarSign, Shield, X } from "lucide-react-native";
import { F } from "../theme/fonts";
import { getAuthHeaders } from "../services/authStore";
import { API_URL } from "../services/api";

const GREEN  = "#4ADE80";
const YELLOW = "#FACC15";
const RED    = "#F87171";
const GLASS  = "rgba(255,255,255,0.06)";

const TYPE_META = {
  dca:            { label: "DCA Automation",    icon: Zap,        color: GREEN  },
  move_to_safety: { label: "Safety Playbook",   icon: Shield,     color: YELLOW },
  compound:       { label: "Auto-Compound",      icon: Zap,        color: GREEN  },
  rebalance:      { label: "Auto-Rebalance",     icon: Zap,        color: GREEN  },
  custom:         { label: "Custom Playbook",    icon: Zap,        color: GREEN  },
};

function formatExpiry(ms) {
  const days = Math.round((ms - Date.now()) / 86_400_000);
  if (days <= 0) return "expired";
  if (days === 1) return "1 day";
  return `${days} days`;
}

function formatConditions(conditions) {
  if (!conditions?.length) return null;
  return conditions.map((c) => {
    const labels = {
      health_factor:  "health factor",
      sol_price_usd:  "SOL price",
      portfolio_usd:  "portfolio value",
    };
    return `${labels[c.metric] || c.metric} ${c.op} ${c.value}`;
  }).join(" and ");
}

export default function PlaybookCard({ data, walletAddress, onSignTx, onConfirmed, onDeclined }) {
  const [state, setState] = useState("idle"); // idle | confirming | declining | done | error
  const [errorMsg, setErrorMsg] = useState(null);

  if (!data) return null;

  const meta = TYPE_META[data.type] || TYPE_META.custom;
  const Icon = meta.icon;
  const condition = formatConditions(data.conditions);
  const expiresIn = formatExpiry(data.expiresAt);

  async function handleAuthorize() {
    setState("confirming");
    setErrorMsg(null);
    try {
      // For DCA type: sign the Jupiter recurring tx first, then authorize in DB
      if (onSignTx && data.serializedTx) {
        await onSignTx(data.serializedTx);
      }

      const res = await fetch(
        `${API_URL}/api/monitor/playbooks/${walletAddress}/${data.playbookId}/authorize`,
        { method: "POST", headers: { "Content-Type": "application/json", ...getAuthHeaders() } }
      );
      const json = await res.json();
      if (!res.ok || !json.success) throw new Error(json.error || "Authorization failed");
      setState("done");
      onConfirmed?.();
    } catch (e) {
      setState("error");
      setErrorMsg(e.message);
    }
  }

  function handleDecline() {
    setState("declining");
    fetch(`${API_URL}/api/monitor/playbooks/${walletAddress}/${data.playbookId}`, {
      method: "DELETE",
      headers: getAuthHeaders(),
    }).catch(() => {});
    setState("done");
    onDeclined?.();
  }

  if (state === "done") return null;

  return (
    <View style={s.card}>
      {/* Header */}
      <View style={s.header}>
        <View style={[s.iconBox, { backgroundColor: `${meta.color}18`, borderColor: `${meta.color}30` }]}>
          <Icon size={16} color={meta.color} strokeWidth={2} />
        </View>
        <View style={s.headerText}>
          <Text style={s.label}>{meta.label}</Text>
          <Text style={[s.name]}>{data.name}</Text>
        </View>
      </View>

      {/* Scope rows */}
      <View style={s.rows}>
        <ScopeRow icon={DollarSign} label="Max authorized" value={`$${data.maxAmountUsd?.toLocaleString()}`} color={GREEN} />
        <ScopeRow icon={Clock} label="Valid for" value={expiresIn} color="rgba(255,255,255,0.5)" />
        {data.cooldownHours && (
          <ScopeRow icon={Clock} label="Cooldown" value={`${data.cooldownHours}h between firings`} color="rgba(255,255,255,0.5)" />
        )}
        {condition && (
          <ScopeRow icon={Shield} label="Triggers when" value={condition} color={YELLOW} />
        )}
      </View>

      {/* Actions preview */}
      {data.actions?.length > 0 && (
        <View style={s.actionsBox}>
          {data.actions.map((a, i) => (
            <Text key={i} style={s.actionItem}>· {a.label || a.tool}</Text>
          ))}
        </View>
      )}

      {/* DCA notice */}
      {data.type === "dca" && data.serializedTx && (
        <Text style={s.notice}>Confirming will sign and submit the recurring order to Jupiter.</Text>
      )}

      {errorMsg && <Text style={s.error}>{errorMsg}</Text>}

      {/* Buttons */}
      <View style={s.btnRow}>
        <TouchableOpacity
          style={s.declineBtn}
          onPress={handleDecline}
          disabled={state === "confirming"}
          activeOpacity={0.7}
        >
          <X size={14} color="rgba(255,255,255,0.4)" strokeWidth={2} />
          <Text style={s.declineText}>Decline</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={[s.confirmBtn, state === "confirming" && s.confirmBtnDisabled]}
          onPress={handleAuthorize}
          disabled={state === "confirming"}
          activeOpacity={0.85}
        >
          {state === "confirming"
            ? <ActivityIndicator size="small" color="#000" />
            : <>
                <Zap size={14} color="#000" strokeWidth={2.5} />
                <Text style={s.confirmText}>Authorize</Text>
              </>
          }
        </TouchableOpacity>
      </View>
    </View>
  );
}

function ScopeRow({ icon: Icon, label, value, color }) {
  return (
    <View style={s.row}>
      <Icon size={12} color={color} strokeWidth={2} style={{ marginTop: 1 }} />
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={[s.rowValue, { color }]}>{value}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    marginTop: 8,
    backgroundColor: GLASS,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "rgba(74,222,128,0.18)",
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  iconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  headerText: { flex: 1 },
  label: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 10,
    fontFamily: F.medium,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  name: {
    color: "#fff",
    fontSize: 15,
    fontFamily: F.headSemi,
    marginTop: 2,
  },
  rows: { gap: 6 },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 6,
  },
  rowLabel: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 12,
    fontFamily: F.regular,
    flex: 1,
  },
  rowValue: {
    fontSize: 12,
    fontFamily: F.medium,
    textAlign: "right",
    flexShrink: 1,
  },
  actionsBox: {
    backgroundColor: "rgba(255,255,255,0.04)",
    borderRadius: 10,
    padding: 10,
    gap: 4,
  },
  actionItem: {
    color: "rgba(255,255,255,0.55)",
    fontSize: 12,
    fontFamily: F.regular,
  },
  notice: {
    color: "rgba(250,204,21,0.7)",
    fontSize: 11,
    fontFamily: F.regular,
    fontStyle: "italic",
  },
  error: {
    color: RED,
    fontSize: 12,
    fontFamily: F.regular,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 4,
  },
  declineBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.10)",
  },
  declineText: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 13,
    fontFamily: F.medium,
  },
  confirmBtn: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: GREEN,
  },
  confirmBtnDisabled: {
    opacity: 0.6,
  },
  confirmText: {
    color: "#000",
    fontSize: 14,
    fontFamily: F.headSemi,
  },
});

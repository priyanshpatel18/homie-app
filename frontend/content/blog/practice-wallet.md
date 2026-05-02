---
title: "What we mean by a practice wallet"
description: "It's not paper trading. Every variable is real: the prices, the protocols, the fees, the slippage. Only the SOL is play money."
date: "2026-05-08"
authors: ["priyansh"]
category: "Product"
tags: ["practice-wallet", "simulation", "product"]
---

## A quick disambiguation

When most people hear *practice wallet* they hear something close to demo
trading or paper trading, and the connotation isn't great. Paper trading was
a flashcard: pick a stock on Monday, check on Friday, decide whether you're a
genius. The numbers were fake, the prices were stale, the friction was zero.
It taught nothing because nothing was at stake, not even the *texture* of
the decision.

The practice wallet in Homie is the opposite. Every variable is real except
one: the SOL.

The protocols are real. When you stake through Marinade in practice mode, the
call goes through the same Marinade math, with the same fees, against the
same validator set. When you swap through Jupiter, the route is built against
live pool depths, and the slippage you see is the slippage you would have
paid. When you deposit into Kamino, the APY moves with the actual market,
hour by hour. The only thing that is pretend is the balance you started with.

## What it gives you

Most people learn DeFi the hard way: small loss, larger loss, lesson, repeat.
The practice wallet collapses that loop into a conversation. You pick a
scenario, Homie runs the next thirty or ninety days against current market
conditions, and you watch the path: best case, worst case, and the drawdown
in the middle.

Then you push on it. *What if SOL drops twenty percent next week. What if
yields compress to half. What if I double the size. What if I split it across
two protocols instead of one.* The rehearsal re-runs in the same thread,
against the same starting conditions. You can ask the same question seven
different ways and see seven different paths without having moved a single
token.

## A walkthrough

Say you have two hundred dollars in USDC and you ask Homie what to do with
it. Homie comes back with three honest options: leave it, lend it, or stake
it through an LST. Each is a card with the APY, the lockup, and the worst
case spelled out. You pick the lending option and ask to rehearse it for
ninety days.

Homie spins up the practice wallet, runs the deposit, and walks you through
the projected path: roughly **$2.10** in interest by day ninety in the median
scenario, around **$1.40** if rates compress, around **$2.80** if a couple of
borrowers push utilization up. You ask what happens if the protocol gets
paused mid-period. The simulation re-runs with that assumption baked in. You
ask what doubling the size would change. It re-runs again.

By the time you are done you haven't earned anything. You have spent twenty
minutes pretending. But you also know exactly what would have happened, what
you would have felt at each step, and what the boring outcome actually looks
like. Now the real version isn't novel. It's familiar.

## Why we built this first

It is genuinely hard to be careful with money you have never moved. People
bypass risk-management not because they are reckless but because the
alternative, pausing to read a thirty-line transaction in a foreign syntax
while the market moves, is too expensive in the moment.

Rehearsal lowers the cost of being careful. The hundredth time you stake SOL
is calmer than the first, and the practice wallet is how you get to the
hundredth without losing money on the first ninety-nine.

Crypto is not going to get easier. But the gap between the people who do well
and the people who get drained is, mostly, the number of reps. The practice
wallet is just a way to give you those reps before they cost anything.

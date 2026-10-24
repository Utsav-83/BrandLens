import { describe, expect, it } from "vitest";
import { checkAccessibilityText, checkAbsoluteClaims, checkGlossaryTerms, checkNumericClaims, checkReadability, checkTone } from "@/lib/review/rules";

const ruleCases = [
  { name: "glossaryTerms", check: (s: string) => checkGlossaryTerms(s, ["AVOID: Smart-Pay | smartpay -> USE: SmartPay"]), positives: ["Use Smart-Pay today", "smartpay works", "SMART-PAY is ready"], negatives: ["SmartPay works", "A wallet works", "Payment is clear"], edges: ["", "🙂", "Smart-Pay, Smart-Pay"] },
  { name: "absoluteClaims", check: checkAbsoluteClaims, positives: ["100% secure", "never fails", "the best app"], negatives: ["secure payments", "steady service", "trusted by teams"], edges: ["", "!!! 🙂", "fastest, fastest"] },
  { name: "numericClaims", check: (s: string) => checkNumericClaims(s, []), positives: ["Fee is 1.8%", "settles in 5 minutes", "Costs ₹500"], negatives: ["Fee varies", "Many merchants", "Settle soon"], edges: ["", "🙂", "0.5%, 0.5%"] },
  { name: "tone", check: checkTone, positives: ["Hey guys", "We are gonna help", "This is awesome"], negatives: ["Hello merchants", "We will help", "This is reliable"], edges: ["", "!!! 🙂", "guys, GUYS"] },
  { name: "readability", check: checkReadability, positives: ["word ".repeat(31).trim()+"." , "This "+"is ".repeat(29)+"long.", "One "+"two ".repeat(30)+"three."], negatives: ["Short sentence.", "", "🙂 !!!"], edges: ["", "🙂", "!" ] },
  { name: "accessibilityText", check: checkAccessibilityText, positives: ["![](chart.png)", "<img src='x'>", "[click here](x)"], negatives: ["![Revenue chart](chart.png)", "<img src='x' alt='Revenue chart'>", "[View report](x)"], edges: ["", "🙂", "![](a) [read more](b)"] },
];

describe.each(ruleCases)("$name rule", ({ check, positives, negatives, edges }) => {
  it.each(positives.map((text, i) => [text, i] as const))("flags positive case %i: %s", (text) => {
    expect(check(text).length).toBeGreaterThan(0);
  });
  it.each(negatives.map((text, i) => [text, i] as const))("leaves compliant case %i unflagged: %s", (text) => {
    expect(check(text)).toEqual([]);
  });
  it.each(edges.map((text, i) => [text, i] as const))("handles edge case %i: %s", (text, i) => {
    const findings = check(text);
    expect(Array.isArray(findings)).toBe(true);
    if (i === 0 || (i === 1 && text === "🙂")) expect(findings).toEqual([]);
  });
});

import { runAllRules } from "../src/lib/review/rules";
import { GLOSSARY_TERMS, APPROVED_FACTS, EXPIRED_FACTS, BRAND_VOICE_GUIDE, CLAIMS_REGISTER } from "../src/lib/seed";

const glossaryLines = GLOSSARY_TERMS.split(/\r?\n/).map((l) => l.trim()).filter((l) => l && !l.startsWith("#"));
const currentFacts = APPROVED_FACTS.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((t) => ({ id: "fact-current", text: t, isExpired: false }));
const expiredFacts = EXPIRED_FACTS.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((t) => ({ id: "fact-expired", text: t, isExpired: true }));
const claimsRegisterLines = CLAIMS_REGISTER.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
const brandGuidePassages = BRAND_VOICE_GUIDE.split(/\n\n+/).map((p) => p.trim()).filter(Boolean);

const context = {
  glossaryLines,
  approvedFacts: [...currentFacts, ...expiredFacts],
  claimsRegisterLines,
  brandGuidePassages,
};

const text = "Hey guys, our Smart-Pay app is the #1 fastest and 100% secure! Fees are just 0.5% and we settle in 5 minutes!!!";
const findings = runAllRules(text, context);
console.log(JSON.stringify(findings, null, 2));

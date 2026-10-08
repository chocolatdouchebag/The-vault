"use strict";

const assert=require("node:assert/strict");
const fs=require("node:fs");
const path=require("node:path");

const root=path.join(__dirname,"..");
const script=fs.readFileSync(path.join(root,"public","script.js"),"utf8");

for(const marker of ["  en: {","  nl: {"]){
  const start=script.indexOf(marker);
  assert.notEqual(start,-1,marker+" missing");
}
const enStart=script.indexOf("  en: {");
const nlStart=script.indexOf("  nl: {");
const nlEnd=script.indexOf("\n};",nlStart);
const en=script.slice(enStart,nlStart);
const nl=script.slice(nlStart,nlEnd);

const required=[
  "withdrawal14Text","returnCostsText","defectiveText","beforeLaunchText",
  "withdrawalTermsText","complaintsText","productSafetyText","aiTransparencyText",
  "governingLawText","processorsText","retentionRightsText","dataSharingText",
  "automatedDecisionText","privacyComplaintText","accessibilityCommitmentText",
  "knownLimitationsText","feedbackText","technicalInfoText"
];

for(const key of required){
  assert.match(en,new RegExp(key+":'"));
  assert.match(nl,new RegExp(key+":'"));
}

for(const block of [en,nl]){
  assert.doesNotMatch(block,/\[PLACEHOLDER[^\]]*\]/);
  assert.match(block,/withdrawalForm|withdrawal-form\.html/);
}

assert.match(script, /'\/privacy':\{[^\n]*dataSharingTitle/);
assert.match(script, /'\/terms':\{[^\n]*withdrawalTermsTitle/);
assert.match(script, /'\/merchant':\{[^\n]*aiTransparencyTitle/);

console.log("Bilingual legal-content regression tests passed.");

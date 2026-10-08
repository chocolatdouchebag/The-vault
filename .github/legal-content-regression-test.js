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


function valueFor(block,key){
  const match=block.match(new RegExp(key+":'((?:\\\\'|[^'])*)'"));
  assert.ok(match,key+" missing");
  return match[1];
}
for(const block of [en,nl]){
  for(const key of required) assert.doesNotMatch(valueFor(block,key),/PLACEHOLDER/i);
  assert.match(valueFor(block,"modelFormText"),/withdrawal-form\.html/);
}

assert.match(script, /'\/privacy':\{[^\n]*dataSharingTitle/);
assert.match(script, /'\/terms':\{[^\n]*withdrawalTermsTitle/);
assert.match(script, /'\/merchant':\{[^\n]*aiTransparencyTitle/);

console.log("Bilingual legal-content regression tests passed.");

import type { StudentSurveyForm } from "@/lib/studentSurvey";
import { filterSurveyFormsForView } from "@/modules/surveys/surveyFormFilters";

const forms = [
  { id: "plx", settings: { surveyType: "plx-tna", templateVariant: "plx-tna" } },
  { id: "ws2", settings: { surveyType: "vnpt-heart-ws2", templateVariant: "generic" } },
] as StudentSurveyForm[];

const allForms = filterSurveyFormsForView(forms, {
  includeAllSurveyTypes: true,
  surveyType: "plx-tna",
  templateVariant: "plx-tna",
});

const plxForms = filterSurveyFormsForView(forms, {
  includeAllSurveyTypes: false,
  surveyType: "plx-tna",
  templateVariant: "plx-tna",
});

if (allForms.length !== 2) {
  throw new Error(`Expected aggregate view to show 2 forms, got ${allForms.length}`);
}

if (plxForms.length !== 1) {
  throw new Error(`Expected PLX view to show 1 form, got ${plxForms.length}`);
}

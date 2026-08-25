import type { StudentSurveyForm } from "@/lib/studentSurvey";
import type { SurveyTypeId } from "@/modules/surveys/surveyTypes";

type SurveyTemplateVariant = "default" | "v2" | "plx-tna" | "generic" | "prompt-practice" | "ai-power-practice";

type SurveyFormViewOptions = {
  includeAllSurveyTypes?: boolean;
  surveyType: SurveyTypeId;
  templateVariant: SurveyTemplateVariant;
};

function getNormalizedFormVariant(form: StudentSurveyForm): SurveyTemplateVariant {
  if (form.settings?.templateVariant === "v2") return "v2";
  if (form.settings?.templateVariant === "generic") return "generic";
  if (form.settings?.templateVariant === "plx-tna") return "plx-tna";
  if (form.settings?.templateVariant === "prompt-practice") return "prompt-practice";
  if (form.settings?.templateVariant === "ai-power-practice") return "ai-power-practice";
  return "default";
}

export function isSurveyFormInView(form: StudentSurveyForm, options: SurveyFormViewOptions) {
  if (options.includeAllSurveyTypes) return true;

  const formSurveyType = form.settings?.surveyType || "evnspc-tnkh";
  if (formSurveyType !== options.surveyType) return false;

  if (options.templateVariant === "plx-tna") {
    return form.settings?.templateVariant === "plx-tna" || formSurveyType === "plx-tna";
  }

  if (options.templateVariant === "generic") {
    return form.settings?.templateVariant === "generic";
  }

  if (options.templateVariant === "prompt-practice") {
    return form.settings?.templateVariant === "prompt-practice";
  }

  if (options.templateVariant === "ai-power-practice") {
    return form.settings?.templateVariant === "ai-power-practice";
  }

  return getNormalizedFormVariant(form) === options.templateVariant;
}

export function filterSurveyFormsForView(forms: StudentSurveyForm[], options: SurveyFormViewOptions) {
  return forms.filter((form) => isSurveyFormInView(form, options));
}

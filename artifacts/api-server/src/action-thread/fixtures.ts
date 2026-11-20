export const calcSource =
  "I have a Calc 2 midterm covering Maclaurin series, Taylor series, absolute convergence, and ratio/root tests. I don't understand Maclaurin series.";

export const action = (
  id: string,
  title: string,
  description: string,
  completion_criterion: string,
) => ({ id, kind: "action", title, description, completion_criterion });

export const next = (from: string, to: string) => ({
  from, to, kind: "next", outcome: null, max_traversals: null,
});

export function plan(goal: string | null, entry_node_id: string | null, source_facts: string[]) {
  return {
    schema_version: 3,
    status: "planned",
    goal,
    entry_node_id,
    source_facts,
    success_criteria: [] as string[],
    nodes: [] as ReturnType<typeof action>[],
    edges: [] as (Omit<ReturnType<typeof next>, "outcome" | "max_traversals"> & {
      outcome: string | null;
      max_traversals: number | null;
    })[],
    deadline: null as { phrase: string; quote: string } | null,
    assumptions: [] as string[],
    missing_information: [] as string[],
  };
}

export function calcPlan() {
  const thread = plan("Prepare for the Calc 2 series midterm", "derive-basics", [
    "I have a Calc 2 midterm covering Maclaurin series, Taylor series, absolute convergence, and ratio/root tests.",
    "I don't understand Maclaurin series.",
  ]);
  thread.success_criteria = [
    "Solve and explain at least four of five independent Maclaurin problems.",
    "In a mixed set, justify the center or convergence test used for each topic.",
  ];
  thread.nodes = [
    action("derive-basics", "Derive Maclaurin coefficients",
      "Compute successive derivatives of e^x and sin(x) at zero and divide by n! to get the coefficients.",
      "Write the first three nonzero terms for each function and explain the coefficient rule."),
    action("manipulate-series", "Transform a known expansion",
      "Substitute -x² into the expansion for e^x, then integrate one polynomial truncation term by term.",
      "Check the first three transformed terms against the original coefficient rule."),
    action("independent-set", "Solve five representative problems",
      "Work without notes or hints. Include direct expansion, substitution, multiplication, differentiation, and integration.",
      "Finish five attempts and compare each solution and explanation with a worked solution."),
    { ...action("check-mastery", "Can you explain four correct solutions?",
      "Count only problems with correct coefficients and a defensible derivation.",
      "Record the number of correct, explainable solutions out of five."), kind: "decision" },
    action("diagnose-errors", "Correct the recurring mistake",
      "Group misses by derivative evaluation, factorial, or series manipulation. Rework one example from the largest group.",
      "Explain the error and produce one correct worked correction before retrying a fresh set."),
    action("request-feedback", "Prepare a question about the unresolved error",
      "Choose one annotated attempt to discuss with a classmate, tutor, or instructor if available.",
      "Write a question pointing to the first line you cannot justify."),
    action("cover-remaining", "Practice Taylor and convergence topics",
      "Expand one Taylor series about a nonzero center. Contrast absolute convergence with conditional convergence and use the ratio and root tests on separate examples.",
      "Complete one example per technique and record why each test applies or is inconclusive."),
    action("mixed-practice", "Complete a mixed series set",
      "Mix the exam topics and choose the expansion or test before calculating.",
      "For every completed problem, explain why the chosen center or test fits."),
  ];
  thread.edges = [
    next("derive-basics", "manipulate-series"),
    next("manipulate-series", "independent-set"),
    next("independent-set", "check-mastery"),
    { ...next("check-mastery", "diagnose-errors"), kind: "outcome", outcome: "Fewer than four correct and explainable" },
    { ...next("check-mastery", "cover-remaining"), kind: "outcome", outcome: "At least four correct and explainable" },
    { ...next("diagnose-errors", "independent-set"), kind: "retry", max_traversals: 2 },
    next("diagnose-errors", "request-feedback"),
    next("cover-remaining", "mixed-practice"),
  ];
  return thread;
}

export const portfolioSource = "I want to build a portfolio site that includes a case study, but I might not have permission to show screenshots.";
export function portfolioPlan() {
  const thread = plan("Create a portfolio case study with approved material", "inventory", [portfolioSource]);
  thread.success_criteria = ["The case study has problem, contribution and outcome sections with approved visuals or a text-only equivalent."];
  thread.nodes = [
    action("inventory", "Inventory case study material", "Outline the problem, contribution, outcome and usable assets.", "List each potential visual and its permission status."),
    { ...action("check-rights", "May the screenshots be shown?", "Check written permission for each screenshot.", "Record whether all selected screenshots may be shared."), kind: "decision" },
    action("use-images", "Prepare approved visuals", "Resize screenshots and write descriptive captions.", "Every image has permission and a caption."),
    action("use-text", "Write a text-only walkthrough", "Describe the interface problem, design change and result without confidential details.", "The full case study works without screenshots."),
    action("review", "Review navigation and accessibility", "Read the whole case study on mobile and navigate it from home by keyboard.", "Navigation and content work without a mouse."),
  ];
  thread.edges = [
    next("inventory", "check-rights"),
    { ...next("check-rights", "use-images"), kind: "outcome", outcome: "Written permission obtained" },
    { ...next("check-rights", "use-text"), kind: "outcome", outcome: "Permission unavailable" },
    next("use-images", "review"),
    next("use-text", "review"),
  ];
  return thread;
}

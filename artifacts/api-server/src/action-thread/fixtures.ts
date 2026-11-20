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

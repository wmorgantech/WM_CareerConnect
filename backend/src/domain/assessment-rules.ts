

export const TERMS_VERSION = "2026-10-v1";

export type RuleGroup = { title: string; items: string[] };

export function buildRules(input: {
  questionCount: number;
  durationMinutes: number;
}): RuleGroup[] {
  return [
    {
      title: "About this assessment",
      items: [
        `There are ${input.questionCount} multiple-choice questions. Each has four options and exactly one correct answer.`,
        `You have ${input.durationMinutes} minutes. The timer is kept by the server and starts when you press Start.`,
        "The timer keeps running if you refresh the page, lose your connection, switch tabs or sign out and back in. You cannot pause it.",
      ],
    },
    {
      title: "Answering",
      items: [
        "Your answers are saved as you select them. You can move between questions and change an answer until time ends or you submit.",
        "You can mark a question for review. Marking does not change your answer.",
        "You will not see marks, correct answers or rankings during or after the assessment.",
      ],
    },
    {
      title: "Allowed and not allowed",
      items: [
        "Allowed: this browser window, the on-screen navigation, and your own reasoning.",
        "Not allowed: other people's help, phones or other devices, notes, websites, AI tools, copying questions, and sharing questions or answers.",
        "Copy, paste, right-click and similar shortcuts are disabled on the question screen where your browser supports it.",
      ],
    },
    {
      title: "Full screen and focus",
      items: [
        "The assessment asks to open in full screen. Please stay in full screen and in this tab for the whole assessment.",
        "Leaving full screen, switching tabs or windows is recorded with the time and shown to the assessment team. You will see a warning each time.",
        "A recorded event does not by itself disqualify you. The team reviews the record. Browser controls cannot prevent every kind of misconduct, so please follow the rules.",
      ],
    },
    {
      title: "Submitting",
      items: [
        "Press Submit and confirm when you finish. After you submit you cannot reopen the assessment.",
        "When time ends the assessment is submitted automatically with the answers already saved.",
        "If you are disconnected, sign in again and you will return to the same assessment with the same remaining time.",
      ],
    },
  ];
}

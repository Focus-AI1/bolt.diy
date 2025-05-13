import React from 'react';

const EXAMPLE_PROMPTS = [
  { 
    text: "Personal Finance Mobile App",
    description: "Goal: Help users track spending, set budgets, and manage savings goals.\n\nKey Requirements:\n- Expense categorization with AI suggestions.\n- Daily and monthly budget dashboards.\n- Bank account integration via Plaid API.\n- Push notifications for budget limits."
  },
  { 
    text: "AI-Powered Resume Builder",
    description: "Goal: Provide users with a smart tool to generate and customize resumes using AI.\n\nKey Requirements:\n- GPT-based content generation based on job descriptions.\n- Drag-and-drop editor with resume templates.\n- Export options to PDF and DOCX.\n- Tips for ATS (applicant tracking systems) optimization."
  },
  { 
    text: "Internal Analytics Dashboard for Sales Team",
    description: "Goal: Enable sales managers to visualize pipeline, conversion rates, and regional performance.\n\nKey Requirements:\n- Role-based data access and permissions.\n- Filters by region, rep, and product.\n- Real-time data sync from CRM (e.g., Salesforce).\n- Custom report export and scheduling."
  },
  { 
    text: "E-commerce Checkout Flow Redesign",
    description: "Goal: Improve conversion rates by reducing friction in the checkout process.\n\nKey Requirements:\n- One-page checkout with auto-fill support.\n- Guest checkout option.\n- Real-time payment validation (credit card, PayPal, etc.).\n- A/B testing setup to compare old vs. new flow."
  },
  { 
    text: "Social Media Content Calendar",
    description: "Goal: Create a tool for planning, scheduling, and analyzing social media posts across platforms.\n\nKey Requirements:\n- Visual calendar interface with drag-and-drop.\n- AI-assisted content suggestions.\n- Analytics dashboard for post performance.\n- Integration with major platforms (Instagram, Twitter, LinkedIn)."
  },
  { 
    text: "AI-Powered Learning Platform",
    description: "Goal: Build an adaptive learning platform that personalizes educational content based on student progress.\n\nKey Requirements:\n- AI algorithm to analyze learning patterns and adjust difficulty.\n- Interactive exercises and quizzes with immediate feedback.\n- Progress tracking dashboard for students and teachers.\n- Content library with various formats (video, text, interactive)."
  }
];

export function ExamplePrompts(sendMessage?: { (event: React.UIEvent, messageInput?: string): void | undefined }) {
  return (
    <div id="examples" className="relative flex flex-col gap-9 w-full max-w-3xl mx-auto flex justify-center mt-6">
      <div
        className="flex flex-wrap justify-center gap-2"
        style={{
          animation: '.25s ease-out 0s 1 _fade-and-move-in_g2ptj_1 forwards',
        }}
      >
        {EXAMPLE_PROMPTS.map((examplePrompt, index: number) => {
          return (
            <button
              key={index}
              onClick={(event) => {
                sendMessage?.(event, examplePrompt.description);
              }}
              className="border border-bolt-elements-borderColor rounded-full bg-gray-50 hover:bg-gray-100 dark:bg-gray-950 dark:hover:bg-gray-900 text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary px-3 py-1 text-xs transition-theme"
            >
              {examplePrompt.text}
            </button>
          );
        })}
      </div>
    </div>
  );
}

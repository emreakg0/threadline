import { useState } from "react";
import { ExecutionReplay } from "./ExecutionReplay";
import type { Trace } from "./trace";
import traces from "./public-traces.json";
import "./execution.css";

export const publicPages = ["#demo", "#privacy", "#terms"];

export function PublicLinks() {
  return (
    <nav className="tl-public-links" aria-label="Public information">
      <a href="/demo">How It Works demo</a>
      <a href="/privacy">Privacy Policy</a>
      <a href="/terms">Terms</a>
    </nav>
  );
}

export function PublicPage({ route }: { route: string }) {
  const [example, setExample] = useState(0);
  const trace: Trace = traces[example];
  return <div className="threadline tl-sign-in tl-public-page">
    <main className="tl-content">
      <a href="/">← Threadline home</a>
      {route === "#demo" ? <>
        <h1>How It Works</h1>
        <p>Replay two runs captured from Threadline’s offline test system. Both used synthetic input and a mock provider. The steps, timings, and database rollback were recorded as they happened.</p>
        <div className="execution-controls" role="group" aria-label="Choose a recorded demo">
          <button aria-pressed={example === 0} onClick={() => setExample(0)}>Successful run</button>
          <button aria-pressed={example === 1} onClick={() => setExample(1)}>Failure and recovery</button>
        </div>
        <ExecutionReplay key={trace.run.id} trace={trace} demo />
      </> : route === "#privacy" ? <>
        <h1>Privacy Policy</h1>
        <h2>What Threadline stores</h2>
        <p>Google sign-in shares your account identifier, verified email, and profile name with Threadline. Threadline stores a hashed session token, plus the notes, saved revisions, plans, tasks, and processing records you create in your workspace. Sessions expire after seven days. Signing out ends your current session.</p>
        <h2>Optional AI processing</h2>
        <p>When Gemini is available and you consent to a submission, Threadline sends the selected saved revision and planning instructions to Google. Google’s terms govern how it handles that data. Unpaid Gemini services may use inputs and outputs to improve Google products and may involve human review. Keep sensitive, confidential, and personal information out of AI submissions. You can plan manually without submitting a revision to Gemini.</p>
        <p><a href="https://ai.google.dev/gemini-api/terms">Google’s Gemini API terms</a></p>
        <h2>Saved revisions and the public demo</h2>
        <p>Editing creates a new revision. Archiving hides the brain dump from your active workspace and retains its history. The public demo uses synthetic test runs. Account export and deletion controls are currently unavailable.</p>
      </> : <>
        <h1>Terms of Use</h1>
        <p>Use Threadline to organize material you have permission to store and, where applicable, share with Google. Respect other users’ access and the service’s limits.</p>
        <p>AI availability depends on eligibility, quotas, and the provider. Review suggested plans and evidence before approval. You decide which actions to take and which tasks to create.</p>
        <p>The AI pilot is intended for eligible adults using it for professional purposes. Use the workspace’s manual planning tools when AI processing is unavailable or unsuitable for your material.</p>
      </>}
      <PublicLinks />
    </main>
  </div>;
}

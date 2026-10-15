// Structured narration of what the agent is doing, for anything that is not a terminal.
//
// The console banners are written for a person reading a scrollback. A UI needs the same story as
// data: which stage, who is acting, what it found, and whether it went well. Both are emitted from
// the same call sites so they can never drift apart.

export interface StepCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface AgentStep {
  /** Position in the run, 1-based. Not the same as the terminal's step numbers. */
  n: number;
  actor: "buyer" | "seller" | "chain";
  title: string;
  /** First-person reasoning — "I don't know this, let me look for someone who does". */
  thought?: string;
  /** Ordered key/value facts to render under the title. */
  detail?: [string, string][];
  /** The seller's verification checks, when this step is the verify stage. */
  checks?: StepCheck[];
  /** The thing that was bought. Present only on the final reveal. */
  data?: unknown;
  status?: "ok" | "fail" | "working";
}

export type StepSink = (step: AgentStep) => void;

/** Counts steps so call sites do not have to track their own numbering. */
export class StepEmitter {
  private n = 0;
  constructor(private readonly sink?: StepSink) {}

  emit(step: Omit<AgentStep, "n">): void {
    if (!this.sink) return;
    this.n += 1;
    this.sink({ n: this.n, ...step });
  }
}

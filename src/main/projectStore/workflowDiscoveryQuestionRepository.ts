import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import type {
  AnswerWorkflowDiscoveryQuestionInput,
  WorkflowDiscoveryQuestion,
  WorkflowDiscoveryQuestionCategory,
  WorkflowRevisionSummary,
} from "../../shared/workflowTypes";
import {
  mapWorkflowDiscoveryQuestionRow,
  type WorkflowAgentThreadRow,
  type WorkflowDiscoveryQuestionRow,
} from "../projectStoreWorkflowMappers";

export interface CreateWorkflowDiscoveryQuestionInput {
  workflowThreadId: string;
  revisionId?: string;
  category: WorkflowDiscoveryQuestionCategory;
  context: string;
  question: string;
  choices: WorkflowDiscoveryQuestion["choices"];
  allowFreeform: boolean;
  graphImpact?: string;
  provider?: WorkflowDiscoveryQuestion["provider"];
  providerModel?: string;
  policyContextSummary?: string;
  capabilitySearch?: WorkflowDiscoveryQuestion["capabilitySearch"];
  capabilityDescriptions?: WorkflowDiscoveryQuestion["capabilityDescriptions"];
  blockedReasons?: string[];
  accessRequests?: WorkflowDiscoveryQuestion["accessRequests"];
  activityEvents?: WorkflowDiscoveryQuestion["activityEvents"];
  cacheCheckpoint?: WorkflowDiscoveryQuestion["cacheCheckpoint"];
  graphPatch?: WorkflowDiscoveryQuestion["graphPatch"];
}

export interface ProjectStoreWorkflowDiscoveryQuestionRepositoryDeps {
  getWorkflowRevision(revisionId: string): WorkflowRevisionSummary;
}

export class ProjectStoreWorkflowDiscoveryQuestionRepository {
  constructor(
    private readonly db: Database.Database,
    private readonly deps: ProjectStoreWorkflowDiscoveryQuestionRepositoryDeps,
  ) {}

  listWorkflowDiscoveryQuestions(workflowThreadId: string, options: { revisionId?: string } = {}): WorkflowDiscoveryQuestion[] {
    this.requireWorkflowAgentThread(workflowThreadId);
    const where = options.revisionId ? "workflow_thread_id = ? AND revision_id = ?" : "workflow_thread_id = ?";
    const params = options.revisionId ? [workflowThreadId, options.revisionId] : [workflowThreadId];
    const rows = this.db
      .prepare(`SELECT * FROM workflow_discovery_questions WHERE ${where} ORDER BY question_order ASC, created_at ASC`)
      .all(...params) as WorkflowDiscoveryQuestionRow[];
    return rows.map(mapWorkflowDiscoveryQuestionRow);
  }

  createWorkflowDiscoveryQuestion(input: CreateWorkflowDiscoveryQuestionInput): WorkflowDiscoveryQuestion {
    this.requireWorkflowAgentThread(input.workflowThreadId);
    if (input.revisionId) {
      const revision = this.deps.getWorkflowRevision(input.revisionId);
      if (revision.workflowThreadId !== input.workflowThreadId) {
        throw new Error(`Workflow revision ${revision.id} does not belong to workflow thread ${input.workflowThreadId}.`);
      }
    }
    const row = this.db
      .prepare("SELECT COALESCE(MAX(question_order), 0) + 1 AS next_order FROM workflow_discovery_questions WHERE workflow_thread_id = ?")
      .get(input.workflowThreadId) as { next_order: number };
    const id = randomUUID();
    const now = new Date().toISOString();
    this.db
      .prepare(
        `INSERT INTO workflow_discovery_questions
          (id, workflow_thread_id, revision_id, question_order, category, context, question, choices_json, allow_freeform, answer_json, graph_impact, provider, provider_model, policy_context_summary, capability_search_json, capability_descriptions_json, blocked_reasons_json, access_requests_json, activity_events_json, cache_checkpoint_json, graph_patch_json, created_at, answered_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.workflowThreadId,
        input.revisionId ?? null,
        row.next_order,
        input.category,
        input.context,
        input.question,
        JSON.stringify(input.choices),
        input.allowFreeform ? 1 : 0,
        null,
        input.graphImpact ?? null,
        input.provider ?? null,
        input.providerModel ?? null,
        input.policyContextSummary ?? null,
        input.capabilitySearch ? JSON.stringify(input.capabilitySearch) : null,
        input.capabilityDescriptions?.length ? JSON.stringify(input.capabilityDescriptions) : null,
        input.blockedReasons?.length ? JSON.stringify(input.blockedReasons) : null,
        input.accessRequests?.length ? JSON.stringify(input.accessRequests) : null,
        input.activityEvents?.length ? JSON.stringify(input.activityEvents) : null,
        input.cacheCheckpoint ? JSON.stringify(input.cacheCheckpoint) : null,
        input.graphPatch ? JSON.stringify(input.graphPatch) : null,
        now,
        null,
      );
    this.db
      .prepare("UPDATE workflow_agent_threads SET phase = ?, updated_at = ? WHERE id = ?")
      .run(input.revisionId ? "revision" : "discovery", now, input.workflowThreadId);
    return this.getWorkflowDiscoveryQuestion(id);
  }

  answerWorkflowDiscoveryQuestion(input: AnswerWorkflowDiscoveryQuestionInput): WorkflowDiscoveryQuestion {
    const question = this.getWorkflowDiscoveryQuestion(input.questionId);
    const choiceId = input.choiceId?.trim();
    const freeform = input.freeform?.trim();
    if (choiceId && !question.choices.some((choice) => choice.id === choiceId)) throw new Error(`Workflow discovery choice not found: ${choiceId}`);
    if (!choiceId && !freeform) throw new Error("Workflow discovery answer requires a choice or freeform text.");
    if (freeform && !question.allowFreeform) throw new Error("This workflow discovery question does not allow freeform answers.");
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE workflow_discovery_questions SET answer_json = ?, answered_at = ? WHERE id = ?")
      .run(JSON.stringify({ choiceId: choiceId || undefined, freeform: freeform || undefined, answeredAt: now }), now, question.id);
    this.db.prepare("UPDATE workflow_agent_threads SET updated_at = ? WHERE id = ?").run(now, question.workflowThreadId);
    return this.getWorkflowDiscoveryQuestion(question.id);
  }

  clearWorkflowDiscoveryQuestionAnswer(questionId: string): WorkflowDiscoveryQuestion {
    const question = this.getWorkflowDiscoveryQuestion(questionId);
    const now = new Date().toISOString();
    this.db.prepare("UPDATE workflow_discovery_questions SET answer_json = NULL, answered_at = NULL WHERE id = ?").run(questionId);
    this.db.prepare("UPDATE workflow_agent_threads SET updated_at = ? WHERE id = ?").run(now, question.workflowThreadId);
    return this.getWorkflowDiscoveryQuestion(questionId);
  }

  getWorkflowDiscoveryQuestion(questionId: string): WorkflowDiscoveryQuestion {
    const row = this.db.prepare("SELECT * FROM workflow_discovery_questions WHERE id = ?").get(questionId) as
      | WorkflowDiscoveryQuestionRow
      | undefined;
    if (!row) throw new Error(`Workflow discovery question not found: ${questionId}`);
    return mapWorkflowDiscoveryQuestionRow(row);
  }

  updateWorkflowDiscoveryAccessRequests(input: {
    questionId: string;
    accessRequests?: WorkflowDiscoveryQuestion["accessRequests"];
  }): WorkflowDiscoveryQuestion {
    const question = this.getWorkflowDiscoveryQuestion(input.questionId);
    const now = new Date().toISOString();
    this.db
      .prepare("UPDATE workflow_discovery_questions SET access_requests_json = ? WHERE id = ?")
      .run(input.accessRequests?.length ? JSON.stringify(input.accessRequests) : null, input.questionId);
    this.db.prepare("UPDATE workflow_agent_threads SET updated_at = ? WHERE id = ?").run(now, question.workflowThreadId);
    return this.getWorkflowDiscoveryQuestion(input.questionId);
  }

  updateWorkflowDiscoveryActivityEvents(input: {
    questionId: string;
    activityEvents?: WorkflowDiscoveryQuestion["activityEvents"];
  }): WorkflowDiscoveryQuestion {
    this.getWorkflowDiscoveryQuestion(input.questionId);
    this.db
      .prepare("UPDATE workflow_discovery_questions SET activity_events_json = ? WHERE id = ?")
      .run(input.activityEvents?.length ? JSON.stringify(input.activityEvents) : null, input.questionId);
    return this.getWorkflowDiscoveryQuestion(input.questionId);
  }

  private requireWorkflowAgentThread(threadId: string): WorkflowAgentThreadRow {
    const row = this.db.prepare("SELECT * FROM workflow_agent_threads WHERE id = ?").get(threadId) as WorkflowAgentThreadRow | undefined;
    if (!row) throw new Error(`Workflow Agent thread not found: ${threadId}`);
    return row;
  }
}

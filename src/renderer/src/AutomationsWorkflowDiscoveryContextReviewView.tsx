import { AutomationHeadingLabel } from "./AutomationsHeading";
import type { WorkflowDiscoveryContextReviewModel } from "./workflowReviewUiModel";

export function WorkflowDiscoveryContextReview({ model }: { model: WorkflowDiscoveryContextReviewModel }) {
  return (
    <section className="workflow-review-section workflow-discovery-context-review">
      <div className="panel-section-heading">
        <AutomationHeadingLabel tooltip="Discovery context access records show what extra information Ambient/Pi was allowed to inspect while designing this workflow.">
          Discovery context inspected
        </AutomationHeadingLabel>
        <span className="panel-note inline">{model.tileDetail}</span>
      </div>
      {model.items.length ? (
        <div className="workflow-discovery-context-list">
          {model.items.map((item) => (
            <article className={`workflow-discovery-context-row ${item.status}`} key={`${item.questionId}:${item.id}`}>
              <div>
                <div className="task-row-header">
                  <strong>{item.targetLabel}</strong>
                  <span>{item.statusLabel}</span>
                </div>
                <p>{item.detail}</p>
                <small>
                  {item.questionLabel} - Question {item.questionId}
                  {item.grantId ? ` - Grant ${item.grantId}` : ""}
                </small>
              </div>
              <div className="plugin-badges">
                <span>{item.categoryLabel}</span>
                <span>{item.capabilityLabel}</span>
                <span>{item.scopeLabel}</span>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="panel-note">Discovery used request text, answers, graph context, connector/plugin capability metadata, and safe base-directory metadata only.</p>
      )}
    </section>
  );
}

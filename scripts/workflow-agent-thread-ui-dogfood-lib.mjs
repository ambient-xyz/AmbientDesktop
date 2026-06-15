export function workflowThreadFromFolders(folders, threadId) {
  if (!Array.isArray(folders)) return undefined;
  for (const folder of folders) {
    const threads = Array.isArray(folder?.threads) ? folder.threads : [];
    const found = threads.find((thread) => thread?.id === threadId);
    if (found) return found;
  }
  return undefined;
}

export function workflowDiscoveryProgress(thread) {
  const questions = Array.isArray(thread?.discoveryQuestions) ? thread.discoveryQuestions : [];
  const answered = questions.filter((question) => question?.answer).length;
  const pendingAccessRequests = questions.reduce((count, question) => {
    const requests = Array.isArray(question?.accessRequests) ? question.accessRequests : [];
    return count + requests.filter((request) => request?.status === "pending").length;
  }, 0);
  return {
    questions: questions.length,
    answered,
    unanswered: questions.length - answered,
    pendingAccessRequests,
  };
}

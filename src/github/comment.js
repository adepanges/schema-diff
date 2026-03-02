'use strict';

/**
 * Post or update a schema diff comment on a GitHub PR.
 *
 * @param {object} octokit   Authenticated Octokit instance (@actions/github)
 * @param {object} context   GitHub Actions context
 * @param {string} body      Comment body (markdown)
 */
async function postPrComment(octokit, context, body) {
  const { owner, repo } = context.repo;
  const pullNumber = context.payload.pull_request && context.payload.pull_request.number;

  if (!pullNumber) {
    throw new Error('Cannot post PR comment: not running in a pull_request event context');
  }

  const MARKER = '<!-- schema-diff-report -->';
  const fullBody = `${MARKER}\n${body}`;

  // Check for an existing comment to update
  const { data: comments } = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number: pullNumber,
    per_page: 100,
  });

  const existing = comments.find((c) => c.body && c.body.startsWith(MARKER));

  if (existing) {
    await octokit.rest.issues.updateComment({
      owner,
      repo,
      comment_id: existing.id,
      body: fullBody,
    });
  } else {
    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: pullNumber,
      body: fullBody,
    });
  }
}

module.exports = { postPrComment };

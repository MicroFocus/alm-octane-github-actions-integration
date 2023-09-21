/*
 * Copyright 2016-2023 Open Text.
 *
 * The only warranties for products and services of Open Text and
 * its affiliates and licensors (“Open Text”) are as may be set forth
 * in the express warranty statements accompanying such products and services.
 * Nothing herein should be construed as constituting an additional warranty.
 * Open Text shall not be liable for technical or editorial errors or
 * omissions contained herein. The information contained herein is subject
 * to change without notice.
 *
 * Except as specifically indicated otherwise, this document contains
 * confidential information and a valid license is required for possession,
 * use or copying. If this work is provided to the U.S. Government,
 * consistent with FAR 12.211 and 12.212, Commercial Computer Software,
 * Computer Software Documentation, and Technical Data for Commercial Items are
 * licensed to the U.S. Government under vendor's standard commercial license.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *   http://www.apache.org/licenses/LICENSE-2.0
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
*/

import GitHubClient from '../client/githubClient';
import OctaneClient from '../client/octaneClient';
import ActionsEvent from '../dto/github/ActionsEvent';
import Commit from '../dto/github/Commit';
import GitHubPullRequest from '../dto/github/PullRequest';
import OctanePullRequest from '../dto/octane/scm/PullRequest';
import PullRequestState from '../dto/octane/scm/PullRequestState';
import ScmChangeType from '../dto/octane/scm/ScmChangeType';
import ScmCommit from '../dto/octane/scm/ScmCommit';
import ScmCommitChange from '../dto/octane/scm/ScmCommitChange';
import ScmData from '../dto/octane/scm/ScmData';
import ScmRepository from '../dto/octane/scm/ScmRepository';

const collectSCMData = async (
  event: ActionsEvent,
  owner: string,
  repo: string,
  since: Date
): Promise<ScmData | undefined> => {
  let scmData;
  const branch = event.workflow_run?.head_branch || '';

  const commitShas = await GitHubClient.getCommitIds(
    owner,
    repo,
    branch,
    since
  );

  const gitHubCommits = [];
  for (const commitSha of commitShas) {
    gitHubCommits.push(await GitHubClient.getCommit(owner, repo, commitSha));
  }

  if (gitHubCommits.length > 0) {
    scmData = await getSCMData(event, branch, gitHubCommits);
  }

  return scmData;
};

const sendPullRequestData = async (
  owner: string,
  repoName: string,
  pullRequest: GitHubPullRequest,
  repoUrl: string
): Promise<void> => {
  const octanePr = await mapGitHubPrToOctanePr(
    owner,
    repoName,
    pullRequest,
    repoUrl
  );

  await OctaneClient.sendPullRequestData([octanePr]);
};

const mapGitHubPrToOctanePr = async (
  owner: string,
  repoName: string,
  pullRequest: GitHubPullRequest,
  repoUrl: string
): Promise<OctanePullRequest> => {
  const sourceBranch = pullRequest.head?.ref || '';
  const targetBranch = pullRequest.base?.ref || '';

  const octanePr: OctanePullRequest = {
    id: pullRequest.number.toString(),
    authorName: pullRequest.user?.login || '',
    authorEmail: pullRequest.user?.email || '',
    title: pullRequest.title || '',
    description: pullRequest.body || '',
    createdTime: new Date(pullRequest.created_at || '').getTime(),
    updatedTime: new Date(pullRequest.updated_at || '').getTime(),
    merged: pullRequest.merged || false,
    selfUrl: pullRequest.html_url || '',
    state: convertPrState(pullRequest.state, pullRequest.merged || false),
    sourceRepository: {
      url: `${repoUrl}\\tree\\${sourceBranch}`,
      type: 'git',
      branch: sourceBranch
    },
    targetRepository: {
      url: `${repoUrl}\\tree\\${targetBranch}`,
      type: 'git',
      branch: targetBranch
    },
    commits: []
  };

  if (octanePr.merged && pullRequest.merged_at) {
    octanePr.mergedTime = new Date(pullRequest.merged_at).getTime();
  }

  if (
    [PullRequestState.MERGED, PullRequestState.CLOSED].includes(
      octanePr.state
    ) &&
    pullRequest.closed_at
  ) {
    octanePr.closedTime = new Date(pullRequest.closed_at).getTime();
  }

  const ghCommits = [];
  const ghCommitShas = await GitHubClient.getPullRequestCommitIds(
    owner,
    repoName,
    pullRequest.number
  );

  for (const commitSha of ghCommitShas) {
    ghCommits.push(await GitHubClient.getCommit(owner, repoName, commitSha));
  }

  octanePr.commits = mapGitHubCommitsToOctaneCommits(ghCommits);

  return octanePr;
};

const convertPrState = (
  state: string | undefined,
  isMerged: boolean
): PullRequestState => {
  switch (state) {
    case 'closed':
      return isMerged ? PullRequestState.MERGED : PullRequestState.CLOSED;
    default:
      return PullRequestState.OPEN;
  }
};

const getSCMData = async (
  event: ActionsEvent,
  branch: string,
  gitHubCommits: Commit[]
): Promise<ScmData> => {
  const repoUrl = event.repository?.html_url;

  if (!repoUrl) {
    throw new Error('Repository URL not present in event!');
  }

  const repository: ScmRepository = {
    url: `${repoUrl}\\tree\\${branch}`,
    branch,
    type: 'git'
  };

  const commits = mapGitHubCommitsToOctaneCommits(gitHubCommits);

  return {
    repository,
    commits
  };
};

const mapGitHubCommitsToOctaneCommits = (
  gitHubCommits: Commit[]
): ScmCommit[] => {
  return gitHubCommits.map(commit => {
    if (!commit.commit.author) {
      throw new Error('Commit has no author!');
    }

    const convertedCommit: ScmCommit = {
      revId: commit.sha,
      user: commit.commit.author.name || '',
      userEmail: commit.commit.author.email,
      time: new Date(commit.commit.author.date || '').getTime(),
      comment: commit.commit.message,
      changes: []
    };

    if (commit.files) {
      commit.files.forEach(fileChange => {
        const changeType = mapChangeTypeToOctane(fileChange.status);
        const convertedChange: ScmCommitChange = {
          file: fileChange.filename,
          type: changeType
        };

        if (fileChange.status === 'renamed') {
          convertedChange.renameToFile = fileChange.filename;
          convertedChange.file = fileChange.previous_filename || '';
        }

        convertedCommit.changes.push(convertedChange);
      });
    }

    return convertedCommit;
  });
};

const mapChangeTypeToOctane = (changeType: string): ScmChangeType => {
  switch (changeType) {
    case 'added':
      return ScmChangeType.ADD;
    case 'removed':
      return ScmChangeType.DELETE;
    default:
      return ScmChangeType.EDIT;
  }
};

export { collectSCMData, sendPullRequestData };

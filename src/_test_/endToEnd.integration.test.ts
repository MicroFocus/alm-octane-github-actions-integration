/*
 * Copyright 2022-2025 Open Text.
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

import { getOctokit } from '@actions/github';
import fs from 'fs';
import TestResources from '../test/TestResources';
import { Octane } from '@microfocus/alm-octane-js-rest-sdk';
import { GitHub } from '@actions/github/lib/utils';
import { sleep } from '../utils/utils';
import Query from '@microfocus/alm-octane-js-rest-sdk/dist/lib/query';
import { pipeline } from 'stream';
import CiServerInfo from '../dto/octane/general/CiServerInfo';

let octokit: InstanceType<typeof GitHub>;
let octane: Octane;
let workflowsToRun: any;
let config: any;
let owner: string;
let repo: string;
let sharedSpaceName: string;
let mainBranch: string;
let secondBranch: string;

let isSecondBranchCreated: boolean;

interface Workflow {
  id: number;
  name: string;
}

interface OctaneResult {
  data: any;
  total_count: number;
}

interface PullRequestDetails {
  numberOfPullRequests: number;
  numberOfCommits: number;
}

interface PipelineDetails {
  pipeline: any;
  numberOfPipelines: number;
  numberOfParentPipelines: number;
  numberOfPipelineRuns: number;
  numberOfJobsPerLatestRun: number;
  numberOfCommits: number;
  numberOfTestResults: number;
}

interface RepositoryDetails {
  default_branch: string;
}

let beforePipelinesDetails: PipelineDetails[] = [];
let afterPipelinesDetails: PipelineDetails[] = [];

const getRepository = async (
  owner: string,
  repo: string
): Promise<RepositoryDetails> => {
  return (
    await octokit.rest.repos.get({
      owner: owner,
      repo: repo
    })
  ).data;
};

const triggerWorkflowRun = async (
  owner: string,
  repo: string,
  workflowRunId: number,
  branch: string
): Promise<number> => {
  return (
    await octokit.request(
      'POST /repos/{owner}/{repo}/actions/workflows/{workflow_id}/dispatches',
      {
        owner: owner,
        repo: repo,
        workflow_id: workflowRunId,
        ref: branch
      }
    )
  ).status;
};

const createCommit = async (branch: string) => {
  console.log('Creating a New Commit ....');

  const lastCommit = await octokit.request(
    'GET /repos/{owner}/{repo}/commits/{ref}',
    {
      owner: owner,
      repo: repo,
      ref: branch
    }
  );

  const blobUTF8 = await octokit.request(
    'POST /repos/{owner}/{repo}/git/blobs',
    {
      owner: owner,
      repo: repo,
      content: 'New Blob',
      encoding: 'utf-8'
    }
  );

  const tree = await octokit.request('POST /repos/{owner}/{repo}/git/trees', {
    owner: owner,
    repo: repo,
    base_tree: lastCommit.data.sha,
    tree: [
      {
        path: 'file.rb',
        mode: '100644',
        type: 'blob',
        sha: blobUTF8.data.sha
      }
    ]
  });

  const commit = await octokit.request(
    'POST /repos/{owner}/{repo}/git/commits',
    {
      owner: owner,
      repo: repo,
      message: 'my new test commit',
      author: {
        name: 'Madalin Tiutiu',
        email: 'Madalin.Tiutiu@microfocus.com',
        date: new Date().toISOString()
      },
      parents: [lastCommit.data.sha],
      tree: tree.data.sha
    }
  );

  await octokit.request('PATCH /repos/{owner}/{repo}/git/refs/{ref}', {
    owner: owner,
    repo: repo,
    ref: `heads/${branch}`,
    sha: commit.data.sha
  });
};

const getWorkflowByName = async (
  owner: string,
  repo: string,
  workflowName: string
): Promise<Workflow[]> => {
  return (
    await octokit.paginate(
      octokit.rest.actions.listRepoWorkflows,
      {
        owner,
        repo,
        event: 'workflow',
        per_page: 100
      },
      response => response.data
    )
  ).filter(workflow => workflow.name === workflowName);
};

const runsToWait = async (
  owner: string,
  repo: string,
  status: 'queued' | 'in_progress' | 'requested'
): Promise<number> => {
  return (
    await octokit.paginate(
      octokit.rest.actions.listWorkflowRunsForRepo,
      {
        owner,
        repo,
        status: status,
        per_page: 100
      },
      response => response.data
    )
  ).length;
};

const pollForRunsToFinish = async (
  owner: string,
  repo: string
): Promise<void> => {
  let done = false;
  let retryCount = 2;
  while (!done) {
    const runsToWaitFor =
      (await runsToWait(owner, repo, 'in_progress')) +
      (await runsToWait(owner, repo, 'queued')) +
      (await runsToWait(owner, repo, 'requested'));
    if (runsToWaitFor === 0 && retryCount >= 0) {
      retryCount--;
    } else if (runsToWaitFor > 0) {
      retryCount = 2;
    }
    if (retryCount === -1) {
      done = true;
    }
    console.log(`${runsToWaitFor} runs still not completed!`);
    await sleep(3000);
  }
};

const queryOctane = async (
  workflowName: string,
  branch: string
): Promise<PipelineDetails> => {
  console.log('Querying Octane ....');

  const parentPipeline = await octane
    .get('pipelines')
    .query(
      Query.field('name')
        .equal(
          `alm-octane-github-actions-tests
`
        )
        .build()
    )
    .execute();

  const pipeline = await octane
    .get('pipelines')
    .query(
      Query.field('name').equal(`${repo} ${workflowName}/${branch}`).build()
    )
    .execute();

  console.log(`Query Found Pipeline: ${JSON.stringify(pipeline.data[0])}`);
  let pipeline_runs: OctaneResult = {
    data: [],
    total_count: 0
  };

  let latestJobs: OctaneResult = {
    data: [],
    total_count: 0
  };

  let commits: OctaneResult = {
    data: [],
    total_count: 0
  };

  let testResults: OctaneResult = {
    data: [],
    total_count: 0
  };

  if (pipeline.total_count > 0) {
    pipeline_runs = await octane
      .get('pipeline_runs')
      .query(
        Query.field('pipeline')
          .equal(Query.field('id').equal(pipeline.data[0].id))
          .build()
      )
      .orderBy('-creation_time')
      .execute();

    console.log(
      `Query Found PipelineRuns: ${JSON.stringify(pipeline_runs.data)}`
    );

    if (pipeline_runs.total_count > 0) {
      latestJobs = await octane
        .get('pipeline_node_runs')
        .query(
          Query.field('pipeline_run')
            .equal(Query.field('id').equal(pipeline_runs.data[0].id))
            .build()
        )
        .fields('ci_build')
        .orderBy('id')
        .execute();

      console.log(
        `Query Found PipelineRunNodes: ${JSON.stringify(latestJobs.data)}`
      );

      testResults = await octane
        .get('previous_runs')
        .query(
          Query.field('pipeline_run_id')
            .equal(pipeline_runs.data[0].id)
            .and()
            .field('pipeline_id')
            .equal(pipeline.data[0].id)
            .build()
        )
        .execute();

      console.log(
        `Query Found Test Results: ${JSON.stringify(testResults.data)}`
      );
      if (latestJobs.total_count > 0) {
        const ci_builds_id = latestJobs.data.map((job: any) => {
          return job.ci_build.id;
        });

        commits = await octane
          .get('scm_commits')
          .query(
            Query.field('ci_build')
              .equal(Query.field('id').inComparison(ci_builds_id))
              .build()
          )
          .execute();

        console.log(`Query Found Commits: ${JSON.stringify(commits.data)}`);
      }
    }
  }

  return {
    pipeline: pipeline.data[0],
    numberOfPipelines: pipeline.total_count,
    numberOfParentPipelines: parentPipeline.total_count,
    numberOfPipelineRuns: pipeline_runs.total_count,
    numberOfJobsPerLatestRun: latestJobs.total_count,
    numberOfCommits: commits.total_count,
    numberOfTestResults: testResults.total_count
  };
};

const queryOctaneForPullRequest = async (): Promise<PullRequestDetails> => {
  const pullRequests = await octane.get('pull_requests').execute();
  const commits = await octane.get('scm_commits').execute();

  return {
    numberOfPullRequests: pullRequests.total_count,
    numberOfCommits: commits.total_count
  };
};

const createFirstPipelineRun = async (
  workflowName: string,
  createCiServer: boolean,
  ciServerId: number | undefined,
  branch: string
): Promise<number> => {
  let ciServer;
  if (createCiServer) {
    console.log('Creating the CI Server...');

    ciServer = (
      await octane
        .create('ci_servers', {
          name: `GHA-${owner}`,
          instance_id: `GHA-${owner}`,
          server_type: 'github_actions',
          url: config.serverBaseUrl
        })
        .fields('instance_id')
        .execute()
    ).data[0];
  }

  console.log('Creating the parent pipeline...');

  await octane
    .create('pipelines', {
      name: `${repo} ${workflowName}`,
      ci_server: {
        type: 'ci_server',
        id: createCiServer ? ciServer.id : ciServerId
      },
      root_job_ci_id: `${repo} ${workflowName}`,
      jobs: [
        {
          name: `${repo} ${workflowName}`,
          jobCiId: `${repo} ${workflowName}`
        }
      ]
    })
    .execute();

  const pipelineRunEventStarted = {
    buildCiId: '1',
    eventType: 'started',
    number: '1',
    project: `${repo} ${workflowName}/${branch}`,
    projectDisplayName: `${repo} ${workflowName}/${branch}`,
    startTime: new Date().getTime(),
    multiBranchType: 'CHILD',
    parentCiId: `${repo} ${workflowName}`,
    branch: branch,
    skipValidation: true,
    causes: [
      {
        type: 'User',
        project: `${repo} ${workflowName}/${branch}`,
        buildCiId: '1'
      }
    ]
  };

  // const rootEventStarted = {
  //   buildCiId: '1',
  //   eventType: 'started',
  //   number: '1',
  //   project: `${repo} ${workflowName}/${branch}`,
  //   projectDisplayName: `${repo} ${workflowName}/${branch}`,
  //   startTime: new Date().getTime(),
  //   causes: [
  //     {
  //       type: 'User',
  //       project: `${repo} ${workflowName}/${branch}`,
  //       buildCiId: '1'
  //     }
  //   ]
  // };

  const rootEventFinished = {
    buildCiId: '1',
    eventType: 'finished',
    number: '1',
    project: `${repo} ${workflowName}/${branch}`,
    projectDisplayName: `${repo} ${workflowName}/${branch}`,
    startTime: new Date().getTime(),
    causes: [
      {
        type: 'User',
        project: `${repo} ${workflowName}/${branch}`,
        buildCiId: '1'
      }
    ],
    result: 'success',
    duration: 5
  };

  const ciServerInfo: CiServerInfo = {
    instanceId: `GHA-${owner}`,
    type: 'github_actions',
    url: config.serverBaseUrl,
    version: '25.1.0',
    sendingTime: new Date().getTime()
  };

  console.log(`Creating the child pipeline (for '${branch}' branch)...`);
  await octane.executeCustomRequest(
    `/internal-api/shared_spaces/${config.octaneSharedSpace}/analytics/ci/events`,
    Octane.operationTypes.update,
    {
      server: ciServerInfo,
      events: [pipelineRunEventStarted]
    }
  );

  await octane.executeCustomRequest(
    `/internal-api/shared_spaces/${config.octaneSharedSpace}/analytics/ci/events`,
    Octane.operationTypes.update,
    {
      server: ciServerInfo,
      events: [rootEventFinished]
    }
  );

  await sleep(6000);

  return createCiServer ? ciServer.id : ciServerId;
};

const runWorkflows = async (branch: string) => {
  for (const workflow of workflowsToRun) {
    const workflows = await getWorkflowByName(owner, repo, workflow.name);
    for (const workflow of workflows) {
      let status = await triggerWorkflowRun(owner, repo, workflow.id, branch);

      if (status === 204) {
        let waitForRunToQueue = await runsToWait(owner, repo, 'queued');

        while (waitForRunToQueue === 0) {
          await sleep(1000);
          waitForRunToQueue = await runsToWait(owner, repo, 'queued');
        }

        await pollForRunsToFinish(owner, repo);
      }
    }
  }
};

const createBranch = async (rootBranch: string, newBranch: string) => {
  const lastCommit = await octokit.request(
    'GET /repos/{owner}/{repo}/commits/{ref}',
    {
      owner: owner,
      repo: repo,
      ref: rootBranch
    }
  );

  await octokit.request('POST /repos/{owner}/{repo}/git/refs', {
    owner: owner,
    repo: repo,
    ref: `refs/heads/${newBranch}`,
    sha: lastCommit.data.sha
  });
};

const createBranchAndPullRequest = async (branch: string) => {
  await createBranch(mainBranch, branch);

  await createCommit(branch);

  await octokit.request('POST /repos/{owner}/{repo}/pulls', {
    owner: owner,
    repo: repo,
    title: 'Test Pull Request',
    head: branch,
    base: mainBranch
  });
};

beforeAll(async () => {
  config = JSON.parse(
    fs.readFileSync(TestResources.OCTANE_CONFIG_PATH).toString()
  );
  workflowsToRun = JSON.parse(
    fs.readFileSync(TestResources.WORKFLOW_TO_RUN_PATH).toString()
  );

  octane = new Octane({
    server: config.octaneUrl,
    sharedSpace: config.octaneSharedSpace,
    workspace: config.octaneWorkspace,
    user: config.octaneClientId,
    password: config.octaneClientSecret,
    headers: {
      'ALM-OCTANE-TECH-PREVIEW': true,
      'ALM-OCTANE-PRIVATE': true
    }
  });

  owner = config.serverBaseUrl.split('/').at(-2);
  repo = config.serverBaseUrl.split('/').at(-1);

  console.log(`Getting the Octokit instance...`);
  octokit = getOctokit(config.githubToken);

  console.log(`Getting the Octane workspace name...`);
  sharedSpaceName = (
    await octane.executeCustomRequest(
      `/api/shared_spaces?fields=name&query="id EQ ${config.octaneSharedSpace}"`,
      Octane.operationTypes.get
    )
  ).data[0].name;

  console.log(`Getting the default branch of the repository...`);
  mainBranch = (await getRepository(owner, repo)).default_branch;
  secondBranch = 'second-branch';
  isSecondBranchCreated = false;
});

afterEach(async () => {
  await octane
    .delete('ci_servers')
    .query(Query.field('name').equal(`GHA-${owner}`).build())
    .execute();

  if (isSecondBranchCreated) {
    await octokit.request('DELETE /repos/{owner}/{repo}/git/refs/{ref}', {
      owner: owner,
      repo: repo,
      ref: `heads/${secondBranch}`
    });
  }
});

describe('End to end integration tests', () => {
  jest.setTimeout(10 * 60 * 1000);
  test('Workflow Run With Pipeline Pre-create Test', async () => {
    let createCIServer = true;
    let ciServerId;

    console.log(`Creating needed pipelines for given workflows...`);
    for (const workflow of workflowsToRun) {
      ciServerId = await createFirstPipelineRun(
        workflow.name,
        createCIServer,
        ciServerId,
        mainBranch
      );
      beforePipelinesDetails.push(await queryOctane(workflow.name, mainBranch));
      createCIServer = false;
    }

    console.log(`Creating the commit on the default branch...`);
    await createCommit(mainBranch);
    console.log(`Running the workflows for the default branch...`);
    await runWorkflows(mainBranch);

    for (const workflow of workflowsToRun) {
      afterPipelinesDetails.push(await queryOctane(workflow.name, mainBranch));
    }

    console.log(`Checking the results...`);
    for (const before of beforePipelinesDetails) {
      expect(before.numberOfPipelines).toEqual(1);
      expect(before.numberOfParentPipelines).toEqual(1);
      expect(before.numberOfPipelineRuns).toEqual(1);
      expect(before.numberOfJobsPerLatestRun).toEqual(1);
      expect(before.numberOfTestResults).toEqual(0);
      expect(before.numberOfCommits).toEqual(0);

      console.log('The first pipeline run has been created successfully.');

      for (const after of afterPipelinesDetails) {
        if (before.pipeline.id === after.pipeline.id) {
          expect(before.numberOfPipelines).toEqual(after.numberOfPipelines);
          expect(before.numberOfParentPipelines).toEqual(
            before.numberOfParentPipelines
          );
          expect(after.numberOfPipelineRuns).toBeGreaterThan(
            before.numberOfPipelineRuns
          );
          expect(after.numberOfTestResults).toBeGreaterThan(
            before.numberOfTestResults
          );
          expect(after.numberOfJobsPerLatestRun).toBeGreaterThan(
            before.numberOfJobsPerLatestRun
          );
          expect(after.numberOfCommits).toBeGreaterThan(before.numberOfCommits);
          expect(after.numberOfCommits).toBeGreaterThanOrEqual(1);
        }
      }
    }
    console.log('All expected pipeline runs have been created successfully.');
  });

  test('Workflow Run Without Pipeline Pre-create Test', async () => {
    console.log(`Creating the commit on the default branch...`);
    await createCommit(mainBranch);

    console.log(`Running the workflows for the default branch...`);
    await runWorkflows(mainBranch);

    console.log(`Creating the second branch...`);
    await createBranch(mainBranch, secondBranch);

    console.log(`Creating the commit on the second branch...`);
    await createCommit(secondBranch);
    isSecondBranchCreated = true;

    console.log(`Running the workflows for the second branch...`);
    await runWorkflows(secondBranch);

    for (const workflow of workflowsToRun) {
      afterPipelinesDetails.push(await queryOctane(workflow.name, mainBranch));
      afterPipelinesDetails.push(
        await queryOctane(workflow.name, secondBranch)
      );
    }

    console.log(`Checking the results...`);
    for (const after of afterPipelinesDetails) {
      expect(after.numberOfPipelines).toEqual(1);
      expect(after.numberOfParentPipelines).toEqual(1);
      expect(after.numberOfPipelineRuns).toBeGreaterThan(0);
      expect(after.numberOfTestResults).toBeGreaterThan(0);
      expect(after.numberOfJobsPerLatestRun).toBeGreaterThan(0);
      expect(after.numberOfCommits).toBeGreaterThanOrEqual(0);
      console.log(
        `Pipeline "${after.pipeline.name}" had ${after.numberOfCommits} new commits.`
      );
    }
    console.log(`The pipeline runs have been created successfully...`);
  });

  test('Pull Request Test', async () => {
    const beforePullRequest: PullRequestDetails =
      await queryOctaneForPullRequest();

    console.log(`Creating the second branch and the pull request...`);
    await createBranchAndPullRequest(secondBranch);
    isSecondBranchCreated = true;

    console.log(`Waiting for all the workflows to finish...`);
    let waitForRunToQueue = await runsToWait(owner, repo, 'queued');
    while (waitForRunToQueue === 0) {
      await sleep(1000);
      waitForRunToQueue = await runsToWait(owner, repo, 'queued');
    }
    await pollForRunsToFinish(owner, repo);

    const afterPullRequest: PullRequestDetails =
      await queryOctaneForPullRequest();

    console.log(`Checking the results...`);
    expect(beforePullRequest.numberOfPullRequests).toBeLessThan(
      afterPullRequest.numberOfPullRequests
    );
    expect(beforePullRequest.numberOfCommits).toBeLessThanOrEqual(
      afterPullRequest.numberOfCommits
    );
  });
});

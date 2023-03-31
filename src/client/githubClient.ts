/*
© Copyright 2023 Micro Focus or one of its affiliates.
Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at
  http://www.apache.org/licenses/LICENSE-2.0

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.
*/

import { getOctokit } from '@actions/github';
import { getConfig } from '../config/config';
import { ActionsJob } from '../dto/github/ActionsJob';
import Artifact from '../dto/github/Artifact';
import Commit from '../dto/github/Commit';
import WorkflowRun from '../dto/github/WorkflowRun';
import WorkflowRunStatus from '../dto/github/WorkflowRunStatus';

export default class GitHubClient {
  private static octokit = getOctokit(getConfig().githubToken);

  public static getWorkflowRunJobs = async (
    owner: string,
    repo: string,
    workflowRunId: number
  ): Promise<ActionsJob[]> => {
    return await this.octokit.paginate(
      this.octokit.rest.actions.listJobsForWorkflowRun,
      {
        owner,
        repo,
        run_id: workflowRunId,
        per_page: 100
      },
      response => response.data
    );
  };

  public static getJob = async (
    owner: string,
    repo: string,
    jobId: number
  ): Promise<ActionsJob> => {
    return (
      await this.octokit.rest.actions.getJobForWorkflowRun({
        owner,
        repo,
        job_id: jobId
      })
    ).data;
  };

  public static getWorkflowRunsTriggeredBeforeByStatus = async (
    owner: string,
    repo: string,
    beforeTime: number,
    workflowId: number,
    status: WorkflowRunStatus
  ): Promise<WorkflowRun[]> => {
    return (
      await this.octokit.paginate(
        this.octokit.rest.actions.listWorkflowRuns,
        {
          owner,
          repo,
          workflow_id: workflowId,
          event: 'workflow_run',
          status,
          per_page: 100
        },
        response => response.data
      )
    ).filter(run => new Date(run.run_started_at!).getTime() < beforeTime);
  };

  public static getWorkflowRun = async (
    owner: string,
    repo: string,
    workflowRunId: number
  ): Promise<WorkflowRun> => {
    return (
      await this.octokit.rest.actions.getWorkflowRun({
        owner,
        repo,
        run_id: workflowRunId
      })
    ).data;
  };

  public static getWorkflowRunArtifacts = async (
    owner: string,
    repo: string,
    workflowRunId: number
  ): Promise<Artifact[]> => {
    return await this.octokit.paginate(
      this.octokit.rest.actions.listWorkflowRunArtifacts,
      { owner, repo, run_id: workflowRunId, per_page: 100 },
      response => response.data
    );
  };

  public static downloadArtifact = async (
    owner: string,
    repo: string,
    artifactId: number
  ): Promise<ArrayBuffer> => {
    return <ArrayBuffer>(
      await this.octokit.rest.actions.downloadArtifact({
        owner,
        repo,
        artifact_id: artifactId,
        archive_format: 'zip'
      })
    ).data;
  };

  public static getCommitIds = async (
    owner: string,
    repo: string,
    branch: string,
    since: Date
  ): Promise<string[]> => {
    return <string[]>(
      await this.octokit.paginate(
        this.octokit.rest.repos.listCommits,
        {
          owner,
          repo,
          sha: branch,
          since: since.toISOString(),
          per_page: 100
        },
        response => response.data
      )
    ).map(commit => commit.sha);
  };

  public static getCommit = async (
    owner: string,
    repo: string,
    commitSha: string
  ): Promise<Commit> => {
    return (
      await this.octokit.rest.repos.getCommit({
        owner,
        repo,
        ref: commitSha
      })
    ).data;
  };

  public static getPullRequestCommitIds = async (
    owner: string,
    repo: string,
    pullRequestNumber: number
  ): Promise<string[]> => {
    return <string[]>(
      await this.octokit.paginate(
        this.octokit.rest.pulls.listCommits,
        {
          owner,
          repo,
          pull_number: pullRequestNumber
        },
        response => response.data
      )
    ).map(commit => commit.sha);
  };
}

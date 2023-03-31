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

import GitHubClient from '../client/githubClient';
import ActionsEvent from '../dto/github/ActionsEvent';
import ActionsEventType from '../dto/github/ActionsEventType';
import WorkflowRun from '../dto/github/WorkflowRun';
import WorkflowRunStatus from '../dto/github/WorkflowRunStatus';
import CiEvent from '../dto/octane/events/CiEvent';
import { CiEventType, Result } from '../dto/octane/events/CiTypes';
import ScmData from '../dto/octane/scm/ScmData';
import { sleep } from '../utils/utils';
import { CauseJobData, getCiEventCauses } from './eventCauseBuilder';
import { PipelineEventData } from './pipelineDataService';

interface PipelineComponent {
  name: string;
  conclusion?: string | null | undefined;
  started_at?: string | null | undefined;
  completed_at?: string | null | undefined;
}

const pollForJobsOfTypeToFinish = async (
  owner: string,
  repoName: string,
  currentRun: WorkflowRun,
  workflowRunId: number,
  startTime: number,
  eventType: ActionsEventType
): Promise<void> => {
  let done = false;

  while (!done) {
    const notFinishedRuns = await getNotFinishedRuns(
      owner,
      repoName,
      startTime,
      currentRun
    );

    // Integration job name structure is: OctaneIntegration#${{github.event.action}}#${{github.event.workflow_run.id}}
    const runsToWaitFor = notFinishedRuns.filter(async run => {
      const jobs = (
        await GitHubClient.getWorkflowRunJobs(owner, repoName, run.id)
      ).filter(job => {
        const nameComponents = job.name.split('#');
        const runEventType = nameComponents[1];
        const triggeredByRunId = nameComponents[2];
        return (
          runEventType === eventType &&
          Number.parseInt(triggeredByRunId) === workflowRunId
        );
      });

      return jobs.length > 0;
    });

    done = runsToWaitFor.length === 0;
    sleep(1000);
  }
};

const getNotFinishedRuns = async (
  owner: string,
  repoName: string,
  startTime: number,
  currentRun: WorkflowRun
): Promise<WorkflowRun[]> => {
  const runs: WorkflowRun[] = [];
  const params: [string, string, number, number] = [
    owner,
    repoName,
    startTime,
    currentRun.workflow_id
  ];
  runs.push(
    ...(await GitHubClient.getWorkflowRunsTriggeredBeforeByStatus(
      ...params,
      WorkflowRunStatus.IN_PROGRESS
    ))
  );
  runs.push(
    ...(await GitHubClient.getWorkflowRunsTriggeredBeforeByStatus(
      ...params,
      WorkflowRunStatus.QUEUED
    ))
  );
  runs.push(
    ...(await GitHubClient.getWorkflowRunsTriggeredBeforeByStatus(
      ...params,
      WorkflowRunStatus.REQUESTED
    ))
  );
  runs.push(
    ...(await GitHubClient.getWorkflowRunsTriggeredBeforeByStatus(
      ...params,
      WorkflowRunStatus.WAITING
    ))
  );
  return runs.filter(run => run.id !== currentRun.id);
};

const generateRootCiEvent = (
  event: ActionsEvent,
  pipelineData: PipelineEventData,
  eventType: CiEventType,
  scmData?: ScmData
): CiEvent => {
  const rootEvent: CiEvent = {
    buildCiId: pipelineData.buildCiId,
    eventType,
    number:
      event.workflow_run?.run_number?.toString() || pipelineData.buildCiId,
    project: pipelineData.rootJobName,
    projectDisplayName: pipelineData.rootJobName,
    startTime: event.workflow_run?.run_started_at
      ? new Date(event.workflow_run.run_started_at).getTime()
      : new Date().getTime(),
    causes: getCiEventCauses(
      {
        isRoot: true,
        jobName: pipelineData.rootJobName,
        causeType: event.workflow_run?.event,
        userId: event.workflow_run?.triggering_actor.login,
        userName: event.workflow_run?.triggering_actor.login
      },
      pipelineData.buildCiId
    )
  };

  if (CiEventType.FINISHED === eventType) {
    rootEvent.duration = getRunDuration(
      event.workflow_run?.run_started_at,
      event.workflow_run?.updated_at
    );
    rootEvent.result = getRunResult(event.workflow_run?.conclusion);
  }

  if (CiEventType.SCM === eventType) {
    if (!scmData) {
      throw new Error('SCM type event must contain SCM data!');
    }

    rootEvent.scmData = scmData;
  }

  return rootEvent;
};

const mapPipelineComponentToCiEvent = (
  pipelineComponent: PipelineComponent,
  parentComponentData: CauseJobData,
  buildCiId: string,
  allChildrenFinished: boolean,
  runNumber?: number
) => {
  const componentName = pipelineComponent.name;
  const componentFullName = `${parentComponentData.jobName}/${componentName}`;
  const ciEvent: CiEvent = {
    buildCiId,
    eventType:
      allChildrenFinished && pipelineComponent.conclusion
        ? CiEventType.FINISHED
        : CiEventType.STARTED,
    number: runNumber?.toString() || buildCiId,
    project: componentFullName,
    projectDisplayName: componentName,
    startTime: pipelineComponent.started_at
      ? new Date(pipelineComponent.started_at).getTime()
      : new Date().getTime(),
    causes: getCiEventCauses(
      {
        isRoot: false,
        jobName: componentFullName,
        parentJobData: parentComponentData
      },
      buildCiId
    )
  };

  if (ciEvent.eventType == CiEventType.FINISHED) {
    ciEvent.result = getRunResult(pipelineComponent.conclusion);
    ciEvent.duration = getRunDuration(
      pipelineComponent.started_at,
      pipelineComponent.completed_at
    );
  }

  return ciEvent;
};

const getEventType = (event: ActionsEvent): ActionsEventType => {
  switch (event.action) {
    case 'requested':
      return ActionsEventType.WORKFLOW_QUEUED;
    case 'completed':
      return ActionsEventType.WORKFLOW_FINISHED;
    case 'opened':
      return ActionsEventType.PULL_REQUEST_OPENED;
    case 'closed':
      return ActionsEventType.PULL_REQUEST_CLOSED;
    case 'reopened':
      return ActionsEventType.PULL_REQUEST_REOPENED;
    case 'edited':
      return ActionsEventType.PULL_REQUEST_EDITED;
    default:
      return ActionsEventType.UNKNOWN_EVENT;
  }
};

const getRunDuration = (
  startedAt: string | null | undefined,
  completedAt: string | null | undefined
): number => {
  if (!startedAt || !completedAt) {
    throw new Error(
      'Event should contain startedAt and completedAt workflow_run fields!'
    );
  }

  return new Date(completedAt).getTime() - new Date(startedAt).getTime();
};

const getRunResult = (conclusion: string | undefined | null): Result => {
  if (!conclusion) {
    throw new Error(
      'Event must contain a conclusion on Workflow Completed event!'
    );
  }

  switch (conclusion) {
    case WorkflowRunStatus.SUCCESS:
      return Result.SUCCESS;
    case WorkflowRunStatus.FAILURE:
    case WorkflowRunStatus.TIMED_OUT:
      return Result.FAILURE;
    case WorkflowRunStatus.CANCELLED:
      return Result.ABORTED;
    case WorkflowRunStatus.NEUTRAL:
    case WorkflowRunStatus.ACTION_REQUIRED:
    case WorkflowRunStatus.STALE:
      return Result.UNSTABLE;
    case WorkflowRunStatus.SKIPPED:
    default:
      return Result.UNAVAILABLE;
  }
};

export {
  generateRootCiEvent,
  mapPipelineComponentToCiEvent,
  getEventType,
  pollForJobsOfTypeToFinish
};

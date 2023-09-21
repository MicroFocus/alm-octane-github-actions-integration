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

import { context } from '@actions/github';
import GitHubClient from './client/githubClient';
import OctaneClient from './client/octaneClient';
import { getConfig } from './config/config';
import ActionsEvent from './dto/github/ActionsEvent';
import ActionsEventType from './dto/github/ActionsEventType';
import PullRequest from './dto/github/PullRequest';
import { CiEventType } from './dto/octane/events/CiTypes';
import {
  generateRootCiEvent,
  getEventType,
  mapPipelineComponentToCiEvent,
  pollForJobsOfTypeToFinish
} from './service/ciEventsService';
import { getPipelineData } from './service/pipelineDataService';
import { collectSCMData, sendPullRequestData } from './service/scmDataService';
import { sendJUnitTestResults } from './service/testResultsService';
import { sleep } from './utils/utils';

export const handleEvent = async (event: ActionsEvent): Promise<void> => {
  const startTime = new Date().getTime();
  const eventType = getEventType(event);
  const owner = event.repository?.owner.login;
  const repoName = event.repository?.name;
  const workflowRunId = event.workflow_run?.id;
  const runNumber = event.workflow_run?.run_number;

  if (!owner || !repoName) {
    throw new Error('Event should contain repository data!');
  }

  const currentRun = await GitHubClient.getWorkflowRun(
    owner,
    repoName,
    context.runId
  );

  switch (eventType) {
    case ActionsEventType.WORKFLOW_QUEUED:
    case ActionsEventType.WORKFLOW_FINISHED:
      if (!workflowRunId) {
        throw new Error('Event should contain workflow run id!');
      }

      const shouldCreatePipelineAndCiServer =
        eventType == ActionsEventType.WORKFLOW_QUEUED;

      const jobs = await GitHubClient.getWorkflowRunJobs(
        owner,
        repoName,
        workflowRunId
      );

      console.log('Getting pipeline data...');
      const pipelineData = await getPipelineData(
        event,
        shouldCreatePipelineAndCiServer,
        jobs
      );

      const rootParentCauseData = {
        isRoot: true,
        jobName: pipelineData.rootJobName,
        causeType: event.workflow_run?.event,
        userId: event.workflow_run?.triggering_actor.login,
        userName: event.workflow_run?.triggering_actor.login
      };

      if (eventType === ActionsEventType.WORKFLOW_QUEUED) {
        const pollForJobStepUpdates = async (
          jobId: number,
          interval: number
        ): Promise<void> => {
          let done = false;
          let alreadySentStartedEvent = false;
          let allStepsFinished = false;
          const stepsStarted = new Set();

          while (!done) {
            done = allStepsFinished;

            const job = await GitHubClient.getJob(owner, repoName, jobId);

            let ciJobEvent = mapPipelineComponentToCiEvent(
              job,
              rootParentCauseData,
              pipelineData.buildCiId,
              allStepsFinished,
              runNumber
            );

            if (
              !alreadySentStartedEvent ||
              ciJobEvent.eventType == CiEventType.FINISHED
            ) {
              await OctaneClient.sendEvents(
                [ciJobEvent],
                pipelineData.instanceId,
                pipelineData.baseUrl
              );
              alreadySentStartedEvent = true;
            }

            const steps =
              job.steps?.sort((step1, step2) => step1.number - step2.number) ||
              [];

            allStepsFinished =
              steps &&
              steps.filter(
                step => step.conclusion == null || step.conclusion == undefined
              ).length === 0;

            for (const step of steps) {
              const stepCiEvent = mapPipelineComponentToCiEvent(
                step,
                {
                  isRoot: false,
                  jobName: `${rootParentCauseData.jobName}/${job.name}`,
                  parentJobData: rootParentCauseData
                },
                pipelineData.buildCiId,
                true,
                runNumber
              );

              if (
                !stepsStarted.has(step.number) &&
                stepCiEvent.eventType == CiEventType.FINISHED
              ) {
                await OctaneClient.sendEvents(
                  [{ ...stepCiEvent, eventType: CiEventType.STARTED }],
                  pipelineData.instanceId,
                  pipelineData.baseUrl
                );
                stepsStarted.add(step.number);
              } else if (
                !stepsStarted.has(step.number) ||
                stepCiEvent.eventType == CiEventType.FINISHED
              ) {
                await OctaneClient.sendEvents(
                  [stepCiEvent],
                  pipelineData.instanceId,
                  pipelineData.baseUrl
                );
                if (stepCiEvent.eventType == CiEventType.STARTED) {
                  stepsStarted.add(step.number);
                }
              }
            }

            await sleep(interval);
          }
        };

        const pollForJobUpdates = async (
          interval: number,
          numberOfTries: number
        ): Promise<void> => {
          if (!workflowRunId) {
            throw new Error('Event should contain workflow run id!');
          }

          let done = false;
          let tryCount = 1;
          const jobsFinished = new Set<number>();
          const jobQueue: number[] = [];

          while (!done) {
            let jobs = (
              await GitHubClient.getWorkflowRunJobs(
                owner,
                repoName,
                workflowRunId
              )
            ).sort(
              (job1, job2) =>
                new Date(job1.started_at!).getTime() -
                new Date(job2.started_at!).getTime()
            );

            jobs.forEach(job => {
              if (!jobsFinished.has(job.id) && !jobQueue.includes(job.id)) {
                jobQueue.push(job.id);
              }
            });

            if (jobQueue.length === 0) {
              if (tryCount === numberOfTries) {
                done = true;
              } else {
                tryCount++;
                await sleep(2000);
              }
            } else {
              tryCount = 1;
              const jobToPollFor = jobQueue.shift()!;
              console.log(`Polling step updates for job ${jobToPollFor}...`);
              await pollForJobStepUpdates(jobToPollFor, interval);
              jobsFinished.add(jobToPollFor);
            }
          }
        };

        const rootQueuedEvent = generateRootCiEvent(
          event,
          pipelineData,
          CiEventType.STARTED
        );

        const rootEventsToSend = [rootQueuedEvent];

        const octaneBuilds = (
          await OctaneClient.getJobBuilds(pipelineData.rootJobName)
        ).sort((build1, build2) => build2.start_time - build1.start_time);

        if (octaneBuilds.length > 0) {
          const since = new Date(octaneBuilds[0].start_time);

          const scmData = await collectSCMData(event, owner, repoName, since);

          if (scmData) {
            const rootSCMEvent = generateRootCiEvent(
              event,
              pipelineData,
              CiEventType.SCM,
              scmData
            );

            rootEventsToSend.push(rootSCMEvent);
            console.log(`Injecting commits since ${since}...`);
          }
        }

        await OctaneClient.sendEvents(
          rootEventsToSend,
          pipelineData.instanceId,
          pipelineData.baseUrl
        );

        console.log('Polling for job updates...');
        await pollForJobUpdates(3000, 2);
      } else {
        console.log('Waiting for queued events to finish up...');
        await pollForJobsOfTypeToFinish(
          owner,
          repoName,
          currentRun,
          workflowRunId,
          startTime,
          ActionsEventType.WORKFLOW_QUEUED
        );

        const completedEvent = generateRootCiEvent(
          event,
          pipelineData,
          CiEventType.FINISHED
        );

        await OctaneClient.sendEvents(
          [completedEvent],
          pipelineData.instanceId,
          pipelineData.baseUrl
        );

        if (getConfig().unitTestResultsGlobPattern) {
          await sendJUnitTestResults(
            owner,
            repoName,
            workflowRunId,
            pipelineData.buildCiId,
            pipelineData.rootJobName,
            pipelineData.instanceId
          );
        }
      }
      break;
    case ActionsEventType.PULL_REQUEST_OPENED:
    case ActionsEventType.PULL_REQUEST_CLOSED:
    case ActionsEventType.PULL_REQUEST_EDITED:
    case ActionsEventType.PULL_REQUEST_REOPENED:
      console.log(`Received pull request event...`);
      if (!event.pull_request || !event.repository?.html_url) {
        throw new Error(
          'Pull request data and repository url should be present!'
        );
      }
      const gitHubPullRequest: PullRequest = event.pull_request;
      console.log('Sending pull request data to ALM Octane...');
      await sendPullRequestData(
        owner,
        repoName,
        gitHubPullRequest,
        event.repository.html_url
      );
      break;
    case ActionsEventType.UNKNOWN_EVENT:
      break;
  }
};

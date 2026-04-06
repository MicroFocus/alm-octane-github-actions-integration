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

import OctaneClient from '../client/octaneClient';
import CiParameter from '../dto/octane/events/CiParameter';
import CiJobBody from '../dto/octane/general/bodies/CiJobBody';
import CiJob from '../dto/octane/general/CiJob';
import CiServer from '../dto/octane/general/CiServer';
import { NEW_SEPARATOR, appendJobName } from '../utils/pathFormatter';
import { GITHUB_ACTIONS_PLUGIN_VERSION } from '../utils/constants';

const getAllJobsByPipeline = async (pipelineId: string): Promise<CiJob[]> => {
  return await OctaneClient.getAllJobsByPipeline(pipelineId);
};

const getJobByCiId = async (
  ciId: string,
  ciServer: CiServer
): Promise<CiJob> => {
  const ciJob = await OctaneClient.getCiJob(ciId, ciServer);
  if (!ciJob) {
    throw Error(`Could not find job with {ci_id='${ciId}'}.`);
  }

  return ciJob;
};

const getOrCreateCiJob = async (
  name: string,
  ciId: string,
  ciServer: CiServer,
  branchName: string,
  parameters?: CiParameter[]
): Promise<CiJob> => {
  const ciJob = await OctaneClient.getCiJob(ciId, ciServer);

  if (ciJob) {
    return ciJob;
  }

  return await OctaneClient.createCiJob({
    name: name,
    jobCiId: ciId,
    ciServer: {
      id: ciServer.id,
      type: 'ci_server'
    },
    branchName: branchName,
    parameters: parameters
  });
};

const updateJobsCiIdIfNeeded = async (
  jobs: CiJob[],
  ciIdPrefix: string,
  ciServer: CiServer,
  oldPipelineName: string,
  newPipelineName: string
): Promise<void> => {
  const jobsToUpdate: CiJobBody[] = [];
  let pipelineCiId: string | undefined;

  // Find the pipeline job
  for (const ciJob of jobs) {
    if (ciJob.name === oldPipelineName) {
      pipelineCiId = ciJob.ci_id;
      break;
    }
  }

  for (const ciJob of jobs) {
    if (checkIfCiIdStartsWithPrefix(ciJob, ciIdPrefix)) {
      // Check if the existing CI ID uses the new format (contains |~~|)
      if (ciJob.ci_id.includes(NEW_SEPARATOR)) {
        // For new format, just update the version prefix
        const parts = ciJob.ci_id.split(NEW_SEPARATOR);
        if (parts.length > 1) {
          // Replace the old version with the new version
          parts[0] = GITHUB_ACTIONS_PLUGIN_VERSION;
          const updatedCiId = parts.join(NEW_SEPARATOR);

          jobsToUpdate.push({
            jobId: ciJob.id,
            name: ciJob.name === oldPipelineName ? newPipelineName : ciJob.name,
            jobCiId: updatedCiId
          });
        }
      } else {
        // For old format, rebuild the CI ID
        if (ciJob.name === oldPipelineName) {
          jobsToUpdate.push({
            jobId: ciJob.id,
            name: newPipelineName,
            jobCiId: `${ciIdPrefix}`
          });
        } else {
          let jobCiIdWithoutPrefix = ciJob.ci_id
            .replace(`${pipelineCiId}/`, '')
            .replace(`/${ciJob.name}`, '');
          const jobParts = jobCiIdWithoutPrefix.split('/');

          let newJobCiId = ciIdPrefix;
          if (jobCiIdWithoutPrefix !== ciJob.name) {
            for (const part of jobParts) {
              newJobCiId = await appendJobName(newJobCiId, part);
            }
          }

          newJobCiId = await appendJobName(newJobCiId, ciJob.name);

          jobsToUpdate.push({
            jobId: ciJob.id,
            name: ciJob.name,
            jobCiId: newJobCiId
          });
        }
      }
    }
  }

  if (jobsToUpdate.length > 0) {
    await OctaneClient.updateCiJobs(jobsToUpdate, ciServer.id, ciServer.id);
  }
};

const updateJobsCiServerIfNeeded = async (
  jobs: CiJob[],
  oldCiServerId: string,
  newCiServerId: string
): Promise<void> => {
  if (!newCiServerId) {
    return;
  }

  const jobsToUpdate: CiJobBody[] = [];
  if (checkIfCiServerIdsMatch(oldCiServerId, newCiServerId)) {
    jobs.forEach((ciJob: CiJob) => {
      jobsToUpdate.push({
        jobId: ciJob.id,
        name: ciJob.name,
        jobCiId: ciJob.ci_id
      });
    });
  }

  if (jobsToUpdate.length > 0) {
    await OctaneClient.updateCiJobs(jobsToUpdate, oldCiServerId, newCiServerId);
  }
};

const updateJobParameters = async (
  jobId: string,
  parameters: CiParameter[]
): Promise<void> => {
  await OctaneClient.updateCiJobParameters(jobId, parameters);
};

const checkIfCiIdStartsWithPrefix = (
  ciJob: CiJob,
  ciIdPrefix: string
): boolean => {
  if (!ciJob.ci_id || !ciJob.name) {
    return false;
  }
  return !ciJob.ci_id.startsWith(ciIdPrefix);
};

const checkIfCiServerIdsMatch = (
  oldCiServerId: string,
  newCiServerId: string
): boolean => {
  return oldCiServerId !== newCiServerId;
};

export {
  getAllJobsByPipeline,
  getJobByCiId,
  getOrCreateCiJob,
  updateJobsCiIdIfNeeded,
  updateJobsCiServerIfNeeded,
  updateJobParameters
};

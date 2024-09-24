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

import OctaneClient from '../client/octaneClient';
import CiJobBody from '../dto/octane/general/bodies/CiJobBody';
import CiJob from '../dto/octane/general/CiJob';
import CiServer from '../dto/octane/general/CiServer';

const getAllJobsByPipeline = async (pipelineId: string): Promise<CiJob[]> => {
  return await OctaneClient.getAllJobsByPipeline(pipelineId);
};

const updateJobsCiIdIfNeeded = async (
  jobs: CiJob[],
  ciIdPrefix: string,
  ciServer: CiServer,
  oldPipelineName: string,
  newPipelineName: string
): Promise<void> => {
  const jobsToUpdate: CiJobBody[] = [];
  jobs.forEach((ciJob: CiJob) => {
    if (checkIfCiIdStartsWithPrefix(ciJob, ciIdPrefix)) {
      if (ciJob.name === oldPipelineName) {
        jobsToUpdate.push({
          jobId: ciJob.id,
          name: newPipelineName,
          jobCiId: `${ciIdPrefix}`
        });
      } else {
        jobsToUpdate.push({
          jobId: ciJob.id,
          name: ciJob.name,
          jobCiId: `${ciIdPrefix}/${ciJob.name}`
        });
      }
    }
  });

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
  updateJobsCiIdIfNeeded,
  updateJobsCiServerIfNeeded
};

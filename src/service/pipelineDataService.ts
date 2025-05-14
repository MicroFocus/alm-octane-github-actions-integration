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
import { getConfig } from '../config/config';
import ActionsEvent from '../dto/github/ActionsEvent';
import { ActionsJob } from '../dto/github/ActionsJob';
import CiParameter from '../dto/octane/events/CiParameter';
import { MultiBranchType } from '../dto/octane/events/CiTypes';
import CiPipelineBody from '../dto/octane/general/bodies/CiPipelineBody';
import CiServerBody from '../dto/octane/general/bodies/CiServerBody';
import InternalCiPipelineBody from '../dto/octane/general/bodies/InternalCiPipelineBody';
import { Logger } from '../utils/logger';
import { getAllJobsByPipeline, updateJobsCiIdIfNeeded } from './ciJobService';

interface PipelineEventData {
  pipelineId: string;
  instanceId: string;
  buildCiId: string;
  baseUrl: string;
  rootJobName: string;
}

const LOGGER: Logger = new Logger('pipelineDataService');

const buildPipelineName = (
  event: ActionsEvent,
  owner: string,
  repoName: string,
  workflowFileName: string,
  isParent: boolean,
  pattern: string
): string => {
  const workflowName = event.workflow?.name;
  const branchName = event.workflow_run?.head_branch;
  if (!workflowName || !branchName) {
    throw new Error('Event should contain workflow data!');
  }

  const tempPipelineName = pattern
    .replace('${repository_owner}', owner)
    .replace('${repository_name}', repoName)
    .replace('${workflow_name}', workflowName)
    .replace('${workflow_file_name}', workflowFileName);
  const pipelineName = isParent
    ? tempPipelineName
    : `${tempPipelineName}/${branchName}`;

  return pipelineName;
};

const getPipelineData = async (
  rootJobName: string,
  ciServer: CiServerBody,
  event: ActionsEvent,
  createOnAbsence: boolean,
  jobCiIdPrefix?: string,
  jobs?: ActionsJob[],
  configParameters?: CiParameter[]
): Promise<PipelineEventData> => {
  const baseUrl = getConfig().serverBaseUrl;

  const pipeline = await OctaneClient.getPipelineOrCreate(
    rootJobName,
    ciServer,
    createOnAbsence,
    jobCiIdPrefix,
    jobs,
    configParameters
  );

  const buildCiId = event.workflow_run?.id.toString();
  if (!buildCiId) {
    throw new Error('Event should contain workflow run data!');
  }

  if (!ciServer.instance_id) {
    throw new Error('Could not find the instance ID of the CI Server!');
  }

  return {
    pipelineId: pipeline.id,
    instanceId: ciServer.instance_id,
    rootJobName,
    baseUrl,
    buildCiId
  };
};

const updatePipeline = async (
  pipeline: InternalCiPipelineBody
): Promise<void> => {
  await OctaneClient.updatePipelineInternal(pipeline);
};

const updatePipelineNameIfNeeded = async (
  rootJobCiId: string,
  ciServer: CiServerBody,
  pipelineName: string
): Promise<void> => {
  const pipelines = await OctaneClient.getPipelineByRootJobCiId(
    rootJobCiId,
    ciServer
  );

  if (!pipelines) {
    return;
  }

  await Promise.all(
    pipelines.map(async pipeline => {
      const nameTokens = pipeline.name.split('/');
      if (pipeline.name !== pipelineName && nameTokens[0] !== pipelineName) {
        const fullPipelineName =
          nameTokens.length === 2
            ? `${pipelineName}/${nameTokens[1]}`
            : pipelineName;

        LOGGER.info(`Renaming '${pipeline.name}' to '${fullPipelineName}'`);
        await OctaneClient.updatePipeline({
          id: pipeline.id,
          name: fullPipelineName
        });
      }
    })
  );
};

const upgradePipelineToMultiBranchIfNeeded = async (
  oldPipelineName: string,
  newPipelineName: string,
  ciIdPrefix: string
): Promise<void> => {
  const pipeline = await OctaneClient.getPipelineByName(oldPipelineName);
  if (!pipeline || pipeline.multi_branch_type) {
    return;
  }

  LOGGER.info(`Migrating '${oldPipelineName}' to multi-branch pipeline...`);

  const pipelineJobs = await getAllJobsByPipeline(pipeline.id);
  await updateJobsCiIdIfNeeded(
    pipelineJobs,
    ciIdPrefix,
    pipeline.ci_server,
    oldPipelineName,
    newPipelineName
  );

  const pipelineToUpdate: CiPipelineBody = {
    id: pipeline.id,
    name: newPipelineName,
    multi_branch_type: MultiBranchType.PARENT
  };

  await OctaneClient.updatePipeline(pipelineToUpdate);
};

export {
  buildPipelineName,
  getPipelineData,
  updatePipeline,
  updatePipelineNameIfNeeded,
  upgradePipelineToMultiBranchIfNeeded,
  PipelineEventData
};

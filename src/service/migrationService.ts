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
import CiJobBody from '../dto/octane/general/bodies/CiJobBody';
import CiServerBody from '../dto/octane/general/bodies/CiServerBody';
import CiPipeline from '../dto/octane/general/CiPipeline';
import CiServer from '../dto/octane/general/CiServer';
import { Logger } from '../utils/logger';
import { appendBranchName } from '../utils/pathFormatter';
import {
  getAllJobsByPipeline,
  updateJobsCiServerIfNeeded
} from './ciJobService';
import {
  updatePipeline,
  upgradePipelineCiIdIfNeeded,
  upgradePipelineToMultiBranchIfNeeded
} from './pipelineDataService';

const LOGGER: Logger = new Logger('migrationService');

const performMigrations = async (
  event: ActionsEvent,
  pipelineName: string,
  ciIdPrefix: string,
  ciServer: CiServerBody,
  branchName: string
): Promise<void> => {
  const workflowName = event.workflow?.name;
  if (!workflowName) {
    return;
  }

  await performMultiBranchPipelineMigration(
    pipelineName,
    workflowName,
    ciIdPrefix
  );

  await performCiServerMigration(ciServer, pipelineName);

  await performPipelineCiIdMigration(pipelineName, ciIdPrefix);

  const childPipelineName = `${pipelineName}/${branchName}`;
  const branchJobCiIdPrefix = await appendBranchName(ciIdPrefix, branchName);
  await performPipelineCiIdMigration(childPipelineName, branchJobCiIdPrefix);
};

const performExecutorMigrations = async (
  oldCiId: string,
  newCiId: string,
  ciServer: CiServer
): Promise<void> => {
  LOGGER.info(`Upgrading Executor CI ID from '${oldCiId}' to '${newCiId}'...`);

  const existingCiJob = await OctaneClient.getCiJob(oldCiId, ciServer);

  if (!existingCiJob) {
    throw Error(`Could not find executor job with {ci_id='${oldCiId}'}`);
  }

  const updatedCiJob: CiJobBody = {
    jobId: existingCiJob.id,
    name: existingCiJob.name,
    jobCiId: newCiId
  };

  await OctaneClient.updateCiJobs([updatedCiJob], ciServer.id, ciServer.id);
};

const performMultiBranchPipelineMigration = async (
  pipelineName: string,
  workflowName: string,
  ciIdPrefix: string
): Promise<void> => {
  const config = getConfig();
  const sharedSpaceName = await OctaneClient.getSharedSpaceName(
    config.octaneSharedSpace
  );
  const oldPipelineName = `GHA/${sharedSpaceName}/${workflowName}`;

  await upgradePipelineToMultiBranchIfNeeded(
    oldPipelineName,
    pipelineName,
    ciIdPrefix
  );
};

const performCiServerMigration = async (
  newCiServer: CiServerBody,
  pipelineName: string
): Promise<void> => {
  const oldCiServerInstanceId = `GHA/${getConfig().octaneSharedSpace}`;

  const oldCiServer = await OctaneClient.getCiServer(oldCiServerInstanceId);
  if (!oldCiServer) {
    return;
  }

  const pipeline = await OctaneClient.getPipelineByName(pipelineName);
  if (!pipeline) {
    return;
  }

  if (shouldMigrateCiServer(newCiServer, oldCiServer, pipeline)) {
    LOGGER.info(
      `Migrating CI Server '${oldCiServer.instance_id!}' to '${newCiServer.instance_id!}'...`
    );

    await updatePipeline({
      id: pipeline.id,
      ciServer: {
        type: 'ci_server',
        id: newCiServer.id
      }
    });

    await updateJobsCiServerIfNeeded(
      await getAllJobsByPipeline(pipeline.id),
      oldCiServer.id,
      newCiServer.id
    );
  }
};

const shouldMigrateCiServer = (
  newCiServer: CiServerBody,
  oldCiServer: CiServerBody,
  pipeline: CiPipeline
): boolean => {
  return (
    newCiServer.instance_id != oldCiServer.instance_id &&
    oldCiServer.id === pipeline.ci_server.id
  );
};

const performPipelineCiIdMigration = async (
  pipelineName: string,
  ciIdPrefix: string
): Promise<void> => {
  LOGGER.info(
    `Upgrading CI ID for pipeline '${pipelineName}' to prefix '${ciIdPrefix}'...`
  );
  await upgradePipelineCiIdIfNeeded(pipelineName, ciIdPrefix);
};

export { performMigrations, performExecutorMigrations };

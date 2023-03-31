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

import OctaneClient from '../client/octaneClient';
import { getConfig } from '../config/config';
import ActionsEvent from '../dto/github/ActionsEvent';
import { ActionsJob } from '../dto/github/ActionsJob';

interface PipelineEventData {
  instanceId: string;
  buildCiId: string;
  baseUrl: string;
  rootJobName: string;
}

const getPipelineData = async (
  event: ActionsEvent,
  shouldCreatePipelineAndCiServer: boolean,
  jobs?: ActionsJob[]
): Promise<PipelineEventData> => {
  const instanceId = `GHA/${getConfig().octaneSharedSpace}`;

  console.log('Getting workspace name...');
  const sharedSpaceName = await OctaneClient.getSharedSpaceName(
    getConfig().octaneSharedSpace
  );
  const projectName = `GHA/${sharedSpaceName}`;
  const baseUrl = getConfig().serverBaseUrl;

  console.log('Getting CI Server...');
  const ciServer = await OctaneClient.getCIServer(
    instanceId,
    projectName,
    baseUrl,
    shouldCreatePipelineAndCiServer
  );

  const pipelineName = event.workflow?.name;
  const rootJobName = `${projectName}/${pipelineName}`;
  if (!pipelineName) {
    throw new Error('Event should contain workflow data!');
  }

  console.log('Getting pipeline...');
  await OctaneClient.getPipeline(
    rootJobName,
    ciServer,
    shouldCreatePipelineAndCiServer,
    jobs
  );

  const buildCiId = event.workflow_run?.id.toString();
  if (!buildCiId) {
    throw new Error('Event should contain workflow run data!');
  }

  return {
    instanceId,
    rootJobName,
    baseUrl,
    buildCiId
  };
};

export { getPipelineData, PipelineEventData };

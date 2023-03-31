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

import { Octane } from '@microfocus/alm-octane-js-rest-sdk';
import Query from '@microfocus/alm-octane-js-rest-sdk/dist/lib/query';
import { getConfig } from '../config/config';
import { ActionsJob } from '../dto/github/ActionsJob';
import CiEvent from '../dto/octane/events/CiEvent';
import CiEventsList from '../dto/octane/events/CiEventsList';
import CiBuildBody from '../dto/octane/general/bodies/CiBuildBody';
import CiPipelineBody from '../dto/octane/general/bodies/CiPipelineBody';
import CiServerBody from '../dto/octane/general/bodies/CiServerBody';
import CiServerInfo from '../dto/octane/general/CiServerInfo';
import PullRequest from '../dto/octane/scm/PullRequest';

export default class OctaneClient {
  private static GITHUB_ACTIONS_SERVER_TYPE = 'github_actions';
  private static GITHUB_ACTIONS_PLUGIN_VERSION = '1.0.0';
  private static config = getConfig();
  private static octane: Octane = new Octane({
    server: this.config.octaneUrl,
    sharedSpace: this.config.octaneSharedSpace,
    workspace: this.config.octaneWorkspace,
    user: this.config.octaneClientId,
    password: this.config.octaneClientSecret,
    headers: {
      'ALM-OCTANE-TECH-PREVIEW': true
    }
  });

  private static ANALYTICS_CI_INTERNAL_API_URL = `/internal-api/shared_spaces/${this.config.octaneSharedSpace}/analytics/ci`;
  private static ANALYTICS_CI_API_URL = `/api/shared_spaces/${this.config.octaneSharedSpace}/workspaces/${this.config.octaneWorkspace}/analytics/ci`;

  public static setAnalyticsSharedSpace = (sharedSpace: string) => {
    this.ANALYTICS_CI_INTERNAL_API_URL = `/internal-api/shared_spaces/${sharedSpace}/analytics/ci`;
  };

  public static setOctane = (newOctane: Octane) => {
    this.octane = newOctane;
  };

  public static sendEvents = async (
    events: CiEvent[],
    instanceId: string,
    url: string
  ): Promise<void> => {
    const ciServerInfo: CiServerInfo = {
      instanceId,
      type: this.GITHUB_ACTIONS_SERVER_TYPE,
      url,
      version: this.GITHUB_ACTIONS_PLUGIN_VERSION,
      sendingTime: new Date().getTime()
    };

    const eventsToSend: CiEventsList = {
      server: ciServerInfo,
      events
    };

    await this.octane.executeCustomRequest(
      `${this.ANALYTICS_CI_INTERNAL_API_URL}/events`,
      Octane.operationTypes.update,
      eventsToSend
    );
  };

  public static sendTestResult = async (
    testResult: string,
    instanceId: string,
    jobId: string,
    buildId: string
  ): Promise<void> => {
    await this.octane.executeCustomRequest(
      `${this.ANALYTICS_CI_INTERNAL_API_URL}/test-results?skip-errors=true&instance-id=${instanceId}&job-ci-id=${jobId}&build-ci-id=${buildId}`,
      Octane.operationTypes.create,
      testResult,
      { 'Content-Type': 'application/xml' }
    );
  };

  public static createCISever = async (
    name: string,
    instanceId: string,
    url: string
  ): Promise<CiServerBody> => {
    return (
      await this.octane
        .create('ci_servers', {
          name,
          instance_id: instanceId,
          server_type: this.GITHUB_ACTIONS_SERVER_TYPE,
          url
        })
        .fields('instance_id')
        .execute()
    ).data[0];
  };

  public static createPipeline = async (
    rootJobName: string,
    ciServer: CiServerBody,
    jobs?: ActionsJob[]
  ): Promise<CiPipelineBody> => {
    const pipelineJobs = jobs?.map(job => {
      const jobName = job.name;
      const jobFullName = `${rootJobName}/${jobName}`;
      return {
        name: jobName,
        jobCiId: jobFullName
      };
    });

    pipelineJobs?.push({
      name: rootJobName,
      jobCiId: rootJobName
    });

    return (
      await this.octane
        .create('pipelines', {
          name: rootJobName,
          ci_server: {
            type: 'ci_server',
            id: ciServer.id
          },
          root_job_ci_id: rootJobName,
          jobs: pipelineJobs
        })
        .execute()
    ).data[0];
  };

  public static getPipeline = async (
    rootJobName: string,
    ciServer: CiServerBody,
    createOnAbsence = false,
    jobs?: ActionsJob[]
  ): Promise<CiPipelineBody> => {
    const pipelineQuery = Query.field('name')
      .equal(this.escapeOctaneQueryValue(rootJobName))
      .and(Query.field('ci_server').equal(Query.field('id').equal(ciServer.id)))
      .build();

    const pipelines = await this.octane
      .get('pipelines')
      .fields('name', 'ci_server')
      .query(pipelineQuery)
      .execute();
    if (
      !pipelines ||
      pipelines.total_count === 0 ||
      pipelines.data.length === 0
    ) {
      if (createOnAbsence) {
        return await this.createPipeline(rootJobName, ciServer, jobs);
      } else {
        throw new Error(`Pipeline '${rootJobName}' not found.`);
      }
    }
    return pipelines.data[0];
  };

  public static getCIServer = async (
    instanceId: string,
    projectName: string,
    baseUri: string,
    createOnAbsence = false
  ): Promise<CiServerBody> => {
    const ciServerQuery = Query.field('instance_id')
      .equal(this.escapeOctaneQueryValue(instanceId))
      .build();

    const ciServers = await this.octane
      .get('ci_servers')
      .fields('instance_id')
      .query(ciServerQuery)
      .execute();
    if (
      !ciServers ||
      ciServers.total_count === 0 ||
      ciServers.data.length === 0
    ) {
      if (createOnAbsence) {
        return await this.createCISever(projectName, instanceId, baseUri);
      } else {
        throw new Error(
          `CI Server '${projectName}(instanceId='${instanceId}'))' not found.`
        );
      }
    }
    return ciServers.data[0];
  };

  public static getSharedSpaceName = async (
    sharedSpaceId: number
  ): Promise<string> => {
    return (
      await this.octane.executeCustomRequest(
        `/api/shared_spaces?fields=name&query="id EQ ${sharedSpaceId}"`,
        Octane.operationTypes.get
      )
    ).data[0].name;
  };

  public static getJobBuilds = async (
    jobId: string
  ): Promise<CiBuildBody[]> => {
    return (
      await this.octane
        .get('ci_builds')
        .fields('start_time')
        .query(
          Query.field('ci_job').equal(Query.field('ci_id').equal(jobId)).build()
        )
        .execute()
    ).data;
  };

  public static sendPullRequestData = async (
    pullRequsts: PullRequest[]
  ): Promise<void> => {
    await this.octane.executeCustomRequest(
      `${this.ANALYTICS_CI_API_URL}/pull-requests`,
      Octane.operationTypes.update,
      pullRequsts
    );
  };

  private static escapeOctaneQueryValue(q: string): string {
    return (
      q && q.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    );
  }
}

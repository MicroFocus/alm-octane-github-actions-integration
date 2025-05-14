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
import { isVersionGreaterOrEqual } from '../utils/utils';
import CiJob from '../dto/octane/general/CiJob';
import CiPipelineNode from '../dto/octane/general/CiPipelineNode';
import CiPipeline from '../dto/octane/general/CiPipeline';
import CiJobBody from '../dto/octane/general/bodies/CiJobBody';
import InternalCiPipelineBody from '../dto/octane/general/bodies/InternalCiPipelineBody';
import { Logger } from '../utils/logger';
import CiParameter from '../dto/octane/events/CiParameter';
import CiExecutor from '../dto/octane/general/CiExecutor';
import CiExecutorBody from '../dto/octane/general/bodies/CiExecutorBody';
import CiServer from '../dto/octane/general/CiServer';

export default class OctaneClient {
  private static LOGGER: Logger = new Logger('octaneClient');

  private static GITHUB_ACTIONS_SERVER_TYPE = 'github_actions';
  private static GITHUB_ACTIONS_PLUGIN_VERSION = '25.2.1';
  private static config = getConfig();
  private static octane: Octane = new Octane({
    server: this.config.octaneUrl,
    sharedSpace: this.config.octaneSharedSpace,
    workspace: this.config.octaneWorkspace,
    user: this.config.octaneClientId,
    password: this.config.octaneClientSecret,
    headers: {
      'ALM-OCTANE-TECH-PREVIEW': true,
      'ALM-OCTANE-PRIVATE': true
    }
  });

  private static ANALYTICS_WORKSPACE_CI_INTERNAL_API_URL = `/internal-api/shared_spaces/${this.config.octaneSharedSpace}/workspaces/${this.config.octaneWorkspace}/analytics/ci`;
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
    this.LOGGER.debug(
      `Sending events to server-side app (instanceId: ${instanceId}): ${JSON.stringify(events)}`
    );

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
    this.LOGGER.debug(
      `Sending test results for job run with {jobId='${jobId}, buildId='${buildId}', instanceId='${instanceId}'}`
    );

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
  ): Promise<CiServer> => {
    this.LOGGER.debug(
      `Creating CI server with {name='${name}', instanceId='${instanceId}'}...`
    );

    return (
      await this.octane
        .create('ci_servers', {
          name,
          instance_id: instanceId,
          server_type: this.GITHUB_ACTIONS_SERVER_TYPE,
          url: url
        })
        .fields('instance_id')
        .execute()
    ).data[0];
  };

  public static createPipeline = async (
    pipelineName: string,
    ciServer: CiServerBody,
    jobCiIdPrefix?: String,
    jobs?: ActionsJob[],
    parameters?: CiParameter[]
  ): Promise<CiPipeline> => {
    this.LOGGER.debug(`Creating pipeline with {name='${pipelineName}'}...`);
    const defaultParameters: CiParameter[] = [];

    const pipelineJobs = jobs?.map(job => {
      const jobName = job.name;
      const jobFullName = `${jobCiIdPrefix}/${jobName}`;
      return {
        name: jobName,
        jobCiId: jobFullName,
        ...(parameters && { parameters: defaultParameters })
      };
    });

    pipelineJobs?.push({
      name: pipelineName,
      jobCiId: `${jobCiIdPrefix}`,
      parameters: parameters
    });

    return (
      await this.octane
        .create('pipelines', {
          name: pipelineName,
          ci_server: {
            type: 'ci_server',
            id: ciServer.id
          },
          root_job_ci_id: `${jobCiIdPrefix}`,
          jobs: pipelineJobs
        })
        .execute()
    ).data[0];
  };

  public static getPipelineOrCreate = async (
    pipelineName: string,
    ciServer: CiServerBody,
    createOnAbsence = false,
    jobCiIdPrefix?: string,
    jobs?: ActionsJob[],
    parameters?: CiParameter[]
  ): Promise<CiPipeline> => {
    this.LOGGER.debug(`Getting pipeline with {name='${pipelineName}'}...`);

    const pipelineQuery = Query.field('name')
      .equal(this.escapeOctaneQueryValue(pipelineName))
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
        return await this.createPipeline(
          pipelineName,
          ciServer,
          jobCiIdPrefix,
          jobs,
          parameters
        );
      } else {
        throw new Error(`Pipeline '${pipelineName}' not found.`);
      }
    }

    return pipelines.data[0];
  };

  public static getCiServerOrCreate = async (
    instanceId: string,
    projectName: string,
    baseUri: string,
    createOnAbsence = false
  ): Promise<CiServer> => {
    this.LOGGER.debug(`Getting CI server with {instanceId='${instanceId}'}...`);

    const ciServerQuery = Query.field('instance_id')
      .equal(this.escapeOctaneQueryValue(instanceId))
      .build();

    const ciServers = await this.octane
      .get('ci_servers')
      .fields('instance_id,plugin_version,url')
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
          `CI Server '${projectName} (instanceId='${instanceId}'))' not found.`
        );
      }
    }
    return ciServers.data[0];
  };

  public static getPipelineByRootJobCiId = async (
    rootJobCiId: string,
    ciServer: CiServerBody
  ): Promise<CiPipeline[] | undefined> => {
    this.LOGGER.debug(
      `Getting pipeline with {root_job_ci_id='${rootJobCiId}'}...`
    );

    const pipelineQuery = Query.field('root_job')
      .equal(
        Query.field('ci_id').equal(this.escapeOctaneQueryValue(rootJobCiId))
      )
      .and(Query.field('ci_server').equal(Query.field('id').equal(ciServer.id)))
      .build();

    const pipelines = await this.octane
      .get('pipelines')
      .fields('name', 'ci_server{instance_id}')
      .query(pipelineQuery)
      .execute();

    if (
      !pipelines ||
      pipelines.total_count === 0 ||
      pipelines.data.length === 0
    ) {
      this.LOGGER.debug(
        `Couldn't find pipeline with {root_job_ci_id='${rootJobCiId}'}...`
      );
      return undefined;
    }
    return pipelines.data;
  };

  public static getPipelineByName = async (
    pipelineName: string
  ): Promise<CiPipeline | undefined> => {
    this.LOGGER.debug(`Getting pipeline with {name='${pipelineName}'}...`);

    const pipelineQuery = Query.field('name')
      .equal(this.escapeOctaneQueryValue(pipelineName))
      .build();

    const pipelines = await this.octane
      .get('pipelines')
      .fields('name', 'ci_server{instance_id}', 'multi_branch_type')
      .query(pipelineQuery)
      .execute();
    if (
      !pipelines ||
      pipelines.total_count === 0 ||
      pipelines.data.length === 0
    ) {
      this.LOGGER.debug(
        `Couldn't find pipeline with {name='${pipelineName}'}...`
      );
      return undefined;
    }

    return pipelines.data[0];
  };

  public static updatePipeline = async (
    pipeline: CiPipelineBody
  ): Promise<void> => {
    this.LOGGER.debug(`Updating pipeline with ${JSON.stringify(pipeline)}...`);
    await this.octane.update('pipelines', pipeline).execute();
  };

  public static updatePipelineInternal = async (
    pipeline: InternalCiPipelineBody
  ): Promise<void> => {
    this.LOGGER.debug(
      `Updating pipeline with ${JSON.stringify(pipeline)}, using custom resource...`
    );

    const url = `${this.ANALYTICS_WORKSPACE_CI_INTERNAL_API_URL}/pipeline_update`;
    await this.octane.executeCustomRequest(
      url,
      Octane.operationTypes.update,
      pipeline
    );
  };

  public static getExecutors = async (
    ciJobId: string,
    ciServer: CiServer
  ): Promise<CiJob[]> => {
    this.LOGGER.debug(
      `Getting executor jobs with {id='${ciJobId}', ci_server.id='${ciServer.id}'}...`
    );

    const executorsQuery = Query.field('id')
      .equal(this.escapeOctaneQueryValue(ciJobId))
      .and(Query.field('ci_server').equal(Query.field('id').equal(ciServer.id)))
      .and(Query.field('executor').notEqual(Query.NULL_REFERENCE))
      .build();

    const executors = await this.octane
      .get('ci_jobs')
      .fields('ci_id,name,ci_server{name,instance_id},executor{name,subtype}')
      .query(executorsQuery)
      .execute();

    if (
      !executors ||
      executors.total_count === 0 ||
      executors.data.length === 0
    ) {
      return [];
    }

    return executors.data;
  };

  public static createExecutor = async (
    executor: CiExecutorBody
  ): Promise<CiExecutor> => {
    this.LOGGER.debug(`Creating executor with ${JSON.stringify(executor)}...`);

    const executors = await this.octane.create('executors', executor).execute();

    if (
      !executors ||
      executors.total_count === 0 ||
      executors.data.length === 0
    ) {
      throw Error('Could not create the test runner entity.');
    }

    return executors.data[0];
  };

  public static getCiServer = async (
    instanceId: string
  ): Promise<CiServerBody | undefined> => {
    this.LOGGER.debug(`Getting CI server with {instanceId='${instanceId}'}...`);

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
      return undefined;
    }
    return ciServers.data[0];
  };

  public static getSharedSpaceName = async (
    sharedSpaceId: number
  ): Promise<string> => {
    this.LOGGER.debug(
      `Getting the name of the shared space with {id='${sharedSpaceId}'}...`
    );
    return (
      await this.octane.executeCustomRequest(
        `/api/shared_spaces?fields=name&query="id EQ ${sharedSpaceId}"`,
        Octane.operationTypes.get
      )
    ).data[0].name;
  };

  public static getAllJobsByPipeline = async (
    pipelineId: string
  ): Promise<CiJob[]> => {
    this.LOGGER.debug(
      `Getting all the jobs for pipeline with {id='${pipelineId}'}...`
    );

    const pipelineNodeQuery = Query.field('pipeline')
      .equal(Query.field('id').equal(pipelineId))
      .build();

    const response = await this.octane
      .get('pipeline_nodes')
      .fields('ci_job{ci_id}')
      .query(pipelineNodeQuery)
      .execute();

    const pipelineNodes: CiPipelineNode[] = response.data;

    const jobs: CiJob[] = [];
    pipelineNodes.forEach((pipelineNode: CiPipelineNode) => {
      if (pipelineNode.ci_job) {
        jobs.push(pipelineNode.ci_job);
      }
    });

    return jobs;
  };

  public static getJobBuilds = async (
    jobId: string
  ): Promise<CiBuildBody[]> => {
    this.LOGGER.debug(`Getting job builds for CI job with {id='${jobId}'}...`);

    return (
      await this.octane
        .get('ci_builds')
        .fields('start_time', 'build_ci_id')
        .query(
          Query.field('ci_job').equal(Query.field('ci_id').equal(jobId)).build()
        )
        .execute()
    ).data;
  };

  public static sendPullRequestData = async (
    pullRequsts: PullRequest[]
  ): Promise<void> => {
    this.LOGGER.debug(
      `Sending pull request data with {pullRequests=${JSON.stringify(pullRequsts)}}...`
    );

    await this.octane.executeCustomRequest(
      `${this.ANALYTICS_CI_API_URL}/pull-requests`,
      Octane.operationTypes.update,
      pullRequsts
    );
  };

  public static getCiJob = async (
    ciId: string,
    ciServer: CiServer
  ): Promise<CiJob | undefined> => {
    this.LOGGER.debug(
      `Getting job with {ci_id='${ciId}, ci_server.id='${ciServer.id}'}...`
    );

    const jobQuery = Query.field('ci_id')
      .equal(this.escapeOctaneQueryValue(ciId))
      .and(Query.field('ci_server').equal(Query.field('id').equal(ciServer.id)))
      .build();

    const ciJobs = await this.octane
      .get('ci_jobs')
      .fields('id,ci_id,name,ci_server{name,instance_id}')
      .query(jobQuery)
      .execute();

    if (!ciJobs || ciJobs.total_count === 0 || ciJobs.data.length === 0) {
      return undefined;
    }

    return ciJobs.data[0];
  };

  public static createCiJob = async (ciJob: CiJobBody): Promise<CiJob> => {
    this.LOGGER.debug(
      `Creating job with {ci_id='${ciJob.jobCiId}', ci_server.id='${ciJob.ciServer?.id}'}...`
    );

    const ciJobToCreate = {
      name: ciJob.name,
      parameters: ciJob.parameters,
      ci_id: ciJob.jobCiId,
      ci_server: {
        id: ciJob.ciServer?.id,
        type: ciJob.ciServer?.type
      },
      branch: ciJob.branchName
    };

    const ciJobs = await this.octane.create('ci_jobs', ciJobToCreate).execute();

    if (!ciJobs || ciJobs.total_count === 0 || ciJobs.data.length === 0) {
      throw Error('Could not create the CI job entity.');
    }

    return ciJobs.data[0];
  };

  public static updateCiJobs = async (
    ciJobs: CiJobBody[],
    ciServerId: string,
    newCiServerId: string
  ): Promise<void> => {
    const requestPayload: any[] = [];

    ciJobs.forEach((ciJob: CiJobBody) => {
      this.LOGGER.debug(
        `Updating job with {id='${ciJob.jobId}', name='${ciJob.name}', jobCiId='${ciJob.jobCiId}', ciServerId='${newCiServerId}'}...`
      );

      requestPayload.push({
        name: ciJob.name,
        jobId: ciJob.jobId,
        jobCiId: ciJob.jobCiId,
        ciServer: {
          id: newCiServerId
        }
      });
    });

    if (requestPayload.length > 0) {
      const url = `${this.ANALYTICS_WORKSPACE_CI_INTERNAL_API_URL}/ci_job_update?ci-server-id=${ciServerId}`;
      await this.octane.executeCustomRequest(
        url,
        Octane.operationTypes.update,
        requestPayload
      );
    }
  };

  public static updatePluginVersionIfNeeded = async (
    instanceId: String,
    ciServer: CiServerBody
  ): Promise<void> => {
    this.LOGGER.info(`Current CI Server version: '${ciServer.plugin_version}'`);
    if (
      !ciServer.plugin_version ||
      isVersionGreaterOrEqual(
        this.GITHUB_ACTIONS_PLUGIN_VERSION,
        ciServer.plugin_version
      )
    ) {
      this.LOGGER.info(
        `Updating CI Server version to: '${this.GITHUB_ACTIONS_PLUGIN_VERSION}'`
      );
      await this.updatePluginVersion(instanceId);
    }
  };

  public static getOctaneVersion = async (): Promise<string> => {
    const requestHeaders = {
      'ALM-OCTANE-TECH-PREVIEW': true
    };

    const response = await this.octane.executeCustomRequest(
      this.ANALYTICS_CI_INTERNAL_API_URL + '/servers/connectivity/status',
      Octane.operationTypes.get,
      undefined,
      requestHeaders
    );

    return response.octaneVersion;
  };

  /**
   * Gets a map containing the experiments related to GitHub Actions and their
   * activation status.
   * @returns Object containing the names of the experiments as keys and the
   * activation status (true if on, false if off) as value.
   */
  public static getFeatureToggles = async (): Promise<{
    [key: string]: boolean;
  }> => {
    this.LOGGER.info(`Getting features' statuses (on/off)...`);

    const response = await this.octane.executeCustomRequest(
      `${this.ANALYTICS_WORKSPACE_CI_INTERNAL_API_URL}/github_feature_toggles`,
      Octane.operationTypes.get
    );

    return response;
  };

  private static updatePluginVersion = async (
    instanceId: String
  ): Promise<void> => {
    const querystring = require('querystring');
    const sdk = '';
    const pluginVersion = this.GITHUB_ACTIONS_PLUGIN_VERSION;
    const client_id = this.config.octaneClientId;
    const selfUrl = querystring.escape(this.config.serverBaseUrl);
    await this.octane.executeCustomRequest(
      `${this.ANALYTICS_CI_INTERNAL_API_URL}/servers/${instanceId}/tasks?self-type=${this.GITHUB_ACTIONS_SERVER_TYPE}&api-version=1&sdk-version=${sdk}&plugin-version=${pluginVersion}&self-url=${selfUrl}&client-id=${client_id}&client-server-user=`,
      Octane.operationTypes.get
    );
  };

  private static escapeOctaneQueryValue(q: string): string {
    return (
      q && q.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)')
    );
  }
}

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

export const enum CiEventType {
  UNDEFINED = 'undefined',
  QUEUED = 'queued',
  STARTED = 'started',
  FINISHED = 'finished',
  SCM = 'scm',
  DELETED = 'deleted'
}

export const enum CiCausesType {
  TIMER = 'timer',
  USER = 'user',
  SCM = 'scm',
  UPSTREAM = 'upstream',
  UNDEFINED = 'undefined'
}

export const enum PhaseType {
  POST = 'post',
  INTERNAL = 'internal'
}

export const enum Result {
  SUCCESS = 'success',
  FAILURE = 'failure',
  ABORTED = 'aborted',
  UNSTABLE = 'unstable',
  UNAVAILABLE = 'unavailable'
}

export const enum SCMType {
  UNKNOWN = 'unknown',
  GIT = 'git',
  SVN = 'svn'
}

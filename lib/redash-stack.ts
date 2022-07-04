import { CfnOutput, Duration, SecretValue, Stack } from 'aws-cdk-lib';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as secrets_manager from 'aws-cdk-lib/aws-secretsmanager';
import { Construct } from 'constructs';

import { makeOrGetVpc } from './components/ec2';
import { EcsRedashCluster } from './components/ecs';
import { RedisRedash } from './components/elasticache';
import { RdsRedash } from './components/rds';
import {
  EcsRedashAutoscalingFargateService,
  EcsRedashLoadBalanceFargateService,
  EcsRedashTaskDefinition,
} from './components/redash_service_components';
import { SecretRedash } from './components/secretsmanager';
import { Config } from './config';

export class RedashStack extends Stack {
  cluster: EcsRedashCluster;

  constructor(scope: Construct, config: Config) {
    const id = `${config.stageName}-redash-stack`;
    super(scope, id, {
      // NOTE: VPC lookup 을 위해 필요하다
      env: { account: config.accountId, region: config.region },
    });

    const vpc = makeOrGetVpc(this, config);
    this.cluster = new EcsRedashCluster(this, config, vpc);
    const rds = new RdsRedash(this, config, vpc);
    const redis = new RedisRedash(this, config, vpc);
    const cookieSecret = new SecretRedash(this, config, 'cookie-secret');
    const secret = new SecretRedash(this, config, 'secret');

    const defaultEnv = this.makeDefaultEnvironmentVariables(redis);

    const secrets = this.makeSecrets(rds, cookieSecret, secret);

    const initDbTask = new EcsRedashTaskDefinition(this, config, {
      serviceName: 'create_db',
      command: ['create_db'],
      servicePort: null,
      cpu: 1024, // 1vcpu
      memoryLimitMib: 2048, // 2GB
      image: config.redashImage,
      environmentVariables: defaultEnv,
      secrets: secrets,
    });

    // NOTE: CDK로 aws-cli run-task 를 실행할 수 없다
    // https://github.com/aws-samples/aws-cdk-examples/issues/289 참고
    new CfnOutput(this, 'run-this-manually', {
      value: `aws ecs run-task --cluster ${this.cluster.clusterArn} \
                --task-definition ${initDbTask.taskDefinitionArn} \
                --launch-type FARGATE \
                --network-configuration '{"awsvpcConfiguration":{"subnets":["${vpc.privateSubnets[0].subnetId}"]}}'`,
      description:
        'Run this command to create the Redash Table after the RDS instance is created',
    });

    const server = this.createServerService(
      config,
      {
        REDASH_WEB_WORKERS: '4',
        ...defaultEnv,
      },
      secrets,
    );

    new CfnOutput(this, `${config.stageName}-RedashServerUrl`, {
      value: server.loadBalancer.loadBalancerDnsName,
    });

    this.createWorkerService(
      config,
      'scheduler',
      'scheduler',
      {
        QUEUES: 'celery',
        WORKERS_COUNT: '1',
        ...defaultEnv,
      },
      1,
      secrets,
    );

    this.createWorkerService(
      config,
      'scheduled_worker',
      'worker',
      {
        QUEUES: 'scheduled_queries,schemas',
        WORKERS_COUNT: '1',
        ...defaultEnv,
      },
      1,
      secrets,
    );

    this.createWorkerService(
      config,
      'adhoc_worker',
      'worker',
      {
        QUEUES: 'queries',
        WORKERS_COUNT: '2',
        ...defaultEnv,
      },
      1,
      secrets,
    );
  }

  makeSecrets(
    rds: RdsRedash,
    cookieSecret: SecretRedash,
    secret: SecretRedash,
  ): { [key: string]: ecs.Secret } {
    const dbPassword = rds
      .secret!.secretValueFromJson('password')
      .unsafeUnwrap();
    const dbUserName = rds
      .secret!.secretValueFromJson('username')
      .unsafeUnwrap();

    const databaseURL = `postgresql://${dbUserName}:${dbPassword}@${rds.dbInstanceEndpointAddress}:${rds.dbInstanceEndpointPort}/redash`;

    const databaseUrlSecret = new secrets_manager.Secret(
      this,
      'redash-database-url',
      {
        secretStringValue: SecretValue.unsafePlainText(databaseURL),
      },
    );

    return {
      REDASH_SECRET_KEY: ecs.Secret.fromSecretsManager(secret),
      REDASH_COOKIE_SECRET: ecs.Secret.fromSecretsManager(cookieSecret),
      REDASH_DATABASE_URL: ecs.Secret.fromSecretsManager(databaseUrlSecret),
    };
  }

  makeDefaultEnvironmentVariables(redis: RedisRedash): {
    [key: string]: string;
  } {
    return {
      REDASH_LOG_LEVEL: 'INFO',
      PYTHONUNBUFFERED: '0',
      REDASH_REDIS_URL: `redis://${redis.attrRedisEndpointAddress}:${redis.attrRedisEndpointPort}/0`,
    };
  }

  createWorkerService(
    config: Config,
    serviceName: string,
    command: string,
    env: { [key: string]: string },
    desiredCount: number = 1,
    secrets: { [key: string]: ecs.Secret },
  ) {
    const task = new EcsRedashTaskDefinition(this, config, {
      serviceName: serviceName,
      command: [command],
      servicePort: null,
      cpu: 1024, // 1vcpu
      memoryLimitMib: 2048, // 2GB
      image: config.redashImage,
      environmentVariables: env,
      secrets: secrets,
    });

    new EcsRedashAutoscalingFargateService(this, config, {
      serviceName: serviceName,
      cluster: this.cluster,
      taskDefinition: task,
      desiredCount: desiredCount,
      maxCapacity: 4,
      targetMemoryUtilizationPercent: 80,
      memoryScaleInCoolDown: Duration.seconds(10),
      memoryScaleOutCoolDown: Duration.seconds(20),
      targetCpuUtilizationPercent: 80,
      cpuScaleInCoolDown: Duration.seconds(10),
      cpuScaleOutCoolDown: Duration.seconds(60),
    });
  }

  createServerService(
    config: Config,
    env: { [key: string]: string },
    secrets: { [key: string]: ecs.Secret },
  ): EcsRedashLoadBalanceFargateService {
    const serverTaskDefinition = new EcsRedashTaskDefinition(this, config, {
      serviceName: 'server',
      servicePort: 5000,
      cpu: 1024, // 1vcpu
      memoryLimitMib: 2048, // 2GB
      image: config.redashImage,
      environmentVariables: env,
      command: ['server'],
      secrets: secrets,
    });

    return new EcsRedashLoadBalanceFargateService(this, config, {
      serviceName: 'server',
      cluster: this.cluster,
      taskDefinition: serverTaskDefinition,
      desiredCount: 1,
    });
  }
}

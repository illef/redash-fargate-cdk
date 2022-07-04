import { Duration } from 'aws-cdk-lib';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as ecs_patterns from 'aws-cdk-lib/aws-ecs-patterns';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Construct } from 'constructs';

import { Config } from '../config';

interface TaskDefinitionParams {
  serviceName: string;
  servicePort: number | null;
  cpu: number;
  memoryLimitMib: number;
  image: string;
  environmentVariables: { [key: string]: string };
  secrets: { [key: string]: ecs.Secret };
  command: string[];
}

export class EcsRedashTaskDefinition extends ecs.FargateTaskDefinition {
  constructor(scope: Construct, config: Config, param: TaskDefinitionParams) {
    const id = `${config.stageName}-redash-${param.serviceName}-task-definition`;
    super(scope, id, {
      cpu: param.cpu,
      memoryLimitMiB: param.memoryLimitMib,
      family: id,
    });

    const containerId = `${config.stageName}-redash-${param.serviceName}-container`;
    const container = this.addContainer(containerId, {
      image: ecs.ContainerImage.fromRegistry(param.image),
      environment: param.environmentVariables,
      secrets: param.secrets,
      command: param.command,
      logging: new ecs.AwsLogDriver({
        streamPrefix: `${config.stageName}-redash-${param.serviceName}`,
        logRetention: RetentionDays.ONE_WEEK,
      }),
    });

    if (param.servicePort) {
      container.addPortMappings({
        containerPort: param.servicePort,
      });
    }
  }
}

interface FargageServiceParams {
  serviceName: string;
  cluster: ecs.Cluster;
  taskDefinition: ecs.FargateTaskDefinition;
  desiredCount: number;
}

interface AutoScalingFargateServiceParams extends FargageServiceParams {
  maxCapacity: number;
  targetMemoryUtilizationPercent: number;
  memoryScaleInCoolDown: Duration;
  memoryScaleOutCoolDown: Duration;
  targetCpuUtilizationPercent: number;
  cpuScaleInCoolDown: Duration;
  cpuScaleOutCoolDown: Duration;
}

export class EcsRedashLoadBalanceFargateService extends ecs_patterns.ApplicationLoadBalancedFargateService {
  constructor(scope: Construct, config: Config, param: FargageServiceParams) {
    const id = `${config.stageName}-redash-${param.serviceName}-service`;
    super(scope, id, {
      cluster: param.cluster,
      taskDefinition: param.taskDefinition,
      desiredCount: param.desiredCount,
      // TODO: securityGroup
      publicLoadBalancer: true,
    });
    this.targetGroup.configureHealthCheck({
      healthyHttpCodes: '200-399',
    });
  }
}
export class EcsRedashFargateService extends ecs.FargateService {
  constructor(scope: Construct, config: Config, params: FargageServiceParams) {
    const id = `${config.stageName}-redash-${params.serviceName}-service`;
    super(scope, id, {
      serviceName: id,
      cluster: params.cluster,
      taskDefinition: params.taskDefinition,
      desiredCount: params.desiredCount,
      vpcSubnets: { subnetType: ec2.SubnetType.PRIVATE_WITH_NAT },
    });
  }
}

export class EcsRedashAutoscalingFargateService extends EcsRedashFargateService {
  constructor(
    scope: Construct,
    config: Config,
    params: AutoScalingFargateServiceParams,
  ) {
    super(scope, config, params);

    const scaleTaskCount = this.autoScaleTaskCount({
      maxCapacity: params.maxCapacity,
    });

    const scaleMemoryId = `${config.stageName}-redash-${params.serviceName}-scale-memory`;
    scaleTaskCount.scaleOnMemoryUtilization(scaleMemoryId, {
      policyName: scaleMemoryId,
      targetUtilizationPercent: params.targetMemoryUtilizationPercent,
      scaleInCooldown: params.memoryScaleInCoolDown,
      scaleOutCooldown: params.memoryScaleOutCoolDown,
    });

    const scaleCpuId = `${config.stageName}-redash-${params.serviceName}-scale-cpu`;
    scaleTaskCount.scaleOnCpuUtilization(scaleCpuId, {
      policyName: scaleCpuId,
      targetUtilizationPercent: params.targetCpuUtilizationPercent,
      scaleInCooldown: params.cpuScaleInCoolDown,
      scaleOutCooldown: params.cpuScaleOutCoolDown,
    });
  }
}

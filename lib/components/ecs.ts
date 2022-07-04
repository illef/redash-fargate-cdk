import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { Construct } from 'constructs';
import { Config } from '../config';

export class EcsRedashCluster extends ecs.Cluster {
  constructor(scope: Construct, config: Config, vpc: ec2.IVpc) {
    const id = `${config.stageName}-redash-cluster`;
    super(scope, id, { clusterName: id, containerInsights: true, vpc: vpc });
  }
}

import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as elastic_cache from 'aws-cdk-lib/aws-elasticache';
import { Construct } from 'constructs';

import { Config } from '../config';

export class RedisRedash extends elastic_cache.CfnCacheCluster {
  constructor(scope: Construct, config: Config, vpc: ec2.IVpc) {
    const id = `${config.stageName}-redash-elasticache`;

    const subnetGroup = new RedashRedisSubnetGroup(scope, config, vpc);
    const securityGroup = new Ec2RedashSecurityGroup(scope, config, vpc);

    super(scope, id, {
      autoMinorVersionUpgrade: true,
      azMode: 'single-az',
      cacheNodeType: 'cache.t3.micro',
      clusterName: id,
      engine: 'redis',
      engineVersion: '5.0.0',
      numCacheNodes: 1,
      port: 6379,
      vpcSecurityGroupIds: [securityGroup.securityGroupId],
      cacheSubnetGroupName: subnetGroup.cacheSubnetGroupName,
    });

    this.addDependsOn(subnetGroup);
  }
}

class Ec2RedashSecurityGroup extends ec2.SecurityGroup {
  constructor(scope: Construct, config: Config, vpc: ec2.IVpc) {
    const id = `${config.stageName}-redash-ec2-redis-sg`;
    super(scope, id, {
      securityGroupName: id,
      allowAllOutbound: true,
      description: 'Redash redis Security Group',
      vpc: vpc,
    });

    for (const subnet of vpc.privateSubnets) {
      this.addIngressRule(
        ec2.Peer.ipv4(subnet.ipv4CidrBlock),
        ec2.Port.tcp(6379),
      );
    }
  }
}

class RedashRedisSubnetGroup extends elastic_cache.CfnSubnetGroup {
  constructor(scope: Construct, config: Config, vpc: ec2.IVpc) {
    const id = `${config.stageName}-redash-redis-subnet-group`;
    super(scope, id, {
      cacheSubnetGroupName: id,
      description: 'Redash redis Subnet Group',
      subnetIds: vpc.privateSubnets.map((subnet) => subnet.subnetId),
    });
  }
}

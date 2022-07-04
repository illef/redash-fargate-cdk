import * as ec2 from 'aws-cdk-lib/aws-ec2';
import { Construct } from 'constructs';

import { Config } from '../config';

export function makeOrGetVpc(scope: Construct, config: Config): ec2.IVpc {
  if (config.vpcId) {
    return ec2.Vpc.fromLookup(scope, 'VPC-lookup', {
      vpcId: config.vpcId!,
      region: config.region,
    });
  } else {
    return new VpcRedash(scope, config);
  }
}

// NOTE: Redash 만을 위한 Vpc를 생성하고자 할때 사용한다
// 2개의 Az 를 생성하고, 각 Az 당 3개 type의 subnet을 생성한다(public, private,
// isolated)
class VpcRedash extends ec2.Vpc {
  constructor(scope: Construct, config: Config) {
    const id = `${config.stageName}-redash-vpc`;
    super(scope, id, {
      cidr: '10.0.0.0/16',
      natGateways: 1,
      maxAzs: 2,
      subnetConfiguration: [
        {
          name: 'private-subnet-1',
          subnetType: ec2.SubnetType.PRIVATE_WITH_NAT,
          cidrMask: 24,
        },
        {
          name: 'public-subnet-1',
          subnetType: ec2.SubnetType.PUBLIC,
          cidrMask: 24,
        },
        {
          name: 'isolated-subnet-1',
          subnetType: ec2.SubnetType.PRIVATE_ISOLATED,
          cidrMask: 28,
        },
      ],
    });
  }
}
